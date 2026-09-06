// unified FIFO queue for all async splat work (GPU readbacks + history mutations).
// every consumer that needs ordering relative to other commands enqueues a task
// here; the queue guarantees strict FIFO across the whole app, so neither
// dataProcessor nor edit-history needs its own private chain.
class CommandQueue {
    private tail: Promise<void> = Promise.resolve();

    // number of enqueued tasks that have not yet completed
    private pending = 0;

    enqueue<T>(fn: () => T | Promise<T>): Promise<T> {
        this.pending++;
        const next = this.tail.then(fn);
        // swallow errors on the chain itself so a failed task doesn't poison
        // subsequent ones. the caller still sees the rejection on its own promise.
        this.tail = next.then(() => {
            this.pending--;
        }, (err) => {
            this.pending--;
            console.error('CommandQueue task failed', err);
        });
        return next;
    }

    // resolves once every task has completed, including tasks enqueued by
    // running tasks (a GPU intersect that then records an edit op, an edit op
    // whose completion schedules a bounds readback). a single barrier task
    // can't offer that: work enqueued after it was scheduled lands behind it.
    async idle(): Promise<void> {
        while (this.pending > 0) {
            await this.tail;
        }
    }
}

export { CommandQueue };
