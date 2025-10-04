/**
 * Utility functions for managing UI state during intensive processing operations
 */

export class ProcessingManager {
    private static originalCursor: string = '';
    private static isProcessing: boolean = false;

    /**
     * Start processing mode - change cursor to hourglass and prepare for intensive operation
     */
    static startProcessing(): void {
        if (!this.isProcessing) {
            this.originalCursor = document.body.style.cursor || 'default';
            document.body.style.cursor = 'wait';
            this.isProcessing = true;
        }
    }

    /**
     * End processing mode - restore original cursor
     */
    static endProcessing(): void {
        if (this.isProcessing) {
            document.body.style.cursor = this.originalCursor;
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