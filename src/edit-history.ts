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

        events.on('edit.undo', () => this.undo());
        events.on('edit.redo', () => this.redo());
        events.on('edit.add', (editOp: EditOp, suppressOp = false) => this.add(editOp, suppressOp));
    }

    // enqueue arbitrary async work onto the serialized history chain. exposed so external
    // callers (e.g. transform handlers) can serialize their own GPU readbacks alongside
    // history mutations and avoid the same race conditions.
    queue(fn: () => Promise<void>) {
        const next = this.chain.then(fn);
        this.chain = next.catch((err) => {
            console.error('EditHistory queued operation failed', err);
        });
        return next;
    }

    add(editOp: EditOp, suppressOp = false) {
        return this.queue(() => this._add(editOp, suppressOp));
    }

    canUndo() {
        return this.cursor > 0;
    }

    canRedo() {
        return this.cursor < this.history.length;
    }

    undo() {
        return this.queue(async () => {
            if (this.canUndo()) {
                await this._undo();
            }
        });
    }

    redo(suppressOp = false) {
        return this.queue(async () => {
            if (this.canRedo()) {
                await this._redo(suppressOp);
            }
        });
    }

    private async _add(editOp: EditOp, suppressOp = false) {
        while (this.cursor < this.history.length) {
            this.history.pop().destroy?.();
        }
        this.history.push(editOp);
        await this._redo(suppressOp);
    }

    private async _undo() {
        // only advance the cursor after a successful undo so a thrown editOp leaves
        // history in a consistent state for subsequent undo/redo.
        const editOp = this.history[this.cursor - 1];
        await editOp.undo();
        this.cursor--;
        this.events.fire('edit.apply', editOp);
        this.fireEvents();
    }

    private async _redo(suppressOp = false) {
        // only advance the cursor after a successful redo so a thrown editOp leaves
        // history in a consistent state for subsequent undo/redo.
        const editOp = this.history[this.cursor];
        if (!suppressOp) {
            await editOp.do();
        }
        this.cursor++;
        this.events.fire('edit.apply', editOp);
        this.fireEvents();
    }

    fireEvents() {
        this.events.fire('edit.canUndo', this.canUndo());
        this.events.fire('edit.canRedo', this.canRedo());
    }

    clear() {
        // route through the queue so any in-flight add/undo/redo finishes before we wipe
        // history, preventing queued ops from running against a cleared state.
        return this.queue(() => {
            this.history.forEach((editOp) => {
                editOp.destroy?.();
            });
            this.history = [];
            this.cursor = 0;
            this.fireEvents();
            return Promise.resolve();
        });
    }

    // Remove all operations that reference a specific splat
    removeForSplat(splat: Splat) {
        // serialize with the chain so we don't reshape history while a queued op is mid-flight
        // (which could leave queued undo/redo pointing at indices that no longer exist).
        return this.queue(() => {
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
            return Promise.resolve();
        });
    }
}

export { EditHistory };
