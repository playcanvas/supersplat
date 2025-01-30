import { Writer } from './writer';
import { FirebaseStorageManager } from '../firebase/storage';

export class FirebaseWriter implements Writer {
    private chunks: Uint8Array[] = [];
    private totalLength = 0;
    private filename: string;
    private storage: FirebaseStorageManager;

    constructor(filename: string, storage: FirebaseStorageManager) {
        this.filename = filename;
        this.storage = storage;
    }

    write(data: Uint8Array): Promise<void> {
        this.chunks.push(data);
        this.totalLength += data.length;
        return Promise.resolve();
    }

    async close(): Promise<string> {
        // Combine all chunks into a single Uint8Array
        const combined = new Uint8Array(this.totalLength);
        let offset = 0;
        for (const chunk of this.chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }

        // Create a blob from the combined data
        const blob = new Blob([combined]);

        // Upload to Firebase Storage
        const url = await this.storage.uploadSplat(blob, this.filename);

        // Clear the chunks array
        this.chunks = [];
        this.totalLength = 0;

        return url;
    }
}
