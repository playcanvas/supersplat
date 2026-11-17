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
    }
};

export { timelineChecks };
