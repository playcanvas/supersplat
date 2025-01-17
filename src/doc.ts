import { Events } from './events';
import { ZipArchive } from './serialize/zip';

type FileSelectorCallback = (fileList: File) => void;

class FileSelector {
    show: (callbackFunc: FileSelectorCallback) => void;

    constructor() {
        const fileSelector = document.createElement('input');
        fileSelector.setAttribute('id', 'document-file-selector');
        fileSelector.setAttribute('type', 'file');
        fileSelector.setAttribute('accept', '.super');
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
};

let fileHandle: FileSystemFileHandle = null;

// the document file handle
const getWriteFunc = (fileHandle?: FileSystemFileHandle) => {
    
};

const registerDocEvents = (events: Events) => {
    // construct the file selector
    const fileSelector = window.showOpenFilePicker ? null : new FileSelector();

    const loadDocumentFromFile = async (file: File) => {
        // reset the scene
        events.invoke('scene.clear');

        // read the document
        /* global JSZip */
        // @ts-ignore
        const zip = new JSZip();
        await zip.loadAsync(file);
        const json = zip.file('document.json');

    };

    events.function('doc.new', async () => {
        const result = await events.invoke('showPopup', {
            type: 'yesno',
            header: 'RESET SCENE',
            message: 'You have unsaved changes. Are you sure you want to reset the scene?'
        });

        if (result.action !== 'yes') {
            return false;
        }

        events.fire('scene.clear');
        events.fire('doc.setName', null);

        return true;
    });

    events.function('doc.open', async () => {
        // if the scene is dirty, ensure user is happy to reset
        if (events.invoke('scene.dirty')) {
            const result = await events.invoke('showPopup', {
                type: 'yesno',
                header: 'RESET SCENE',
                message: 'You have unsaved changes. Are you sure you want to reset the scene?'
            });

            if (result.action !== 'yes') {
                return false;
            }
        }

        if (fileSelector) {
            fileSelector.show(async (file?: File) => {
                if (file) {
                    await loadDocumentFromFile(file);
                }
            });
        } else {
            try {
                const handles = await window.showOpenFilePicker({
                    id: 'SuperSplatDocumentOpen',
                    multiple: false,
                    types: [{
                        description: 'SuperSplat document',
                        accept: {
                            'application/octet-stream': ['.super']
                        }
                    }]
                });

                if (handles?.length === 1) {
                    const file = await handles[0].getFile();
                    await loadDocumentFromFile(file);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
            }
        }
    });

    events.function('doc.save', async () => {
        const json: any = { };
        const files: {
            filename: string,
            data: Uint8Array
        }[] = [];

        await events.invoke('doc.serialize', { json, files });
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
                    types: [filePickerTypes.ply],
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

    // serialize the document to the given 
    events.on('doc.write', async (fileHandle: FileSystemFileHandle, { json, files }) => {
        const stream = await fileHandle.createWritable();

        const zipArchive = new ZipArchive(write);
        await zipArchive.file('document.json', JSON.stringify(json));
        for (let i = 0; i < files.length; ++i) {
            await zipArchive.file(files[i].filename, files[i].data);
        }
        await zipArchive.end();
    });

    //-- doc name

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
