import { AnimTrack } from './anim-track';
import { AnimTrackEditOp } from './edit-ops';
import { Element, ElementType } from './element';
import { Events } from './events';
import { Splat } from './splat';
import { SplatAnimTrack } from './splat-anim-track';

type TrackMode = 'camera' | 'object';

/**
 * Manages the active animation track and provides undo-wrapped
 * key operations. Resolves which track the user is interacting
 * with and ensures all mutations are undoable.
 *
 * 'camera' mode (the default) edits the camera track, as before.
 * 'object' mode edits the selected splat's own transform track - one
 * SplatAnimTrack per splat, created lazily and cached for the splat's
 * lifetime so switching selection away and back keeps its keys. Both
 * tracks evaluate every frame regardless of mode; mode only decides which
 * one 'track.addKey' etc. and the timeline UI operate on.
 */
const registerTrackManagerEvents = (events: Events) => {
    let mode: TrackMode = 'camera';
    const splatTracks = new Map<Splat, SplatAnimTrack>();

    const getSplatTrack = (splat: Splat): SplatAnimTrack => {
        let track = splatTracks.get(splat);
        if (!track) {
            track = new SplatAnimTrack(events, splat);
            splatTracks.set(splat, track);
        }
        return track;
    };

    // Get the animation track of the currently active element.
    const getActiveTrack = (): AnimTrack | null => {
        if (mode === 'object') {
            const splat = events.invoke('selection') as Splat | null;
            return splat ? getSplatTrack(splat) : null;
        }
        return events.invoke('camera.animTrack') ?? null;
    };

    events.function('trackManager.mode', () => mode);

    events.on('trackManager.setMode', (value: TrackMode) => {
        if (value !== mode) {
            mode = value;
            events.fire('trackManager.mode', mode);
            // the active track changed, so its keys need re-announcing to the timeline UI
            events.fire('track.keysLoaded');
        }
    });

    // drop the cached track for a splat once it's gone - destroy() first so
    // its 'timeline.frame' subscription doesn't keep firing on the now-dead
    // splat (e.g. calling splat.move() on a destroyed entity every frame)
    events.on('scene.elementRemoved', (element: Element) => {
        if (element.type === ElementType.splat) {
            const splat = element as Splat;
            splatTracks.get(splat)?.destroy();
            splatTracks.delete(splat);
        }
    });

    events.on('scene.clear', () => {
        splatTracks.forEach(track => track.destroy());
        splatTracks.clear();
    });

    // Helper: execute an edit on the active track wrapped in undo.
    // The editFn must return true if it modified the track, false if it was a no-op.
    const trackEdit = (name: string, editFn: (track: AnimTrack) => boolean) => {
        const track = getActiveTrack();
        if (!track) return;
        const before = track.snapshot();
        if (!editFn(track)) return;
        const after = track.snapshot();
        events.fire('edit.add', new AnimTrackEditOp(name, track, before, after), true);
    };

    // Get keys from active track
    events.function('track.keys', () => {
        const track = getActiveTrack();
        return track ? track.keys : [];
    });

    // Add key to active track
    events.on('track.addKey', (frame?: number) => {
        const keyFrame = frame ?? events.invoke('timeline.frame');
        trackEdit('addKey', track => track.addKey(keyFrame));
    });

    // Remove key from active track
    events.on('track.removeKey', (frame?: number) => {
        const keyFrame = frame ?? events.invoke('timeline.frame');
        trackEdit('removeKey', track => track.removeKey(keyFrame));
    });

    // Move key in active track
    events.on('track.moveKey', (fromFrame: number, toFrame: number) => {
        trackEdit('moveKey', track => track.moveKey(fromFrame, toFrame));
    });

    // Copy key in active track
    events.on('track.copyKey', (fromFrame: number, toFrame: number) => {
        trackEdit('copyKey', track => track.copyKey(fromFrame, toFrame));
    });
};

export { registerTrackManagerEvents };
