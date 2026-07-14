import { computeSplatValueGLSL } from './splat-value-shader';

// fragment writes a 4-byte texel per output pixel where each channel is 255 if
// the corresponding splat falls within the requested histogram-bucket range
// (and is visible / not locked / not deleted), or 0 otherwise. callers can
// then read the result back as a Uint8Array and use `data[i] === 255` as the
// per-splat selection predicate.

const vertexShader = /* glsl */ `
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    ${computeSplatValueGLSL}

    uniform ivec2 output_params;  // result texture (width, height)
    uniform vec2 minMax;           // (min, max) from the last histogram pass
    uniform int numBins;
    uniform int rangeStart;
    uniform int rangeEnd;

    float check(int idx) {
        float val;
        bool sel;
        bool vis;
        bool valid = computeSplatValue(idx, val, sel, vis);
        if (!valid || !vis) return 0.0;

        float n = (minMax.y == minMax.x) ? 0.0 : (val - minMax.x) / (minMax.y - minMax.x);
        int bin = clamp(int(n * float(numBins)), 0, numBins - 1);
        return (bin >= rangeStart && bin <= rangeEnd) ? 1.0 : 0.0;
    }

    void main(void) {
        ivec2 outUV = ivec2(gl_FragCoord);
        int baseIdx = (outUV.y * output_params.x + outUV.x) * 4;

        gl_FragColor = vec4(
            check(baseIdx),
            check(baseIdx + 1),
            check(baseIdx + 2),
            check(baseIdx + 3)
        );
    }
`;

export { vertexShader, fragmentShader };
