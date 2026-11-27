import type { EventHandle } from 'playcanvas';

import type { Events } from './events';

type TimelineData = Partial<{
    frames: number;
    frameRate: number;
    frame: number;
    smoothness: number;
    loop: boolean;
}>;

// an inclusive frame range selected on the strip; the playhead and playback are
// confined to it while it is set
type TimelineRange = {
    start: number;
    end: number;
};

/**
 * Register global timeline events.
 * The timeline manages playback state (frames, frameRate, current frame, playing).
 * Key management is delegated to individual animation tracks via track.* events.
 */
const registerTimelineEvents = (events: Events) => {
    let frames = 180;
    let frameRate = 30;
    let smoothness = 1;
    let loop = true;

    // current frame
    let frame = 0;

    // set when a bounds change clamps the playhead, so playback's clock
    // continues from the frame on screen instead of its old position
    let clockRebase = false;

    // selected clip, or null when the whole timeline is seekable
    let clipRange: TimelineRange = null;

    // the inclusive bounds the playhead may occupy
    const bounds = (): TimelineRange => clipRange ?? { start: 0, end: frames - 1 };

    const clampFrame = (value: number) => {
        const { start, end } = bounds();
        return Math.max(start, Math.min(end, value));
    };

    const setFrame = (value: number) => {
        value = clampFrame(value);
        if (value !== frame) {
            frame = value;
            events.fire('timeline.frame', frame);
        }
    };

    events.function('timeline.frame', () => {
        return frame;
    });

    events.on('timeline.setFrame', (value: number) => {
        setFrame(value);
    });

    // frames

    const setFrames = (value: number) => {
        if (value !== frames) {
            frames = value;

            // keep the clip inside the new length; a clip with nothing left
            // in range is dropped
            if (clipRange) {
                if (clipRange.start >= frames) {
                    clipRange = null;
                } else {
                    clipRange = { start: clipRange.start, end: Math.min(clipRange.end, frames - 1) };
                }
                events.fire('timeline.clipRange', clipRange);
            }

            // clamp a playhead left outside the new bounds before announcing
            // the new length, so listeners observe a consistent pair
            const beforeFrame = frame;
            setFrame(frame);
            if (frame !== beforeFrame) {
                clockRebase = true;
            }
            events.fire('timeline.frames', frames);
        }
    };

    events.function('timeline.frames', () => {
        return frames;
    });

    events.on('timeline.setFrames', (value: number) => {
        setFrames(value);
    });

    // clip range

    const setClipRange = (range: TimelineRange | null, seekTo?: number) => {
        if (range) {
            const lo = Math.max(0, Math.min(frames - 1, Math.min(range.start, range.end)));
            const hi = Math.max(lo, Math.min(frames - 1, Math.max(range.start, range.end)));
            clipRange = { start: lo, end: hi };
        } else {
            clipRange = null;
        }

        // announce the range first, then clamp the playhead into it
        events.fire('timeline.clipRange', clipRange);
        const beforeFrame = frame;
        setFrame(seekTo ?? frame);
        if (frame !== beforeFrame) {
            clockRebase = true;
        }
    };

    events.function('timeline.clipRange', () => (clipRange ? { ...clipRange } : null));

    events.on('timeline.setClipRange', (range: TimelineRange | null, seekTo?: number) => {
        setClipRange(range, seekTo);
    });

    events.on('timeline.clearClipRange', (seekTo?: number) => {
        setClipRange(null, seekTo);
    });

    // frame rate

    const setFrameRate = (value: number) => {
        if (value !== frameRate) {
            frameRate = value;
            events.fire('timeline.frameRate', frameRate);
        }
    };

    events.function('timeline.frameRate', () => {
        return frameRate;
    });

    events.on('timeline.setFrameRate', (value: number) => {
        setFrameRate(value);
    });

    // smoothness

    const setSmoothness = (value: number) => {
        if (value !== smoothness) {
            smoothness = value;
            events.fire('timeline.smoothness', smoothness);
        }
    };

    events.function('timeline.smoothness', () => {
        return smoothness;
    });

    events.on('timeline.setSmoothness', (value: number) => {
        setSmoothness(value);
    });

    // loop

    const setLoop = (value: boolean) => {
        if (value !== loop) {
            loop = value;
            events.fire('timeline.loop', loop);
        }
    };

    events.function('timeline.loop', () => {
        return loop;
    });

    events.on('timeline.setLoop', (value: boolean) => {
        setLoop(value);
    });

    // anim controls
    let animHandle: EventHandle = null;

    const play = () => {
        const initial = bounds();

        // with loop off, playing from the end starts over from the start
        if (!loop && frame >= initial.end) {
            setFrame(initial.start);
        }
        let time = frame;

        // handle application update tick
        animHandle = events.on('update', (dt: number) => {
            // the bounds can change while playing (timeline length or clip)
            const clip = events.invoke('timeline.clipRange');
            const { start, end } = bounds();
            const span = end - start + 1;

            // a bounds change may have clamped the playhead; continue from the
            // frame on screen instead of the clock's old position
            if (clockRebase) {
                time = frame;
                clockRebase = false;
            }

            time += dt * frameRate;
            let ended = false;

            if (loop) {
                // wrap the clock inside the playable bounds, staying correct
                // even if a tick spans several laps
                if (time >= end + 1) {
                    time = start + ((((time - start) % span) + span) % span);
                }
            } else if (time >= end) {
                // stop on the last playable frame instead of running past it
                time = end;
                ended = true;
            }

            // a clip holds the camera on its last frame for the rest of that
            // frame's duration; without a clip the full-timeline spline keeps
            // its loop-seam interpolation
            const evaluated = clip ? Math.min(Math.max(time, start), end) : time;

            setFrame(Math.floor(evaluated));
            events.fire('timeline.time', evaluated);
            if (ended) {
                setPlaying(false);
            }
        });
    };

    const stop = () => {
        animHandle.off();
        animHandle = null;
    };

    // playing state
    let playing = false;

    const setPlaying = (value: boolean) => {
        // a single frame without looping has nothing to play
        if (value && !loop && bounds().end <= bounds().start) {
            return;
        }
        if (value !== playing) {
            playing = value;
            events.fire('timeline.playing', playing);
            if (playing) {
                play();
            } else {
                stop();
            }
        }
    };

    events.function('timeline.playing', () => {
        return playing;
    });

    events.on('timeline.setPlaying', (value: boolean) => {
        setPlaying(value);
    });

    // shortcut handlers
    events.on('timeline.togglePlay', () => {
        setPlaying(!playing);
    });

    events.on('timeline.prevFrame', () => {
        const { start, end } = bounds();
        const span = end - start + 1;
        setFrame(start + ((((frame - start - 1) % span) + span) % span));
    });

    events.on('timeline.nextFrame', () => {
        const { start, end } = bounds();
        const span = end - start + 1;
        setFrame(start + ((((frame - start + 1) % span) + span) % span));
    });

    // Key navigation - delegates to active track's keys
    const skipToKey = (dir: 'forward' | 'back') => {
        const { start, end } = bounds();

        // ignore keys outside the playable bounds - they don't play
        const keys = ((events.invoke('track.keys') as number[]) ?? []).filter((k) => k >= start && k <= end);

        if (keys.length > 0) {
            const orderedKeys = keys.slice().sort((a, b) => a - b);
            const l = orderedKeys.length;

            const nextKeyIndex = orderedKeys.findIndex((k) => (dir === 'back' ? k >= frame : k > frame));

            if (nextKeyIndex === -1) {
                setFrame(orderedKeys[dir === 'back' ? l - 1 : 0]);
            } else {
                setFrame(orderedKeys[dir === 'back' ? (nextKeyIndex + l - 1) % l : nextKeyIndex]);
            }
        } else {
            setFrame(dir === 'back' ? start : end);
        }
    };

    events.on('timeline.prevKey', () => {
        skipToKey('back');
    });

    events.on('timeline.nextKey', () => {
        skipToKey('forward');
    });

    // clear timeline state when scene is cleared
    events.on('scene.clear', () => {
        if (clipRange) {
            clipRange = null;
            events.fire('timeline.clipRange', null);
        }
        events.fire('timeline.frames', frames);
    });

    // Serialization - only global state, keys are owned by tracks

    events.function('docSerialize.timeline', () => {
        return {
            frames,
            frameRate,
            frame,
            smoothness,
            loop
        };
    });

    events.function('docDeserialize.timeline', (data: TimelineData = {}) => {
        // Set values
        frames = data.frames ?? 180;
        frameRate = data.frameRate ?? 30;
        frame = data.frame ?? 0;
        smoothness = data.smoothness ?? 1;
        loop = data.loop ?? true;

        // the clip is session state, not part of the document
        clipRange = null;

        // Fire events to update UI (always fire to ensure rebuild)
        events.fire('timeline.clipRange', null);
        events.fire('timeline.frames', frames);
        events.fire('timeline.frameRate', frameRate);
        events.fire('timeline.frame', frame);
        events.fire('timeline.smoothness', smoothness);
        events.fire('timeline.loop', loop);
    });
};

export { registerTimelineEvents };
