import { ZipFileSystem, ZipReadFileSystem } from '@playcanvas/splat-transform';
import type { Asset, Quat } from 'playcanvas';

import { decodeInstances, encodeInstances, restorePalettes } from './doc-instances';
import type { EditorSplatResource } from './editor-splat-resource';
import { Events } from './events';
import { GaussianInstances } from './gaussian-instances';
import { BrowserFileSystem, BlobReadSource, loadSplatSource, sourcesOf } from './io';
import { recentFiles } from './recent-files';
import { Scene } from './scene';
import { Splat } from './splat';
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

    // The zip the current document's resources still read from. A loaded resource
    // retains a lazy ChunkSource over its PLY - that is what export streams from -
    // so the archive has to outlive the load and can only be closed once nothing
    // references it. Closing it at the end of the load made every export from an
    // opened document fail with 'Source has been closed'.
    let documentFs: ZipReadFileSystem = null;

    // the file the archive reads from, and the resources reading from it. The
    // browser invalidates a File once its file changes, so saving over that file
    // has to move them all onto the new archive afterwards (see rebindDocument)
    let documentSource: BlobReadSource = null;
    let documentResources = new Set<EditorSplatResource>();

    events.function('doc.fileSources', () => (documentSource ? [documentSource] : []));

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
        // clear first: the layers and their resources are what still read from the
        // archive, so the zip is only safe to close once they are gone
        events.fire('scene.clear');
        events.fire('camera.reset');
        events.fire('doc.setName', null);
        documentFileHandle = null;
        documentFs?.close();
        documentFs = null;
        documentSource = null;
        documentResources = new Set();
    };

    // load the document from the given file. `handle` is the file's handle when
    // known, so a later save over the same file can be recognised
    const loadDocument = async (file: File, handle?: FileSystemFileHandle) => {
        events.fire('startSpinner');

        // Create streaming ZIP reader from the file
        const blobSource = new BlobReadSource(file, handle ?? null);
        const zipFs = new ZipReadFileSystem(blobSource);

        try {
            // the document's view settings are applied through the same events
            // as user changes - suspend preference capture so they don't
            // overwrite the user's stored preferences. resumed in the finally
            // below so a failed load can't leave capture suspended.
            events.fire('preferences.suspend');

            // the document is applied piecewise: each layer becomes visible
            // before its saved transform is applied (scene.add awaits a GPU
            // bound readback in between) and the camera pose is restored last,
            // so frames rendered mid-load would show a half-assembled scene.
            // Suspend viewport rendering until the load settles; the finally
            // below resumes it and forces a render of the final state.
            scene.suspendRender = true;

            // reset the scene. This closes the *previous* document's archive, so
            // adopt this one only afterwards
            resetScene();
            documentFs = zipFs;
            documentSource = blobSource;

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
                    const loaded = await scene.assetLoader.loadAsset(resource.filename, zipFs, false, true);
                    documentResources.add(loaded.asset.resource as EditorSplatResource);
                    assets.push(loaded);
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
                    documentResources.add(splat.resource);

                    await scene.add(splat);

                    splat.docDeserialize(splatSettings);
                }
            }

            // reading the bound forces a recalculation (and its
            // scene.boundChanged event) so the deserialize steps below observe
            // the loaded scene's extents. The result must be consumed: the
            // release build's treeshaker assumes property reads are pure and
            // drops a bare read, getter side effects and all
            if (scene.bound === null) {
                console.error('unexpected missing scene bound');
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
            scene.suspendRender = false;
            scene.forceRender = true;
            events.fire('preferences.resume');
            events.fire('stopSpinner');
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
    //
    // `compact` false keeps every row instead, so the written resource is an
    // identical view of the live one. Used when saving over the file the document
    // is open from, where the resources are then re-read from what was written
    // (see rebindDocument) and an undo must still find its rows.
    const groupByResource = (splats: Splat[], compact: boolean) => {
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
            if (!compact) referenced.fill(1);
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

    // returns the resource groups written, in resource file order, or null if
    // the save failed
    const saveDocument = async (options: { stream?: FileSystemWritableFileStream, filename?: string, compact?: boolean }) => {
        events.fire('startSpinner');

        try {
            const splats = events.invoke('scene.allSplats') as Splat[];
            const groups = groupByResource(splats, options.compact ?? true);

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

            return groups;
        } catch (error) {
            await options.stream?.abort().catch(() => { /* the writer may already have aborted */ });
            await events.invoke('showPopup', {
                type: 'error',
                header: i18n.t('doc.save-failed'),
                message: `'${error.message ?? error}'`
            });
            return null;
        } finally {
            events.fire('stopSpinner');
        }
    };

    // The document was just written over the file it is open from. The browser
    // invalidates a File once its file changes, so the archive and every resource
    // reading from it are moved onto the freshly written file. The rows were
    // written verbatim (see writeDocument), so each resource's new entry is an
    // identical view of its rows: nothing is copied or re-uploaded.
    const rebindDocument = async (handle: FileSystemFileHandle, groups: { resource: EditorSplatResource }[]) => {
        const blobSource = new BlobReadSource(await handle.getFile(), handle);
        const zipFs = new ZipReadFileSystem(blobSource);
        const rebound = new Set<EditorSplatResource>();
        for (let i = 0; i < groups.length; ++i) {
            const { resource } = groups[i];
            if (!documentResources.has(resource)) continue;
            const loaded = await loadSplatSource(`resource_${i}.ply`, zipFs, true);
            await resource.rebind(loaded.source);
            rebound.add(resource);
        }
        documentFs?.close();
        documentFs = zipFs;
        documentSource = blobSource;
        documentResources = rebound;
    };

    // write the document to `handle`, which may be the file it is open from.
    // returns false if nothing was written
    const writeDocument = async (handle: FileSystemFileHandle) => {
        const inPlace = documentSource && (await sourcesOf([documentSource], handle)).length > 0;
        const groups = await saveDocument({ stream: await handle.createWritable(), compact: !inPlace });
        if (!groups) {
            return false;
        }
        if (inPlace) {
            await rebindDocument(handle, groups);
        }
        return true;
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

        await loadDocument(file, handle);

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
                    await loadDocument(await fileHandle.getFile(), fileHandle);

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

            await loadDocument(await fileHandle.getFile(), fileHandle);

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
                if (await writeDocument(documentFileHandle)) {
                    events.fire('doc.saved');
                }
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
        try {
            const hasFilePicker = !!window.showDirectoryPicker;
            const directory = hasFilePicker ? await events.invoke('scene.getExportDirectory') : undefined;

            const options = await events.invoke('show.savePopup', events.invoke('doc.name') || 'scene.ssproj', directory, documentSource);
            if (!options) return false;

            if (hasFilePicker) {
                const target = options.fileTarget;
                const handle = target.handle;
                let written = false;
                try {
                    written = await writeDocument(handle);
                    if (!written) return false;
                } finally {
                    if (!written) await target.discard?.();
                }
                documentFileHandle = handle;
                events.fire('doc.setName', handle.name);
                recentFiles.add(handle);
            } else {
                if (!await saveDocument({ filename: options.filename })) {
                    return false;
                }
                events.fire('doc.setName', options.filename);
            }
            events.fire('doc.saved');
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
                await events.invoke('showPopup', {
                    type: 'error',
                    header: i18n.t('doc.save-failed'),
                    message: `${error.message ?? error}`
                });
            }
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
