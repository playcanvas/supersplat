interface ExportSettings {
    directory?: FileSystemDirectoryHandle;
}

let database: Promise<IDBDatabase>;

const openDatabase = () => {
    database ??= new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('supersplat-export', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('settings');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return database;
};

const loadExportSettings = async (): Promise<ExportSettings> => {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const request = db.transaction('settings', 'readonly').objectStore('settings').get('export');
        request.onsuccess = () => resolve({ directory: request.result?.directory });
        request.onerror = () => reject(request.error);
    });
};

const saveExportSettings = async (settings: ExportSettings) => {
    const db = await openDatabase();
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('settings', 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
        transaction.objectStore('settings').put(settings, 'export');
    });
};

export { ExportSettings, loadExportSettings, saveExportSettings };
