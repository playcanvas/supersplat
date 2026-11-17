// Checks for timeline playback.
import assert from 'node:assert/strict';

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
        advance(events, 2);
        assert.equal(events.invoke('timeline.frame'), 2);
        assert.equal(events.invoke('timeline.playing'), true);
    }
};

export { timelineChecks };
