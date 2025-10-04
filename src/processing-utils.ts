/**
 * Utility functions for managing UI state during intensive processing operations
 */

export class ProcessingManager {
    private static originalCursor: string = '';
    private static isProcessing: boolean = false;
    private static cursorStyleElement: HTMLStyleElement | null = null;
    private static cursorEnforcementInterval: number | null = null;

    /**
     * Start processing mode - change cursor to hourglass and prepare for intensive operation
     */
    static startProcessing(): void {
        if (!this.isProcessing) {
            this.originalCursor = document.body.style.cursor || 'default';
            
            // Create a style element that forces wait cursor on all elements
            this.cursorStyleElement = document.createElement('style');
            this.cursorStyleElement.id = 'processing-cursor-override';
            this.cursorStyleElement.textContent = `
                /* Global cursor override with maximum specificity */
                *, *::before, *::after, *:hover, *:focus, *:active {
                    cursor: wait !important;
                }
                html, body {
                    cursor: wait !important;
                }
                /* Specific UI elements */
                canvas, div, span, button, input, select, textarea, a, label {
                    cursor: wait !important;
                }
                /* PCUI specific elements */
                .pcui-container, .pcui-panel, .pcui-element, .pcui-button {
                    cursor: wait !important;
                }
                /* Canvas and application areas */
                #canvas-container, #canvas, #application-canvas, #app {
                    cursor: wait !important;
                }
                /* Override any pointer cursors */
                [style*="cursor: pointer"], [style*="cursor: default"], [style*="cursor: grab"] {
                    cursor: wait !important;
                }
            `;
            document.head.appendChild(this.cursorStyleElement);
            
            // Also set on body as fallback
            document.body.style.cursor = 'wait';
            document.documentElement.style.cursor = 'wait';
            
            // Add a JavaScript fallback that continuously enforces the cursor
            this.cursorEnforcementInterval = window.setInterval(() => {
                if (this.isProcessing) {
                    document.body.style.cursor = 'wait';
                    document.documentElement.style.cursor = 'wait';
                    
                    // Also apply to any canvas elements that might reset their cursor
                    const canvases = document.querySelectorAll('canvas');
                    canvases.forEach((canvas) => {
                        (canvas as HTMLElement).style.cursor = 'wait';
                    });
                }
            }, 100);
            
            this.isProcessing = true;
        }
    }

    /**
     * End processing mode - restore original cursor
     */
    static endProcessing(): void {
        if (this.isProcessing) {
            // Clear the cursor enforcement interval
            if (this.cursorEnforcementInterval !== null) {
                clearInterval(this.cursorEnforcementInterval);
                this.cursorEnforcementInterval = null;
            }
            
            // Remove the global cursor style
            if (this.cursorStyleElement) {
                document.head.removeChild(this.cursorStyleElement);
                this.cursorStyleElement = null;
            }
            
            // Restore original cursors
            document.body.style.cursor = this.originalCursor;
            document.documentElement.style.cursor = '';
            
            // Clear cursor on canvas elements
            const canvases = document.querySelectorAll('canvas');
            canvases.forEach((canvas) => {
                (canvas as HTMLElement).style.cursor = '';
            });
            
            this.isProcessing = false;
        }
    }

    /**
     * Yield control to browser to prevent "page unresponsive" warnings
     * Use this in intensive loops to allow browser to update UI
     */
    static async yieldToUI(): Promise<void> {
        return new Promise(resolve => {
            if (typeof requestAnimationFrame !== 'undefined') {
                requestAnimationFrame(() => resolve());
            } else {
                setTimeout(resolve, 0);
            }
        });
    }

    /**
     * Execute a function with processing indicators and yielding
     * @param operation - The intensive operation to perform
     * @param yieldInterval - How often to yield (default: every 1000 iterations)
     */
    static async executeWithYielding<T>(
        operation: (yieldCallback: () => Promise<void>) => Promise<T>,
        yieldInterval: number = 1000
    ): Promise<T> {
        this.startProcessing();
        
        try {
            let iterationCount = 0;
            const yieldCallback = async () => {
                iterationCount++;
                if (iterationCount % yieldInterval === 0) {
                    await this.yieldToUI();
                }
            };

            const result = await operation(yieldCallback);
            return result;
        } finally {
            this.endProcessing();
        }
    }

    /**
     * Wrap a synchronous intensive operation to be async with yielding
     * @param syncOperation - Synchronous operation that takes a yield callback
     * @param yieldInterval - How often to yield
     */
    static async makeYielding<T>(
        syncOperation: (yieldCallback: () => Promise<void>) => T,
        yieldInterval: number = 1000
    ): Promise<T> {
        return this.executeWithYielding(async (yieldCallback) => {
            return syncOperation(yieldCallback);
        }, yieldInterval);
    }
}