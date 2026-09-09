/**
 * IO Write module - handles writing splat data to various destinations.
 */

// Browser file system
export { BrowserFileSystem } from './browser-file-system';
export { pickWriteTarget, WriteTarget } from './pick-target';

// Writer utilities
export {
    GZipWriter,
    ProgressWriter
} from './writer';
