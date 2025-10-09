import { EditHistory } from './edit-history';
import { SORCleanupOp, SelectOp, DeleteSelectionOp, AddSplatOp, MultiOp } from './edit-ops';
import { Events } from './events';
import { ProcessingManager } from './processing-utils';
import { Scene } from './scene';
import { BufferWriter } from './serialize/writer';
import { SORCleanup } from './sor-cleanup';
import { Splat } from './splat';
import { serializePly } from './splat-serialize';
import { SORCleanupOptions } from './ui/sor-cleanup-dialog';

/**
 * Perform SOR separate operation with custom filename for outliers
 * @param {Splat} splat - The splat containing the selected outliers
 * @param {Scene} scene - The scene to add the separated splat to
 * @param {EditHistory} editHistory - The edit history for undo/redo
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
 * @param {Events} events - The events system
 * @param {EditHistory} editHistory - The edit history for undo/redo
 * @param {Scene} scene - The scene containing splats
 */
const registerSOREvents = (events: Events, editHistory: EditHistory, scene: Scene) => {
    // Log version info to help identify when latest build is loaded
    console.log('🔧 SOR Events registered - Build timestamp: 2025-10-09T01:49:00Z - OUTLIER STATE IMPLEMENTATION');

    // TEMPORARILY DISABLED: MutationObserver to test if it's interfering
    console.log('🔧 MutationObserver DISABLED for debugging');
    //
    // const popupContainer = document.getElementById('popup');
    // if (popupContainer) {
    //     const observer = new MutationObserver((mutations) => {
    //         mutations.forEach((mutation) => {
    //             if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
    //                 const target = mutation.target as HTMLElement;
    //                 if (!target.classList.contains('pcui-hidden')) {
    //                     // Popup is being shown, check if we need to reset position
    //                     resetPopupPositionIfNotSOR();
    //                 }
    //             }
    //         });
    //     });
    //
    //     observer.observe(popupContainer, {
    //         attributes: true,
    //         attributeFilter: ['class']
    //     });
    // }
    //

    // Preview SOR outliers by temporarily marking them with outlier state
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
            // Start processing mode (hourglass cursor)
            ProcessingManager.startProcessing();

            // No need to change locked color anymore - outliers use dedicated outlier state

            // Yield to UI to show cursor change before intensive operation
            await ProcessingManager.yieldToUI();

            const result = await SORCleanup.previewOutliers(selection, options);

            // End processing mode
            ProcessingManager.endProcessing();

            const popupResult = await events.invoke('showPopup', {
                type: 'info',
                header: 'SOR Preview Results',
                message: `Preview Mode: ${options.mode}\nProcessed Points: ${result.totalProcessed.toLocaleString()}\nOutliers Found: ${result.totalOutliers.toLocaleString()}\n\nParameters:\nNeighbors: ${options.nbNeighbors}\nStd Ratio: ${options.stdRatio}\n\nOutliers are highlighted in RED.\n\nNext Actions:\n• Apply Cleanup - permanently remove\n• Select Outliers - select outlier points\n• Separate Outliers - move to new splat\n• Close dialog to cancel preview`
            });

            // SOR popup positioning is now handled directly in popup.ts
            console.log('🔧 SOR popup positioning delegated to popup.ts');
        } catch (error: any) {
            // Make sure to end processing mode on error
            ProcessingManager.endProcessing();

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
            // Start processing mode (hourglass cursor)
            ProcessingManager.startProcessing();

            // Clear any preview state first
            SORCleanup.clearPreview(selection);

            // Yield to UI to show cursor change before intensive operation
            await ProcessingManager.yieldToUI();

            // Create and execute the SOR cleanup operation
            const sorOp = await SORCleanupOp.create(selection, options);

            // End processing mode
            ProcessingManager.endProcessing();

            if (sorOp.indices.length === 0) {
                const noOutliersResult = await events.invoke('showPopup', {
                    type: 'info',
                    header: 'SOR Cleanup Complete',
                    message: 'No outliers found with the current parameters.\n\nNo points were removed.'
                });

                // Move the popup dialog to bottom-right position immediately (SOR specific)
                const popupDialog = document.getElementById('popup-dialog');
                const popupHeader = document.getElementById('popup-header');
                const popupContent = document.getElementById('popup-content');

                if (popupDialog && popupHeader && popupHeader.textContent?.includes('SOR')) {
                    // Set data attribute immediately to prevent reset by observer
                    popupDialog.setAttribute('data-sor-popup', 'true');

                    // Apply positioning and styling immediately
                    popupDialog.style.position = 'fixed';
                    popupDialog.style.bottom = '20px';
                    popupDialog.style.right = '20px';
                    popupDialog.style.top = 'auto';
                    popupDialog.style.left = 'auto';
                    popupDialog.style.transform = 'none';
                    popupDialog.style.maxWidth = '400px';

                    // Apply content styling for better formatting
                    if (popupContent) {
                        popupContent.style.whiteSpace = 'pre-line';
                        popupContent.style.fontFamily = 'monospace';
                        popupContent.style.fontSize = '12px';
                        popupContent.style.lineHeight = '1.4';
                    }
                }
                return;
            }

            // Add to edit history and execute
            editHistory.add(sorOp);

            const removalPercentage = ((sorOp.totalOutliers / sorOp.totalProcessed) * 100).toFixed(1);

            const applyResult = await events.invoke('showPopup', {
                type: 'success',
                header: 'SOR Cleanup Complete',
                message: `Successfully removed statistical outliers!\n\nMode:...................................${options.mode}\nProcessed Points:.......................${sorOp.totalProcessed.toLocaleString()}\nRemoved Points:.........................${sorOp.totalOutliers.toLocaleString()} (${removalPercentage}%)\n\nParameters:\nNeighbors:..............................${options.nbNeighbors}\nStd Ratio:..............................${options.stdRatio}\n\nUse Ctrl+Z to undo if needed.`
            });

            // Move the popup dialog to bottom-right position immediately (SOR specific)
            const popupDialog = document.getElementById('popup-dialog');
            const popupHeader = document.getElementById('popup-header');
            const popupContent = document.getElementById('popup-content');

            if (popupDialog && popupHeader && popupHeader.textContent?.includes('SOR')) {
                // Set data attribute immediately to prevent reset by observer
                popupDialog.setAttribute('data-sor-popup', 'true');

                // Apply positioning and styling immediately
                popupDialog.style.position = 'fixed';
                popupDialog.style.bottom = '20px';
                popupDialog.style.right = '20px';
                popupDialog.style.top = 'auto';
                popupDialog.style.left = 'auto';
                popupDialog.style.transform = 'none';
                popupDialog.style.maxWidth = '450px';
                popupDialog.style.minWidth = '350px';

                // Apply content styling for better formatting
                if (popupContent) {
                    popupContent.style.whiteSpace = 'pre-line';
                    popupContent.style.fontFamily = 'monospace';
                    popupContent.style.fontSize = '12px';
                    popupContent.style.lineHeight = '1.4';
                }
            }

            // Close the SOR dialog after successful apply
            events.fire('sor.closeDialog');
        } catch (error: any) {
            // Make sure to end processing mode on error
            ProcessingManager.endProcessing();

            await events.invoke('showPopup', {
                type: 'error',
                header: 'SOR Apply Error',
                message: `Failed to apply SOR cleanup: ${error.message || error}`
            });
        }
    });

    // Clear SOR preview when selection changes
    events.on('selection.changed', () => {
        const selection = events.invoke('selection') as Splat;
        if (selection) {
            // Clear any existing SOR previews on the selected splat
            SORCleanup.clearPreview(selection);
        }
    });

    // Clear SOR preview when scene is cleared
    events.on('scene.clear', () => {
        // Previews are automatically cleared when splats are destroyed
    });

    // Select SOR outliers (no deletion, just set current selection to outliers)
    events.on('sor.selectOutliers', async (options: SORCleanupOptions) => {
        const selection = events.invoke('selection') as Splat;
        if (!selection) {
            await events.invoke('showPopup', {
                type: 'error',
                header: 'SOR Select Error',
                message: 'No splat selected. Please select a splat to select SOR outliers.'
            });
            return;
        }

        try {
            // Start processing mode (hourglass cursor)
            ProcessingManager.startProcessing();

            // Clear any preview state
            SORCleanup.clearPreview(selection);

            // Yield to UI to show cursor change before intensive operation
            await ProcessingManager.yieldToUI();

            const result = await SORCleanup.identifyOutliers(selection, options);

            // End processing mode
            ProcessingManager.endProcessing();

            // Safety check for result object
            if (!result || typeof result.totalOutliers === 'undefined' || typeof result.totalProcessed === 'undefined') {
                throw new Error('Invalid result from SOR outlier detection');
            }

            const outlierSet = new Set(result.outlierIndices);
            const filter = (i: number) => outlierSet.has(i);

            // Apply selection
            events.fire('edit.add', new SelectOp(selection, 'set', filter));

            await events.invoke('showPopup', {
                type: 'success',
                header: 'SOR Select Outliers',
                message: `Selected outliers successfully!\n\nProcessed Points:.......................${result.totalProcessed.toLocaleString()}\nSelected Outliers:......................${result.totalOutliers.toLocaleString()}\n\nThe outlier points are now selected and ready for further operations.`
            });

            // Move popup bottom-right immediately (SOR specific)
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
                    popupDialog.style.whiteSpace = 'pre-line'; // Respect line breaks
                    popupDialog.setAttribute('data-sor-popup', 'true');
                }
            }, 1);
        } catch (error: any) {
            // Make sure to end processing mode on error
            ProcessingManager.endProcessing();

            await events.invoke('showPopup', {
                type: 'error',
                header: 'SOR Select Error',
                message: `Failed to select SOR outliers: ${error.message || error}`
            });
        }
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
            // Start processing mode (hourglass cursor)
            ProcessingManager.startProcessing();

            // Clear any preview state first
            SORCleanup.clearPreview(selection);

            // Yield to UI to show cursor change before intensive operation
            await ProcessingManager.yieldToUI();

            // Find the outlier indices
            const result = await SORCleanup.previewOutliers(selection, options);

            if (result.outlierIndices.length === 0) {
                // End processing mode before showing popup
                ProcessingManager.endProcessing();

                const noOutliersResult = await events.invoke('showPopup', {
                    type: 'info',
                    header: 'SOR Separate Complete',
                    message: 'No outliers found with the current parameters.\n\nNo points were separated.'
                });

                // Move popup to bottom-right immediately
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
                        popupDialog.style.whiteSpace = 'pre-line'; // Respect line breaks
                        popupDialog.setAttribute('data-sor-popup', 'true');
                    }
                }, 1);
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
            await new Promise<void>((resolve) => {
                setTimeout(() => resolve(), 10);
            });

            // Perform custom separate operation with modified filename
            await performSORSeparate(selection, scene, editHistory);

            // End processing mode before showing success popup
            ProcessingManager.endProcessing();

            const separatePercentage = ((result.totalOutliers / result.totalProcessed) * 100).toFixed(1);

            const separateResult = await events.invoke('showPopup', {
                type: 'success',
                header: 'SOR Separate Complete',
                message: `Successfully separated statistical outliers into a new splat!\n\nMode:...................................${options.mode}\nProcessed Points:.......................${result.totalProcessed.toLocaleString()}\nSeparated Points:.......................${result.totalOutliers.toLocaleString()} (${separatePercentage}%)\n\nParameters:\nNeighbors:..............................${options.nbNeighbors}\nStd Ratio:..............................${options.stdRatio}\n\nOutliers are now in a separate splat.\nUse Ctrl+Z to undo if needed.`
            });

            // Move popup to bottom-right immediately (SOR specific)
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
                    popupDialog.style.whiteSpace = 'pre-line'; // Respect line breaks
                    popupDialog.setAttribute('data-sor-popup', 'true');
                }
            }, 1);

        } catch (error: any) {
            // Make sure to end processing mode on error
            ProcessingManager.endProcessing();

            await events.invoke('showPopup', {
                type: 'error',
                header: 'SOR Separate Error',
                message: `Failed to separate SOR outliers: ${error.message || error}`
            });
        }
    });

    // Handle cancel preview
    events.on('sor.cancelPreview', () => {
        // Clear any existing previews
        const selection = events.invoke('selection') as Splat;
        if (selection) {
            SORCleanup.clearPreview(selection);
        }
    });
};

export { registerSOREvents };
