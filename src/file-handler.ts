import { path, Mat3, Mat4, Vec3 } from 'playcanvas';
import { Scene } from './scene';
import { Events } from './events';
import { CreateDropHandler } from './drop-handler';
import { serializeAsPly, serializeAsCompressedPly, serializeAsSSplat } from './splat-serializer';
import { startSpinner, stopSpinner } from './ui/spinner';
import { ElementType } from './element';
import { Splat } from './splat';

interface RemoteStorageDetails {
    method: string;
    url: string;
}

type ExportType = 'ply' | 'compressed-ply' | 'ssplat';

interface SceneWriteOptions {
    type: ExportType;
    filename?: string;
    stream?: FileSystemWritableFileStream;
}

const filePickerTypes = {
    'ply': [{
        description: 'Gaussian Splat PLY File',
        accept: {
            'application/ply': ['.ply']
        }
    }],
    'compressed-ply': [{
        description: 'Compressed Gaussian Splat PLY File',
        accept: {
            'application/ply': ['.ply']
        }
    }],
    'ssplat': [{
            description: 'Gaussian Splat SPLAT File',
            accept: {
                'application/splat': ['.splat']
            }
    }],
    'gsplatfile': [{
            description: 'Gaussian Splat File',
            accept: {
                'application/ply': ['.ply'],                
                'application/splat': ['.splat']
            }
    }]
};

let fileHandle: FileSystemFileHandle = null;

const vec = new Vec3();

// download the data to the given filename
const download = (filename: string, data: ArrayBuffer) => {
    const blob = new Blob([data], { type: "octet/stream" });
    const url = window.URL.createObjectURL(blob);

    const lnk = document.createElement('a');
    lnk.download = filename;
    lnk.href = url;

    // create a "fake" click-event to trigger the download
    if (document.createEvent) {
        const e = document.createEvent("MouseEvents");
        e.initMouseEvent("click", true, true, window,
                         0, 0, 0, 0, 0, false, false, false,
                         false, 0, null);
        lnk.dispatchEvent(e);
    } else {
        // @ts-ignore
        lnk.fireEvent?.("onclick");
    }

    window.URL.revokeObjectURL(url);
};

// send the file to the remote storage
const sendToRemoteStorage = async (filename: string, data: ArrayBuffer, remoteStorageDetails: RemoteStorageDetails) => {
    const formData = new FormData();
    formData.append('file', new Blob([data], { type: "octet/stream" }), filename);
    formData.append('preserveThumbnail', 'true');
    await fetch(remoteStorageDetails.url, {
        method: remoteStorageDetails.method,
        body: formData
    });
};

// write the data to file
const writeToFile = async (stream: FileSystemWritableFileStream, data: ArrayBuffer) => {
    await stream.seek(0);
    await stream.write(data);
    await stream.truncate(data.byteLength);
    await stream.close();
};

const loadCameraPoses = async (url: string, filename: string, events: Events) => {
    const response = await fetch(url);
    const json = await response.json();
    if (json.length > 0) {
        // calculate the average position of the camera poses
        const ave = new Vec3(0, 0, 0);
        json.forEach((pose: any) => {
            vec.set(pose.position[0], pose.position[1], pose.position[2]);
            ave.add(vec);
        });
        ave.mulScalar(1 / json.length);

        json.forEach((pose: any, i: number) => {
            if (pose.hasOwnProperty('position') && pose.hasOwnProperty('rotation')) {
                const p = new Vec3(pose.position);
                const z = new Vec3(pose.rotation[0][2], pose.rotation[1][2], pose.rotation[2][2]);

                const dot = vec.sub2(ave, p).dot(z);
                vec.copy(z).mulScalar(dot).add(p);

                events.fire('camera.addPose', {
                    name: pose.img_name ?? `${filename}_${i}`,
                    position: new Vec3(-p.x, -p.y, p.z),
                    target: new Vec3(-vec.x, -vec.y, vec.z)
                });
            }
        });
    }
};

// initialize file handler events
const initFileHandler = async (scene: Scene, events: Events, dropTarget: HTMLElement, remoteStorageDetails: RemoteStorageDetails) => {

    const handleLoad = (url: string, filename: string) => {
        if (filename.toLowerCase().endsWith('.json')) {
            return loadCameraPoses(url, filename, events);
        } else if (filename.toLowerCase().endsWith('.ply') || filename.toLowerCase().endsWith('.splat')) {
            return scene.loadModel(url, filename);
        } else {
            return null;
        }
    };

    events.function('load', (url: string, filename: string) => {
        return handleLoad(url, filename);
    });

    // create a file selector element as fallback when showOpenFilePicker isn't available
    let fileSelector: HTMLInputElement;
    if (!window.showOpenFilePicker) {
        fileSelector = document.createElement('input');
        fileSelector.setAttribute('id', 'file-selector');
        fileSelector.setAttribute('type', 'file');
        fileSelector.setAttribute('accept', '.ply');
        fileSelector.setAttribute('multiple', 'true');

        fileSelector.onchange = async () => {
            const files = fileSelector.files;
            for (let i = 0; i < files.length; i++) {
                const file = fileSelector.files[i];
                const url = URL.createObjectURL(file);
                await handleLoad(url, file.name);
                URL.revokeObjectURL(url);
            }
        };
        document.body.append(fileSelector);
    }

    // create the file drag & drop handler
    CreateDropHandler(dropTarget, async (entries) => {
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            await handleLoad(entry.url, entry.filename);
        }
    });

    // get the array of visible splats
    const getSplats = () => {
        return (scene.getElementsByType(ElementType.splat) as Splat[]).filter(splat => splat.visible);
    };

    events.function('scene.empty', () => {
        return getSplats().length === 0;
    });

    events.function('scene.new', async () => {
        if (events.invoke('scene.dirty')) {
            const result = await events.invoke('showPopup', {
                type: 'yesno',
                header: 'RESET SCENE',
                message: `You have unsaved changes. Are you sure you want to reset the scene?`
            });

            if (result.action !== 'yes') {
                return false;
            }
        }

        events.fire('scene.clear');

        return true;
    });

    events.on('scene.import', async () => {
        if (fileSelector) {
            fileSelector.click();
        } else {
            try {
                const handles = await window.showOpenFilePicker({
                    id: 'SuperSplatFileOpen',
                    multiple: true,
                    types: filePickerTypes.gsplatfile as FilePickerAcceptType[]
                });
                for (let i = 0; i < handles.length; i++) {
                    const handle = handles[i];
                    const file = await handle.getFile();
                    const url = URL.createObjectURL(file);
                    await handleLoad(url, file.name);
                    URL.revokeObjectURL(url);

                    if (i === 0) {
                        fileHandle = handle;
                    }
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
            }
        }
    });

    events.function('scene.export', async (type: ExportType, outputFilename: string = null) => {
        const extensions = {
            'ply': '.ply',
            'compressed-ply': '.compressed.ply',
            'ssplat': '.splat'
        };

        const replaceExtension = (filename: string, extension: string) => {
            const removeExtension = (filename: string) => {
                return filename.substring(0, filename.length - path.getExtension(filename).length);
            };
            return `${removeExtension(filename)}${extension}`;
        }

        const splats = getSplats();
        const splat = splats[0];
        const filename = outputFilename ?? replaceExtension(splat.filename, extensions[type]);

        if (window.showSaveFilePicker) {
            try {
                const fileHandle = await window.showSaveFilePicker({
                    id: 'SuperSplatFileExport',
                    types: filePickerTypes[type] as FilePickerAcceptType[],
                    suggestedName: filename
                });
                await events.invoke('scene.write', {
                    type: type,
                    stream: await fileHandle.createWritable()
                });
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
            }
        } else {
            const result = await events.invoke('showPopup', {
                type: 'okcancel',
                header: 'EXPORT',
                message: 'Please enter a filename',
                value: filename
            });

            if (result.action === 'ok') {
                await events.invoke('scene.write', {
                    type: type,
                    filename: result.value
                });
            }
        }
    });

    const serializeData = (splats: Splat[], type: ExportType) => {
        const convertData = splats.map((splat) => {
            return {
                splatData: splat.splatData,
                alignmentMat: splat.entity.getWorldTransform()
            };
        });

        switch (type) {
            case 'ply':
                return serializeAsPly(convertData);
            case 'compressed-ply':
                return serializeAsCompressedPly(convertData);
            case 'ssplat':
                return serializeAsSSplat(convertData);
        }
    };

    events.function('scene.write', async (options: SceneWriteOptions) => {
        const splats = getSplats();

        startSpinner();

        // setTimeout so spinner has a chance to activate
        await new Promise<void>((resolve) => {
            setTimeout(resolve);
        });

        const data = serializeData(splats, options.type);

        if (options.stream) {
            // write to stream
            await writeToFile(options.stream, data);
        } else if (remoteStorageDetails) {
            // write data to remote storage
            await sendToRemoteStorage(options.filename, data, remoteStorageDetails);
        } else if (options.filename) {
            // download file to local machine
            download(options.filename, data);
        }

        stopSpinner();
    });
};

export { initFileHandler };
