import { path } from 'playcanvas';

import type { Events } from './events';
import { FileReadBlockedError, readHandle } from './file-read';
import { dropFormats } from './import-formats';
import { i18n } from './ui/localization';
import sceneImport from './ui/svg/import.svg';

class DroppedFile {
    filename: string;
    // null when the browser blocked reading it (see resolveHandleFiles)
    file: File | null;
    handle?: FileSystemFileHandle;
    // the dropped item this file came from: the file itself or an enclosing folder
    root?: FileSystemHandle;

    constructor(filename: string, file: File | null, handle?: FileSystemFileHandle, root?: FileSystemHandle) {
        this.filename = filename;
        this.file = file;
        this.handle = handle;
        this.root = root;
    }
}

type DropHandlerFunc = (files: DroppedFile[], resetScene: boolean) => void;

const resolveDirectories = (entries: FileSystemEntry[]): Promise<FileSystemFileEntry[]> => {
    const promises: Promise<FileSystemFileEntry[]>[] = [];
    const result: FileSystemFileEntry[] = [];

    entries.forEach((entry) => {
        if (entry.name === '.DS_Store') {
            return;
        }

        if (entry.isFile) {
            result.push(entry as FileSystemFileEntry);
        } else if (entry.isDirectory) {
            promises.push(
                new Promise<FileSystemFileEntry[]>((resolve) => {
                    const reader = (entry as FileSystemDirectoryEntry).createReader();

                    const p: Promise<FileSystemFileEntry[]>[] = [];

                    const read = () => {
                        reader.readEntries((children: FileSystemEntry[]) => {
                            if (children.length > 0) {
                                p.push(resolveDirectories(children));
                                read();
                            } else {
                                Promise.all(p).then((children: FileSystemFileEntry[][]) => {
                                    resolve(children.flat());
                                });
                            }
                        });
                    };
                    read();
                })
            );
        }
    });

    return Promise.all(promises).then((children: FileSystemFileEntry[][]) => {
        return result.concat(...children);
    });
};

// collect the files under a dropped handle, named by their path relative to the
// drop (so a dropped folder 'foo' yields 'foo/a.ply', matching resolveDirectories)
const resolveHandles = async (
    handle: FileSystemHandle,
    prefix: string,
    result: DroppedFile[],
    root: FileSystemHandle,
    keepBlocked: boolean
) => {
    if (handle.name === '.DS_Store') {
        return;
    }

    if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle;
        let file: File | null;
        try {
            file = await readHandle(fileHandle);
        } catch (error) {
            if (!keepBlocked || !(error instanceof FileReadBlockedError)) throw error;
            file = null;
        }
        result.push(new DroppedFile(prefix + handle.name, file, fileHandle, root));
    } else {
        for await (const child of (handle as FileSystemDirectoryHandle).values()) {
            await resolveHandles(child, `${prefix}${handle.name}${path.delimiter}`, result, root, keepBlocked);
        }
    }
};

const removeCommonPrefix = (urls: DroppedFile[]) => {
    const split = (pathname: string) => {
        const parts = pathname.split(path.delimiter);
        const base = parts[0];
        const rest = parts.slice(1).join(path.delimiter);
        return [base, rest];
    };
    while (true) {
        const parts = split(urls[0].filename);
        if (parts[1].length === 0) {
            return;
        }
        for (let i = 1; i < urls.length; ++i) {
            const other = split(urls[i].filename);
            if (parts[0] !== other[0]) {
                return;
            }
        }
        for (let i = 0; i < urls.length; ++i) {
            urls[i].filename = split(urls[i].filename)[1];
        }
    }
};

// expand picked or dropped handles into files, descending into folders. A read
// the browser blocks throws FileReadBlockedError, or with keepBlocked yields the
// file with a null file so the rest of the set is still read
const resolveHandleFiles = async (handles: FileSystemHandle[], keepBlocked = false) => {
    const files: DroppedFile[] = [];
    for (const handle of handles) {
        await resolveHandles(handle, '', files, handle, keepBlocked);
    }

    if (files.length > 1) {
        removeCommonPrefix(files);
    }

    return files;
};

// Full-window overlay shown while files are dragged over the editor.
// If it doesn't appear while dragging, the editor is too busy to take the drop.
const createDropOverlay = (target: HTMLElement) => {
    const element = (className: string, ...children: Node[]) => {
        const el = document.createElement('div');
        el.className = className;
        el.append(...children);
        return el;
    };

    const icon = new DOMParser().parseFromString(
        decodeURIComponent(sceneImport.substring('data:image/svg+xml,'.length)),
        'image/svg+xml'
    ).documentElement;
    icon.classList.add('icon');
    const message = element('message font-bold');
    const formats = element('formats');
    formats.textContent = dropFormats.map((format) => format.substring(1).toUpperCase()).join(' · ');

    const content = element('content', message, formats);
    const overlay = element('', element('drop-zone font-regular', element('icon-badge', icon), content));
    overlay.id = 'drop-overlay';
    overlay.hidden = true;
    target.append(overlay);

    let hideTimer: ReturnType<typeof setTimeout>;

    const hide = () => {
        clearTimeout(hideTimer);
        overlay.hidden = true;
    };

    return {
        // dragover repeats while the drag is over the page, so the overlay hides
        // shortly after it stops, whichever way the drag ended
        dragging: () => {
            if (overlay.hidden) {
                message.textContent = i18n.t('drop.drop-to-import');
            }
            overlay.hidden = false;
            clearTimeout(hideTimer);
            hideTimer = setTimeout(hide, 300);
        },
        hide
    };
};

// configure drag and drop
const CreateDropHandler = (target: HTMLElement, events: Events, dropHandler: DropHandlerFunc) => {
    const overlay = createDropOverlay(target);
    const hasFiles = (ev: DragEvent) => ev.dataTransfer?.types.includes('Files');
    let reading = false;

    // the editor's dialogs, popups and progress screens are marked .blocks-shortcuts;
    // while one is open a drop would start a second import underneath it
    const dialogOpen = () => !!document.querySelector('.blocks-shortcuts:not(.pcui-hidden)');

    const dragstart = (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.effectAllowed = 'all';
    };

    const dragover = (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.effectAllowed = 'all';
        if (!hasFiles(ev)) return;
        if (dialogOpen()) {
            // show the drop as refused, without the overlay
            ev.dataTransfer.dropEffect = 'none';
        } else {
            overlay.dragging();
        }
    };

    // hide as soon as the drag leaves the window
    const dragleave = (ev: DragEvent) => {
        if (!ev.relatedTarget) overlay.hide();
    };

    const drop = async (ev: DragEvent) => {
        ev.preventDefault();

        // one drop at a time: a second drop while the first is read, or while a
        // dialog is open, is ignored
        if (reading || dialogOpen() || !hasFiles(ev)) return;
        reading = true;
        overlay.hide();
        events.fire('progressStart', i18n.t('drop.reading'));

        let files: DroppedFile[];
        try {
            files = await readDrop(ev);
        } finally {
            reading = false;
            events.fire('progressEnd');
        }
        dropHandler(files, ev.shiftKey);
    };

    // resolve the dropped items, descending into folders, into files
    const readDrop = async (ev: DragEvent) => {
        const items = Array.from(ev.dataTransfer.items);

        // Entries and handles must be requested before the handler first yields,
        // after which the items are no longer readable. The entries are the
        // fallback when the browser refuses to read through a handle.
        const entries = items.map((item) => item.webkitGetAsEntry()).filter((v) => v);

        // Prefer file system handles where the browser provides them (Chromium):
        // a document keeps its handle for later saves, and every imported file
        // keeps one so a save can recognise a file the scene still reads from.
        if (items.every((item) => item.getAsFileSystemHandle)) {
            const handles = await Promise.all(items.map((item) => item.getAsFileSystemHandle()));
            try {
                return await resolveHandleFiles(handles.filter((handle) => handle));
            } catch (error) {
                if (!(error instanceof FileReadBlockedError)) throw error;
                console.warn(`${error.message}; reading the dropped items without their handles`);
            }
        }

        // resolve directories to files
        const resolvedEntries = await resolveDirectories(entries);

        const files = await Promise.all(
            resolvedEntries.map((entry) => {
                return new Promise<DroppedFile>((resolve) => {
                    entry.file((entryFile: File) => {
                        resolve(new DroppedFile(entry.fullPath.substring(1), entryFile));
                    });
                });
            })
        );

        if (files.length > 1) {
            // if all files share a common filename prefix, remove it
            removeCommonPrefix(files);
        }

        return files;
    };

    target.addEventListener('dragstart', dragstart, true);
    target.addEventListener('dragover', dragover, true);
    target.addEventListener('dragleave', dragleave, true);
    target.addEventListener('drop', drop, true);
};

export { CreateDropHandler, resolveHandleFiles };
