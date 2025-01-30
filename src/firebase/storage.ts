import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL, StorageReference } from 'firebase/storage';

export interface FirebaseConfig {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId?: string;
}

export class FirebaseStorageManager {
    private storage;
    private auth;
    private userId: string;

    constructor(config: FirebaseConfig, userId: string) {
        const app = initializeApp(config, 'supersplat-editor');
        this.storage = getStorage(app);
        this.auth = getAuth(app);
        this.userId = userId;
    }

    private getSplatRef(filename: string): StorageReference {
        return ref(this.storage, `users/${this.userId}/splats/${filename}`);
    }

    async uploadSplat(file: File | Blob, filename: string): Promise<string> {
        try {
            const splatRef = this.getSplatRef(filename);
            await uploadBytes(splatRef, file);
            return await getDownloadURL(splatRef);
        } catch (error) {
            console.error('Error uploading splat:', error);
            throw error;
        }
    }

    async downloadSplat(url: string): Promise<ArrayBuffer> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.arrayBuffer();
        } catch (error) {
            console.error('Error downloading splat:', error);
            throw error;
        }
    }
}

// Parse URL parameters to get Firebase config and user ID
export function getFirebaseParams(): { config: FirebaseConfig; userId: string } | null {
    try {
        const params = new URLSearchParams(window.location.search);
        const configStr = params.get('config');
        const userId = params.get('userId');

        if (!configStr || !userId) {
            console.error('Missing required Firebase parameters');
            return null;
        }

        const config = JSON.parse(decodeURIComponent(configStr));
        return { config, userId };
    } catch (error) {
        console.error('Error parsing Firebase parameters:', error);
        return null;
    }
}

// Initialize Firebase storage with URL parameters
export function initializeFirebaseStorage(): FirebaseStorageManager | null {
    const params = getFirebaseParams();
    if (!params) return null;

    return new FirebaseStorageManager(params.config, params.userId);
}
