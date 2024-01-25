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

    constructor(events: Events) {
        events.on('edit:undo', () => {
            if (this.canUndo()) {
                this.undo();
                events.fire('edit:changed');
            }
        });

        events.on('edit:redo', () => {
            if (this.canRedo()) {
                this.redo();
                events.fire('edit:changed');
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
        this.history[--this.cursor].undo();
    }

    redo() {
        this.history[this.cursor++].do();
    }
}

export { EditHistory };
