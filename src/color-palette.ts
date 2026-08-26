import {
    ADDRESS_CLAMP_TO_EDGE,
    PIXELFORMAT_RGBA32F,
    GraphicsDevice,
    Texture
} from 'playcanvas';

import { createGradeTerms, gradeFromRows, gradeRows, type GradeTerms } from './color-grade';
import { COLOR_PALETTE_ENTRIES_PER_ROW } from './shaders/color-grade-chunk';

// an entry is 4 texels: the three rows of the affine colour transform - exactly
// gradeRows' output - then the alpha multiplier in .x, 3 floats spare
const FLOATS_PER_ENTRY = 16;

// texture data stores COLOR_PALETTE_ENTRIES_PER_ROW grades per row. the
// shader-side lookup derives its row stride from the same constant
const width = COLOR_PALETTE_ENTRIES_PER_ROW * 4;

// wraps a palette of per-gaussian colour grades. Entries are affine colour
// transforms plus an alpha multiplier, which is the form closed under
// composition, so applying a grade on top of an existing one stays one entry.
class ColorPalette {
    getEntry: (index: number, out: GradeTerms) => GradeTerms;
    setEntry: (index: number, terms: GradeTerms) => void;
    alloc: (num?: number) => number;
    free: (num?: number) => void;
    destroy: () => void;
    texture: Texture;
    // number of allocated entries, including the identity at index 0
    size: number;

    // grades come from explicit user actions, so there are far fewer of them than
    // transforms; start at one texture row and grow from there
    constructor(device: GraphicsDevice, initialSize = COLOR_PALETTE_ENTRIES_PER_ROW) {
        let texture: Texture;
        let data: Float32Array;

        // the packed rows of one entry, reused so get/set don't allocate
        const rows = new Float32Array(12);

        // reallocate the storage texture and copy over old data
        const realloc = (width: number, height: number) => {
            const newTexture = new Texture(device, {
                name: 'colorPalette',
                width,
                height,
                format: PIXELFORMAT_RGBA32F,
                mipmaps: false,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });

            const newData = newTexture.lock() as Float32Array;
            newTexture.unlock();

            // copy over data if this is a realloc
            if (texture) {
                newData.set(data);

                texture.destroy();
            }

            texture = newTexture;
            data = newData;
        };

        this.getEntry = (index: number, out: GradeTerms) => {
            const base = index * FLOATS_PER_ENTRY;
            for (let i = 0; i < 12; ++i) {
                rows[i] = data[base + i];
            }
            return gradeFromRows(rows, data[base + 12], out);
        };

        this.setEntry = (index: number, terms: GradeTerms) => {
            gradeRows(terms, rows);
            const base = index * FLOATS_PER_ENTRY;
            for (let i = 0; i < 12; ++i) {
                data[base + i] = rows[i];
            }
            data[base + 12] = terms.transparency;

            texture.upload();
        };

        // index of the next available entry. index 0 is the identity grade.
        let nextIdx = 1;

        // allocate one or more entries from the palette, returns the index of the first
        this.alloc = (num = 1) => {
            const result = nextIdx;

            while (nextIdx + num > data.length / FLOATS_PER_ENTRY) {
                realloc(width, texture.height * 2);
            }

            nextIdx += num;

            return result;
        };

        this.free = (num = 1) => {
            nextIdx -= num;
        };

        this.destroy = () => {
            texture.destroy();
        };

        Object.defineProperty(this, 'texture', { get() {
            return texture;
        } });

        Object.defineProperty(this, 'size', { get() {
            return nextIdx;
        } });

        // allocate initial storage
        realloc(width, Math.ceil(initialSize / COLOR_PALETTE_ENTRIES_PER_ROW));

        // initialize the first entry to the identity grade
        this.setEntry(0, createGradeTerms());
    }
}

export { ColorPalette };
