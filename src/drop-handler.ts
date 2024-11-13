import { path } from 'playcanvas';

class DroppedFile {
    filename: string;
    file: File;

    constructor(filename: string, file: File) {
        this.filename = filename;
        this.file = file;
    }

    get url() {
        return URL.createObjectURL(this.file);
    }
}

type DropHandlerFunc = (files: Array<DroppedFile>, resetScene: boolean) => void;

const resolveDirectories = (entries: Array<FileSystemEntry>): Promise<Array<FileSystemFileEntry>> => {
    const promises: Promise<Array<FileSystemFileEntry>>[] = [];
    const result: Array<FileSystemFileEntry> = [];

    entries.forEach((entry) => {
        if (entry.isFile) {
            result.push(entry as FileSystemFileEntry);
        } else if (entry.isDirectory) {
            promises.push(
                new Promise<any>((resolve, reject) => {
                    const reader = (entry as FileSystemDirectoryEntry).createReader();

                    const p: Promise<any>[] = [];

                    const read = () => {
                        reader.readEntries((children: Array<FileSystemEntry>) => {
                            if (children.length > 0) {
                                p.push(resolveDirectories(children));
                                read();
                            } else {
                                Promise.all(p).then((children: Array<Array<FileSystemFileEntry>>) => {
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

    return Promise.all(promises).then((children: Array<Array<FileSystemFileEntry>>) => {
        return result.concat(...children);
    });
};

const removeCommonPrefix = (urls: Array<DroppedFile>) => {
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

// configure drag and drop
const CreateDropHandler = (target: HTMLElement, dropHandler: DropHandlerFunc) => {

    const dragstart = (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.effectAllowed = 'all';
    };

    const dragover = (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.effectAllowed = 'all';
    };

    const drop = async (ev: DragEvent) => {
        ev.preventDefault();

        const items = Array.from(ev.dataTransfer.items)
        .map(item => item.webkitGetAsEntry())
        .filter(v => v);

        // resolve directories to files
        const entries = await resolveDirectories(items);

        const files = await Promise.all(
            entries.map((entry) => {
                return new Promise<DroppedFile>((resolve, reject) => {
                    entry.file((entryFile: any) => {
                        resolve(new DroppedFile(entry.fullPath.substring(1), entryFile));
                    });
                });
            })
        );

        if (files.length > 1) {
            // if all files share a common filename prefix, remove it
            removeCommonPrefix(files);
        }

        // finally, call the drop handler
        dropHandler(files, !ev.shiftKey);
    };

    target.addEventListener('dragstart', dragstart, true);
    target.addEventListener('dragover', dragover, true);
    target.addEventListener('drop', drop, true);
};

export { CreateDropHandler };
