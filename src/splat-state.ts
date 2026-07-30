// per-gaussian editor state bits. the live storage lives on the instance list
// (see src/gaussian-instances.ts); this is just the shared vocabulary.
enum State {
    selected = 1,
    locked = 2,
    deleted = 4
}

export { State };
