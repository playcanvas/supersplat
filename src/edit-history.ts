import { EditOp, MultiOp } from './edit-ops';
import { Events } from './events';
import { Splat } from './splat';

// Check if an operation references a specific splat
const opReferencesSplat = (op: EditOp, splat: Splat): boolean => {
    // Handle MultiOp by checking nested operations
    if (op instanceof MultiOp) {
        return op.ops.some(nestedOp => opReferencesSplat(nestedOp, splat));
    }
    // Check for splat property on the operation
    return (op as any).splat === splat;
};

class EditHistory {
    history: EditOp[] = [];
    cursor = 0;
    events: Events;

    // serialize all history-modifying operations so an in-flight op (including its async GPU
    // readback in updatePositions) completes before the next add/undo/redo begins. without this,
    // rapid Ctrl+Z / Ctrl+Shift+Z events race with pending updatePositions calls and corrupt the
    // sorter's centers buffer in centers-overlay mode.
    private chain: Promise<void> = Promise.resolve();

    constructor(events: Events) {
        this.events = events;

        events.on('edit.undo', () => {
            this.queue(async () => {
                if (this.canUndo()) {
                    await this.undo();
                }
            });
        });

        events.on('edit.redo', () => {
            this.queue(async () => {
                if (this.canRedo()) {
                    await this.redo();
                }
            });
        });

        events.on('edit.add', (editOp: EditOp, suppressOp = false) => {
            this.queue(() => this.add(editOp, suppressOp));
        });
    }

    private queue(fn: () => Promise<void>) {
        const next = this.chain.then(fn);
        this.chain = next.catch(() => {});
        return next;
    }

    async add(editOp: EditOp, suppressOp = false) {
        while (this.cursor < this.history.length) {
            this.history.pop().destroy?.();
        }
        this.history.push(editOp);
        await this.redo(suppressOp);
    }

    canUndo() {
        return this.cursor > 0;
    }

    canRedo() {
        return this.cursor < this.history.length;
    }

    async undo() {
        const editOp = this.history[--this.cursor];
        await editOp.undo();
        this.events.fire('edit.apply', editOp);
        this.fireEvents();
    }

    async redo(suppressOp = false) {
        const editOp = this.history[this.cursor++];
        if (!suppressOp) {
            await editOp.do();
        }
        this.events.fire('edit.apply', editOp);
        this.fireEvents();
    }

    fireEvents() {
        this.events.fire('edit.canUndo', this.canUndo());
        this.events.fire('edit.canRedo', this.canRedo());
    }

    clear() {
        this.history.forEach((editOp) => {
            editOp.destroy?.();
        });
        this.history = [];
        this.cursor = 0;
    }

    // Remove all operations that reference a specific splat
    removeForSplat(splat: Splat) {
        let newCursor = 0;
        const newHistory: EditOp[] = [];

        for (let i = 0; i < this.history.length; i++) {
            const op = this.history[i];
            // Skip ops referencing the splat; don't destroy them since the caller handles that
            if (!opReferencesSplat(op, splat)) {
                // Keep this operation
                newHistory.push(op);
                // Track cursor position (count kept operations before original cursor)
                if (i < this.cursor) {
                    newCursor++;
                }
            }
        }

        this.history = newHistory;
        this.cursor = newCursor;
        this.fireEvents();
    }
}

export { EditHistory };
