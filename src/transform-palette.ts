import {
    ADDRESS_CLAMP_TO_EDGE,
    PIXELFORMAT_RGBA32F,
    GraphicsDevice,
    Mat4,
    Texture
} from 'playcanvas';

// mapping from Mat4 to transposed 3x4 matrix
const idx = [
    0, 4, 8, 12,
    1, 5, 9, 13,
    2, 6, 10, 14
];

// texture data stores 512 matrices per row: 512 * 3 * 4 (rgba) floats
const width = 512 * 3;

// wraps a palette of transform data. transforms are stored as 3x4 (non-perspective)
// matrices
class TransformPalette {
    getTransform: (index: number, transform: Mat4) => void;
    setTransform: (index: number, transform: Mat4) => void;
    alloc: (num?: number) => number;
    free: (num?: number) => void;
    texture: Texture;

    constructor(device: GraphicsDevice, initialSize = 4096) {
        let texture: Texture;
        let data: Float32Array;

        // reallocate the storage texture and copy over old data
        const realloc = (width: number, height: number) => {
            const newTexture = new Texture(device, {
                name: 'transformPalette',
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

        this.getTransform = (index: number, transform: Mat4) => {
            const dst = transform.data;
            for (let i = 0; i < 12; ++i) {
                dst[idx[i]] = data[index * 12 + i];
            }
        };

        this.setTransform = (index: number, transform: Mat4) => {
            const src = transform.data;
            for (let i = 0; i < 12; ++i) {
                data[index * 12 + i] = src[idx[i]];
            }

            texture.upload();
        };

        // index of the next available matrix. index 0 is identity.
        let nextIdx = 1;

        // allocate one or more matrices from the palette, returns the index of the first matrix
        this.alloc = (num = 1) => {
            const result = nextIdx;

            while (nextIdx + num > data.length / 12) {
                realloc(width, texture.height * 2);
            }

            nextIdx += num;

            return result;
        };

        this.free = (num = 1) => {
            nextIdx -= num;
        };

        Object.defineProperty(this, 'texture', { get() {
            return texture;
        } });

        // allocate initial storage
        realloc(width, Math.ceil(initialSize / (width / 3)));

        // initialize first matrix to identity
        this.setTransform(0, Mat4.IDENTITY);
    }
}

export { TransformPalette };
