import { path } from 'playcanvas';

import type { Splat } from './splat';

const removeExtension = (filename: string) => {
    return filename.substring(0, filename.length - path.getExtension(filename).length);
};

const isInvalidFilenameChar = (char: string) => {
    return /[<>:"/\\|?*]/.test(char) || char.charCodeAt(0) < 32;
};

const sanitizeFilename = (filename: string) => {
    const sanitized = Array.from(filename, (char) => {
        return isInvalidFilenameChar(char) ? '_' : char;
    }).join('').trim();

    return sanitized.length > 0 ? sanitized : 'supersplat';
};

const getImportedFilename = (filename: string) => {
    const trimmed = filename.split(/[?#]/)[0];

    if (trimmed.includes('://') || trimmed.startsWith('blob:')) {
        try {
            return path.getBasename(new URL(trimmed).pathname);
        } catch {
            // fall back to the raw filename below
        }
    }

    return path.getBasename(trimmed);
};

const getRenderBaseName = (splats: Splat[]) => {
    const sourceName = splats[0]?.filename ?? splats[0]?.name ?? 'supersplat';
    return sanitizeFilename(removeExtension(getImportedFilename(sourceName)));
};

const getRenderFilename = (splats: Splat[], extension: string) => {
    const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
    return `${getRenderBaseName(splats)}${normalizedExtension}`;
};

export { getRenderFilename };
