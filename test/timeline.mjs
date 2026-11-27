// Checks for timeline playback.
import assert from 'node:assert/strict';

import { CommandQueue } from './.build/src/command-queue.js';
import { createEditorTimeline } from './.build/src/editor-timeline.js';
import { Events } from './.build/src/events.js';
import { registerTimelineEvents } from './.build/src/timeline.js';

const setup = ({ frames = 10, loop = true } = {}) => {
    const events = new Events();
    registerTimelineEvents(events);
    events.fire('timeline.setFrameRate', 1);
    events.fire('timeline.setFrames', frames);
    events.fire('timeline.setLoop', loop);
    return events;
};

// the editor API's timeline commands over a real timeline, with an empty camera track
const setupEditor = (options) => {
    const events = setup(options);
    events.function('camera.animTrack', () => ({ keys: [], evaluate() {} }));
    events.function('sequence.idle', () => undefined);
    const scene = { camera: { onUpdate() {} }, forceRender: false };
    const session = { camera: () => null, viewport: { assertIdle() {}, info: () => null } };
    const timeline = createEditorTimeline(events, scene, new CommandQueue(), session, () => ({ canUndo: false, canRedo: false }));
    return { events, timeline };
};

// advance playback by `seconds` in one-second ticks
const advance = (events, seconds) => {
    for (let i = 0; i < seconds; i++) {
        events.fire('update', 1);
    }
};

const timelineChecks = {
    'playback wraps to the first frame when looping'() {
        const events = setup({ loop: true });
        events.fire('timeline.setFrame', 8);
        events.fire('timeline.setPlaying', true);
        advance(events, 3);
        assert.equal(events.invoke('timeline.frame'), 1);
        assert.equal(events.invoke('timeline.playing'), true);
    },

    'playback stops on the last frame when not looping'() {
        const events = setup({ loop: false });
        events.fire('timeline.setFrame', 7);
        events.fire('timeline.setPlaying', true);
        advance(events, 5);
        assert.equal(events.invoke('timeline.frame'), 9);
        assert.equal(events.invoke('timeline.playing'), false);
    },

    'playing from the last frame without looping starts over'() {
        const events = setup({ loop: false });
        events.fire('timeline.setFrame', 9);
        events.fire('timeline.setPlaying', true);
        // the playhead moves to the start right away, not on the next tick
        assert.equal(events.invoke('timeline.frame'), 0);
        advance(events, 2);
        assert.equal(events.invoke('timeline.frame'), 2);
        assert.equal(events.invoke('timeline.playing'), true);
    },

    'turning loop off during playback stops on the last frame'() {
        const events = setup({ loop: true });
        events.fire('timeline.setFrame', 6);
        events.fire('timeline.setPlaying', true);
        advance(events, 1);
        events.fire('timeline.setLoop', false);
        advance(events, 5);
        assert.equal(events.invoke('timeline.frame'), 9);
        assert.equal(events.invoke('timeline.playing'), false);
    },

    'a single frame without looping does not start playback'() {
        const events = setup({ frames: 1, loop: false });
        events.fire('timeline.setPlaying', true);
        assert.equal(events.invoke('timeline.playing'), false);
    },

    async 'editor seek to the last frame during non-looping playback stays there'() {
        const { events, timeline } = setupEditor({ loop: false });
        events.fire('timeline.setFrame', 3);
        events.fire('timeline.setPlaying', true);
        const result = await timeline.update({ frame: 9 });
        assert.equal(result.timeline.frame, 9);
        assert.equal(result.timeline.playing, false);
        advance(events, 2);
        assert.equal(events.invoke('timeline.frame'), 9);
    },

    async 'editor play from the last frame without looping starts over'() {
        const { events, timeline } = setupEditor({ loop: false });
        events.fire('timeline.setFrame', 9);
        const result = await timeline.update({ playing: true });
        assert.equal(result.timeline.frame, 0);
        assert.equal(result.timeline.playing, true);
    },

    async 'editor seek during looping playback keeps playing'() {
        const { events, timeline } = setupEditor({ loop: true });
        events.fire('timeline.setPlaying', true);
        const result = await timeline.update({ frame: 9 });
        assert.equal(result.timeline.frame, 9);
        assert.equal(result.timeline.playing, true);
    },

    'a clip clamps the playhead and wraps the frame steps inside it'() {
        const events = setup();
        events.fire('timeline.setClipRange', { start: 3, end: 6 }, 5);
        assert.equal(events.invoke('timeline.frame'), 5);

        events.fire('timeline.setFrame', 0);
        assert.equal(events.invoke('timeline.frame'), 3);
        events.fire('timeline.setFrame', 9);
        assert.equal(events.invoke('timeline.frame'), 6);

        // steps wrap inside the clip rather than the full timeline
        events.fire('timeline.nextFrame');
        assert.equal(events.invoke('timeline.frame'), 3);
        events.fire('timeline.prevFrame');
        assert.equal(events.invoke('timeline.frame'), 6);
    },

    'playback loops inside a clip'() {
        const events = setup({ loop: true });
        events.fire('timeline.setClipRange', { start: 3, end: 6 }, 5);
        events.fire('timeline.setPlaying', true);
        advance(events, 2);
        // 5 -> 6 -> wraps back to 3
        assert.equal(events.invoke('timeline.frame'), 3);
        assert.equal(events.invoke('timeline.playing'), true);
    },

    'playback stops on a clip end when not looping'() {
        const events = setup({ loop: false });
        events.fire('timeline.setClipRange', { start: 3, end: 6 }, 3);
        events.fire('timeline.setPlaying', true);
        advance(events, 5);
        assert.equal(events.invoke('timeline.frame'), 6);
        assert.equal(events.invoke('timeline.playing'), false);
    },

    'looping a clip holds the camera sample on its last frame'() {
        const events = setup({ loop: true });
        const times = [];
        events.on('timeline.time', (time) => times.push(time));
        events.fire('timeline.setClipRange', { start: 3, end: 6 }, 6);
        events.fire('timeline.setPlaying', true);
        // half a frame past the end, the camera must not sample beyond the clip
        events.fire('update', 0.5);
        assert.equal(times[times.length - 1], 6);
    },

    'playback follows a timeline length change'() {
        const events = setup({ frames: 10, loop: true });
        events.fire('timeline.setFrame', 5);
        events.fire('timeline.setPlaying', true);
        events.fire('timeline.setFrames', 7);
        advance(events, 1);
        assert.equal(events.invoke('timeline.frame'), 6);
        advance(events, 1);
        assert.equal(events.invoke('timeline.frame'), 0);
    },

    'a clip follows the timeline length down and drops when nothing is left'() {
        const events = setup();
        events.fire('timeline.setClipRange', { start: 3, end: 6 }, 3);

        events.fire('timeline.setFrames', 5);
        assert.deepEqual(events.invoke('timeline.clipRange'), { start: 3, end: 4 });

        events.fire('timeline.setFrames', 3);
        assert.equal(events.invoke('timeline.clipRange'), null);
        assert.equal(events.invoke('timeline.frame'), 2);
    },

    'clearing a clip reopens the whole timeline'() {
        const events = setup();
        events.fire('timeline.setClipRange', { start: 3, end: 6 }, 3);
        events.fire('timeline.clearClipRange', 9);
        assert.equal(events.invoke('timeline.clipRange'), null);
        assert.equal(events.invoke('timeline.frame'), 9);
    },

    async 'an editor seek outside the clip lands on its boundary'() {
        const { events, timeline } = setupEditor();
        events.fire('timeline.setClipRange', { start: 3, end: 6 }, 3);
        const result = await timeline.update({ frame: 9 });
        assert.equal(result.timeline.frame, 6);
        assert.deepEqual(events.invoke('timeline.clipRange'), { start: 3, end: 6 });
    }
};

export { timelineChecks };
