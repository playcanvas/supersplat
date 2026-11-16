import type { Events } from './events';
import { i18n } from './ui/localization';

// Chromium 157 can refuse to read a file the user picked or dropped, through its
// handle, with a SecurityError (NotAllowedError in some builds), apparently
// because its restricted-folder list now applies to reads as well as to
// choosing. A plain file input is not affected, so these reads fall back to one.
class FileReadBlockedError extends Error {
    filename: string;

    constructor(filename: string, cause: unknown) {
        super(`The browser blocked reading '${filename}'`, { cause });
        this.name = 'FileReadBlockedError';
        this.filename = filename;
    }
}

const isReadBlocked = (error: unknown) =>
    error instanceof DOMException && (error.name === 'SecurityError' || error.name === 'NotAllowedError');

// read a file through its handle, reporting a blocked read as FileReadBlockedError
const readHandle = async (handle: FileSystemFileHandle) => {
    try {
        return await handle.getFile();
    } catch (error) {
        if (isReadBlocked(error)) throw new FileReadBlockedError(handle.name, error);
        throw error;
    }
};

// choose files with a plain file input, resolving [] if the dialog is cancelled.
// Must run while the page has user activation.
const pickWithInput = (accept: string, multiple: boolean) => {
    return new Promise<File[]>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.multiple = multiple;
        input.addEventListener('change', () => resolve(Array.from(input.files ?? [])), { once: true });
        input.addEventListener('cancel', () => resolve([]), { once: true });
        input.click();
    });
};

// after a blocked read, explain and offer to choose the file again with a plain
// file input; the OK click provides the user activation that dialog needs.
// Resolves [] if the user declines or cancels.
const repickBlocked = async (events: Events, filename: string, accept: string, multiple = false) => {
    const result = await events.invoke('showPopup', {
        type: 'okcancel',
        header: i18n.t('popup.file-blocked'),
        message: i18n.t('popup.file-blocked-message', { filename })
    });
    return result?.action === 'ok' ? await pickWithInput(accept, multiple) : [];
};

export { FileReadBlockedError, readHandle, pickWithInput, repickBlocked };
