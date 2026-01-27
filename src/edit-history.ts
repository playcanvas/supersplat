import { EditOp, MultiOp } from './edit-ops';
import { Element } from './element';
import { Events } from './events';
import { Splat } from './splat';


class EditHistory {
    history: EditOp[] = [];
    cursor = 0;
    events: Events;

    constructor(events: Events) {
        this.events = events;

        events.on('edit.undo', async () => {
            if (this.canUndo()) {
                await this.undo();
            }
        });

        events.on('edit.redo', async () => {
            if (this.canRedo()) {
                await this.redo();
            }
        });

        events.on('edit.add', async (editOp: EditOp, suppressOp = false) => {
            await this.add(editOp, suppressOp);
        });

        // listen to scene element removal event, automatically clean up related history
        events.on('scene.elementRemoved', (element: Element) => {
            this.removeByElement(element);
        });
    }

    async add(editOp: EditOp, suppressOp = false) {
        while (this.cursor < this.history.length) {
            this.history.pop().destroy?.();
        }
        this.history.push(editOp);
        await this.redo(suppressOp);
    }

    removeByElement(element: Element) {
        this.history = this.history.filter((editOp) => {
            if (editOp.isRelatedToElement?.(element)) {
                editOp.destroy?.();
                return false;
            }
            return true;
        });
        if (this.cursor > this.history.length) {
            this.cursor = this.history.length;
        }
        this.fireEvents();
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
}

export { EditHistory };
