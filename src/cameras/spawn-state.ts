import { Vec3 } from 'playcanvas';

/**
 * Captures a controller's pose at its initial spawn so it can be restored
 * later (e.g. via the "reset" UI gesture). Shared by fly and walk controllers
 * which both implement `resetToSpawn`.
 *
 * Position / angles / distance are the basic camera-pose components. Callers
 * with extra controller-specific state (e.g. walk's grounded flag) keep that
 * alongside as a separate field.
 */
class SpawnState {
    private _position = new Vec3();

    private _angles = new Vec3();

    private _distance = 1;

    private _has = false;

    /**
     * True once `store` has been called at least once.
     *
     * @returns Whether a spawn pose has been captured.
     */
    get has(): boolean {
        return this._has;
    }

    /**
     * Capture the given pose as the spawn state.
     *
     * @param position - World-space position to remember.
     * @param angles - Euler angles to remember.
     * @param distance - Camera distance (orbit-style) to remember.
     */
    store(position: Vec3, angles: Vec3, distance: number) {
        this._position.copy(position);
        this._angles.copy(angles);
        this._distance = distance;
        this._has = true;
    }

    /**
     * Forget any previously-stored spawn pose so a subsequent `has` check
     * reports false. Used by controllers that scope spawn to a single mode
     * entry (e.g. walk).
     */
    clear() {
        this._has = false;
    }

    /**
     * Copy the captured pose into the supplied targets. Caller must check
     * `has` first; calling `restore` before `store` returns the field
     * defaults (position and angles zeroed, distance `1`).
     *
     * @param position - Mutated with the stored world position.
     * @param angles - Mutated with the stored Euler angles.
     * @returns The stored camera distance.
     */
    restore(position: Vec3, angles: Vec3): number {
        position.copy(this._position);
        angles.copy(this._angles);
        return this._distance;
    }
}

export { SpawnState };
