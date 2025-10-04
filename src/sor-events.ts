import { EditHistory } from './edit-history';
import { SORCleanupOp, SelectOp, DeleteSelectionOp, AddSplatOp, MultiOp } from './edit-ops';
import { Events } from './events';
import { Scene } from './scene';
import { SORCleanup } from './sor-cleanup';
import { Splat } from './splat';
import { SORCleanupOptions } from './ui/sor-cleanup-dialog';
import { BufferWriter } from './serialize/writer';
import { serializePly } from './splat-serialize';

/**
 * Perform SOR separate operation with custom filename for outliers
 * @param splat The splat containing the selected outliers
 * @param scene The scene to add the separated splat to
 * @param editHistory The edit history for undo/redo
 */
const performSORSeparate = async (splat: Splat, scene: Scene, editHistory: EditHistory) => {
    const writer = new BufferWriter();

    // Serialize only the selected (outlier) points
    await serializePly([splat], {
        maxSHBands: 3,
        selected: true
    }, writer);

    const buffers = writer.close();

    if (buffers) {
        // Create a modified filename for the outliers
        const originalFilename = splat.filename;
        const extension = originalFilename.toLowerCase().endsWith('.ply') ? '.ply' : 
                          originalFilename.toLowerCase().endsWith('.sog') ? '.sog' : '';
        const baseName = extension ? originalFilename.slice(0, -extension.length) : originalFilename;
        const outliersFilename = `${baseName}_SOR_outliers${extension}`;

        // Create blob and load as new splat with custom filename
        const blob = new Blob(buffers as unknown as ArrayBuffer[], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        
        try {
            const outliersSplat = await scene.assetLoader.loadPly({ 
                url, 
                filename: outliersFilename 
            });

            // Perform the separate operation: delete selection from original, add new splat
            editHistory.add(new MultiOp([
                new DeleteSelectionOp(splat),
                new AddSplatOp(scene, outliersSplat)
            ]));
        } finally {
            URL.revokeObjectURL(url);
        }
    }
};

/**
 * Reset popup to center position if it's not a SOR popup
 */
const resetPopupPositionIfNotSOR = () => {
    setTimeout(() => {
        const popupDialog = document.getElementById('popup-dialog');
        const popupHeader = document.getElementById('popup-header');
        
        if (popupDialog && popupHeader) {
            // Check if this is NOT a SOR popup
            const isSORPopup = popupHeader.textContent?.includes('SOR');
            const hasDataAttribute = popupDialog.hasAttribute('data-sor-popup');
            
            if (!isSORPopup && !hasDataAttribute) {
                // Reset to center position (original SCSS styling)
                popupDialog.style.position = 'absolute';
                popupDialog.style.left = '50%';
                popupDialog.style.top = '50%';
                popupDialog.style.right = 'auto';
                popupDialog.style.bottom = 'auto';
                popupDialog.style.transform = 'translate(-50%, -50%)';
                popupDialog.style.maxWidth = '480px'; // Original max-width from SCSS
                popupDialog.removeAttribute('data-sor-popup');
            }
        }
    }, 10);
};

/**
 * Register SOR cleanup event handlers
 * @param events The events system
 * @param editHistory The edit history for undo/redo
 * @param scene The scene containing splats
 */
const registerSOREvents = (events: Events, editHistory: EditHistory, scene: Scene) => {
    let originalLockedColor: any = null;
    
    // Set up MutationObserver to detect popup changes and reset position for non-SOR popups
    const popupContainer = document.getElementById('popup');
    if (popupContainer) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target as HTMLElement;
                    if (!target.classList.contains('pcui-hidden')) {
                        // Popup is being shown, check if we need to reset position
                        resetPopupPositionIfNotSOR();
                    }
                }
            });
        });
        
        observer.observe(popupContainer, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
    
    // Preview SOR outliers by temporarily marking them as locked and changing color to red
    events.on('sor.preview', async (options: SORCleanupOptions) => {
        const selection = events.invoke('selection') as Splat;
        if (!selection) {
            await events.invoke('showPopup', {
                type: 'error',
                header: 'SOR Preview Error',
                message: 'No splat selected. Please select a splat to preview SOR cleanup.'
            });
            return;
        }

        try {
            // Store original locked color and set it to red for preview
            if (originalLockedColor === null) {
                originalLockedColor = events.invoke('lockedClr');
            }
            events.fire('setLockedClr', { r: 1, g: 0, b: 0, a: 0.8 }); // Red with some transparency
            
            const result = SORCleanup.previewOutliers(selection, options);
            
            const popupResult = await events.invoke('showPopup', {
                type: 'info',
                header: 'SOR Preview Results',
                message: `Preview Mode: ${options.mode}\n\nProcessed Points: ${result.totalProcessed.toLocaleString()}\nOutliers Found: ${result.totalOutliers.toLocaleString()}\n\nParameters:\n• Neighbors: ${options.nbNeighbors}\n• Std Ratio: ${options.stdRatio}\n\nOutliers are highlighted in RED. Use "Apply Cleanup" to permanently remove them, or close the dialog to cancel.`
            });
            
            // Move the popup dialog to bottom-right position after showing (SOR specific)
            setTimeout(() => {
                const popupDialog = document.getElementById('popup-dialog');
                const popupHeader = document.getElementById('popup-header');
                if (popupDialog && popupHeader && popupHeader.textContent?.includes('SOR')) {
                    popupDialog.style.position = 'fixed';
                    popupDialog.style.bottom = '20px';
                    popupDialog.style.right = '20px';
                    popupDialog.style.top = 'auto';
                    popupDialog.style.left = 'auto';
                    popupDialog.style.transform = 'none';
                    popupDialog.style.maxWidth = '400px';
                    popupDialog.setAttribute('data-sor-popup', 'true');
                }
            }, 10);
        } catch (error: any) {
            await events.invoke('showPopup', {
                type: 'error',
                header: 'SOR Preview Error',
                message: `Failed to preview SOR cleanup: ${error.message || error}`
            });
        }
    });

    // Apply SOR cleanup permanently
    events.on('sor.apply', async (options: SORCleanupOptions) => {
        const selection = events.invoke('selection') as Splat;
        if (!selection) {
            await events.invoke('showPopup', {
                type: 'error',
                header: 'SOR Apply Error',
                message: 'No splat selected. Please select a splat to apply SOR cleanup.'
            });
            return;
        }

        try {
            // Restore original locked color if it was changed
            if (originalLockedColor !== null) {
                events.fire('setLockedClr', originalLockedColor);
                originalLockedColor = null;
            }
            
            // Clear any preview state first
            SORCleanup.clearPreview(selection);
            
            // Create and execute the SOR cleanup operation
            const sorOp = new SORCleanupOp(selection, options);
            
            if (sorOp.indices.length === 0) {
                const noOutliersResult = await events.invoke('showPopup', {
                    type: 'info',
                    header: 'SOR Cleanup Complete',
                    message: 'No outliers found with the current parameters. No points were removed.'
                });
                
            // Move the popup dialog to bottom-right position after showing (SOR specific)
            setTimeout(() => {
                const popupDialog = document.getElementById('popup-dialog');
                const popupHeader = document.getElementById('popup-header');
                if (popupDialog && popupHeader && popupHeader.textContent?.includes('SOR')) {
                    popupDialog.style.position = 'fixed';
                    popupDialog.style.bottom = '20px';
                    popupDialog.style.right = '20px';
                    popupDialog.style.top = 'auto';
                    popupDialog.style.left = 'auto';
                    popupDialog.style.transform = 'none';
                    popupDialog.style.maxWidth = '400px';
                    popupDialog.setAttribute('data-sor-popup', 'true');
                }
            }, 10);
                return;
            }
            
            // Add to edit history and execute
            editHistory.add(sorOp);
            
            const removalPercentage = ((sorOp.totalOutliers / sorOp.totalProcessed) * 100).toFixed(1);
            
            const applyResult = await events.invoke('showPopup', {
                type: 'success',
                header: 'SOR Cleanup Complete',
                message: `Successfully removed statistical outliers!\n\nMode: ${options.mode}\nProcessed Points: ${sorOp.totalProcessed.toLocaleString()}\nRemoved Points: ${sorOp.totalOutliers.toLocaleString()} (${removalPercentage}%)\n\nParameters:\n• Neighbors: ${options.nbNeighbors}\n• Std Ratio: ${options.stdRatio}\n\nUse Ctrl+Z to undo if needed.`
            });
            
            // Move the popup dialog to bottom-right position after showing (SOR specific)
            setTimeout(() => {
                const popupDialog = document.getElementById('popup-dialog');
                const popupHeader = document.getElementById('popup-header');
                if (popupDialog && popupHeader && popupHeader.textContent?.includes('SOR')) {
                    popupDialog.style.position = 'fixed';
                    popupDialog.style.bottom = '20px';
                    popupDialog.style.right = '20px';
                    popupDialog.style.top = 'auto';
                    popupDialog.style.left = 'auto';
                    popupDialog.style.transform = 'none';
                    popupDialog.style.maxWidth = '400px';
                    popupDialog.setAttribute('data-sor-popup', 'true');
                }
            }, 10);
            
            // Close the SOR dialog after successful apply
            events.fire('sor.closeDialog');
        } catch (error: any) {
            await events.invoke('showPopup', {
                type: 'error',
                header: 'SOR Apply Error',
                message: `Failed to apply SOR cleanup: ${error.message || error}`
            });
        }
    });

    // Clear SOR preview when selection changes
    events.on('selection.changed', () => {
        // Restore original locked color if it was changed
        if (originalLockedColor !== null) {
            events.fire('setLockedClr', originalLockedColor);
            originalLockedColor = null;
        }
        
        const selection = events.invoke('selection') as Splat;
        if (selection) {
            // Clear any existing SOR previews on the selected splat
            SORCleanup.clearPreview(selection);
        }
    });

    // Clear SOR preview when scene is cleared
    events.on('scene.clear', () => {
        // Restore original locked color if it was changed
        if (originalLockedColor !== null) {
            events.fire('setLockedClr', originalLockedColor);
            originalLockedColor = null;
        }
        // Previews are automatically cleared when splats are destroyed
    });
    
    // Separate SOR outliers into a new splat
    events.on('sor.separate', async (options: SORCleanupOptions) => {
        const selection = events.invoke('selection') as Splat;
        if (!selection) {
            await events.invoke('showPopup', {
                type: 'error',
                header: 'SOR Separate Error',
                message: 'No splat selected. Please select a splat to separate SOR outliers.'
            });
            return;
        }

        try {
            // Restore original locked color if it was changed
            if (originalLockedColor !== null) {
                events.fire('setLockedClr', originalLockedColor);
                originalLockedColor = null;
            }
            
            // Clear any preview state first
            SORCleanup.clearPreview(selection);
            
            // Find the outlier indices
            const result = SORCleanup.previewOutliers(selection, options);
            
            if (result.outlierIndices.length === 0) {
                const noOutliersResult = await events.invoke('showPopup', {
                    type: 'info',
                    header: 'SOR Separate Complete',
                    message: 'No outliers found with the current parameters. No points were separated.'
                });
                
                // Move popup to bottom-right
                setTimeout(() => {
                    const popupDialog = document.getElementById('popup-dialog');
                    if (popupDialog) {
                        popupDialog.style.position = 'fixed';
                        popupDialog.style.bottom = '20px';
                        popupDialog.style.right = '20px';
                        popupDialog.style.top = 'auto';
                        popupDialog.style.left = 'auto';
                        popupDialog.style.transform = 'none';
                        popupDialog.style.maxWidth = '400px';
                    }
                }, 10);
                return;
            }
            
            // Clear any existing preview first
            SORCleanup.clearPreview(selection);
            
            // Perform custom SOR separate operation with modified filename
            const outlierSet = new Set(result.outlierIndices);
            const filter = (i: number) => outlierSet.has(i);
            
            // Temporarily mark the outliers as selected
            events.fire('edit.add', new SelectOp(selection, 'set', filter));
            
            // Wait a frame to ensure selection is applied
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Perform custom separate operation with modified filename
            await performSORSeparate(selection, scene, editHistory);
            
            const separatePercentage = ((result.totalOutliers / result.totalProcessed) * 100).toFixed(1);
            
            const separateResult = await events.invoke('showPopup', {
                type: 'success',
                header: 'SOR Separate Complete',
                message: `Successfully separated statistical outliers into a new splat!\n\nMode: ${options.mode}\nProcessed Points: ${result.totalProcessed.toLocaleString()}\nSeparated Points: ${result.totalOutliers.toLocaleString()} (${separatePercentage}%)\n\nParameters:\n• Neighbors: ${options.nbNeighbors}\n• Std Ratio: ${options.stdRatio}\n\nOutliers are now in a separate splat. Use Ctrl+Z to undo if needed.`
            });
            
            // Move popup to bottom-right (SOR specific)
            setTimeout(() => {
                const popupDialog = document.getElementById('popup-dialog');
                const popupHeader = document.getElementById('popup-header');
                if (popupDialog && popupHeader && popupHeader.textContent?.includes('SOR')) {
                    popupDialog.style.position = 'fixed';
                    popupDialog.style.bottom = '20px';
                    popupDialog.style.right = '20px';
                    popupDialog.style.top = 'auto';
                    popupDialog.style.left = 'auto';
                    popupDialog.style.transform = 'none';
                    popupDialog.style.maxWidth = '400px';
                    popupDialog.setAttribute('data-sor-popup', 'true');
                }
            }, 10);
            
        } catch (error: any) {
            await events.invoke('showPopup', {
                type: 'error',
                header: 'SOR Separate Error',
                message: `Failed to separate SOR outliers: ${error.message || error}`
            });
        }
    });

    // Handle cancel preview to restore colors
    events.on('sor.cancelPreview', () => {
        // Restore original locked color if it was changed
        if (originalLockedColor !== null) {
            events.fire('setLockedClr', originalLockedColor);
            originalLockedColor = null;
        }
        
        // Clear any existing previews
        const selection = events.invoke('selection') as Splat;
        if (selection) {
            SORCleanup.clearPreview(selection);
        }
    });
};

export { registerSOREvents };