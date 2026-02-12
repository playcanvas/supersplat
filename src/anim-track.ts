/**
 * Interface for animation tracks that can be attached to animatable targets.
 * Each track owns its keyframes and handles capture, interpolation, and evaluation.
 */
interface AnimTrack {
    /** Array of frame numbers where keyframes exist */
    readonly keys: readonly number[];

    /**
     * Add a keyframe at the specified frame, capturing current state.
     * If a key already exists at this frame, it will be updated.
     */
    addKey(frame: number): void;

    /**
     * Remove the keyframe at the specified frame.
     */
    removeKey(frame: number): void;

    /**
     * Move a keyframe from one frame to another.
     */
    moveKey(fromFrame: number, toFrame: number): void;

    /**
     * Copy a keyframe from one frame to another.
     * The original keyframe remains in place.
     */
    copyKey(fromFrame: number, toFrame: number): void;

    /**
     * Clear all keyframes.
     */
    clear(): void;

    /**
     * Return a deep copy of the track's internal state (for undo snapshots).
     */
    snapshot(): unknown;

    /**
     * Replace the track's internal state with a previously captured snapshot
     * and fire appropriate change events.
     */
    restore(snapshot: unknown): void;
}

export { AnimTrack };
