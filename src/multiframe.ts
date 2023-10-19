import {
    BLENDEQUATION_ADD,
    BLENDMODE_CONSTANT,
    BLENDMODE_ONE_MINUS_CONSTANT,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_RGBA16F,
    PIXELFORMAT_RGBA32F,
    SEMANTIC_POSITION,
    createShaderFromCode,
    drawQuadWithShader,
    BlendState,
    CameraComponent,
    RenderTarget,
    ScopeId,
    Shader,
    Texture,
    Vec3,
    WebglGraphicsDevice
} from 'playcanvas';
import {Element, ElementType} from './element';
import {Serializer} from './serializer';

const gamma = 2.2;

const vshader = `
attribute vec2 vertex_position;
varying vec2 texcoord;
void main(void) {
    gl_Position = vec4(vertex_position, 0.5, 1.0);
    texcoord = vertex_position.xy * 0.5 + 0.5;
}
`;

const fshader = `
varying vec2 texcoord;
uniform sampler2D multiframeTex;
uniform float power;
void main(void) {
    vec4 t = texture2D(multiframeTex, texcoord);
    gl_FragColor = pow(t, vec4(power));
}
`;

const supportsFloat16 = (device: WebglGraphicsDevice): boolean => {
    return device.extTextureHalfFloat && device.textureHalfFloatRenderable;
};

const supportsFloat32 = (device: WebglGraphicsDevice): boolean => {
    return device.extTextureFloat && device.textureFloatRenderable;
};

// lighting source should be stored HDR
const choosePixelFormat = (device: WebglGraphicsDevice): number => {
    return supportsFloat16(device)
        ? PIXELFORMAT_RGBA16F
        : supportsFloat32(device)
        ? PIXELFORMAT_RGBA32F
        : PIXELFORMAT_RGBA8;
};

// calculate 1d gauss
const gauss = (x: number, sigma: number): number => {
    return (1.0 / (Math.sqrt(2.0 * Math.PI) * sigma)) * Math.exp(-(x * x) / (2.0 * sigma * sigma));
};

const accumBlend = new BlendState(true, BLENDEQUATION_ADD, BLENDMODE_CONSTANT, BLENDMODE_ONE_MINUS_CONSTANT);
const noBlend = new BlendState(false);

// generate multiframe, supersampled AA
class Multiframe extends Element {
    device: WebglGraphicsDevice;
    camera: CameraComponent;
    textureBias: number;
    shader: Shader = null;
    pixelFormat: number;
    multiframeTexUniform: ScopeId = null;
    powerUniform: ScopeId = null;
    textureBiasUniform: ScopeId = null;
    accumTexture: Texture = null;
    accumRenderTarget: RenderTarget = null;
    sampleArray: Vec3[] = [];
    sampleId = 0;
    sampleAccum = 0;
    enabled = true;
    blend = 1.0;

    constructor(device: WebglGraphicsDevice, camera: CameraComponent, samples?: Vec3[]) {
        super(ElementType.other);

        this.device = device;
        this.camera = camera;
        this.samples = samples || Multiframe.generateSamples(5, false, 2, 0);

        // just before rendering the scene we apply a subpixel jitter
        // to the camera's projection matrix.
        this.camera.onPreRender = () => {
            const camera = this.camera.camera;
            const pmat = camera.projectionMatrix;

            if (this.enabled && this.accumTexture) {
                const sample = this.sampleArray[this.sampleId];
                pmat.data[8] = sample.x / this.accumTexture.width;
                pmat.data[9] = sample.y / this.accumTexture.height;
                this.textureBiasUniform.setValue(this.sampleId === 0 ? 0.0 : this.textureBias);
            } else {
                pmat.data[8] = 0;
                pmat.data[9] = 0;
                this.textureBiasUniform.setValue(0.0);
            }

            // look away
            camera._viewProjMatDirty = true;
        };

        this.camera.onPostRender = () => {
            const pmat = camera.projectionMatrix;
            pmat.data[8] = 0;
            pmat.data[9] = 0;
        };

        this.shader = createShaderFromCode(device, vshader, fshader, 'multiframe', {
            vertex_position: SEMANTIC_POSITION
        });

        this.pixelFormat = choosePixelFormat(device);
        this.multiframeTexUniform = device.scope.resolve('multiframeTex');
        this.powerUniform = device.scope.resolve('power');
        this.textureBiasUniform = device.scope.resolve('textureBias');

        const handler = () => {
            this.destroyEngineResources();
        };

        device.once('destroy', handler);
        device.on('devicelost', handler);
    }

    // set the samples array which contains one Vec3 per multiframe sample
    // each sample contains (x pixel offset, y pixel offset, normalized weight)
    set samples(sampleArray: Vec3[]) {
        this.sampleArray = sampleArray;
        this.textureBias = -Math.log2(Math.sqrt(sampleArray.length));
        this.sampleId = 0;
    }

    get samples() {
        return this.sampleArray;
    }

    // helper function to generate an array of samples for use in multiframe rendering
    // numSamples: square root of number of samples: 5 === 25 total samples
    // jitter: enable sample jittering
    // size: size of the filter, in pixels
    // sigma: guassian sigma filter value or 0 to use box filtering instead
    static generateSamples(numSamples: number, jitter = false, size = 1, sigma = 0): Vec3[] {
        const samples: Vec3[] = [];
        const kernelSize = Math.ceil(3 * sigma) + 1;
        const halfSize = size * 0.5;
        let sx, sy, weight, totalWeight = 0;

        // generate jittered grid samples (poisson would be better)
        for (let x = 0; x < numSamples; ++x) {
            for (let y = 0; y < numSamples; ++y) {
                // generate sx, sy in range -1..1
                if (jitter) {
                    sx = ((x + Math.random()) / numSamples) * 2.0 - 1.0;
                    sy = ((y + Math.random()) / numSamples) * 2.0 - 1.0;
                } else {
                    sx = (x / (numSamples - 1)) * 2.0 - 1.0;
                    sy = (y / (numSamples - 1)) * 2.0 - 1.0;
                }
                // calculate sample weight
                weight = (sigma <= 0.0) ? 1.0 : gauss(sx * kernelSize, sigma) * gauss(sy * kernelSize, sigma);
                totalWeight += weight;
                samples.push(new Vec3(sx * halfSize, sy * halfSize, weight));
            }
        }

        // normalize weights
        samples.forEach((v) => {
            v.z /= totalWeight;
        });

        // closest sample first
        samples.sort((a, b) => {
            const aL = a.length();
            const bL = b.length();
            return aL < bL ? -1 : (bL < aL ? 1 : 0);
        });

        return samples;
    }

    destroy() {
        super.destroy();
        this.destroyEngineResources();
    }

    destroyEngineResources() {
        if (this.accumRenderTarget) {
            this.accumRenderTarget.destroy();
            this.accumRenderTarget = null;
        }

        if (this.accumTexture) {
            this.accumTexture.destroy();
            this.accumTexture = null;
        }
    }

    private create() {
        const source = this.camera.renderTarget.colorBuffer;

        this.accumTexture = new Texture(this.device, {
            name: 'multiframe-texture',
            width: source.width,
            height: source.height,
            format: this.pixelFormat,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST
        });

        this.accumRenderTarget = new RenderTarget({
            name: 'multiframe-target',
            colorBuffer: this.accumTexture,
            depth: false
        });
    }

    // activate the backbuffer for upcoming rendering
    private activateBackbuffer() {
        const device = this.device;
        device.setRenderTarget(null);
        device.updateBegin();
        device.setViewport(0, 0, device.width, device.height);
        device.setScissor(0, 0, device.width, device.height);
    }

    // check if the scene requested a render (meaning the scene changed)
    onPostUpdate() {
        if (this.scene.app.renderNextFrame) {
            this.sampleId = 0;
            this.sampleAccum = 0;
        } else if (this.enabled && this.sampleId < this.sampleArray.length) {
            this.scene.app.renderNextFrame = true;
        }
    }

    // update the multiframe accumulation buffer.
    // blend the camera's render target colour buffer with the multiframe accumulation buffer.
    // writes results to the backbuffer.
    onPostRender() {
        const device = this.device;
        const sampleCnt = this.sampleArray.length;
        const sourceTex = this.camera.renderTarget.colorBuffer;

        // in disabled state we resolve directly from source to backbuffer
        if (!this.enabled) {
            if (this.blend !== 1.0) {
                device.setBlendState(accumBlend);
                device.setBlendColor(this.blend, this.blend, this.blend, this.blend);
            } else {
                device.setBlendState(noBlend);
            }

            this.multiframeTexUniform.setValue(sourceTex);
            this.powerUniform.setValue(1.0);
            drawQuadWithShader(device, null, this.shader);
            this.activateBackbuffer();
            return;
        }

        if (
            this.accumTexture &&
            (this.accumTexture.width !== sourceTex.width || this.accumTexture.height !== sourceTex.height)
        ) {
            this.destroyEngineResources();
        }

        if (!this.accumTexture) {
            this.create();
        }

        if (this.sampleId < sampleCnt) {
            const sampleWeight = this.sampleArray[this.sampleId].z;
            const blend = sampleWeight / (this.sampleAccum + sampleWeight);
            device.setBlendState(accumBlend);
            device.setBlendColor(blend, blend, blend, blend);

            this.multiframeTexUniform.setValue(sourceTex);
            this.powerUniform.setValue(gamma);
            drawQuadWithShader(device, this.accumRenderTarget, this.shader);

            this.sampleAccum += sampleWeight;
        }

        if (this.sampleId === 0) {
            // first frame - copy the camera render target directly to the back buffer
            this.multiframeTexUniform.setValue(sourceTex);
            this.powerUniform.setValue(1.0);
        } else {
            this.multiframeTexUniform.setValue(this.accumTexture);
            this.powerUniform.setValue(1.0 / gamma);
        }

        if (this.blend !== 1.0) {
            device.setBlendState(accumBlend);
            device.setBlendColor(this.blend, this.blend, this.blend, this.blend);
        } else {
            device.setBlendState(noBlend);
        }

        drawQuadWithShader(device, null, this.shader);

        if (this.sampleId < sampleCnt) {
            this.sampleId++;
        }

        this.activateBackbuffer();
    }

    serialize(serializer: Serializer) {
        serializer.pack(this.enabled);
    }
}

export {Multiframe};
