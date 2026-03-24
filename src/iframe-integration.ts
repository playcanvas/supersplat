import { MemoryFileSystem } from '@playcanvas/splat-transform';

import { Events } from './events';
import { Scene } from './scene';
import { serializePlyCompressed } from './splat-serialize';

/**
 * Checks if the app is running inside an iframe
 */
const isInIframe = (): boolean => {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
};

/**
 * Creates the Submit/Cancel buttons for iframe mode
 */
const createIframeControls = (events: Events, scene: Scene): { submit: HTMLButtonElement, cancel: HTMLButtonElement } => {
    const submitButton = document.createElement('button');
    submitButton.id = 'submit-splat-button';
    submitButton.textContent = 'Upload';
    submitButton.className = 'iframe-control-button';

    const cancelButton = document.createElement('button');
    cancelButton.id = 'cancel-splat-button';
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'iframe-control-button';

    document.body.appendChild(cancelButton);
    document.body.appendChild(submitButton);

    return { submit: submitButton, cancel: cancelButton };
};

/**
 * Gets the current camera pose (position, target, fov)
 */
const getCameraPose = (events: Events): { position: number[], target: number[], fov: number } | null => {
    try {
        const pose = events.invoke('camera.getPose');
        if (!pose) {
            console.error('[IframeIntegration] Failed to get camera pose');
            return null;
        }

        return {
            position: [pose.position.x, pose.position.y, pose.position.z],
            target: [pose.target.x, pose.target.y, pose.target.z],
            fov: events.invoke('camera.fov')
        };
    } catch (error) {
        console.error('[IframeIntegration] Error getting camera pose:', error);
        return null;
    }
};

/**
 * Captures a thumbnail using the render.offscreen() API
 */
const captureThumbnail = async (scene: Scene): Promise<Blob | null> => {
    try {
        const width = 512;
        const height = 512;

        // Use the render.offscreen() API to capture the current viewport
        const pixels = await scene.events.invoke('render.offscreen', width, height);

        if (!pixels) {
            console.error('[IframeIntegration] Failed to capture pixels from render.offscreen()');
            return null;
        }

        // Convert pixels to PNG blob
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                resolve(null);
                return;
            }

            const imageData = ctx.createImageData(width, height);
            imageData.data.set(pixels);
            ctx.putImageData(imageData, 0, 0);

            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });
    } catch (error) {
        console.error('[IframeIntegration] Error capturing thumbnail:', error);
        return null;
    }
};

/**
 * Exports the PLY file from the scene
 */
const exportPly = async (events: Events): Promise<{ filename: string, data: ArrayBuffer } | null> => {
    try {
        // Get all splats from the scene
        const splats = events.invoke('scene.splats');

        if (!splats || splats.length === 0) {
            console.error('[IframeIntegration] No splats found in scene');
            return null;
        }

        // Use MemoryFileSystem to capture PLY data in memory (no download)
        const memFs = new MemoryFileSystem();
        const serializeSettings = {
            maxSHBands: 3,
            minOpacity: 1 / 255,
            removeInvalid: true
        };
        await serializePlyCompressed(splats, serializeSettings, memFs);

        // Get the written file from memory (serializer uses 'output.compressed.ply')
        const data = memFs.results.get('output.compressed.ply');
        if (!data) {
            console.error('[IframeIntegration] No PLY data written to memory');
            return null;
        }
        const arrayBuffer = new ArrayBuffer(data.byteLength);
        new Uint8Array(arrayBuffer).set(data);

        // Get the filename from the first splat and ensure .compressed.ply extension
        let filename = splats[0].filename || 'edited.ply';
        if (!filename.includes('.compressed.ply')) {
            filename = filename.replace(/\.ply$/i, '.compressed.ply');
        }

        return {
            filename,
            data: arrayBuffer
        };
    } catch (error) {
        console.error('[IframeIntegration] Error exporting PLY:', error);
        return null;
    }
};

/**
 * Initializes iframe integration if running in an iframe
 */
export const initIframeIntegration = (events: Events, scene: Scene) => {
    if (!isInIframe()) {
        console.log('[IframeIntegration] Not in iframe, skipping integration');
        return;
    }

    console.log('[IframeIntegration] Detected iframe mode, initializing controls');

    const { submit, cancel } = createIframeControls(events, scene);

    // Handle Cancel button
    cancel.addEventListener('click', () => {
        console.log('[IframeIntegration] Cancel clicked');
        window.parent.postMessage({ type: 'splat-editor-cancel' }, '*');
    });

    /**
     * Core export logic - used by both Submit button and auto-export message
     */
    const performExport = async (options: { includeThumbnail?: boolean, includeCameraPose?: boolean } = {}) => {
        const { includeThumbnail = true, includeCameraPose = true } = options;

        // Capture camera pose if requested
        let cameraPose = null;
        if (includeCameraPose) {
            cameraPose = getCameraPose(events);
            if (!cameraPose) {
                throw new Error('Failed to capture camera pose');
            }
        }

        // Capture thumbnail if requested
        let thumbnail = null;
        if (includeThumbnail) {
            thumbnail = await captureThumbnail(scene);
            if (!thumbnail) {
                throw new Error('Failed to capture thumbnail');
            }
        }

        // Export PLY (always required)
        const plyData = await exportPly(events);
        if (!plyData) {
            throw new Error('Failed to export PLY');
        }

        // Send data to parent window
        window.parent.postMessage({
            type: 'splat-editor-submit',
            data: {
                thumbnail: thumbnail,
                plyFile: plyData.data,
                filename: plyData.filename,
                cameraPose: cameraPose
            }
        }, '*');

        console.log('[IframeIntegration] Successfully sent export to parent');
    };

    // Handle Submit button
    submit.addEventListener('click', async () => {
        console.log('[IframeIntegration] Submit clicked, capturing thumbnail and exporting PLY');

        submit.disabled = true;
        cancel.disabled = true;
        submit.textContent = 'Processing...';

        try {
            await performExport({ includeThumbnail: true, includeCameraPose: true });
        } catch (error) {
            console.error('[IframeIntegration] Error during submit:', error);
            window.parent.postMessage({
                type: 'splat-editor-error',
                error: error?.message || String(error)
            }, '*');

            submit.disabled = false;
            cancel.disabled = false;
            submit.textContent = 'Submit';
        }
    });

    // Listen for messages from parent
    window.addEventListener('message', async (e) => {
        if (e.data?.type === 'supersplat:import') {
            console.log('[IframeIntegration] Import message received:', e.data);
            const files = e.data.files;

            if (files && files.length > 0) {
                for (const fileData of files) {
                    try {
                        await events.invoke('import', [fileData]);
                        console.log('[IframeIntegration] Successfully imported:', fileData.filename);
                    } catch (error) {
                        console.error('[IframeIntegration] Failed to import:', fileData.filename, error);
                        window.parent.postMessage({
                            type: 'supersplat:import:error',
                            error: error?.message || String(error)
                        }, '*');
                    }
                }
            }
        } else if (e.data?.type === 'supersplat:auto-export') {
            console.log('[IframeIntegration] Auto-export message received');

            try {
                // For auto-export (batch compression), skip thumbnail and camera pose
                // to optimize performance
                await performExport({ includeThumbnail: false, includeCameraPose: false });
            } catch (error) {
                console.error('[IframeIntegration] Error during auto-export:', error);
                window.parent.postMessage({
                    type: 'splat-editor-error',
                    error: error?.message || String(error)
                }, '*');
            }
        }
    });

    // Notify parent that editor is ready (send both formats for compatibility)
    window.parent.postMessage({ type: 'splat-editor-ready' }, '*');
    window.parent.postMessage({ type: 'supersplat:ready' }, '*');
    console.log('[IframeIntegration] Sent ready messages to parent');
};
