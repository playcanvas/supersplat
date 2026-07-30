// per-gaussian editor state bits. the live storage lives on the instance list
// (see src/gaussian-instances.ts); this is just the shared vocabulary.
// deletion is not a state: it removes instances from the list
enum State {
    selected = 1,
    locked = 2
}

export { State };
