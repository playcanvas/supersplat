import { path } from 'playcanvas';
import { Scene } from './scene';
import { Events } from './events';
import { CreateDropHandler } from './drop-handler';
import { convertPly, convertPlyCompressed, convertSplat } from './splat-convert';
import { startSpinner, stopSpinner } from './ui/spinner';
import { ElementType } from './element';
import { Splat } from './splat';

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

// initialize file handler events
const initFileHandler = async (scene: Scene, events: Events, dropTarget: HTMLElement, remoteStorageDetails: RemoteStorageDetails) => {

    // create a file selector element as fallback when showOpenFilePicker isn't available
    let fileSelector: HTMLInputElement;
    if (!window.showOpenFilePicker) {
        fileSelector = document.createElement('input');
        fileSelector.setAttribute('id', 'file-selector');
        fileSelector.setAttribute('type', 'file');
        fileSelector.setAttribute('accept', '.ply');
        fileSelector.onchange = async () => {
            const files = fileSelector.files;
            if (files.length > 0) {
                const file = fileSelector.files[0];
                const url = URL.createObjectURL(file);
                await scene.loadModel(url, file.name);
                URL.revokeObjectURL(url);
            }
        };
        document.body.append(fileSelector);
    }

    // create the file drag & drop handler
    CreateDropHandler(dropTarget, async (entries) => {
        const modelExtensions = ['.ply'];
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (modelExtensions.some(extension => entry.filename.endsWith(extension))) {
                await scene.loadModel(entry.url, entry.filename);
            }
        }
    });

    // get the array of visible splats
    const getSplats = () => {
        return (scene.getElementsByType(ElementType.splat) as Splat[]).filter(splat => splat.visible);
    };

    events.function('scene.canSave', () => {
        return getSplats().length > 0;
    });

    events.on('scene.new', () => {
        scene.clear();
    });

    events.on('scene.open', async () => {
        if (fileSelector) {
            fileSelector.click();
        } else {
            try {
                const handle = (await window.showOpenFilePicker({
                    id: 'SuperSplatFileOpen',
                    types: filePickerTypes.ply as FilePickerAcceptType[]
                }))[0];
                const file = await handle.getFile();
                const url = URL.createObjectURL(file);
                await scene.loadModel(url, file.name);
                URL.revokeObjectURL(url);

                fileHandle = handle;
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
            await events.invoke('scene.export', 'ply', splat.filename);
            events.fire('scene.saved');
        }
    });

    events.function('scene.export', async (type: ExportType, outputFilename: string = null) => {
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
                message: 'Enter filename:',
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

    const convertData = (splats: Splat[], type: ExportType) => {
        const convertData = splats.map((splat) => {
            return {
                splatData: splat.splatData,
                modelMat: splat.pivot.getWorldTransform()
            };
        });

        switch (type) {
            case 'ply':
                return convertPly(convertData);
            case 'compressed-ply':
                return convertPlyCompressed(convertData);
            case 'splat':
                return convertSplat(convertData);
        }
    };

    events.function('scene.write', async (options: SceneWriteOptions) => {
        const splats = getSplats();

        startSpinner();

        // setTimeout so spinner has a chance to activate
        await new Promise<void>((resolve) => {
            setTimeout(resolve);
        });

        const data = convertData(splats, options.type);

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
