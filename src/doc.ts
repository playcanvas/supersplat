import { Events } from './events';
import { Scene } from './scene';
import { DownloadWriter, FileStreamWriter } from './serialize/writer';
import { ZipWriter } from './serialize/zip-writer';
import { Splat } from './splat';
import { serializePly } from './splat-serialize';
import { localize } from './ui/localization';

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
            header: localize('doc.reset'),
            message: localize(events.invoke('scene.dirty') ? 'doc.unsaved-message' : 'doc.reset-message')
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
        try {
            // reset the scene
            resetScene();

            // read the document
            /* global JSZip */
            // @ts-ignore
            const zip = new JSZip();
            await zip.loadAsync(file);
            const document = JSON.parse(await zip.file('document.json').async('text'));

            // run through each splat and load it
            for (let i = 0; i < document.splats.length; ++i) {
                const filename = `splat_${i}.ply`;
                const splatSettings = document.splats[i];

                // construct the splat asset
                const contents = await zip.file(`splat_${i}.ply`).async('blob');
                const url = URL.createObjectURL(contents);
                const splat = await scene.assetLoader.loadModel({
                    url,
                    filename
                });
                URL.revokeObjectURL(url);

                scene.add(splat);

                splat.docDeserialize(splatSettings);
            }

            // FIXME: trigger scene bound calc in a better way
            const tmp = scene.bound;
            if (tmp === null) {
                console.error('this should never fire');
            }

            events.invoke('docDeserialize.timeline', document.timeline);
            events.invoke('docDeserialize.poseSets', document.poseSets);
            events.invoke('docDeserialize.view', document.view);
            scene.camera.docDeserialize(document.camera);
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('doc.load-failed'),
                message: `'${error.message ?? error}'`
            });
        } finally {
            events.fire('stopSpinner');
        }
    };

    const saveDocument = async (options: { stream?: FileSystemWritableFileStream, filename?: string }) => {
        events.fire('startSpinner');

        try {
            const splats = events.invoke('scene.allSplats') as Splat[];

            const document = {
                version: 0,
                camera: scene.camera.docSerialize(),
                view: events.invoke('docSerialize.view'),
                poseSets: events.invoke('docSerialize.poseSets'),
                timeline: events.invoke('docSerialize.timeline'),
                splats: splats.map(s => s.docSerialize())
            };

            const serializeSettings = {
                // even though we support saving selection state, we disable that for now
                // because including a uint8 array in the document PLY results in slow loading
                // path.
                keepStateData: false,
                keepWorldTransform: true,
                keepColorTint: true
            };

            const writer = options.stream ? new FileStreamWriter(options.stream) : new DownloadWriter(options.filename);
            const zipWriter = new ZipWriter(writer);
            await zipWriter.file('document.json', JSON.stringify(document));
            for (let i = 0; i < splats.length; ++i) {
                await zipWriter.start(`splat_${i}.ply`);
                await serializePly([splats[i]], serializeSettings, zipWriter);
            }
            await zipWriter.close();
            await writer.close();
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('doc.save-failed'),
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
        return true;
    });

    // handle document file being dropped
    // NOTE: on chrome it's possible to get the FileSystemFileHandle from the DataTransferItem
    // (which would result in more seamless user experience), but this is not yet supported in
    // other browsers.
    events.function('doc.dropped', async (file: File) => {
        if (!events.invoke('scene.empty') && !await getResetConfirmation()) {
            return false;
        }

        await loadDocument(file);

        events.fire('doc.setName', file.name);
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
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
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
