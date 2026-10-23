import type { EditOp } from './edit-ops';
import { EditorError } from './editor-command';

// the handle a queued task receives. It is the proof that the caller is
// running inside its slot: history application through it happens in that
// slot, not in a task enqueued behind it. It belongs to the task's callback
// and is invalid once the callback settles.
interface CommandContext {
    apply(editOp: EditOp, suppressOp?: boolean): Promise<void>;
}

// installed by EditHistory: applies an op right away, in the caller's slot
type EditApplier = (editOp: EditOp, suppressOp: boolean) => Promise<void>;

// unified FIFO queue for all async splat work (GPU readbacks + history mutations).
// every consumer that needs ordering relative to other commands enqueues a task
// here; the queue guarantees strict FIFO across the whole app, so neither
// dataProcessor nor edit-history needs its own private chain. A task that
// needs further work in its own slot (a GPU readback and then the edit op it
// produces) does that work through its CommandContext: enqueueing from inside
// a task deadlocks, since the nested task waits for the one waiting for it.
class CommandQueue {
    private tail: Promise<void> = Promise.resolve();
    private editApplier: EditApplier | null = null;

    setEditApplier(editApplier: EditApplier) {
        this.editApplier = editApplier;
    }

    enqueue<T>(fn: (ctx: CommandContext) => T | Promise<T>): Promise<T> {
        const next = this.tail.then(async () => {
            let live = true;
            const ctx: CommandContext = {
                apply: (editOp, suppressOp = false) => {
                    if (!live) {
                        return Promise.reject(new Error('CommandContext used after its task completed'));
                    }
                    if (!this.editApplier) {
                        return Promise.reject(new Error('CommandQueue has no edit applier'));
                    }
                    return this.editApplier(editOp, suppressOp);
                }
            };
            try {
                return await fn(ctx);
            } finally {
                live = false;
            }
        });
        // swallow errors on the chain itself so a failed task doesn't poison
        // subsequent ones. the caller still sees the rejection on its own promise.
        // an EditorError is a typed outcome (empty selection, removed layer,
        // cancellation) the caller handles, so only unexpected failures are logged
        this.tail = next.then(() => {}, (err) => {
            if (!(err instanceof EditorError)) {
                console.error('CommandQueue task failed', err);
            }
        });
        return next;
    }
}

export { CommandQueue, CommandContext };
