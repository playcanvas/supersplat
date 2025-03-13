import { path, Vec3 } from 'playcanvas';

import { CreateDropHandler } from './drop-handler';
import { ElementType } from './element';
import { Events } from './events';
import { Scene } from './scene';
import { Writer, DownloadWriter, FileStreamWriter } from './serialize/writer';
import { Splat } from './splat';
import { serializePly, serializePlyCompressed, SerializeSettings, serializeSplat, serializeViewer, ViewerExportSettings } from './splat-serialize';
import { localize } from './ui/localization';

// ts compiler and vscode find this type, but eslint does not
type FilePickerAcceptType = unknown;

interface RemoteStorageDetails {
    method: string;
    url: string;
}

type ExportType = 'ply' | 'compressed-ply' | 'splat' | 'viewer';

interface SceneWriteOptions {
    type: ExportType;
    filename?: string;
    stream?: FileSystemWritableFileStream;
    viewerExportSettings?: ViewerExportSettings
}

const filePickerTypes: { [key: string]: FilePickerAcceptType } = {
    'ply': {
        description: 'Gaussian Splat PLY File',
        accept: {
            'application/ply': ['.ply']
        }
    },
    'compressed-ply': {
        description: 'Compressed Gaussian Splat PLY File',
        accept: {
            'application/ply': ['.ply']
        }
    },
    'splat': {
        description: 'Gaussian Splat File',
        accept: {
            'application/x-gaussian-splat': ['.splat']
        }
    },
    'htmlViewer': {
        description: 'Viewer HTML',
        accept: {
            'text/html': ['.html']
        }
    },
    'packageViewer': {
        description: 'Viewer ZIP',
        accept: {
            'application/zip': ['.zip']
        }
    }
};

let fileHandle: FileSystemFileHandle = null;

const vec = new Vec3();

// download the data to the given filename
const download = (filename: string, data: Uint8Array) => {
    const blob = new Blob([data], { type: 'octet/stream' });
    const url = window.URL.createObjectURL(blob);

    const lnk = document.createElement('a');
    lnk.download = filename;
    lnk.href = url;

    // create a "fake" click-event to trigger the download
    if (document.createEvent) {
        const e = document.createEvent('MouseEvents');
        e.initMouseEvent('click', true, true, window,
            0, 0, 0, 0, 0, false, false, false,
            false, 0, null);
        lnk.dispatchEvent(e);
    } else {
        // @ts-ignore
        lnk.fireEvent?.('onclick');
    }

    window.URL.revokeObjectURL(url);
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

        // sort entries by trailing number if it exists
        const sorter = (a: any, b: any) => {
            const avalue = a.img_name?.match(/\d*$/)?.[0];
            const bvalue = b.img_name?.match(/\d*$/)?.[0];
            return (avalue && bvalue) ? parseInt(avalue, 10) - parseInt(bvalue, 10) : 0;
        };

        json.sort(sorter).forEach((pose: any, i: number) => {
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
const initFileHandler = (scene: Scene, events: Events, dropTarget: HTMLElement, remoteStorageDetails: RemoteStorageDetails) => {

    // returns a promise that resolves when the file is loaded
    const handleImport = async (url: string, filename?: string, focusCamera = true, animationFrame = false) => {
        try {
            if (!filename) {
                // extract filename from url if one isn't provided
                try {
                    filename = new URL(url, document.baseURI).pathname.split('/').pop();
                } catch (e) {
                    filename = url;
                }
            }

            const lowerFilename = (filename || url).toLowerCase();
            if (lowerFilename.endsWith('.ssproj')) {
                await events.invoke('doc.dropped', new File([await (await fetch(url)).blob()], filename));
            } else if (lowerFilename.endsWith('.json')) {
                await loadCameraPoses(url, filename, events);
            } else if (lowerFilename.endsWith('.ply') || lowerFilename.endsWith('.splat')) {
                const model = await scene.assetLoader.loadModel({ url, filename, animationFrame });
                scene.add(model);
                if (focusCamera) scene.camera.focus();
                return model;
            } else {
                throw new Error('Unsupported file type');
            }
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error-loading'),
                message: `${error.message ?? error} while loading '${filename}'`
            });
        }
    };

    events.function('import', (url: string, filename?: string, focusCamera = true, animationFrame = false) => {
        return handleImport(url, filename, focusCamera, animationFrame);
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
                await handleImport(url, file.name);
                URL.revokeObjectURL(url);
            }
        };
        document.body.append(fileSelector);
    }

    // create the file drag & drop handler
    CreateDropHandler(dropTarget, async (entries, shift) => {
        // document load, only support a single file drop
        if (entries.length === 1 && entries[0].file?.name?.toLowerCase().endsWith('.ssproj')) {
            await events.invoke('doc.dropped', entries[0].file);
            return;
        }

        // filter out non supported extensions
        entries = entries.filter((entry) => {
            const name = entry.file?.name;
            if (!name) return false;
            const lowerName = name.toLowerCase();
            return lowerName.endsWith('.ply') || lowerName.endsWith('.splat') || lowerName.endsWith('.json');
        });

        if (entries.length === 0) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error-loading'),
                message: localize('popup.drop-files')
            });
        } else {
            // determine if all files share a common filename prefix followed by
            // a frame number, e.g. "frame0001.ply", "frame0002.ply", etc.
            const isSequence = () => {
                // eslint-disable-next-line regexp/no-super-linear-backtracking
                const regex = /(.*?)(\d+).ply$/;
                const baseMatch = entries[0].file.name?.toLowerCase().match(regex);
                if (!baseMatch) {
                    return false;
                }

                for (let i = 1; i < entries.length; i++) {
                    const thisMatch = entries[i].file.name?.toLowerCase().match(regex);
                    if (!thisMatch || thisMatch[1] !== baseMatch[1]) {
                        return false;
                    }
                }

                return true;
            };

            if (entries.length > 1 && isSequence()) {
                events.fire('plysequence.setFrames', entries.map(e => e.file));
                events.fire('timeline.frame', 0);
            } else {
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    const url = URL.createObjectURL(entry.file);
                    await handleImport(url, entry.filename);
                    URL.revokeObjectURL(url);
                }
            }
        }
    });

    // get the list of visible splats containing gaussians
    const getSplats = () => {
        return (scene.getElementsByType(ElementType.splat) as Splat[])
        .filter(splat => splat.visible)
        .filter(splat => splat.numSplats > 0);
    };

    events.function('scene.allSplats', () => {
        return (scene.getElementsByType(ElementType.splat) as Splat[]);
    });

    events.function('scene.splats', () => {
        return getSplats();
    });

    events.function('scene.empty', () => {
        return getSplats().length === 0;
    });

    events.function('scene.import', async () => {
        if (fileSelector) {
            fileSelector.click();
        } else {
            try {
                const handles = await window.showOpenFilePicker({
                    id: 'SuperSplatFileOpen',
                    multiple: true,
                    types: [filePickerTypes.ply, filePickerTypes.splat]
                });
                for (let i = 0; i < handles.length; i++) {
                    const handle = handles[i];
                    const file = await handle.getFile();
                    const url = URL.createObjectURL(file);
                    await handleImport(url, file.name);
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

    // open a folder
    events.function('scene.openAnimation', async () => {
        try {
            const handle = await window.showDirectoryPicker({
                id: 'SuperSplatFileOpenAnimation',
                mode: 'readwrite'
            });

            if (handle) {
                const files = [];
                for await (const value of handle.values()) {
                    if (value.kind === 'file') {
                        const file = await value.getFile();
                        if (file.name.toLowerCase().endsWith('.ply')) {
                            files.push(file);
                        }
                    }
                }
                events.fire('plysequence.setFrames', files);
                events.fire('timeline.frame', 0);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
            }
        }
    });

    events.function('scene.export', async (type: ExportType, outputFilename: string = null, exportType: 'export' | 'saveAs' = 'export') => {
        const extensions = {
            'ply': '.ply',
            'compressed-ply': '.compressed.ply',
            'splat': '.splat',
            'viewer': '-viewer.html'
        };

        const removeExtension = (filename: string) => {
            return filename.substring(0, filename.length - path.getExtension(filename).length);
        };

        const replaceExtension = (filename: string, extension: string) => {
            return `${removeExtension(filename)}${extension}`;
        };

        const splats = getSplats();
        const splat = splats[0];
        let filename = outputFilename ?? replaceExtension(splat.filename, extensions[type]);

        const hasFilePicker = window.showSaveFilePicker;

        let viewerExportSettings;
        if (type === 'viewer') {
            // show viewer export options
            viewerExportSettings = await events.invoke('show.viewerExportPopup', hasFilePicker ? null : filename);

            // return if user cancelled
            if (!viewerExportSettings) {
                return;
            }

            if (hasFilePicker) {
                filename = replaceExtension(filename, viewerExportSettings.type === 'html' ? '.html' : '.zip');
            } else {
                filename = viewerExportSettings.filename;
            }
        }

        if (hasFilePicker) {
            try {
                const filePickerType = type === 'viewer' ? (viewerExportSettings.type === 'html' ? filePickerTypes.htmlViewer : filePickerTypes.packageViewer) : filePickerTypes[type];

                const fileHandle = await window.showSaveFilePicker({
                    id: 'SuperSplatFileExport',
                    types: [filePickerType],
                    suggestedName: filename
                });
                await events.invoke('scene.write', {
                    type,
                    stream: await fileHandle.createWritable(),
                    viewerExportSettings
                });
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
            }
        } else {
            await events.invoke('scene.write', { type, filename, viewerExportSettings });
        }
    });

    const writeScene = async (type: ExportType, writer: Writer, viewerExportSettings?: ViewerExportSettings) => {
        const splats = getSplats();
        const events = splats[0].scene.events;

        const serializeSettings: SerializeSettings = {
            maxSHBands: events.invoke('view.bands')
        };

        switch (type) {
            case 'ply':
                await serializePly(splats, serializeSettings, writer);
                break;
            case 'compressed-ply':
                serializeSettings.minOpacity = 1 / 255;
                serializeSettings.removeInvalid = true;
                await serializePlyCompressed(splats, serializeSettings, writer);
                break;
            case 'splat':
                await serializeSplat(splats, serializeSettings, writer);
                break;
            case 'viewer':
                await serializeViewer(splats, viewerExportSettings, writer);
                break;
        }
    };

    events.function('scene.write', async (options: SceneWriteOptions) => {
        events.fire('startSpinner');

        try {
            // setTimeout so spinner has a chance to activate
            await new Promise<void>((resolve) => {
                setTimeout(resolve);
            });

            const { stream, filename, type, viewerExportSettings } = options;
            const writer = stream ? new FileStreamWriter(stream) : new DownloadWriter(filename);

            await writeScene(type, writer, viewerExportSettings);
            await writer.close();
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error-loading'),
                message: `${error.message ?? error} while saving file`
            });
        } finally {
            events.fire('stopSpinner');
        }
    });
};

export { initFileHandler };
