// Deterministic ordering checks for CommandQueue + EditHistory. Runs against
// the tsc-emitted sources in test/.build (see test/tsconfig.json):
//
//   npm test
//
// No framework: each check is an async function that throws on failure.
// Timing is controlled with barriers the check releases, never with sleeps.
import assert from 'node:assert/strict';

import { CommandQueue } from './.build/src/command-queue.js';
import { EditHistory } from './.build/src/edit-history.js';
import { Events } from './.build/src/events.js';

const barrier = () => {
    let release;
    const promise = new Promise((resolve) => {
        release = resolve;
    });
    return { promise, release };
};

// an EditOp whose do/undo log their order; do() can be paused or made to fail
const makeOp = (log, name, { pauseDo = null, failDo = false } = {}) => ({
    name,
    async do() {
        log.push(`do:${name}`);
        if (pauseDo) {
            await pauseDo.promise;
        }
        if (failDo) {
            throw new Error(`${name} failed`);
        }
    },
    async undo() {
        log.push(`undo:${name}`);
    }
});

const setup = () => {
    const events = new Events();
    const queue = new CommandQueue();
    const history = new EditHistory(events, queue);
    return { events, queue, history, log: [] };
};

// let every microtask that can run, run
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

// CommandQueue reports task failures on console.error; the failure checks
// expect them
const quietly = async (fn) => {
    const error = console.error;
    console.error = () => {};
    try {
        await fn();
    } finally {
        console.error = error;
    }
};

const checks = {
    async 'enqueue is strictly FIFO'() {
        const { queue, log } = setup();
        const gate = barrier();
        const a = queue.enqueue(async () => {
            log.push('a:start');
            await gate.promise;
            log.push('a:end');
        });
        const b = queue.enqueue(() => log.push('b'));
        await tick();
        assert.deepEqual(log, ['a:start']);
        gate.release();
        await Promise.all([a, b]);
        assert.deepEqual(log, ['a:start', 'a:end', 'b']);
    },

    async 'ctx.apply lands the op in the gesture slot, ahead of an undo queued meanwhile'() {
        const { queue, history, log } = setup();
        const readback = barrier();
        const gesture = queue.enqueue(async (ctx) => {
            log.push('gesture:start');
            // the GPU readback
            await readback.promise;
            await ctx.apply(makeOp(log, 'A'));
        });
        // the user hits undo while the gesture is in flight
        const undo = history.undo();
        await tick();
        assert.deepEqual(log, ['gesture:start']);
        readback.release();
        await Promise.all([gesture, undo]);
        assert.deepEqual(log, ['gesture:start', 'do:A', 'undo:A']);
        assert.equal(history.cursor, 0);
    },

    // the shape of the pre-existing bug, kept to show what ctx.apply fixes:
    // firing edit.add from inside a slot enqueues a second task, so anything
    // queued during the readback runs between the intersect and its op
    async 'legacy: edit.add fired inside a slot lands behind commands queued meanwhile'() {
        const { events, queue, history, log } = setup();
        const readback = barrier();
        const gesture = queue.enqueue(async () => {
            await readback.promise;
            events.fire('edit.add', makeOp(log, 'A'));
        });
        const undo = history.undo();
        readback.release();
        await Promise.all([gesture, undo]);
        // drain the trailing edit.add task
        await queue.enqueue(() => {});
        // the undo found an empty history, then A applied after it
        assert.deepEqual(log, ['do:A']);
        assert.equal(history.cursor, 1);
    },

    async 'a paused EditOp.do blocks the next command'() {
        const { queue, history, log } = setup();
        const pause = barrier();
        const add = history.add(makeOp(log, 'A', { pauseDo: pause }));
        let nextRan = false;
        const next = queue.enqueue(() => {
            nextRan = true;
        });
        await tick();
        assert.deepEqual(log, ['do:A']);
        assert.equal(nextRan, false);
        pause.release();
        await Promise.all([add, next]);
        assert.equal(nextRan, true);
        assert.equal(history.cursor, 1);
    },

    async 'in-slot applies compose and stay ahead of a later command'() {
        const { queue, history, log } = setup();
        const readback = barrier();
        const gesture = queue.enqueue(async (ctx) => {
            await readback.promise;
            await ctx.apply(makeOp(log, 'A'));
            await ctx.apply(makeOp(log, 'B'));
        });
        const later = queue.enqueue(() => log.push('later'));
        readback.release();
        await Promise.all([gesture, later]);
        assert.deepEqual(log, ['do:A', 'do:B', 'later']);
        assert.equal(history.cursor, 2);
    },

    async 'the context is invalid once its task has settled'() {
        const { queue, log } = setup();
        let leaked;
        await queue.enqueue((ctx) => {
            leaked = ctx;
        });
        await assert.rejects(leaked.apply(makeOp(log, 'late')), /after its task/);
        assert.deepEqual(log, []);
    },

    async 'a failing task rejects only its caller'() {
        await quietly(async () => {
            const { queue } = setup();
            await assert.rejects(queue.enqueue(() => {
                throw new Error('boom');
            }), /boom/);
            assert.equal(await queue.enqueue(() => 42), 42);
        });
    },

    async 'a failing op rejects its caller and the queue keeps running'() {
        await quietly(async () => {
            const { history, log } = setup();
            await assert.rejects(history.add(makeOp(log, 'bad', { failDo: true })), /bad failed/);
            // known limitation, not rollback: the op was pushed before do()
            // threw, so it sits at the cursor as a redo candidate until the
            // next add discards it
            assert.equal(history.history.length, 1);
            assert.equal(history.cursor, 0);
            assert.equal(history.canRedo(), true);
            await history.add(makeOp(log, 'good'));
            assert.deepEqual(log, ['do:bad', 'do:good']);
            assert.equal(history.history.length, 1);
            assert.equal(history.cursor, 1);
        });
    },

    // why the context exists: a slot-owning task can't enqueue, because the
    // nested task waits for the one that is waiting for it
    async 'nested enqueue inside a slot never resolves'() {
        const { queue } = setup();
        const nested = queue.enqueue(() => queue.enqueue(() => 'inner'));
        const outcome = await Promise.race([nested.then(() => 'resolved'), tick().then(() => 'pending')]);
        assert.equal(outcome, 'pending');
    }
};

let failed = 0;
for (const [name, check] of Object.entries(checks)) {
    try {
        await check();
        console.log(`ok   ${name}`);
    } catch (error) {
        failed++;
        console.log(`FAIL ${name}\n${error.stack}\n`);
    }
}
const total = Object.keys(checks).length;
console.log(failed ? `\n${failed} of ${total} failed` : `\n${total} passed`);
process.exit(failed ? 1 : 0);
