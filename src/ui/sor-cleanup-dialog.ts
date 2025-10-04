import { Button, Container, Label, NumericInput, SelectInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import { Tooltips } from './tooltips';

interface SORCleanupOptions {
    mode: 'selection' | 'all';
    nbNeighbors: number;
    stdRatio: number;
}

class SORCleanupDialog extends Container {
    events: Events;
    modeSelect: SelectInput;
    nbNeighborsInput: NumericInput;
    stdRatioInput: NumericInput;
    
    constructor(events: Events, tooltips?: Tooltips) {
        super({
            id: 'sor-cleanup-dialog',
            class: 'sor-cleanup-dialog',
            hidden: true
        });

        this.events = events;

        // Dialog content
        const content = new Container({
            class: 'sor-cleanup-content',
            flex: true,
            flexDirection: 'column'
        });
        
        // Apply inline styling to content for dark theme panel
        setTimeout(() => {
            if (content.dom) {
                content.dom.style.background = '#2a2a2a';
                content.dom.style.color = 'white';
                content.dom.style.borderRadius = '8px';
                content.dom.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.5)';
                content.dom.style.border = '1px solid #444';
                content.dom.style.padding = '20px';
                content.dom.style.minWidth = '350px';
                content.dom.style.maxWidth = '400px';
                // Ensure content is interactive
                content.dom.style.pointerEvents = 'auto';
                content.dom.style.userSelect = 'auto';
            }
            
            // Style all text elements to be white while preserving interactivity
            const allElements = content.dom?.querySelectorAll('*');
            allElements?.forEach((el: Element) => {
                const element = el as HTMLElement;
                if (element.tagName === 'LABEL' || element.tagName === 'SPAN' || element.classList.contains('pcui-label')) {
                    element.style.color = 'white !important';
                }
                if (element.tagName === 'INPUT' || element.tagName === 'SELECT') {
                    element.style.color = 'white !important';
                    element.style.backgroundColor = '#404040 !important';
                    element.style.border = '1px solid #666 !important';
                    element.style.borderRadius = '4px';
                    element.style.padding = '4px 8px';
                    // Preserve interactivity
                    element.style.pointerEvents = 'auto';
                    element.style.userSelect = 'auto';
                }
                if (element.tagName === 'BUTTON') {
                    element.style.color = 'white';
                    element.style.backgroundColor = '#505050';
                    element.style.border = '1px solid #666';
                    element.style.borderRadius = '4px';
                    element.style.padding = '6px 12px';
                    element.style.cursor = 'pointer';
                    element.style.pointerEvents = 'auto';
                }
            });
        }, 0);

        // Title
        const title = new Label({
            class: 'sor-cleanup-title',
            text: 'Statistical Outlier Removal (SOR) Cleanup'
        });

        // Description
        const description = new Label({
            class: 'sor-cleanup-description',
            text: 'Remove statistical outliers based on distance to neighboring points. This method analyzes each point\'s distance to its neighbors and removes points that are significantly farther than the mean distance.'
        });

        // Mode selection
        const modeContainer = new Container({
            class: 'sor-cleanup-option',
            flex: true,
            flexDirection: 'row'
        });
        
        const modeLabel = new Label({
            class: 'sor-cleanup-label',
            text: 'Process:'
        });

        this.modeSelect = new SelectInput({
            class: 'sor-cleanup-select',
            options: [
                { v: 'selection', t: 'Selection Only' },
                { v: 'all', t: 'All Points' }
            ],
            value: 'selection'
        });

        modeContainer.append(modeLabel);
        modeContainer.append(this.modeSelect);

        // Number of neighbors parameter
        const nbNeighborsContainer = new Container({
            class: 'sor-cleanup-option',
            flex: true,
            flexDirection: 'row'
        });

        const nbNeighborsLabel = new Label({
            class: 'sor-cleanup-label',
            text: 'Neighbors:'
        });

        this.nbNeighborsInput = new NumericInput({
            class: 'sor-cleanup-input',
            value: 20,
            min: 1,
            max: 100,
            precision: 0,
            step: 1
        });
        
        // Ensure numeric input is enabled and styled with white text
        this.nbNeighborsInput.enabled = true;
        setTimeout(() => {
            if (this.nbNeighborsInput.dom) {
                this.nbNeighborsInput.dom.style.color = 'white !important';
                this.nbNeighborsInput.dom.style.backgroundColor = '#404040 !important';
                this.nbNeighborsInput.dom.style.border = '1px solid #666 !important';
                this.nbNeighborsInput.dom.style.pointerEvents = 'auto';
                this.nbNeighborsInput.dom.style.userSelect = 'auto';
                
                // Find and style the actual input element
                const input = this.nbNeighborsInput.dom.querySelector('input');
                if (input) {
                    (input as HTMLElement).style.color = 'white !important';
                    (input as HTMLElement).style.backgroundColor = '#404040 !important';
                    (input as HTMLElement).style.border = '1px solid #666 !important';
                    (input as HTMLElement).style.pointerEvents = 'auto';
                }
            }
        }, 10);

        const nbNeighborsHelp = new Label({
            class: 'sor-cleanup-help',
            text: 'Number of neighboring points to analyze for each point (1-100)'
        });

        nbNeighborsContainer.append(nbNeighborsLabel);
        nbNeighborsContainer.append(this.nbNeighborsInput);

        // Standard deviation ratio parameter
        const stdRatioContainer = new Container({
            class: 'sor-cleanup-option',
            flex: true,
            flexDirection: 'row'
        });

        const stdRatioLabel = new Label({
            class: 'sor-cleanup-label',
            text: 'Std Ratio:'
        });

        this.stdRatioInput = new NumericInput({
            class: 'sor-cleanup-input',
            value: 1.5,
            min: 0.1,
            max: 5.0,
            precision: 1,
            step: 0.1
        });
        
        // Ensure std ratio input is enabled and styled with white text
        this.stdRatioInput.enabled = true;
        
        // Ensure select is enabled
        this.modeSelect.enabled = true;
        
        setTimeout(() => {
            if (this.stdRatioInput.dom) {
                this.stdRatioInput.dom.style.color = 'white !important';
                this.stdRatioInput.dom.style.backgroundColor = '#404040 !important';
                this.stdRatioInput.dom.style.border = '1px solid #666 !important';
                this.stdRatioInput.dom.style.pointerEvents = 'auto';
                this.stdRatioInput.dom.style.userSelect = 'auto';
                
                // Find and style the actual input element
                const input = this.stdRatioInput.dom.querySelector('input');
                if (input) {
                    (input as HTMLElement).style.color = 'white !important';
                    (input as HTMLElement).style.backgroundColor = '#404040 !important';
                    (input as HTMLElement).style.border = '1px solid #666 !important';
                    (input as HTMLElement).style.pointerEvents = 'auto';
                }
            }
            
            // Style select dropdown and ensure it's interactive
            if (this.modeSelect.dom) {
                this.modeSelect.dom.style.color = 'white !important';
                this.modeSelect.dom.style.backgroundColor = '#404040 !important';
                this.modeSelect.dom.style.border = '1px solid #666 !important';
                this.modeSelect.dom.style.pointerEvents = 'auto';
                this.modeSelect.dom.style.userSelect = 'auto';
                
                // Find and style the actual select element
                const select = this.modeSelect.dom.querySelector('select');
                if (select) {
                    (select as HTMLElement).style.color = 'white !important';
                    (select as HTMLElement).style.backgroundColor = '#404040 !important';
                    (select as HTMLElement).style.border = '1px solid #666 !important';
                    (select as HTMLElement).style.pointerEvents = 'auto';
                }
            }
        }, 10);

        const stdRatioHelp = new Label({
            class: 'sor-cleanup-help',
            text: 'Standard deviation threshold multiplier (0.1-5.0). Lower values = more aggressive cleanup'
        });

        stdRatioContainer.append(stdRatioLabel);
        stdRatioContainer.append(this.stdRatioInput);

        // Buttons
        const buttonContainer = new Container({
            class: 'sor-cleanup-buttons',
            flex: true,
            flexDirection: 'row'
        });

        const cancelButton = new Button({
            class: ['sor-cleanup-button', 'cancel'],
            text: 'Cancel',
            enabled: true
        });

        const previewButton = new Button({
            class: ['sor-cleanup-button', 'preview'],
            text: 'Preview',
            enabled: true
        });

        const applyButton = new Button({
            class: ['sor-cleanup-button', 'apply'],
            text: 'Apply Cleanup',
            enabled: true
        });

        const separateButton = new Button({
            class: ['sor-cleanup-button', 'separate'],
            text: 'Separate Outliers',
            enabled: true
        });

        buttonContainer.append(cancelButton);
        buttonContainer.append(previewButton);
        buttonContainer.append(applyButton);
        buttonContainer.append(separateButton);
        
        // Style buttons with proper white text and hover effects
        setTimeout(() => {
            [cancelButton, previewButton, applyButton, separateButton].forEach(button => {
                if (button.dom) {
                    button.dom.style.color = 'white';
                    button.dom.style.backgroundColor = '#505050';
                    button.dom.style.border = '1px solid #666';
                    button.dom.style.borderRadius = '4px';
                    button.dom.style.padding = '8px 16px';
                    button.dom.style.margin = '0 4px';
                    button.dom.style.cursor = 'pointer';
                    button.dom.style.transition = 'background-color 0.2s';
                    
                    // Add hover effects
                    button.dom.addEventListener('mouseenter', () => {
                        button.dom.style.backgroundColor = '#606060';
                    });
                    button.dom.addEventListener('mouseleave', () => {
                        button.dom.style.backgroundColor = '#505050';
                    });
                }
            });
            
            // Special styling for apply button (primary action)
            if (applyButton.dom) {
                applyButton.dom.style.backgroundColor = '#007acc';
                applyButton.dom.addEventListener('mouseenter', () => {
                    applyButton.dom.style.backgroundColor = '#005999';
                });
                applyButton.dom.addEventListener('mouseleave', () => {
                    applyButton.dom.style.backgroundColor = '#007acc';
                });
            }
            
            // Special styling for preview button
            if (previewButton.dom) {
                previewButton.dom.style.backgroundColor = '#cc5500';
                previewButton.dom.addEventListener('mouseenter', () => {
                    previewButton.dom.style.backgroundColor = '#aa4400';
                });
                previewButton.dom.addEventListener('mouseleave', () => {
                    previewButton.dom.style.backgroundColor = '#cc5500';
                });
            }
            
            // Special styling for separate button
            if (separateButton.dom) {
                separateButton.dom.style.backgroundColor = '#7d4cdb';
                separateButton.dom.addEventListener('mouseenter', () => {
                    separateButton.dom.style.backgroundColor = '#6a3bb8';
                });
                separateButton.dom.addEventListener('mouseleave', () => {
                    separateButton.dom.style.backgroundColor = '#7d4cdb';
                });
            }
        }, 0);

        // Assemble dialog
        content.append(title);
        content.append(description);
        content.append(modeContainer);
        content.append(nbNeighborsContainer);
        content.append(nbNeighborsHelp);
        content.append(stdRatioContainer);
        content.append(stdRatioHelp);
        content.append(buttonContainer);

        this.append(content);

        // Prevent clicks on content from closing the dialog
        content.on('click', (event) => {
            event.stopPropagation();
        });

        // Event handlers
        cancelButton.on('click', () => {
            // Clear any preview and restore colors when canceling
            this.events.fire('sor.cancelPreview');
            this.hide();
        });

        previewButton.on('click', () => {
            this.previewCleanup();
        });

        applyButton.on('click', () => {
            this.applyCleanup();
        });

        separateButton.on('click', () => {
            this.separateOutliers();
        });

        // Update mode selection based on current selection
        events.on('selection.changed', () => {
            const hasSelection = events.invoke('selection') !== null;
            if (!hasSelection && this.modeSelect.value === 'selection') {
                this.modeSelect.value = 'all';
            }
        });
    }

    show() {
        // Check if there's a current selection
        const hasSelection = this.events.invoke('selection') !== null;
        
        if (!hasSelection) {
            this.modeSelect.value = 'all';
            // Show a message if no selection is available
            console.log('SOR Dialog: No selection available, defaulting to "All Points" mode');
        }

        this.hidden = false;
        
        // Apply inline styling to position dialog in top-right
        if (this.dom) {
            this.dom.style.position = 'fixed';
            this.dom.style.top = '20px';
            this.dom.style.right = '20px';
            this.dom.style.zIndex = '10000';
            this.dom.style.maxWidth = '400px';
            this.dom.style.pointerEvents = 'auto';
            this.dom.style.userSelect = 'auto';
            
            // Force re-enable all inputs and selects after a slight delay
            setTimeout(() => {
                this.modeSelect.enabled = true;
                this.nbNeighborsInput.enabled = true;
                this.stdRatioInput.enabled = true;
                
                // Focus the first interactive element to confirm it's working
                const firstInput = this.dom.querySelector('input, select');
                if (firstInput) {
                    (firstInput as HTMLElement).focus();
                }
            }, 50);
        }
    }

    hide() {
        this.hidden = true;
    }

    private getOptions(): SORCleanupOptions {
        return {
            mode: this.modeSelect.value as 'selection' | 'all',
            nbNeighbors: Math.round(this.nbNeighborsInput.value),
            stdRatio: this.stdRatioInput.value
        };
    }

    private previewCleanup() {
        const options = this.getOptions();
        this.events.fire('sor.preview', options);
    }

    private applyCleanup() {
        const options = this.getOptions();
        this.events.fire('sor.apply', options);
        this.hide();
    }

    private separateOutliers() {
        const options = this.getOptions();
        this.events.fire('sor.separate', options);
        this.hide();
    }
}

export { SORCleanupDialog, SORCleanupOptions };