import type { CommandContext, CommandQueue } from './command-queue';

type SelectionGesture<S> = {
    // runs synchronously at invocation: capture everything the gesture
    // depends on (camera frame, footprint, target layers, private copies of
    // the stroke). if it allocates and then throws it must release what it
    // allocated, since release() is only called for a snapshot it returned
    snapshot: () => S;
    // every pick, intersect and history application for every target, inside
    // the gesture's command slot. the in-slot functions it calls take ctx and
    // never enqueue
    run: (snapshot: S, ctx: CommandContext) => Promise<void>;
    // frees the snapshot's resources once run has settled, success or failure
    release?: (snapshot: S) => void;
};

// Orchestration for a screen-space selection gesture. The snapshot is taken
// and one command slot reserved before anything yields, so the gesture's
// inputs are what the user saw and later commands queue behind the whole
// gesture rather than landing between its readbacks and its ops. Completion
// means the ops and their history bookkeeping have settled and the snapshot
// has been released; it doesn't promise that a frame has rendered. Failure
// rejects the caller and leaves the queue usable.
const runSelectionGesture = <S>(commandQueue: CommandQueue, gesture: SelectionGesture<S>): Promise<void> => {
    const snapshot = gesture.snapshot();
    return commandQueue.enqueue(async (ctx) => {
        try {
            await gesture.run(snapshot, ctx);
        } finally {
            gesture.release?.(snapshot);
        }
    });
};

export { runSelectionGesture, SelectionGesture };
