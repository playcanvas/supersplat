import { EventHandle } from 'playcanvas';

import { Events } from './events';

/**
 * Register global timeline events.
 * The timeline manages playback state (frames, frameRate, current frame, playing).
 * Key management is delegated to individual animation tracks via track.* events.
 */
const registerTimelineEvents = (events: Events) => {
    let frames = 180;
    let frameRate = 30;
    let smoothness = 1;

    // frames

    const setFrames = (value: number) => {
        if (value !== frames) {
            frames = value;
            events.fire('timeline.frames', frames);
        }
    };

    events.function('timeline.frames', () => {
        return frames;
    });

    events.on('timeline.setFrames', (value: number) => {
        setFrames(value);
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

    // current frame
    let frame = 0;

    const setFrame = (value: number) => {
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

    // anim controls
    let animHandle: EventHandle = null;

    const play = () => {
        let time = frame;

        // handle application update tick
        animHandle = events.on('update', (dt: number) => {
            time = (time + dt * frameRate) % frames;
            setFrame(Math.floor(time));
            events.fire('timeline.time', time);
        });
    };

    const stop = () => {
        animHandle.off();
        animHandle = null;
    };

    // playing state
    let playing = false;

    const setPlaying = (value: boolean) => {
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
        setFrame((frame - 1 + frames) % frames);
    });

    events.on('timeline.nextFrame', () => {
        setFrame((frame + 1) % frames);
    });

    // Key navigation - delegates to active track's keys
    const skipToKey = (dir: 'forward' | 'back') => {
        const keys = events.invoke('track.keys') as number[];

        if (keys.length > 0) {
            const orderedKeys = keys.slice().sort((a, b) => a - b);
            const l = orderedKeys.length;

            const nextKeyIndex = orderedKeys.findIndex(k => (dir === 'back' ? k >= frame : k > frame));

            if (nextKeyIndex === -1) {
                setFrame(orderedKeys[dir === 'back' ? l - 1 : 0]);
            } else {
                setFrame(orderedKeys[dir === 'back' ? (nextKeyIndex + l - 1) % l : nextKeyIndex]);
            }
        } else {
            setFrame(dir === 'back' ? 0 : frames - 1);
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
        events.fire('timeline.frames', frames);
    });

    // Serialization - only global state, keys are owned by tracks

    events.function('docSerialize.timeline', () => {
        return {
            frames,
            frameRate,
            frame,
            smoothness
        };
    });

    events.function('docDeserialize.timeline', (data: any = {}) => {
        // Set values
        frames = data.frames ?? 180;
        frameRate = data.frameRate ?? 30;
        frame = data.frame ?? 0;
        smoothness = data.smoothness ?? 1;

        // Fire events to update UI (always fire to ensure rebuild)
        events.fire('timeline.frames', frames);
        events.fire('timeline.frameRate', frameRate);
        events.fire('timeline.frame', frame);
        events.fire('timeline.smoothness', smoothness);
    });
};

export { registerTimelineEvents };
