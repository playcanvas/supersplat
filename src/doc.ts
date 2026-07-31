import { ZipFileSystem, ZipReadFileSystem } from '@playcanvas/splat-transform';
import type { Asset, Quat } from 'playcanvas';

import { decodeInstances, encodeInstances, restorePalettes } from './doc-instances';
import { Events } from './events';
import { GaussianInstances } from './gaussian-instances';
import { BrowserFileSystem, BlobReadSource } from './io';
import { recentFiles } from './recent-files';
import { Scene } from './scene';
import { Splat } from './splat';
import type { EditorSplatResource } from './splat-resource';
import { writeResourceFile } from './splat-serialize';
import { Transform } from './transform';
import { i18n } from './ui/localization';

// ts compiler and vscode find this type, but eslint does not
type FilePickerAcceptType = unknown;

const SuperFileType: FilePickerAcceptType[] = [{
    description: 'SuperSplat document',
    accept: {
        'application/x-supersplat': ['.ssproj']
    }
}];

type FileSelectorCallback = (fileList: File) => void;

// helper class to show a file selector dialog.
// used when showOpenFilePicker is not available.
class FileSelector {
    show: (callbackFunc: FileSelectorCallback) => void;

    constructor() {
        const fileSelector = document.createElement('input');
        fileSelector.setAttribute('id', 'document-file-selector');
        fileSelector.setAttribute('type', 'file');
        fileSelector.setAttribute('accept', '.ssproj');
        fileSelector.setAttribute('multiple', 'false');

        document.body.append(fileSelector);

        let callbackFunc: FileSelectorCallback = null;

        fileSelector.addEventListener('change', () => {
            callbackFunc(fileSelector.files[0]);
        });

        fileSelector.addEventListener('cancel', () => {
            callbackFunc(null);
        });

        this.show = (func: FileSelectorCallback) => {
            callbackFunc = func;
            fileSelector.click();
        };
    }
}

const registerDocEvents = (scene: Scene, events: Events) => {
    // construct the file selector
    const fileSelector = window.showOpenFilePicker ? null : new FileSelector();

    // this file handle is updated as the current document is loaded and saved
    let documentFileHandle: FileSystemFileHandle = null;

    // show the user a reset confirmation popup
    const getResetConfirmation = async () => {
        const result = await events.invoke('showPopup', {
            type: 'yesno',
            header: i18n.t('doc.reset'),
            message: i18n.t(events.invoke('scene.dirty') ? 'doc.unsaved-message' : 'doc.reset-message')
        });

        if (result.action !== 'yes') {
            return false;
        }

        return true;
    };

    // reset the scene
    const resetScene = () => {
        events.fire('scene.clear');
        events.fire('camera.reset');
        events.fire('doc.setName', null);
        documentFileHandle = null;
    };

    // load the document from the given file
    const loadDocument = async (file: File) => {
        events.fire('startSpinner');

        // Create streaming ZIP reader from the file
        const blobSource = new BlobReadSource(file);
        const zipFs = new ZipReadFileSystem(blobSource);

        try {
            // the document's view settings are applied through the same events
            // as user changes - suspend preference capture so they don't
            // overwrite the user's stored preferences. resumed in the finally
            // below so a failed load can't leave capture suspended.
            events.fire('preferences.suspend');

            // reset the scene
            resetScene();

            // read document.json via streaming (only reads what's needed)
            const docSource = await zipFs.createSource('document.json');
            const docData = await docSource.read().readAll();
            docSource.close();
            const document = JSON.parse(new TextDecoder().decode(docData));

            if ((document.version ?? 0) >= 1) {
                // v1: the static tier is stored once per resource, and each layer
                // brings its own instance list and palettes. Layers sharing a
                // resource share it here too, so a duplicated layer costs nothing
                // beyond its list.
                const assets: { asset: Asset, rotation: Quat }[] = [];
                for (const resource of document.resources) {
                    assets.push(await scene.assetLoader.loadAsset(resource.filename, zipFs, false, true));
                }

                for (const splatSettings of document.splats) {
                    const { asset, rotation } = assets[splatSettings.resource];
                    const numRows = (asset.resource as EditorSplatResource).numRows;

                    const source = await zipFs.createSource(splatSettings.instances);
                    const blob = await source.read().readAll();
                    source.close();
                    const records = decodeInstances(blob);

                    const instances = GaussianInstances.fromRecords(
                        scene.app.graphicsDevice, numRows, records.sourceRow, records.flags, records.palette
                    );
                    const splat = new Splat(asset, rotation, instances);
                    restorePalettes(records, splat.transformPalette, splat.colorPalette);

                    await scene.add(splat);
                    splat.docDeserialize(splatSettings);
                }
            } else {
                // v0: one baked PLY per layer, no instance list
                for (let i = 0; i < document.splats.length; ++i) {
                    const filename = `splat_${i}.ply`;
                    const splatSettings = document.splats[i];

                    // load splat directly from the zip filesystem (streams on-demand)
                    // skipReorder=true because ssproj PLY files are already in morton order
                    const splat = await scene.assetLoader.load(filename, zipFs, false, true);

                    await scene.add(splat);

                    splat.docDeserialize(splatSettings);
                }
            }

            // FIXME: trigger scene bound calc in a better way
            const tmp = scene.bound;
            if (tmp === null) {
                console.error('this should never fire');
            }

            events.invoke('docDeserialize.timeline', document.timeline);
            events.invoke('docDeserialize.poseSets', document.poseSets, document.camera?.fov);
            events.invoke('docDeserialize.view', document.view);
            scene.camera.docDeserialize(document.camera);

            // refresh the pivot to reflect the loaded transform
            const currentSelection = events.invoke('selection');
            if (currentSelection) {
                const pivot = events.invoke('pivot');
                const transform = new Transform();
                currentSelection.getPivot(transform);
                pivot.place(transform);
            }
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: i18n.t('doc.load-failed'),
                message: `'${error.message ?? error}'`
            });
        } finally {
            // fire events before cleanup so a throwing close can't leave
            // preference capture suspended or the spinner running
            events.fire('preferences.resume');
            events.fire('stopSpinner');

            // Clean up resources
            zipFs.close();
        }
    };

    // Group layers by the static resource they share and work out, per resource,
    // which rows are still referenced. The saved file stores each resource's
    // gaussian data once, so a duplicated layer costs its instance list rather than
    // a second copy of the scene.
    //
    // The union across layers is a correctness requirement, not a size
    // optimisation: if one layer deleted rows another still references, dropping
    // them would corrupt that other layer. Rows nothing references are dropped, so
    // deletions become permanent at save - as they already were.
    const groupByResource = (splats: Splat[]) => {
        const groups: { resource: EditorSplatResource, layers: Splat[] }[] = [];
        const index = new Map<EditorSplatResource, number>();
        for (const splat of splats) {
            let at = index.get(splat.resource);
            if (at === undefined) {
                at = groups.length;
                index.set(splat.resource, at);
                groups.push({ resource: splat.resource, layers: [] });
            }
            groups[at].layers.push(splat);
        }

        return groups.map(({ resource, layers }) => {
            const referenced = new Uint8Array(resource.numRows);
            for (const layer of layers) {
                const { sourceRow, count } = layer.instances;
                for (let i = 0; i < count; ++i) {
                    referenced[sourceRow[i]] = 1;
                }
            }

            // ascending, so the written order is the retained subsequence of the
            // resource's own row order - which is morton order, and what the
            // instance run encoding stays compact under
            let numRows = 0;
            for (let row = 0; row < referenced.length; ++row) {
                if (referenced[row]) numRows++;
            }
            const rows = new Uint32Array(numRows);
            const rowMap = new Uint32Array(resource.numRows);
            let at = 0;
            for (let row = 0; row < referenced.length; ++row) {
                if (referenced[row]) {
                    rows[at] = row;
                    rowMap[row] = at;
                    at++;
                }
            }
            return { resource, layers, rows, rowMap };
        });
    };

    const saveDocument = async (options: { stream?: FileSystemWritableFileStream, filename?: string }) => {
        events.fire('startSpinner');

        try {
            const splats = events.invoke('scene.allSplats') as Splat[];
            const groups = groupByResource(splats);

            // layer -> the resource file it reads from, and its remapped records
            const layerInfo = new Map<Splat, { resource: number, records: ArrayBuffer }>();
            groups.forEach((group, resourceIndex) => {
                for (const layer of group.layers) {
                    // remap into the compacted row numbering on a copy: the live
                    // instance list must keep working after the save
                    const records = encodeInstances(layer, group.rowMap);
                    layerInfo.set(layer, { resource: resourceIndex, records });
                }
            });

            const document = {
                version: 1,
                camera: scene.camera.docSerialize(),
                view: events.invoke('docSerialize.view'),
                poseSets: events.invoke('docSerialize.poseSets'),
                timeline: events.invoke('docSerialize.timeline'),
                resources: groups.map((group, i) => ({
                    filename: `resource_${i}.ply`,
                    numRows: group.rows.length
                })),
                splats: splats.map((splat, i) => ({
                    ...splat.docSerialize(),
                    resource: layerInfo.get(splat).resource,
                    instances: `instances_${i}.bin`
                }))
            };

            // Create browser filesystem and zip filesystem
            const browserFs = new BrowserFileSystem(options.filename, options.stream);
            const browserWriter = await browserFs.createWriter(options.filename);
            const zipFs = new ZipFileSystem(browserWriter);

            // Write document.json
            const docWriter = await zipFs.createWriter('document.json');
            await docWriter.write(new TextEncoder().encode(JSON.stringify(document)));
            await docWriter.close();

            // Write each resource's static data once, verbatim
            for (let i = 0; i < groups.length; ++i) {
                await writeResourceFile(groups[i].resource, groups[i].rows, `resource_${i}.ply`, zipFs);
            }

            // Write each layer's instance list and palettes
            for (let i = 0; i < splats.length; ++i) {
                const writer = await zipFs.createWriter(`instances_${i}.bin`);
                await writer.write(new Uint8Array(layerInfo.get(splats[i]).records));
                await writer.close();
            }

            // Close zip (also closes underlying browser writer)
            await zipFs.close();
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: i18n.t('doc.save-failed'),
                message: `'${error.message ?? error}'`
            });
        } finally {
            events.fire('stopSpinner');
        }
    };

    // handle user requesting a new document
    events.function('doc.new', async () => {
        if (!await getResetConfirmation()) {
            return false;
        }
        resetScene();
        // new documents start from the user's stored preferences rather than
        // whatever view state the previous document left behind
        events.fire('preferences.apply');
        return true;
    });

    // handle document file being dropped
    // NOTE: on chrome it's possible to get the FileSystemFileHandle from the DataTransferItem
    // (which would result in more seamless user experience), but this is not yet supported in
    // other browsers.
    events.function('doc.load', async (file: File, handle?: FileSystemFileHandle) => {
        if (!events.invoke('scene.empty') && !await getResetConfirmation()) {
            return false;
        }

        await loadDocument(file);

        events.fire('doc.setName', file.name);

        if (handle) {
            documentFileHandle = handle;
            recentFiles.add(handle);
        }
    });

    events.function('doc.open', async () => {
        if (!events.invoke('scene.empty') && !await getResetConfirmation()) {
            return false;
        }

        if (fileSelector) {
            fileSelector.show(async (file?: File) => {
                if (file) {
                    await loadDocument(file);
                }
            });
        } else {
            try {
                const fileHandles = await window.showOpenFilePicker({
                    id: 'SuperSplatDocumentOpen',
                    multiple: false,
                    types: SuperFileType
                });

                if (fileHandles?.length === 1) {
                    const fileHandle = fileHandles[0];

                    // null file handle incase loadDocument fails
                    await loadDocument(await fileHandle.getFile());

                    // store file handle for subsequent saves
                    documentFileHandle = fileHandle;
                    events.fire('doc.setName', fileHandle.name);
                    recentFiles.add(fileHandle);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
            }
        }
    });

    events.function('doc.openRecent', async (fileHandle: FileSystemFileHandle) => {
        if (!events.invoke('scene.empty') && !await getResetConfirmation()) {
            return false;
        }

        try {
            if (await fileHandle.queryPermission({ mode: 'read' }) !== 'granted') {
                if (await fileHandle.requestPermission({ mode: 'read' }) !== 'granted') {
                    return false;
                }
            }

            await loadDocument(await fileHandle.getFile());

            // store file handle for subsequent saves
            documentFileHandle = fileHandle;
            events.fire('doc.setName', fileHandle.name);
            recentFiles.add(fileHandle);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
                await events.invoke('showPopup', {
                    type: 'error',
                    header: i18n.t('popup.error-loading'),
                    message: `${error.message ?? error}`
                });
            }
        }
    });

    events.function('doc.save', async () => {
        if (documentFileHandle) {
            try {
                await saveDocument({
                    stream: await documentFileHandle.createWritable()
                });
                events.fire('doc.saved');
            } catch (error) {
                if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
                    console.error(error);
                }
            }
        } else {
            await events.invoke('doc.saveAs');
        }
    });

    events.function('doc.saveAs', async () => {
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    id: 'SuperSplatDocumentSave',
                    types: SuperFileType,
                    suggestedName: 'scene.ssproj'
                });
                await saveDocument({ stream: await handle.createWritable() });
                documentFileHandle = handle;
                events.fire('doc.setName', handle.name);
                events.fire('doc.saved');
                recentFiles.add(handle);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
            }
        } else {
            await saveDocument({
                filename: 'scene.ssproj'
            });
            events.fire('doc.saved');
        }
    });

    // doc name

    let docName: string = null;

    const setDocName = (name: string) => {
        if (name !== docName) {
            docName = name;
            events.fire('doc.name', docName);
        }
    };

    events.function('doc.name', () => {
        return docName;
    });

    events.on('doc.setName', (name) => {
        setDocName(name);
    });
};

export { registerDocEvents };
