const DB_NAME = 'supersplat';
const DB_VERSION = 1;
const STORE_NAME = 'recent-files';

interface RecentFile {
    handle: FileSystemFileHandle;
    name: string;
    date: number;
}

class RecentFiles {
    private db: IDBDatabase | null = null;

    async init() {
        if (this.db) return;

        return new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('RecentFiles: Failed to open database');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'name' });
                }
            };
        });
    }

    async add(handle: FileSystemFileHandle) {
        if (!this.db) await this.init();

        return new Promise<void>((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put({
                handle: handle,
                name: handle.name,
                date: Date.now()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async get(): Promise<RecentFile[]> {
        if (!this.db) await this.init();

        return new Promise<RecentFile[]>((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const result = request.result as RecentFile[];
                // Sort by date descending
                result.sort((a, b) => b.date - a.date);
                resolve(result);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async clear() {
        if (!this.db) await this.init();

        return new Promise<void>((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    async count(): Promise<number> {
        if (!this.db) await this.init();

        return new Promise<number>((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

const recentFiles = new RecentFiles();
export { recentFiles };
