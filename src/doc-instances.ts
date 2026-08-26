import { Mat4 } from 'playcanvas';

import { createGradeTerms, gradeFromRows, gradeRows, type GradeTerms } from './color-grade';
import type { ColorPalette } from './color-palette';
import type { Splat } from './splat';
import type { TransformPalette } from './transform-palette';

// A layer's editable state, as stored in a .ssproj alongside the shared static
// data: which static row each instance references, its flags, and its two palette
// indices - plus the palettes those indices resolve through.
//
// This is what makes layer sharing survive a save. The static tier is written once
// per resource; each layer contributes only this, ~13 bytes per instance.
type InstanceRecords = {
    count: number;
    sourceRow: Uint32Array;
    flags: Uint8Array;
    palette: Uint32Array;
    // 16 floats per entry (a Mat4), entry 0 identity
    transformEntries: Float32Array;
    // 13 floats per entry (matrix, offset, alpha), entry 0 the identity grade
    colorEntries: Float32Array;
};

const MAGIC = 0x4c495353; // 'SSIL'
const VERSION = 1;
const HEADER_WORDS = 5;
const TRANSFORM_FLOATS = 16;
const COLOR_FLOATS = 13;

// Pack a layer's live state into a single buffer. `rowMap` maps a live static row
// to its index in the saved resource file, which drops the rows nothing
// references; it is applied here rather than to the live list so the editor keeps
// working after a save.
const encodeInstances = (splat: Splat, rowMap: Uint32Array): ArrayBuffer => {
    const { instances, transformPalette, colorPalette } = splat;
    const { count } = instances;
    const numTransform = transformPalette.size;
    const numColor = colorPalette.size;

    // flags are bytes; round the section out so the float sections stay aligned
    const flagWords = Math.ceil(count / 4);
    const words =
        HEADER_WORDS + count * 2 + flagWords +
        numTransform * TRANSFORM_FLOATS + numColor * COLOR_FLOATS;

    const buffer = new ArrayBuffer(words * 4);
    const u32 = new Uint32Array(buffer);
    const f32 = new Float32Array(buffer);

    u32[0] = MAGIC;
    u32[1] = VERSION;
    u32[2] = count;
    u32[3] = numTransform;
    u32[4] = numColor;

    let at = HEADER_WORDS;
    for (let i = 0; i < count; ++i) {
        u32[at + i] = rowMap[instances.sourceRow[i]];
    }
    at += count;
    u32.set(instances.palette.subarray(0, count), at);
    at += count;
    new Uint8Array(buffer, at * 4, count).set(instances.flags.subarray(0, count));
    at += flagWords;

    const mat = new Mat4();
    for (let i = 0; i < numTransform; ++i) {
        transformPalette.getTransform(i, mat);
        f32.set(mat.data, at);
        at += TRANSFORM_FLOATS;
    }

    const terms = createGradeTerms();
    const rows = new Float32Array(12);
    for (let i = 0; i < numColor; ++i) {
        colorPalette.getEntry(i, terms);
        gradeRows(terms, rows);
        f32.set(rows, at);
        f32[at + 12] = terms.transparency;
        at += COLOR_FLOATS;
    }

    return buffer;
};

const decodeInstances = (bytes: Uint8Array): InstanceRecords => {
    // copy into a fresh buffer: a zip read hands back a view at an arbitrary
    // offset, and the u32/f32 views below need 4-byte alignment
    const buffer = bytes.slice().buffer as ArrayBuffer;
    const u32 = new Uint32Array(buffer);
    if (u32[0] !== MAGIC) {
        throw new Error('not a supersplat instance blob');
    }
    if (u32[1] !== VERSION) {
        throw new Error(`unsupported instance blob version ${u32[1]}`);
    }
    const count = u32[2];
    const numTransform = u32[3];
    const numColor = u32[4];
    const f32 = new Float32Array(buffer);

    let at = HEADER_WORDS;
    // copies rather than views: the caller keeps these past the buffer's life,
    // and the flags section is not 4-byte aligned in general
    const sourceRow = u32.slice(at, at + count);
    at += count;
    const palette = u32.slice(at, at + count);
    at += count;
    const flags = new Uint8Array(buffer, at * 4, count).slice();
    at += Math.ceil(count / 4);

    const transformEntries = f32.slice(at, at + numTransform * TRANSFORM_FLOATS);
    at += numTransform * TRANSFORM_FLOATS;
    const colorEntries = f32.slice(at, at + numColor * COLOR_FLOATS);

    return { count, sourceRow, flags, palette, transformEntries, colorEntries };
};

// Refill a layer's palettes from stored entries. Entry 0 is written too: it is the
// identity in a freshly constructed palette, so this is a no-op for it, but going
// through the same path keeps the allocator's count honest.
const restorePalettes = (
    records: InstanceRecords,
    transformPalette: TransformPalette,
    colorPalette: ColorPalette
) => {
    const numTransform = records.transformEntries.length / TRANSFORM_FLOATS;
    const numColor = records.colorEntries.length / COLOR_FLOATS;

    // entry 0 already exists in both palettes, so only the rest are allocated
    if (numTransform > 1) transformPalette.alloc(numTransform - 1);
    if (numColor > 1) colorPalette.alloc(numColor - 1);

    const mat = new Mat4();
    for (let i = 0; i < numTransform; ++i) {
        mat.data.set(records.transformEntries.subarray(i * TRANSFORM_FLOATS, (i + 1) * TRANSFORM_FLOATS));
        transformPalette.setTransform(i, mat);
    }

    const terms: GradeTerms = createGradeTerms();
    for (let i = 0; i < numColor; ++i) {
        const base = i * COLOR_FLOATS;
        gradeFromRows(records.colorEntries.subarray(base, base + 12), records.colorEntries[base + 12], terms);
        colorPalette.setEntry(i, terms);
    }
};

export { encodeInstances, decodeInstances, restorePalettes };
export type { InstanceRecords };
