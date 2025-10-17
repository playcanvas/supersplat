import { CubicSpline } from './anim/spline';
import { Events } from './events';

type DepthVisualizationKeyframe = {
    frame: number;
    enabled: boolean;
    min: number;
    max: number;
    reverse: boolean;
    yMode: boolean;
    blend: number;
};

const registerDepthVisualizationAnimationEvents = (events: Events) => {
    const keyframes: DepthVisualizationKeyframe[] = [];

    let onTimelineChange: (frame: number) => void;
    let isAddingKeyframe = false; // Flag to prevent timeline interference during manual keyframe addition

    const rebuildSpline = () => {
        const duration = events.invoke('timeline.frames');

        const orderedKeyframes = keyframes.slice()
        // filter out keys beyond the end of the timeline
        .filter(a => a.frame < duration)
        // order keys by time for spline
        .sort((a, b) => a.frame - b.frame);

        if (orderedKeyframes.length > 1) {
            const times = orderedKeyframes.map(k => k.frame);
            const values = orderedKeyframes.map(k => [
                k.enabled ? 1 : 0,
                k.min,
                k.max,
                k.reverse ? 1 : 0,
                k.yMode ? 1 : 0,
                k.blend
            ]).flat();

            // create spline for depth visualization values
            const spline = CubicSpline.fromPointsLooping(duration, times, values, events.invoke('timeline.smoothness'));
            const result: number[] = [];

            // handle application update tick
            onTimelineChange = (frame: number) => {
                const time = frame;

                // evaluate the spline at current time
                spline.evaluate(time, result);

                // apply the interpolated values
                events.fire('view.setDepthVisualization', result[0] > 0.5);
                events.fire('view.setDepthMin', result[1]);
                events.fire('view.setDepthMax', result[2]);
                events.fire('view.setDepthReverse', result[3] > 0.5);
                events.fire('view.setDepthYMode', result[4] > 0.5);
                events.fire('view.setDepthBlend', result[5]);
            };
        } else if (orderedKeyframes.length === 1) {
            // single keyframe - use constant values
            const constantValues = orderedKeyframes[0];
            onTimelineChange = (frame: number) => {
                events.fire('view.setDepthVisualization', constantValues.enabled);
                events.fire('view.setDepthMin', constantValues.min);
                events.fire('view.setDepthMax', constantValues.max);
                events.fire('view.setDepthReverse', constantValues.reverse);
                events.fire('view.setDepthYMode', constantValues.yMode);
                events.fire('view.setDepthBlend', constantValues.blend);
            };
        } else {
            onTimelineChange = null;
        }
    };

    // Timeline event handlers
    events.on('timeline.time', (time: number) => {
        if (!isAddingKeyframe) {
            onTimelineChange?.(time);
        }
    });

    events.on('timeline.frame', (frame: number) => {
        if (!isAddingKeyframe) {
            onTimelineChange?.(frame);
        }
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
    const addKeyframe = (keyframe: DepthVisualizationKeyframe) => {
        if (keyframe.frame === undefined) {
            console.warn('Cannot add keyframe: frame is undefined');
            return false;
        }

        // if a keyframe already exists at this time, update it
        const idx = keyframes.findIndex(k => k.frame === keyframe.frame);
        if (idx !== -1) {
            console.log(`Updating existing depth keyframe at frame ${keyframe.frame} (index ${idx})`);
            keyframes[idx] = keyframe;
        } else {
            console.log(`Adding new depth keyframe at frame ${keyframe.frame}`);
            keyframes.push(keyframe);
            console.log('Firing timeline.addKey event for frame:', keyframe.frame);
            events.fire('timeline.addKey', keyframe.frame);
        }

        console.log(`Total depth keyframes: ${keyframes.length}`);
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
    events.function('depthVisualization.keyframes', () => {
        return keyframes;
    });

    events.on('depthVisualization.addKeyframe', (keyframe: DepthVisualizationKeyframe) => {
        addKeyframe(keyframe);
    });

    events.on('depthVisualization.addCurrentKeyframe', () => {
        // Set flag to prevent timeline interference
        isAddingKeyframe = true;

        try {
            const currentFrame = events.invoke('timeline.frame');
            const currentEnabled = events.invoke('view.depthVisualization') || false;
            const currentMin = events.invoke('view.depthMin') || 1;
            const currentMax = events.invoke('view.depthMax') || 50;
            const currentReverse = events.invoke('view.depthReverse') || false;
            const currentYMode = events.invoke('view.depthYMode') || false;
            const currentBlend = events.invoke('view.depthBlend');
            console.log('Raw depth blend value from events:', currentBlend);
            const finalBlend = currentBlend !== null && currentBlend !== undefined ? currentBlend : 1;
            console.log('Final depth blend value to use:', finalBlend);

            console.log('Adding depth keyframe at frame', currentFrame, 'with values:', {
                enabled: currentEnabled,
                min: currentMin,
                max: currentMax,
                reverse: currentReverse,
                yMode: currentYMode,
                blend: finalBlend
            });

            const success = addKeyframe({
                frame: currentFrame,
                enabled: currentEnabled,
                min: currentMin,
                max: currentMax,
                reverse: currentReverse,
                yMode: currentYMode,
                blend: finalBlend
            });

            if (success) {
                console.log('Depth keyframe added successfully');
            } else {
                console.warn('Failed to add depth keyframe');
            }
        } finally {
            // Clear flag after a short delay to allow for any pending events
            setTimeout(() => {
                isAddingKeyframe = false;
            }, 100);
        }
    });

    events.on('depthVisualization.removeKeyframe', (frame: number) => {
        console.log('Removing depth visualization keyframe at frame:', frame);
        const index = keyframes.findIndex(k => k.frame === frame);
        if (index !== -1) {
            removeKeyframe(index);
        } else {
            console.warn('Depth visualization keyframe not found at frame:', frame);
        }
    });

    events.on('timeline.add', (frame: number) => {
        // when adding a timeline keyframe, check if we should add depth visualization keyframe too
        const currentEnabled = events.invoke('view.depthVisualization');
        if (currentEnabled) {
            const currentMin = events.invoke('view.depthMin') || 1;
            const currentMax = events.invoke('view.depthMax') || 50;
            const currentReverse = events.invoke('view.depthReverse') || false;
            const currentYMode = events.invoke('view.depthYMode') || false;
            const currentBlend = events.invoke('view.depthBlend') || 1;

            addKeyframe({
                frame,
                enabled: currentEnabled,
                min: currentMin,
                max: currentMax,
                reverse: currentReverse,
                yMode: currentYMode,
                blend: currentBlend
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

    events.on('depthVisualization.clear', () => {
        console.log('Clearing depth visualization keyframes, count:', keyframes.length);

        // Remove all keys from timeline first (in reverse order to avoid index issues)
        for (let i = keyframes.length - 1; i >= 0; i--) {
            events.fire('timeline.removeKey', i);
        }

        keyframes.length = 0; // Clear all keyframes
        rebuildSpline();

        console.log('Cleared all depth visualization keyframes');
    });

    // Doc serialization
    events.function('docSerialize.depthVisualizationKeyframes', (): any[] => {
        if (keyframes.length === 0) {
            return [];
        }

        return [{
            name: 'depthVisualization',
            keyframes: keyframes.map(keyframe => ({
                frame: keyframe.frame,
                enabled: keyframe.enabled,
                min: keyframe.min,
                max: keyframe.max,
                reverse: keyframe.reverse,
                yMode: keyframe.yMode,
                blend: keyframe.blend
            }))
        }];
    });

    events.function('docDeserialize.depthVisualizationKeyframes', (data: any[]) => {
        if (data.length === 0) {
            return;
        }

        // Clear existing keyframes
        keyframes.length = 0;

        // Load keyframes from data
        data.forEach((animationData) => {
            if (animationData.name === 'depthVisualization' && animationData.keyframes) {
                animationData.keyframes.forEach((keyframeData: any) => {
                    keyframes.push({
                        frame: keyframeData.frame,
                        enabled: keyframeData.enabled || false,
                        min: keyframeData.min || 1,
                        max: keyframeData.max || 50,
                        reverse: keyframeData.reverse || false,
                        yMode: keyframeData.yMode || false,
                        blend: keyframeData.blend || 1
                    });
                });
            }
        });

        rebuildSpline();
        console.log('Loaded', keyframes.length, 'depth visualization keyframes');
    });
};

export { registerDepthVisualizationAnimationEvents };
