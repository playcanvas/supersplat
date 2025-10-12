import { CubicSpline } from './anim/spline';
import { Events } from './events';

type SplatSizeKeyframe = {
    frame: number;
    size: number;
};

const registerSplatSizeAnimationEvents = (events: Events) => {
    const keyframes: SplatSizeKeyframe[] = [];

    let onTimelineChange: (frame: number) => void;

    const rebuildSpline = () => {
        const duration = events.invoke('timeline.frames');

        const orderedKeyframes = keyframes.slice()
        // filter out keys beyond the end of the timeline
        .filter(a => a.frame < duration)
        // order keys by time for spline
        .sort((a, b) => a.frame - b.frame);

        if (orderedKeyframes.length > 1) {
            const times = orderedKeyframes.map(k => k.frame);
            const values = orderedKeyframes.map(k => k.size);

            // create spline for splat size values
            const spline = CubicSpline.fromPointsLooping(duration, times, values, events.invoke('timeline.smoothness'));
            const result: number[] = [];

            // handle application update tick
            onTimelineChange = (frame: number) => {
                const time = frame;

                // evaluate the spline at current time
                spline.evaluate(time, result);

                // apply the interpolated size to all splats
                events.fire('splatSize.setValue', result[0]);
            };
        } else if (orderedKeyframes.length === 1) {
            // single keyframe - use constant value
            const constantSize = orderedKeyframes[0].size;
            onTimelineChange = (frame: number) => {
                events.fire('splatSize.setValue', constantSize);
            };
        } else {
            onTimelineChange = null;
        }
    };

    // Timeline event handlers
    events.on('timeline.time', (time: number) => {
        onTimelineChange?.(time);
    });

    events.on('timeline.frame', (frame: number) => {
        onTimelineChange?.(frame);
    });

    events.on('timeline.frames', () => {
        rebuildSpline();
        events.fire('timeline.time', events.invoke('timeline.frame'));
    });

    events.on('timeline.smoothness', () => {
        rebuildSpline();
        events.fire('timeline.time', events.invoke('timeline.frame'));
    });

    // Keyframe management functions
    const addKeyframe = (keyframe: SplatSizeKeyframe) => {
        if (keyframe.frame === undefined) {
            return false;
        }

        // if a keyframe already exists at this time, update it
        const idx = keyframes.findIndex(k => k.frame === keyframe.frame);
        if (idx !== -1) {
            keyframes[idx] = keyframe;
        } else {
            keyframes.push(keyframe);
            events.fire('timeline.addKey', keyframe.frame);
        }

        rebuildSpline();
        return true;
    };

    const removeKeyframe = (index: number) => {
        keyframes.splice(index, 1);

        // remove the timeline key
        rebuildSpline();
        events.fire('timeline.removeKey', index);
    };

    const moveKeyframe = (index: number, frame: number) => {
        // remove target frame keyframe
        const toIndex = keyframes.findIndex(k => k.frame === frame);
        // move keyframe
        keyframes[index].frame = frame;
        if (toIndex !== -1) {
            removeKeyframe(toIndex);
        }

        rebuildSpline();
        events.fire('timeline.setKey', index, frame);
    };

    // Public API functions
    events.function('splatSize.keyframes', () => {
        return keyframes;
    });

    events.on('splatSize.addKeyframe', (keyframe: SplatSizeKeyframe) => {
        addKeyframe(keyframe);
    });

    events.on('splatSize.addCurrentKeyframe', () => {
        const currentFrame = events.invoke('timeline.frame');
        const currentSize = events.invoke('splatSize.getValue') || 1;

        addKeyframe({
            frame: currentFrame,
            size: currentSize
        });
    });

    events.on('splatSize.removeKeyframe', (frame: number) => {
        console.log('Removing keyframe at frame:', frame);
        const index = keyframes.findIndex(k => k.frame === frame);
        if (index !== -1) {
            removeKeyframe(index);
        } else {
            console.warn('Keyframe not found at frame:', frame);
        }
    });

    events.on('timeline.add', (frame: number) => {
        // when adding a timeline keyframe, check if we should add splat size keyframe too
        const currentSize = events.invoke('splatSize.getValue');
        if (currentSize !== undefined && currentSize !== 1) {
            addKeyframe({
                frame,
                size: currentSize
            });
        }
    });

    events.on('timeline.move', (frameFrom: number, frameTo: number) => {
        if (frameFrom === frameTo) return;

        const index = keyframes.findIndex(k => k.frame === frameFrom);
        if (index !== -1) {
            moveKeyframe(index, frameTo);
        }
    });

    events.on('timeline.remove', (index: number) => {
        const frame = events.invoke('timeline.keys')[index];
        const keyframeIndex = keyframes.findIndex(k => k.frame === frame);
        if (keyframeIndex !== -1) {
            removeKeyframe(keyframeIndex);
        }
    });

    events.on('splatSize.clear', () => {
        console.log('Clearing splat size keyframes, count:', keyframes.length);

        // Remove all keys from timeline first (in reverse order to avoid index issues)
        for (let i = keyframes.length - 1; i >= 0; i--) {
            events.fire('timeline.removeKey', i);
        }

        keyframes.length = 0; // Clear all keyframes
        rebuildSpline();

        console.log('Cleared all splat size keyframes');
    });

    // Doc serialization
    events.function('docSerialize.splatSizeKeyframes', (): any[] => {
        if (keyframes.length === 0) {
            return [];
        }

        return [{
            name: 'splatSize',
            keyframes: keyframes.map(keyframe => ({
                frame: keyframe.frame,
                size: keyframe.size
            }))
        }];
    });

    events.function('docDeserialize.splatSizeKeyframes', (data: any[]) => {
        if (data.length === 0) {
            return;
        }

        // Clear existing keyframes
        keyframes.length = 0;

        // Load keyframes safely
        const keyframesToLoad = data[0]?.keyframes;
        if (Array.isArray(keyframesToLoad)) {
            keyframesToLoad.forEach((docKeyframe: any) => {
                if (docKeyframe && typeof docKeyframe.frame === 'number' && typeof docKeyframe.size === 'number') {
                    addKeyframe({
                        frame: docKeyframe.frame,
                        size: docKeyframe.size
                    });
                }
            });
        }
    });
};

export { registerSplatSizeAnimationEvents, SplatSizeKeyframe };
