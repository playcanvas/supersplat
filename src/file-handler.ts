import { path, Vec3 } from 'playcanvas';
import { Scene } from './scene';
import { Events } from './events';
import { CreateDropHandler } from './drop-handler';
import { WriteFunc, serializePly, serializePlyCompressed, serializeSplat } from './splat-serialize';
import { ElementType } from './element';
import { Splat } from './splat';
import { localize } from './ui/localization';

interface RemoteStorageDetails {
    method: string;
    url: string;
}

type ExportType = 'ply' | 'compressed-ply' | 'splat';

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
    'splat': [{
            description: 'Gaussian Splat File',
            accept: {
                'application/octet-stream': ['.splat']
            }
    }]
};

let fileHandle: FileSystemFileHandle = null;

const vec = new Vec3();

// download the data to the given filename
const download = (filename: string, data: Uint8Array) => {
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

    // returns a promise that resolves when the file is loaded
    const handleLoad = async (url: string, filename?: string) => {
        try {
            if (!filename) {
                // extract filename from url if one ins't provided
                try {
                    filename = new URL(url, document.baseURI).pathname.split('/').pop();
                } catch (e) {
                    filename = url;
                }                
            }

            const lowerFilename = (filename || url).toLowerCase();
            if (lowerFilename.endsWith('.json')) {
                await loadCameraPoses(url, filename, events);
            } else if (lowerFilename.endsWith('.ply') || lowerFilename.endsWith('.splat')) {
                const model = await scene.assetLoader.loadModel({ url, filename });
                scene.add(model);
                scene.camera.focus();
                events.fire('loaded', filename);
            } else {
                throw new Error(`Unsupported file type`);
            }
        } catch (err) {
            events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error-loading'),
                message: `${err.message ?? err} while loading '${filename}'`
            });
        }
    };

    events.function('load', (url: string, filename?: string) => {
        return handleLoad(url, filename);
    });

    // create a file selector element as fallback when showOpenFilePicker isn't available
    let fileSelector: HTMLInputElement;
    if (!window.showOpenFilePicker) {
        fileSelector = document.createElement('input');
        fileSelector.setAttribute('id', 'file-selector');
        fileSelector.setAttribute('type', 'file');
        fileSelector.setAttribute('accept', '.ply,.splat');
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

    events.on('scene.open', async () => {
        if (fileSelector) {
            fileSelector.click();
        } else {
            try {
                const handles = await window.showOpenFilePicker({
                    id: 'SuperSplatFileOpen',
                    multiple: true,
                    types: [filePickerTypes.ply, filePickerTypes.splat] as FilePickerAcceptType[]
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

    events.on('scene.save', async () => {
        if (fileHandle) {
            try {
                await events.invoke('scene.write', {
                    type: 'ply',
                    stream: await fileHandle.createWritable()
                });
                events.fire('scene.saved');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
            }
        } else {
            events.fire('scene.saveAs');
        }
    });

    events.on('scene.saveAs', async () => {
        const splats = getSplats();
        const splat = splats[0];

        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    id: 'SuperSplatFileSave',
                    types: filePickerTypes.ply as FilePickerAcceptType[],
                    suggestedName: fileHandle?.name ?? splat.filename ?? 'scene.ply'
                });
                await events.invoke('scene.write', {
                    type: 'ply',
                    stream: await handle.createWritable()
                });
                fileHandle = handle;
                events.fire('scene.saved');
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
            }
        } else {
            await events.invoke('scene.export', 'ply', splat.filename, 'saveAs');
            events.fire('scene.saved');
        }
    });

    events.function('scene.export', async (type: ExportType, outputFilename: string = null, exportType: 'export' | 'saveAs' = 'export') => {
        const extensions = {
            'ply': '.ply',
            'compressed-ply': '.compressed.ply',
            'splat': '.splat'
        };

        const replaceExtension = (filename: string, extension: string) => {
            const removeExtension = (filename: string) => {
                return filename.substring(0, filename.length - path.getExtension(filename).length);
            };
            return `${removeExtension(filename)}${extension}`;
        };

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
                header: exportType === 'saveAs' ? 'SAVE AS' : 'EXPORT',
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

    const writeScene = async (type: ExportType, writeFunc: WriteFunc) => {
        const splats = getSplats();

        switch (type) {
            case 'ply':
                await serializePly(splats, writeFunc);
                break;
            case 'compressed-ply':
                await serializePlyCompressed(splats, writeFunc);
                return;
            case 'splat':
                await serializeSplat(splats, writeFunc);
                return;
        }
    };

    events.function('scene.write', async (options: SceneWriteOptions) => {
        events.fire('startSpinner');

        try {
            // setTimeout so spinner has a chance to activate
            await new Promise<void>((resolve) => {
                setTimeout(resolve);
            });

            const { stream } = options;

            if (stream) {
                // writer must keep track of written bytes because JS streams don't
                let cursor = 0;
                const writeFunc = (data: Uint8Array) => {
                    cursor += data.byteLength;
                    return stream.write(data);
                };

                await stream.seek(0);
                await writeScene(options.type, writeFunc);
                await stream.truncate(cursor);
                await stream.close();
            } else if (options.filename) {
                // safari and firefox: concatenate data into single buffer for old-school download
                let data: Uint8Array = null;
                let cursor = 0;

                const writeFunc = (chunk: Uint8Array, finalWrite?: boolean) => {
                    if (!data) {
                        data = finalWrite ? chunk : chunk.slice();
                        cursor = chunk.byteLength;
                     } else {
                        if (data.byteLength < cursor + chunk.byteLength) {
                            let newSize = data.byteLength * 2;
                            while (newSize < cursor + chunk.byteLength) {
                                newSize *= 2;
                            }
                            const newData = new Uint8Array(newSize);
                            newData.set(data);
                            data = newData;
                        }
                        data.set(chunk, cursor);
                        cursor += chunk.byteLength;
                    }
                };
                await writeScene(options.type, writeFunc);
                download(options.filename, (cursor === data.byteLength) ? data : new Uint8Array(data.buffer, 0, cursor));
            }
        } catch (err) {
            events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error-loading'),
                message: `${err.message ?? err} while saving file`
            });
        } finally {
            events.fire('stopSpinner');
        }
    });
};

export { initFileHandler };
