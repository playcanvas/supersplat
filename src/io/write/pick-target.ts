interface WriteTarget {
    handle: FileSystemFileHandle;
    exists: boolean;
    // Only newly created destinations can be discarded after a failed write.
    discard?: () => Promise<void>;
}

// Resolve a filename in a chosen folder without modifying an existing file.
// showSaveFilePicker can truncate the selection before we can protect sources.
const pickWriteTarget = async (dir: FileSystemDirectoryHandle, filename: string): Promise<WriteTarget> => {
    try {
        return { handle: await dir.getFileHandle(filename), exists: true };
    } catch (error) {
        if (error.name !== 'NotFoundError') throw error;
        return {
            handle: await dir.getFileHandle(filename, { create: true }),
            exists: false,
            discard: () => dir.removeEntry(filename)
        };
    }
};

export { pickWriteTarget, WriteTarget };
