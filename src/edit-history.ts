interface EditOp {
    name: string;
    do(): void;
    undo(): void;
    destroy(): void;
}

class EditHistory {
    history: EditOp[] = [];
    cursor = 0;

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
