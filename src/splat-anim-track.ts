import { EventHandle, Quat, Vec3 } from 'playcanvas';

import { AnimTrack } from './anim-track';
import { Events } from './events';
import { Splat } from './splat';

type SplatKey = {
    name: string;
    frame: number;
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
};

const tmpQuat = new Quat();
const tmpPos = new Vec3();
const tmpScale = new Vec3();

/**
 * Animation track that keyframes a single splat's own local transform
 * (position/rotation/scale), as opposed to the camera. Interpolates linearly
 * between the two keys neighbouring the current frame - simple lerp/slerp
 * rather than a fitted spline, since a handful of hand-placed keys (e.g. a
 * turntable spin) only need to move smoothly and monotonically between them,
 * never overshoot.
 */
class SplatAnimTrack implements AnimTrack {
    private keysList: SplatKey[] = [];
    private events: Events;
    private splat: Splat;
    private handles: EventHandle[];
    private destroyed = false;

    constructor(events: Events, splat: Splat) {
        this.events = events;
        this.splat = splat;

        this.handles = [
            events.on('timeline.time', (time: number) => this.evaluate(time)),
            events.on('timeline.frame', (frame: number) => this.evaluate(frame))
        ];
    }

    // stop evaluating and unsubscribe - must be called once the owning splat
    // is gone, otherwise this track keeps firing on every timeline tick and
    // calling splat.move() on a destroyed entity
    destroy(): void {
        this.destroyed = true;
        this.handles.forEach(h => h.off());
        this.handles.length = 0;
    }

    get keys(): readonly number[] {
        return this.keysList.map(k => k.frame);
    }

    private captureKey(frame: number): SplatKey {
        const { entity } = this.splat;
        return {
            name: `splat_${this.keysList.length}`,
            frame,
            position: entity.getLocalPosition().clone(),
            rotation: entity.getLocalRotation().clone(),
            scale: entity.getLocalScale().clone()
        };
    }

    addKey(frame: number): boolean {
        const key = this.captureKey(frame);
        const existingIndex = this.keysList.findIndex(k => k.frame === frame);

        if (existingIndex === -1) {
            this.keysList.push(key);
            this.events.fire('track.keyAdded', frame);
        } else {
            this.keysList[existingIndex] = key;
            this.events.fire('track.keyUpdated', frame);
        }
        this.evaluate(this.events.invoke('timeline.frame'));
        return true;
    }

    removeKey(frame: number): boolean {
        const index = this.keysList.findIndex(k => k.frame === frame);
        if (index === -1) return false;
        this.keysList.splice(index, 1);
        this.events.fire('track.keyRemoved', frame);
        return true;
    }

    moveKey(fromFrame: number, toFrame: number): boolean {
        if (fromFrame === toFrame) return false;
        const index = this.keysList.findIndex(k => k.frame === fromFrame);
        if (index === -1) return false;

        const toIndex = this.keysList.findIndex(k => k.frame === toFrame);
        if (toIndex !== -1) {
            this.keysList.splice(toIndex, 1);
        }

        const movedIndex = this.keysList.findIndex(k => k.frame === fromFrame);
        this.keysList[movedIndex].frame = toFrame;
        this.events.fire('track.keyMoved', fromFrame, toFrame);
        return true;
    }

    copyKey(fromFrame: number, toFrame: number): boolean {
        if (fromFrame === toFrame) return false;
        const source = this.keysList.find(k => k.frame === fromFrame);
        if (!source) return false;

        const toIndex = this.keysList.findIndex(k => k.frame === toFrame);
        if (toIndex !== -1) {
            this.keysList.splice(toIndex, 1);
        }

        this.keysList.push({
            name: `splat_${this.keysList.length}`,
            frame: toFrame,
            position: source.position.clone(),
            rotation: source.rotation.clone(),
            scale: source.scale.clone()
        });
        this.events.fire('track.keyAdded', toFrame);
        return true;
    }

    clear(): void {
        this.keysList.length = 0;
        this.events.fire('track.keysCleared');
    }

    snapshot(): SplatKey[] {
        return this.keysList.map(k => ({
            name: k.name,
            frame: k.frame,
            position: k.position.clone(),
            rotation: k.rotation.clone(),
            scale: k.scale.clone()
        }));
    }

    restore(snapshot: unknown): void {
        this.keysList = (snapshot as SplatKey[]).map(k => ({
            name: k.name,
            frame: k.frame,
            position: k.position.clone(),
            rotation: k.rotation.clone(),
            scale: k.scale.clone()
        }));
        this.events.fire('track.keysLoaded');
        this.evaluate(this.events.invoke('timeline.frame'));
    }

    // apply the interpolated transform for the given frame directly to the
    // splat entity. two-key lerp/slerp only - always monotonic, never
    // overshoots, unlike a multi-key fitted spline
    evaluate(frame: number): void {
        if (this.destroyed) return;
        const ordered = this.keysList.slice().sort((a, b) => a.frame - b.frame);
        if (ordered.length === 0) return;

        if (ordered.length === 1) {
            const k = ordered[0];
            this.splat.move(k.position, k.rotation, k.scale);
            return;
        }

        const duration = this.events.invoke('timeline.frames') as number;
        const loop = this.events.invoke('timeline.loop') as boolean;

        let lo: SplatKey, hi: SplatKey, t: number;

        if (frame <= ordered[0].frame) {
            if (loop) {
                lo = ordered[ordered.length - 1];
                hi = ordered[0];
                const span = (hi.frame + duration) - lo.frame;
                t = span > 0 ? (frame + duration - lo.frame) / span : 0;
            } else {
                lo = hi = ordered[0];
                t = 0;
            }
        } else if (frame >= ordered[ordered.length - 1].frame) {
            if (loop) {
                lo = ordered[ordered.length - 1];
                hi = ordered[0];
                const span = (hi.frame + duration) - lo.frame;
                t = span > 0 ? (frame - lo.frame) / span : 0;
            } else {
                lo = hi = ordered[ordered.length - 1];
                t = 0;
            }
        } else {
            let seg = 0;
            while (ordered[seg + 1].frame <= frame) seg++;
            lo = ordered[seg];
            hi = ordered[seg + 1];
            t = (frame - lo.frame) / (hi.frame - lo.frame);
        }

        tmpPos.lerp(lo.position, hi.position, t);
        tmpScale.lerp(lo.scale, hi.scale, t);
        tmpQuat.slerp(lo.rotation, hi.rotation, t);

        this.splat.move(tmpPos, tmpQuat, tmpScale);
    }
}

export { SplatAnimTrack, SplatKey };
