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
};

type ExportType = 'ply' | 'compressed-ply' | 'splat';

interface SceneWriteOptions {
    type: ExportType;
    filename?: string;
    stream?: FileSystemWritableFileStream;
};

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
const initFileHandler = async (scene: Scene, events: Events, canvas: HTMLCanvasElement, remoteStorageDetails: RemoteStorageDetails) => {

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
    CreateDropHandler(canvas, urls => {
        const modelExtensions = ['.ply'];
        const model = urls.find(url => modelExtensions.some(extension => url.filename.endsWith(extension)));
        if (model) {
            scene.loadModel(model.url, model.filename);
        }
    });

    // get the active splat
    const getSplat = () => {
        const splats = scene.getElementsByType(ElementType.splat) as Splat[];
        return splats.length > 0 ? splats[0] : null;
    };

    events.function('scene.canSave', () => {
        return getSplat() !== null;
    });

    events.on('scene.new', () => {
        // TODO
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
        const splat = getSplat();
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

        const splat = getSplat();
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

    const convertData = (splat: Splat, type: ExportType) => {
        switch (type) {
            case 'ply':
                return convertPly(splat.splatData, splat.root.getWorldTransform());
            case 'compressed-ply':
                return convertPlyCompressed(splat.splatData, splat.root.getWorldTransform());
            case 'splat':
                return convertSplat(splat.splatData, splat.root.getWorldTransform());
        }
    };

    events.function('scene.write', async (options: SceneWriteOptions) => {
        const splat = getSplat();

        startSpinner();

        // setTimeout so spinner has a chance to activate
        await new Promise<void>((resolve) => {
            setTimeout(resolve);
        });

        const data = convertData(splat, options.type);

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
