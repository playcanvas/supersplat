// Checks for sorting picked or dropped files into import groups.
import assert from 'node:assert/strict';

import { analyzeImport, needsReview } from './.build/src/import-analysis.js';

const frames = (prefix, count, ext = '.ply') =>
    Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(4, '0')}${ext}`);

// [kind, filenames] per group, for compact comparisons
const summary = filenames => analyzeImport(filenames).map(g => [g.kind, g.files.map(i => filenames[i])]);

const importAnalysisChecks = {
    'a sequence with stray files keeps its frames together'() {
        const files = [...frames('frame_', 5), 'notes.txt', 'preview.png'];
        const groups = analyzeImport(files);
        assert.deepEqual(groups.map(g => g.kind), ['sequence', 'unsupported']);
        assert.equal(groups[0].files.length, 5);
        assert.equal(groups[0].missing, 0);
        assert.equal(groups[1].name, 'notes.txt, preview.png');
        assert.equal(needsReview(files.length, groups), true);
    },

    'frames are ordered by number, not name, and gaps are counted'() {
        const files = ['f10.ply', 'f2.ply', 'f1.ply', 'f5.ply'];
        const [group] = analyzeImport(files);
        assert.deepEqual(group.files.map(i => files[i]), ['f1.ply', 'f2.ply', 'f5.ply', 'f10.ply']);
        assert.equal(group.missing, 6);
        assert.equal(group.name, 'f1.ply … f10.ply');
    },

    'two sequences in one drop are split by prefix and folder'() {
        const files = [...frames('a_', 3), ...frames('b_', 2), ...frames('x/a_', 2)];
        assert.deepEqual(summary(files), [
            ['sequence', frames('a_', 3)],
            ['sequence', frames('b_', 2)],
            ['sequence', frames('x/a_', 2)]
        ]);
    },

    'a lone numbered ply is a model, other files sort by kind'() {
        const files = ['scan1.ply', 'cameras.json', 'model.spz', 'images.txt', 'scene.ssproj', 'loose.webp', 'anim.gsaf'];
        assert.deepEqual(summary(files), [
            ['document', ['scene.ssproj']],
            ['model', ['scan1.ply']],
            ['model', ['model.spz']],
            ['poses', ['cameras.json']],
            ['poses', ['images.txt']],
            ['unsupported', ['loose.webp', 'anim.gsaf']]
        ]);
    },

    'an unpacked sog takes only its own json and webp files'() {
        const files = ['means_l.webp', 'meta.json', 'scales.webp', 'a.ply', 'readme.md'];
        const groups = analyzeImport(files);
        assert.deepEqual(summary(files), [
            ['bundle', ['meta.json', 'means_l.webp', 'scales.webp']],
            ['model', ['a.ply']],
            ['unsupported', ['readme.md']]
        ]);
        assert.equal(groups[0].dir, '');
    },

    'streamed sog and lcc take their whole folder, including nested meta files'() {
        const files = [
            'big/lod-meta.json', 'big/0/meta.json', 'big/0/means_l.webp', 'big/1/meta.json',
            'lcc/Scene.lcc', 'lcc/data.bin', 'lcc/index.bin', 'lcc/sub/chunk.sog',
            'small/meta.json', 'small/shN.webp'
        ];
        const groups = analyzeImport(files);
        assert.deepEqual(summary(files), [
            ['bundle', ['big/lod-meta.json', 'big/0/meta.json', 'big/0/means_l.webp', 'big/1/meta.json']],
            ['bundle', ['lcc/Scene.lcc', 'lcc/data.bin', 'lcc/index.bin', 'lcc/sub/chunk.sog']],
            ['bundle', ['small/meta.json', 'small/shN.webp']]
        ]);
        assert.deepEqual(groups.map(g => g.dir), ['big/', 'lcc/', 'small/']);
    },

    'only a single file or a single bundle skips review'() {
        const review = files => needsReview(files.length, analyzeImport(files));
        assert.equal(review(['a.ply']), false);
        assert.equal(review(['notes.txt']), false);
        assert.equal(review(['meta.json', 'means_l.webp']), false);
        assert.equal(review(frames('frame_', 2)), true);
        assert.equal(review(['a.ply', 'b.spz']), true);
        assert.equal(review(['meta.json', 'means_l.webp', 'readme.md']), true);
    },

    'compressed ply frames and upper case names are recognised'() {
        const files = ['Frame0001.compressed.PLY', 'Frame0002.compressed.PLY'];
        const [group] = analyzeImport(files);
        assert.equal(group.kind, 'sequence');
        assert.equal(group.name, 'Frame0001.compressed.PLY … Frame0002.compressed.PLY');
    }
};

export { importAnalysisChecks };
