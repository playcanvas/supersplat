import { EditOp } from './edit-ops';
import { Events } from './events';

class EditHistory {
    history: EditOp[] = [];
    cursor = 0;
    events: Events;

    constructor(events: Events) {
        this.events = events;

        events.on('edit.undo', () => {
            if (this.canUndo()) {
                this.undo();
            }
        });

        events.on('edit.redo', () => {
            if (this.canRedo()) {
                this.redo();
            }
        });

        events.on('edit.add', (editOp: EditOp, suppressOp = false) => {
            this.add(editOp, suppressOp);
        });
    }

    add(editOp: EditOp, suppressOp = false) {
        while (this.cursor < this.history.length) {
            this.history.pop().destroy?.();
        }
        this.history.push(editOp);
        this.redo(suppressOp);
    }

    canUndo() {
        return this.cursor > 0;
    }

    canRedo() {
        return this.cursor < this.history.length;
    }

    undo() {
        const editOp = this.history[--this.cursor];
        editOp.undo();
        this.events.fire('edit.apply', editOp);
        this.fireEvents();
    }

    redo(suppressOp = false) {
        const editOp = this.history[this.cursor++];
        if (!suppressOp) {
            editOp.do();
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
}

export { EditHistory };
