import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ZERO,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BlendState,
    Color,
    Entity,
    GraphicsDevice,
    RenderPassPicker,
    RenderTarget,
    WebglGraphicsDevice
} from 'playcanvas';

import { ElementType } from './element';
import { Scene } from './scene';
import { Splat } from './splat';

// Clear color for depth pass (transmittance starts at 1)
const depthClearColor = new Color(0, 0, 0, 1);

// Shared buffer for half-to-float conversion
const float32 = new Float32Array(1);
const uint32 = new Uint32Array(float32.buffer);

// Convert 16-bit half-float to 32-bit float using bit manipulation
const half2Float = (h: number): number => {
    const sign = (h & 0x8000) << 16;           // Move sign to bit 31
    const exponent = (h & 0x7C00) >> 10;       // Extract 5-bit exponent
    const mantissa = h & 0x03FF;               // Extract 10-bit mantissa

    if (exponent === 0) {
        if (mantissa === 0) {
            // Zero
            uint32[0] = sign;
        } else {
            // Denormalized: convert to normalized float32
            let e = -1;
            let m = mantissa;
            do {
                e++;
                m <<= 1;
            } while ((m & 0x0400) === 0);
            uint32[0] = sign | ((127 - 15 - e) << 23) | ((m & 0x03FF) << 13);
        }
    } else if (exponent === 31) {
        // Infinity or NaN
        uint32[0] = sign | 0x7F800000 | (mantissa << 13);
    } else {
        // Normalized: adjust exponent bias from 15 to 127
        uint32[0] = sign | ((exponent + 127 - 15) << 23) | (mantissa << 13);
    }

    return float32[0];
};

class Picker {
    private device: GraphicsDevice;
    private scene: Scene;

    // Render targets (provided by camera)
    private depthRenderTarget: RenderTarget | null = null;
    private idRenderTarget: RenderTarget | null = null;

    // Render pass (shared for depth and ID picking)
    private renderPass: RenderPassPicker;

    // Blend state for depth accumulation
    private depthBlendState: BlendState;

    constructor(scene: Scene) {
        this.scene = scene;
        this.device = scene.graphicsDevice;

        // Create shared render pass for picking
        this.renderPass = new RenderPassPicker(this.device, this.scene.app.renderer);

        // Blend state for depth accumulation:
        // RGB: additive depth accumulation (ONE, ONE_MINUS_SRC_ALPHA)
        // Alpha: multiplicative transmittance (ZERO, ONE_MINUS_SRC_ALPHA) -> T = T * (1 - alpha)
        this.depthBlendState = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA,           // RGB blend
            BLENDEQUATION_ADD, BLENDMODE_ZERO, BLENDMODE_ONE_MINUS_SRC_ALPHA           // Alpha blend (transmittance)
        );
    }

    // Set render targets from camera
    setRenderTargets(depthRT: RenderTarget, idRT: RenderTarget) {
        this.depthRenderTarget = depthRT;
        this.idRenderTarget = idRT;
    }

    // Prepare for ID picking by rendering the specified splat
    prepareId(splat: Splat, mode: 'add' | 'remove' | 'set') {
        if (!this.idRenderTarget) {
            return;
        }

        const worldLayer = this.scene.app.scene.layers.getLayerByName('World');
        const events = this.scene.events;
        const alpha = events.invoke('camera.mode') === 'rings' ? 0.0 : 0.2;

        // Hide non-selected elements
        const splats = this.scene.getElementsByType(ElementType.splat);
        splats.forEach((s: Splat) => {
            s.entity.enabled = s === splat;
        });

        // Set picker uniforms
        this.device.scope.resolve('pickerAlpha').setValue(alpha);
        this.device.scope.resolve('pickMode').setValue(['add', 'remove', 'set'].indexOf(mode));
        this.device.scope.resolve('depthEstimationMode').setValue(0);

        // Render ID picking pass
        const emptyMap = new Map();
        this.renderPass.blendState = BlendState.NOBLEND;
        this.renderPass.init(this.idRenderTarget);
        this.renderPass.update(this.scene.camera.entity.camera, this.scene.app.scene, [worldLayer], emptyMap, false);
        this.renderPass.render();

        // Re-enable all splats
        splats.forEach((s: Splat) => {
            s.entity.enabled = true;
        });
    }

    // Read single splat ID at screen position (after prepareId)
    readId(x: number, y: number): number {
        return this.readIds(x, y, 1, 1)[0];
    }

    // Read rectangle of splat IDs (after prepareId)
    readIds(x: number, y: number, width: number, height: number): number[] {
        if (!this.idRenderTarget) {
            return [];
        }

        const device = this.device as WebglGraphicsDevice;
        const pixels = new Uint8Array(width * height * 4);

        // Read pixels
        // @ts-ignore
        device.setRenderTarget(this.idRenderTarget);
        device.updateBegin();
        // @ts-ignore
        device.readPixels(x, this.idRenderTarget.height - y - height, width, height, pixels);
        device.updateEnd();

        const result: number[] = [];
        for (let i = 0; i < width * height; i++) {
            result.push(
                pixels[i * 4] |
                (pixels[i * 4 + 1] << 8) |
                (pixels[i * 4 + 2] << 16) |
                (pixels[i * 4 + 3] << 24)
            );
        }

        return result;
    }

    // Prepare for depth picking by rendering the specified splat
    prepareDepth(splat: Splat, camera: Entity) {
        if (!this.depthRenderTarget) {
            return;
        }

        const worldLayer = this.scene.app.scene.layers.getLayerByName('World');
        const emptyMap = new Map();

        // Hide non-selected elements
        const splats = this.scene.getElementsByType(ElementType.splat);
        splats.forEach((s: Splat) => {
            s.entity.enabled = s === splat;
        });

        // Set depth estimation mode uniform
        this.device.scope.resolve('depthEstimationMode').setValue(1);
        this.device.scope.resolve('pickMode').setValue(2); // 'set' mode - don't skip any visible splats

        // Render scene with depth pass
        this.renderPass.blendState = this.depthBlendState;
        this.renderPass.init(this.depthRenderTarget);
        this.renderPass.setClearColor(depthClearColor);
        this.renderPass.update(camera.camera, this.scene.app.scene, [worldLayer], emptyMap, false);
        this.renderPass.render();

        // Reset depth estimation mode
        this.device.scope.resolve('depthEstimationMode').setValue(0);

        // Re-enable all splats
        splats.forEach((s: Splat) => {
            s.entity.enabled = true;
        });
    }

    // Read normalized depth (0-1) at screen position (after prepareDepth)
    async readDepth(screenX: number, screenY: number): Promise<number | null> {
        if (!this.depthRenderTarget) {
            return null;
        }

        const rt = this.depthRenderTarget;
        const colorBuffer = rt.colorBuffer;
        const canvas = this.scene.canvas;

        // Convert screen coordinates to render target coordinates
        const x = Math.floor(screenX / canvas.clientWidth * rt.width);
        const y = Math.floor(screenY / canvas.clientHeight * rt.height);

        // Flip Y for texture read on WebGL (texture origin is bottom-left)
        const texY = this.device.isWebGL2 ? rt.height - y - 1 : y;

        // Read the pixel using Texture.read() which handles RGBA16F format
        const pixels = await colorBuffer.read(x, texY, 1, 1, { renderTarget: rt });

        // Convert half-float values to floats
        // R channel: accumulated depth * alpha
        // A channel: transmittance (1 - alpha)
        const r = half2Float(pixels[0]);
        const transmittance = half2Float(pixels[3]);
        const alpha = 1 - transmittance;

        // Check alpha (transmittance close to 1 means nothing visible)
        if (alpha < 1e-6) {
            return null;
        }

        // Return normalized depth (0-1 range)
        return r / alpha;
    }

    // Clean up resources
    destroy() {
        this.renderPass?.destroy();
    }
}

export { Picker };
