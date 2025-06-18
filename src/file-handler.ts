import { Vec3 } from 'playcanvas';

import { CreateDropHandler } from './drop-handler';
import { ElementType } from './element';
import { Events } from './events';
import { Scene } from './scene';
import { DownloadWriter, FileStreamWriter } from './serialize/writer';
import { Splat } from './splat';
import { serializePly, serializePlyCompressed, SerializeSettings, serializeSplat, serializeViewer, ViewerExportSettings } from './splat-serialize';
import { localize } from './ui/localization';

// ts compiler and vscode find this type, but eslint does not
type FilePickerAcceptType = unknown;

interface RemoteStorageDetails {
    method: string;
    url: string;
}

type ExportType = 'ply' | 'splat' | 'viewer';

type FileType = 'ply' | 'compressedPly' | 'splat' | 'htmlViewer' | 'packageViewer';

interface SceneExportOptions {
    filename: string;
    splatIdx: 'all' | number;
    serializeSettings: SerializeSettings;

    // ply
    compressedPly?: boolean;

    // viewer
    viewerExportSettings?: ViewerExportSettings;
}

const filePickerTypes: { [key: string]: FilePickerAcceptType } = {
    'ply': {
        description: 'Gaussian Splat PLY File',
        accept: {
            'application/ply': ['.ply']
        }
    },
    'compressedPly': {
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
            const avalue = a.id ?? a.img_name?.match(/\d*$/)?.[0];
            const bvalue = b.id ?? b.img_name?.match(/\d*$/)?.[0];
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
                    frame: i,
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
    const handleImport = async (url: string, filename?: string, animationFrame = false) => {
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
            } else if (lowerFilename.endsWith('.ply') || lowerFilename.endsWith('.splat') || (lowerFilename === 'meta.json')) {
                const model = await scene.assetLoader.loadModel({ url, filename, animationFrame });
                scene.add(model);
                return model;
            } else if (lowerFilename.endsWith('.json')) {
                await loadCameraPoses(url, filename, events);
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

    events.function('import', (url: string, filename?: string, animationFrame = false) => {
        return handleImport(url, filename, animationFrame);
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
                const regex = /(.*?)(\d+)(?:\.compressed)?\.ply$/;
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

    events.function('scene.export', async (exportType: 'ply' | 'splat' | 'viewer') => {
        const splats = getSplats();

        const hasFilePicker = !!window.showSaveFilePicker;

        // show viewer export options
        const options = await events.invoke('show.exportPopup', exportType, splats.map(s => s.name), !hasFilePicker) as SceneExportOptions;

        // return if user cancelled
        if (!options) {
            return;
        }

        const fileType =
            (exportType === 'viewer') ? (options.viewerExportSettings.type === 'zip' ? 'packageViewer' : 'htmlViewer') :
                (exportType === 'ply') ? (options.compressedPly ? 'compressedPly' : 'ply') : 'splat';

        if (hasFilePicker) {
            try {
                const fileHandle = await window.showSaveFilePicker({
                    id: 'SuperSplatFileExport',
                    types: [filePickerTypes[fileType]],
                    suggestedName: options.filename
                });
                await events.invoke('scene.write', fileType, options, await fileHandle.createWritable());
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
            }
        } else {
            await events.invoke('scene.write', fileType, options);
        }
    });

    events.function('scene.write', async (fileType: FileType, options: SceneExportOptions, stream?: FileSystemWritableFileStream) => {
        events.fire('startSpinner');

        try {
            // setTimeout so spinner has a chance to activate
            await new Promise<void>((resolve) => {
                setTimeout(resolve);
            });

            const { filename, splatIdx, serializeSettings, viewerExportSettings } = options;

            const writer = stream ? new FileStreamWriter(stream) : new DownloadWriter(filename);

            try {
                const splats = splatIdx === 'all' ? getSplats() : [getSplats()[splatIdx]];

                switch (fileType) {
                    case 'ply':
                        await serializePly(splats, serializeSettings, writer);
                        break;
                    case 'compressedPly':
                        serializeSettings.minOpacity = 1 / 255;
                        serializeSettings.removeInvalid = true;
                        await serializePlyCompressed(splats, serializeSettings, writer);
                        break;
                    case 'splat':
                        await serializeSplat(splats, serializeSettings, writer);
                        break;
                    case 'htmlViewer':
                    case 'packageViewer':
                        await serializeViewer(splats, serializeSettings, viewerExportSettings, writer);
                        break;
                }
            } finally {
                await writer.close();
            }

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

export { initFileHandler, ExportType, SceneExportOptions };
