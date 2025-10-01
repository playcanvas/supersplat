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
    'sog': {
        description: 'SOG Scene',
        accept: {
            'application/x-gaussian-splat': ['.json', '.sog'],
            'image/webp': ['.webp']
        }
    },
    'splat': {
        description: 'Splat File',
        accept: {
            'application/x-gaussian-splat': ['.splat']
        }
    },
    'jsonCamera': {
        description: 'JSON Camera Animation',
        accept: {
            'application/json': ['.json']
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

type ImportFile = {
    filename: string;
    url?: string;
    contents?: File;
};

const vec = new Vec3();

const loadCameraPoses = async (file: ImportFile, events: Events) => {
    const response = new Response(file.contents);
    const json = await response.json();
    
    // Check if this is a Blender camera export format
    if (json.poses && json.camera_name) {
        await loadBlenderCameraPoses(json, events);
        return;
    }
    
    // Handle legacy format
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
                    name: pose.img_name ?? `${file.filename}_${i}`,
                    frame: i,
                    position: new Vec3(-p.x, -p.y, p.z),
                    target: new Vec3(-vec.x, -vec.y, vec.z)
                });
            }
        });
    }
};

const loadBlenderCameraPoses = async (jsonData: any, events: Events) => {
    try {
        
        // Set timeline frame count
        const maxFrame = Math.max(...jsonData.poses.map((pose: any) => pose.frame));
        const minFrame = Math.min(...jsonData.poses.map((pose: any) => pose.frame));
        const totalFrames = maxFrame - minFrame + 1;
        
        events.fire('timeline.setFrames', totalFrames);
        
        // Set frame rate if available
        if (jsonData.frame_rate) {
            events.fire('timeline.setFrameRate', jsonData.frame_rate);
        }
        
        // Convert Blender coordinates if needed
        // Blender uses Z-up, SuperSplat typically uses Y-up
        const convertCoordinates = (pos: number[], useZup: boolean = true) => {
            if (useZup) {
                // Convert from Blender Z-up to Y-up: [x, y, z] -> [x, z, -y]
                return new Vec3(pos[0], pos[2], -pos[1]);
            } else {
                // Use coordinates as-is
                return new Vec3(pos[0], pos[1], pos[2]);
            }
        };
        
        // Add poses to timeline
        jsonData.poses.forEach((poseData: any, index: number) => {
            // Convert coordinates (try Z-up first, can be adjusted via the debug panel)
            const position = convertCoordinates(poseData.position, true);
            const target = convertCoordinates(poseData.target, true);
            
            
            events.fire('camera.addPose', {
                name: poseData.name || `${jsonData.camera_name}_frame_${poseData.frame}`,
                frame: poseData.frame - minFrame, // Normalize to start at 0
                position: position,
                target: target,
                fov: poseData.fov || 65, // Import FOV from Blender export
                focalLength: poseData.focal_length // Store focal length for potential future use
            });
        });
        
        
    } catch (error) {
        console.error('Failed to load Blender camera poses:', error);
        throw new Error(`Failed to load Blender camera poses: ${error.message}`);
    }
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

    // import a single file, .ply, .splat or meta.json
    const importFile = async (file: ImportFile, animationFrame: boolean) => {
        try {
            const model = await scene.assetLoader.loadModel({
                contents: file.contents,
                filename: file.filename,
                url: file.url,
                animationFrame
            });
            scene.add(model);
            return model;
        } catch (error) {
            await showLoadError(error.message ?? error, file.filename);
        }
    };

    const importCameraPoses = async (file: ImportFile) => {
        await loadCameraPoses(file, events);
    };
    

    const importSog = async (files: ImportFile[], animationFrame: boolean) => {
        const meta = files.findIndex(f => f.filename.toLowerCase() === 'meta.json');
        const urls = files.map(file => (file.contents && URL.createObjectURL(file.contents)) ?? file.url ?? file.filename);

        const mapUrl = (name: string) => {
            const lowerName = name.toLowerCase();
            if (lowerName.endsWith('.webp')) {
                const idx = files.findIndex(f => f.filename.toLowerCase() === lowerName);
                if (idx >= 0) {
                    return urls[idx] ?? files[idx].url ?? files[idx].filename;
                }
            }
            return name;
        };

        const model = await scene.assetLoader.loadModel({
            filename: files[meta].filename,
            url: urls[meta],
            animationFrame,
            mapUrl: files.length > 1 ? mapUrl : null
        });

        urls.forEach(url => URL.revokeObjectURL(url));

        scene.add(model);

        return model;
    };

    // figure out what the set of files are (ply sequence, document, sog set, ply) and then import them
    const importFiles = async (files: ImportFile[], animationFrame = false) => {
        const filenames = files.map(f => f.filename.toLocaleLowerCase());

        const result = [];

        if (isPlySequence(filenames)) {
            // handle ply sequence
            events.fire('plysequence.setFrames', files.map(f => f.contents));
            events.fire('timeline.frame', 0);
        } else if (isSog(filenames)) {
            // import sog files
            result.push(await importSog(files, animationFrame));
        } else {
            // check for unrecognized file types
            for (let i = 0; i < filenames.length; i++) {
                const filename = filenames[i];
                if (!filename.endsWith('.ssproj') && !filename.endsWith('.json') && !filename.endsWith('.ply') && !filename.endsWith('.splat') && !filename.endsWith('.sog') && !filename.endsWith('.webp')) {
                    await showLoadError('Unrecognized file type', filename);
                    return;
                }
            }

            // handle multiple files as independent imports
            for (let i = 0; i < files.length; i++) {
                if (filenames[i].endsWith('.ssproj')) {
                    await events.invoke('doc.load', files[i].contents ?? (await fetch(files[i].url)).arrayBuffer());
                } else if (filenames[i].endsWith('.json')) {
                    await importCameraPoses(files[i]);
                } else if (filenames[i].endsWith('.ply') || filenames[i].endsWith('.splat') || filenames[i].endsWith('.sog')) {
                    result.push(await importFile(files[i], animationFrame));
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
        fileSelector.setAttribute('accept', '.ply,.splat,meta.json,.json,.webp,.ssproj,.sog');
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
                contents: e.file
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
                    types: [
                        filePickerTypes.ply,
                        filePickerTypes.splat,
                        filePickerTypes.sog
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

    events.function('scene.importJsonCamera', async () => {
        if (fileSelector) {
            // Update file selector to only accept JSON files
            const currentAccept = fileSelector.getAttribute('accept');
            fileSelector.setAttribute('accept', '.json');
            fileSelector.click();
            // Restore original accept attribute after a short delay
            setTimeout(() => {
                fileSelector.setAttribute('accept', currentAccept);
            }, 100);
        } else {
            try {
                const handles = await window.showOpenFilePicker({
                    id: 'SuperSplatJsonCameraImport',
                    multiple: false,
                    types: [{
                        description: 'JSON Camera Files',
                        accept: {
                            'application/json': ['.json']
                        }
                    }]
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
