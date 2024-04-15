import { Events } from './events';

interface EditOp {
    name: string;
    do(): void;
    undo(): void;
    destroy(): void;
}

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
    }

    add(editOp: EditOp) {
        while (this.cursor < this.history.length) {
            this.history.pop().destroy();
        }
        this.history.push(editOp);
        this.redo();
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

    redo() {
        const editOp = this.history[this.cursor++];
        editOp.do();
        this.events.fire('edit.apply', editOp);
        this.fireEvents();
    }

    fireEvents() {
        this.events.fire('edit.canUndo', this.canUndo());
        this.events.fire('edit.canRedo', this.canRedo());
    }
}

export { EditHistory, EditOp };
