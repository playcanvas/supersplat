import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA32F,
    GraphicsDevice,
    Mat4,
    Texture
} from 'playcanvas';

const idx = [
    0, 4, 8, 12,
    1, 5, 9, 13,
    2, 6, 10, 14
];

// wraps a palette of transform data
class TransformPalette {
    texture: Texture;
    data: Float32Array;
    idx = 1;                // index of the next available matrix. index 0 is identity

    constructor(device: GraphicsDevice, maxTransforms = 4096) {
        const width = 512 * 3;                                      // 512 matrices per row (512 * 3 * 4 floats)
        const height = Math.ceil(maxTransforms / (width / 3));      // calculate height based on max transforms

        this.texture = new Texture(device, {
            width,
            height,
            format: PIXELFORMAT_RGBA32F,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });

        this.data = this.texture.lock() as Float32Array;
        this.texture.unlock();

        this.setTransform(0, Mat4.IDENTITY);
    }

    getTransform(index: number, transform: Mat4) {
        const dst = transform.data;
        for (let i = 0; i < 12; ++i) {
            dst[idx[i]] = this.data[index * 12 + i];
        }
    }

    setTransform(index: number, transform: Mat4) {
        const src = transform.data;
        for (let i = 0; i < 12; ++i) {
            this.data[index * 12 + i] = src[idx[i]];
        }

        this.texture.upload();
    }
}

export { TransformPalette };
