import { EventHandle } from 'playcanvas';

import { Events } from './events';

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

    // keys

    const keys: number[] = [];

    // skip to previous/next key
    const skipToKey = (dir: 'forward' | 'back') => {
        const orderedKeys = keys.map((keyFrame, index) => {
            return { frame: keyFrame, index };
        }).sort((a, b) => a.frame - b.frame);

        if (orderedKeys.length > 0) {
            const nextKey = orderedKeys.findIndex(k => (dir === 'back' ? k.frame >= frame : k.frame > frame));
            const l = orderedKeys.length;

            if (nextKey === -1) {
                setFrame(orderedKeys[dir === 'back' ? l - 1 : 0].frame);
            } else {
                setFrame(orderedKeys[dir === 'back' ? (nextKey + l - 1) % l : nextKey].frame);
            }
        } else {
            // if there are no keys, go to start or end of timeline
            if (dir === 'back') {
                setFrame(0);
            } else {
                setFrame(frames - 1);
            }
        }
    };

    events.on('timeline.prevKey', () => {
        skipToKey('back');
    });

    events.on('timeline.nextKey', () => {
        skipToKey('forward');
    });

    events.function('timeline.keys', () => {
        return keys;
    });

    // Add or update a key at a specific frame (defaults to current frame)
    events.on('timeline.addKey', (keyFrame = frame) => {
        const isNew = !keys.includes(keyFrame);
        if (isNew) {
            keys.push(keyFrame);
            events.fire('timeline.keyAdded', keyFrame);
        } else {
            events.fire('timeline.keyUpdated', keyFrame);
        }
    });

    // Remove a key by index (defaults to key at current frame)
    events.on('timeline.removeKey', (index = keys.indexOf(frame)) => {
        if (index >= 0 && index < keys.length) {
            keys.splice(index, 1);
            events.fire('timeline.keyRemoved', index);
        }
    });

    // Move a key from one frame to another
    events.on('timeline.moveKey', (fromFrame: number, toFrame: number) => {
        const index = keys.indexOf(fromFrame);
        if (index !== -1 && fromFrame !== toFrame) {
            // remove existing key at target frame if one exists
            const existingIndex = keys.indexOf(toFrame);
            if (existingIndex !== -1) {
                keys.splice(existingIndex, 1);
                events.fire('timeline.keyRemoved', existingIndex);
                // adjust index if the removed key was before the moving key
                if (existingIndex < index) {
                    keys[index - 1] = toFrame;
                    events.fire('timeline.keyMoved', index - 1, fromFrame, toFrame);
                    return;
                }
            }
            keys[index] = toFrame;
            events.fire('timeline.keyMoved', index, fromFrame, toFrame);
        }
    });

    // Load keys directly without firing per-key events (used during document deserialization)
    events.function('timeline.loadKeys', (keyFrames: number[]) => {
        keys.length = 0;
        keys.push(...keyFrames);
        // Fire timeline.frames to trigger UI rebuild  with the loaded keys
        events.fire('timeline.frames', frames);
    });

    // clear all keys when scene is cleared
    events.on('scene.clear', () => {
        keys.length = 0;
        events.fire('timeline.frames', frames);
    });

    // doc

    events.function('docSerialize.timeline', () => {
        return {
            frames,
            frameRate,
            frame,
            smoothness,
            keys: keys.slice()
        };
    });

    events.function('docDeserialize.timeline', (data: any = {}) => {
        keys.length = 0;

        // Set values
        frames = data.frames ?? 180;
        frameRate = data.frameRate ?? 30;
        frame = data.frame ?? 0;
        smoothness = data.smoothness ?? 0;

        // Fire events to update UI (always fire to ensure rebuild)
        events.fire('timeline.frames', frames);
        events.fire('timeline.frameRate', frameRate);
        events.fire('timeline.frame', frame);
        events.fire('timeline.smoothness', smoothness);
    });
};

export { registerTimelineEvents };
