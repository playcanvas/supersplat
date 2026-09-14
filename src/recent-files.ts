// a recently opened document
interface RecentFile {
    handle: FileSystemFileHandle;
    name: string;
    date: number;
}

// a recent import: the items the user picked, dropped or launched together (a
// dropped folder is one item), so they can be imported again as a set
interface RecentImport {
    handles: FileSystemHandle[];
    name: string;
    date: number;
}

// wrap IDBRequest in a promise
const wrap = (IDBRequest: IDBRequest): Promise<any> => {
    return new Promise((resolve, reject) => {
        IDBRequest.onsuccess = () => resolve(IDBRequest.result);
        IDBRequest.onerror = () => {
            console.error('IndexedDB error', IDBRequest.error);
            reject(IDBRequest.error);
        };
    });
};

// Each store is its own single-store database, so adding a store never
// upgrades an existing database (an older tab holding it open would block that).
class RecentStore<T extends { name: string, date: number }> {
    private db: Promise<IDBDatabase>;
    private storeName: string;

    constructor(dbName: string, storeName: string) {
        this.storeName = storeName;

        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(storeName)) {
                // NOTE: for now we store by filename even though files in
                // loaded from different directories could have the same name.
                // We do this because we can't distinguish files from different
                // directories anyway due to File System Access API limitations.
                db.createObjectStore(storeName, { keyPath: 'name' });
            }
        };
        this.db = wrap(request);
    }

    private async objectStore(mode: 'readonly' | 'readwrite') {
        const db = await this.db;
        return db.transaction([this.storeName], mode).objectStore(this.storeName);
    }

    async add(entry: Omit<T, 'date'>) {
        const store = await this.objectStore('readwrite');
        await wrap(store.put({ ...entry, date: Date.now() }));
    }

    async get(): Promise<T[]> {
        const store = await this.objectStore('readonly');
        const result = await wrap(store.getAll()) as T[];

        // Sort by date descending
        result.sort((a, b) => b.date - a.date);
        return result;
    }

    async clear() {
        const store = await this.objectStore('readwrite');
        await wrap(store.clear());
    }

    async count(): Promise<number> {
        const store = await this.objectStore('readonly');
        return wrap(store.count());
    }
}

const recentFiles = new RecentStore<RecentFile>('supersplat', 'recent-files');
const recentImports = new RecentStore<RecentImport>('supersplat-imports', 'recent-imports');

export { recentFiles, recentImports, RecentImport, RecentStore };
