// / <reference lib="dom" />

declare interface FileSystemWritableFileStream extends WritableStream {
    write(data: ArrayBuffer | Blob | string): Promise<void>;
    seek(position: number): Promise<void>;
    truncate(size: number): Promise<void>;
}

declare interface FileSystemHandle {
    readonly kind: 'file' | 'directory';
    readonly name: string;
}

declare interface FileSystemFileHandle extends FileSystemHandle {
    readonly kind: 'file';
    getFile(): Promise<File>;
    createWritable(): Promise<FileSystemWritableFileStream>;
}

declare interface FileSystemDirectoryHandle extends FileSystemHandle {
    readonly kind: 'directory';
    values(): AsyncIterableIterator<FileSystemHandle>;
}

declare interface Window {
    showOpenFilePicker(options?: {
        id?: string;
        multiple?: boolean;
        excludeAcceptAllOption?: boolean;
        types?: Array<{
            description?: string;
            accept: { [mimeType: string]: string[] };
        }>;
    }): Promise<FileSystemFileHandle[]>;

    showSaveFilePicker(options?: {
        id?: string;
        suggestedName?: string;
        excludeAcceptAllOption?: boolean;
        types?: Array<{
            description?: string;
            accept: { [mimeType: string]: string[] };
        }>;
    }): Promise<FileSystemFileHandle>;

    showDirectoryPicker(options?: {
        mode?: 'read' | 'readwrite';
    }): Promise<FileSystemDirectoryHandle>;
}
