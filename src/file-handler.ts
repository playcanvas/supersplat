import { path, Quat, Vec3 } from 'playcanvas';

import { CreateDropHandler } from './drop-handler';
import { ElementType } from './element';
import { Events } from './events';
import { BrowserFileSystem, MappedReadFileSystem } from './io';
import { Scene } from './scene';
import { Splat } from './splat';
import { serializePly, serializePlyCompressed, SerializeSettings, serializeSog, serializeSplat, serializeViewer, SogSettings, ViewerExportSettings } from './splat-serialize';
import { localize } from './ui/localization';

// ts compiler and vscode find this type, but eslint does not
type FilePickerAcceptType = unknown;

type ExportType = 'ply' | 'splat' | 'sog' | 'viewer';

type FileType = 'ply' | 'compressedPly' | 'splat' | 'sog' | 'htmlViewer' | 'packageViewer';

interface SceneExportOptions {
    filename: string;
    splatIdx: 'all' | number;
    serializeSettings: SerializeSettings;

    // ply
    compressedPly?: boolean;

    // sog
    sogIterations?: number;

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
    'sog': {
        description: 'SOG Scene',
        accept: {
            'application/x-gaussian-splat': ['.json', '.sog'],
            'image/webp': ['.webp']
        }
    },
    'lcc': {
        description: 'LCC Scene',
        accept: {
            'application/json': ['.lcc'],
            'application/octet-stream': ['.bin']
        }
    },
    'splat': {
        description: 'Splat File',
        accept: {
            'application/x-gaussian-splat': ['.splat']
        }
    },
    'ksplat': {
        description: 'KSplat File',
        accept: {
            'application/x-gaussian-splat': ['.ksplat']
        }
    },
    'spz': {
        description: 'SPZ File (Niantic)',
        accept: {
            'application/x-gaussian-splat': ['.spz']
        }
    },
    'indexTxt': {
        description: 'Colmap Poses (Images.txt)',
        accept: {
            'text/plain': ['.txt']
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

const allImportTypes = {
    description: 'Supported Files',
    accept: {
        'application/ply': ['.ply'],
        'application/x-gaussian-splat': ['.json', '.sog', '.splat', '.ksplat', '.spz'],
        'image/webp': ['.webp'],
        'application/json': ['.lcc'],
        'application/octet-stream': ['.bin'],
        'text/plain': ['.txt']
    }
};

// determine if all files share a common filename prefix followed by
// a frame number, e.g. "frame0001.ply", "frame0002.ply", etc.
const isPlySequence = (filenames: string[]) => {
    if (filenames.length < 2) {
        return false;
    }

    // eslint-disable-next-line regexp/no-super-linear-backtracking
    const regex = /(.*?)(\d+)(?:\.compressed)?\.ply$/;
    const baseMatch = filenames[0].match(regex);
    if (!baseMatch) {
        return false;
    }

    for (let i = 1; i < filenames.length; i++) {
        const thisMatch = filenames[i].match(regex);
        if (!thisMatch || thisMatch[1] !== baseMatch[1]) {
            return false;
        }
    }

    return true;
};

// sog comprises a single meta.json file and zero or more .webp files
const isSog = (filenames: string[]) => {
    const count = (extension: string) => filenames.reduce((sum, f) => sum + (f.endsWith(extension) ? 1 : 0), 0);
    return count('meta.json') === 1;
};

// The LCC file contains meta.lcc, index.bin, data.bin and shcoef.bin (optional)
const isLcc = (filenames: string[]) => {
    const count = (extension: string) => filenames.reduce((sum, f) => sum + (f.endsWith(extension) ? 1 : 0), 0);
    return count('.lcc') === 1;
};

type ImportFile = {
    filename: string;
    url?: string;
    contents?: File;
    handle?: FileSystemFileHandle;
};

const vec = new Vec3();

// load inria camera poses from json file
const loadCameraPoses = async (file: ImportFile, events: Events) => {
    const response = new Response(file.contents);
    const json = await response.json();

    if (json.length > 0) {
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

                // Use fixed offset along Z-axis direction instead of variable dot product
                vec.copy(z).mulScalar(10).add(p);

                events.fire('camera.addPose', {
                    name: pose.img_name ?? `${file.filename}_${i}`,
                    frame: i,
                    position: new Vec3(-p.x, -p.y, p.z),
                    target: new Vec3(-vec.x, -vec.y, vec.z)
                });
            }
        });
    }
};

const removeExtension = (filename: string) => {
    return filename.substring(0, filename.length - path.getExtension(filename).length);
};

// https://colmap.github.io/format.html#images-txt
const loadImagesTxt = async (file: ImportFile, events: Events) => {
    const response = new Response(file.contents);
    const text = await response.text();

    // split into lines, remove comments and empty lines
    const poses = text.split('\n')
    .map(line => line.trim())
    .filter(line => !line.startsWith('#'))      // remove comments
    .filter((_, i) => i % 2 === 0)              // remove every second line
    .map((line, i) => {
        const parts = line.split(' ');
        if (parts.length !== 10) {
            return null;
        }
        const name = parts[9];
        const order = parseInt(removeExtension(name).match(/\d+$/)?.[0], 10);
        return {
            w: parseFloat(parts[1]),
            x: parseFloat(parts[2]),
            y: parseFloat(parts[3]),
            z: parseFloat(parts[4]),
            tx: parseFloat(parts[5]),
            ty: parseFloat(parts[6]),
            tz: parseFloat(parts[7]),
            name: name ?? `${file.filename}_${i}`,
            order: isFinite(order) ? order : i
        };
    })
    .filter(entry => !!entry)
    .sort((a, b) => (a.order < b.order ? -1 : 1));

    const q = new Quat();
    const t = new Vec3();

    poses.forEach((pose, i) => {
        const { w, x, y, z, tx, ty, tz } = pose;

        q.set(x, y, z, w).normalize().invert();
        t.set(-tx, -ty, -tz);
        q.transformVector(t, t);

        q.transformVector(Vec3.BACK, vec);
        vec.mulScalar(10).add(t);

        events.fire('camera.addPose', {
            name: pose.name,
            frame: i,
            position: new Vec3(-t.x, -t.y, t.z),
            target: new Vec3(-vec.x, -vec.y, vec.z)
        });
    });
};

// initialize file handler events
const initFileHandler = (scene: Scene, events: Events, dropTarget: HTMLElement) => {

    const showLoadError = async (message: string, filename: string) => {
        await events.invoke('showPopup', {
            type: 'error',
            header: localize('popup.error-loading'),
            message: `${message} while loading '${filename}'`
        });
    };

    // import splat model(s) - handles single files, SOG, and LCC formats
    const importSplatModel = async (files: ImportFile[], animationFrame: boolean) => {
        try {
            const filenames = files.map(f => f.filename.toLowerCase());

            // Determine the main file based on format
            let mainIndex: number;
            if (filenames.some(f => f === 'meta.json')) {
                mainIndex = filenames.findIndex(f => f === 'meta.json');
            } else if (filenames.some(f => f.endsWith('.lcc'))) {
                mainIndex = filenames.findIndex(f => f.endsWith('.lcc'));
            } else {
                mainIndex = 0;  // Single file case
            }

            const mainFile = files[mainIndex];
            const baseUrl = mainFile.url ? new URL('.', new URL(mainFile.url, window.location.href)).href : undefined;

            // Create file system with all local files, falling back to URL loading
            const fileSystem = new MappedReadFileSystem(baseUrl);
            files.forEach((f) => {
                if (f.contents) fileSystem.addFile(f.filename, f.contents);
            });

            // For URL-only single file, use full URL as filename
            const filename = (files.length === 1 && !mainFile.contents && mainFile.url) ?
                mainFile.url :
                mainFile.filename;

            const model = await scene.assetLoader.load(filename, fileSystem, animationFrame);
            await scene.add(model);
            return model;
        } catch (error) {
            const displayName = files[0]?.filename ?? 'unknown';
            await showLoadError(error.message ?? error, displayName);
        }
    };

    // figure out what the set of files are (ply sequence, document, sog set, ply) and then import them
    const importFiles = async (files: ImportFile[], animationFrame = false) => {
        const filenames = files.map(f => f.filename.toLowerCase());

        const result = [];

        if (isPlySequence(filenames)) {
            // handle ply sequence
            events.fire('plysequence.setFrames', files.map(f => f.contents));
            events.fire('timeline.frame', 0);
        } else if (isSog(filenames) || isLcc(filenames)) {
            // import multi-file splat model (SOG or LCC)
            result.push(await importSplatModel(files, animationFrame));
        } else {
            // check for unrecognized file types
            for (let i = 0; i < filenames.length; i++) {
                const filename = filenames[i].toLowerCase();
                if (['.ssproj', '.ply', '.splat', '.sog', '.webp', 'images.txt', '.json', '.ksplat', '.spz'].every(ext => !filename.endsWith(ext))) {
                    await showLoadError('Unrecognized file type', filename);
                    return;
                }
            }

            // handle multiple files as independent imports
            for (let i = 0; i < files.length; i++) {
                const filename = filenames[i].toLowerCase();

                if (filename.endsWith('.ssproj')) {
                    // load ssproj document
                    await events.invoke('doc.load', files[i].contents ?? (await fetch(files[i].url)).arrayBuffer(), files[i].handle);
                } else if (['.ply', '.splat', '.sog', '.ksplat', '.spz'].some(ext => filename.endsWith(ext))) {
                    // load gaussian splat model
                    result.push(await importSplatModel([files[i]], animationFrame));
                } else if (filename.endsWith('images.txt')) {
                    // load colmap frames
                    await loadImagesTxt(files[i], events);
                } else if (filename.endsWith('.json')) {
                    // load inria camera poses
                    await loadCameraPoses(files[i], events);
                }
            }
        }

        return result;
    };

    events.function('import', (files: ImportFile[], animationFrame = false) => {
        return importFiles(files, animationFrame);
    });

    // create a file selector element as fallback when showOpenFilePicker isn't available
    let fileSelector: HTMLInputElement;
    if (!window.showOpenFilePicker) {
        fileSelector = document.createElement('input');
        fileSelector.setAttribute('id', 'file-selector');
        fileSelector.setAttribute('type', 'file');
        fileSelector.setAttribute('accept', '.ply,.splat,meta.json,.json,.webp,.ssproj,.sog,.lcc,.bin,.txt,.ksplat,.spz');
        fileSelector.setAttribute('multiple', 'true');

        fileSelector.onchange = () => {
            const files = [];
            for (let i = 0; i < fileSelector.files.length; i++) {
                const file = fileSelector.files[i];
                files.push({
                    filename: file.name,
                    contents: file
                });
            }
            importFiles(files);
            fileSelector.value = '';
        };
        document.body.append(fileSelector);
    }

    // create the file drag & drop handler
    CreateDropHandler(dropTarget, (entries, shift) => {
        importFiles(entries.map((e) => {
            return {
                filename: e.filename,
                contents: e.file,
                handle: e.handle
            };
        }));
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
                    id: 'SuperSplatFileImport',
                    multiple: true,
                    excludeAcceptAllOption: false,
                    types: [
                        allImportTypes,
                        filePickerTypes.ply,
                        filePickerTypes.compressedPly,
                        filePickerTypes.splat,
                        filePickerTypes.sog,
                        filePickerTypes.lcc,
                        filePickerTypes.ksplat,
                        filePickerTypes.spz,
                        filePickerTypes.indexTxt
                    ]
                });

                const files = [];
                for (let i = 0; i < handles.length; i++) {
                    files.push({
                        filename: handles[i].name,
                        contents: await handles[i].getFile()
                    });
                }

                importFiles(files);

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

    events.function('scene.export', async (exportType: ExportType) => {
        const splats = getSplats();

        const hasFilePicker = !!window.showSaveFilePicker;

        // show viewer export options
        const options = await events.invoke('show.exportPopup', exportType, splats.map(s => s.name), !hasFilePicker) as SceneExportOptions;

        // return if user cancelled
        if (!options) {
            return;
        }

        const fileType: FileType =
            (exportType === 'viewer') ? (options.viewerExportSettings!.type === 'zip' ? 'packageViewer' : 'htmlViewer') :
                (exportType === 'ply') ? (options.compressedPly ? 'compressedPly' : 'ply') :
                    (exportType === 'sog') ? 'sog' : 'splat';

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
        // SOG and viewer exports have their own progress UI, other formats use spinner
        const useSpinner = fileType !== 'sog' && fileType !== 'htmlViewer' && fileType !== 'packageViewer';

        if (useSpinner) {
            events.fire('startSpinner');
        }

        try {
            // setTimeout so spinner/progress has a chance to activate
            await new Promise<void>((resolve) => {
                setTimeout(resolve);
            });

            const { filename, splatIdx, serializeSettings, viewerExportSettings } = options;

            // Create FileSystem for output
            const fs = new BrowserFileSystem(filename, stream);

            const splats = splatIdx === 'all' ? getSplats() : [getSplats()[splatIdx]];

            switch (fileType) {
                case 'ply':
                    await serializePly(splats, serializeSettings, fs);
                    break;
                case 'compressedPly':
                    serializeSettings.minOpacity = 1 / 255;
                    serializeSettings.removeInvalid = true;
                    await serializePlyCompressed(splats, serializeSettings, fs);
                    break;
                case 'splat':
                    await serializeSplat(splats, serializeSettings, fs);
                    break;
                case 'sog': {
                    const sogSettings: SogSettings = {
                        ...serializeSettings,
                        minOpacity: 1 / 255,
                        removeInvalid: true,
                        iterations: options.sogIterations ?? 10,
                        events
                    };
                    await serializeSog(splats, sogSettings, fs);
                    break;
                }
                case 'htmlViewer':
                case 'packageViewer':
                    await serializeViewer(splats, serializeSettings, { ...viewerExportSettings!, events }, fs);
                    break;
            }

        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('popup.error-loading'),
                message: `${error.message ?? error} while saving file`
            });
        } finally {
            if (useSpinner) {
                events.fire('stopSpinner');
            }
        }
    });
};

export { initFileHandler, ExportType, SceneExportOptions };
