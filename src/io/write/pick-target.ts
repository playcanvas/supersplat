// Resolve a filename in a chosen folder without modifying an existing file.
// showSaveFilePicker can truncate the selection before we can protect sources.
const pickWriteTarget = async (location: string | FileSystemDirectoryHandle, filename: string): Promise<{
    handle: FileSystemFileHandle;
    exists: boolean;
} | null> => {
    let dir: FileSystemDirectoryHandle;
    try {
        dir = typeof location === 'string' ? await window.showDirectoryPicker({ id: location, mode: 'readwrite' }) : location;
    } catch (error) {
        if (error.name === 'AbortError') return null;
        throw error;
    }

    try {
        return { handle: await dir.getFileHandle(filename), exists: true };
    } catch (error) {
        if (error.name !== 'NotFoundError') throw error;
        return { handle: await dir.getFileHandle(filename, { create: true }), exists: false };
    }
};

export { pickWriteTarget };
