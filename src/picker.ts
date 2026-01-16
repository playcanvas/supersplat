import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ZERO,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    PROJECTION_ORTHOGRAPHIC,
    BlendState,
    Color,
    Entity,
    GraphicsDevice,
    Ray,
    RenderPassPicker,
    RenderTarget,
    Vec3,
    WebglGraphicsDevice
} from 'playcanvas';

import { ElementType } from './element';
import { Scene } from './scene';
import { Splat } from './splat';

// Work globals
const vec = new Vec3();
const vecb = new Vec3();
const ray = new Ray();

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

// Get the normalized world-space ray starting at the camera position
// facing the supplied screen position
// Works for both perspective and orthographic cameras
const getRay = (camera: Entity, screenX: number, screenY: number, outRay: Ray) => {
    const cameraPos = camera.getPosition();

    // Create the pick ray in world space
    if (camera.camera.projection === PROJECTION_ORTHOGRAPHIC) {
        camera.camera.screenToWorld(screenX, screenY, -1.0, vec);
        camera.camera.screenToWorld(screenX, screenY, 1.0, vecb);
        vecb.sub(vec).normalize();
        outRay.set(vec, vecb);
    } else {
        camera.camera.screenToWorld(screenX, screenY, 1.0, vec);
        vec.sub(cameraPos).normalize();
        outRay.set(cameraPos, vec);
    }
};

interface PickDepthResult {
    splat: Splat | null;
    position: Vec3;
    distance: number;
}

class Picker {
    private device: GraphicsDevice;
    private scene: Scene;

    // Render targets (provided by camera)
    private depthRenderTarget: RenderTarget | null = null;
    private idRenderTarget: RenderTarget | null = null;

    // Render passes
    private depthRenderPass: RenderPassPicker;
    private idRenderPass: RenderPassPicker;

    // Blend state for depth accumulation
    private depthBlendState: BlendState;

    constructor(scene: Scene) {
        this.scene = scene;
        this.device = scene.graphicsDevice;

        // Create render pass for depth picking
        this.depthRenderPass = new RenderPassPicker(this.device, this.scene.app.renderer);
        // RGB: additive depth accumulation (ONE, ONE_MINUS_SRC_ALPHA)
        // Alpha: multiplicative transmittance (ZERO, ONE_MINUS_SRC_ALPHA) -> T = T * (1 - alpha)
        this.depthBlendState = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA,           // RGB blend
            BLENDEQUATION_ADD, BLENDMODE_ZERO, BLENDMODE_ONE_MINUS_SRC_ALPHA           // Alpha blend (transmittance)
        );
        this.depthRenderPass.blendState = this.depthBlendState;

        // Create render pass for ID picking
        this.idRenderPass = new RenderPassPicker(this.device, this.scene.app.renderer);
    }

    // Set render targets from camera
    setRenderTargets(depthRT: RenderTarget, idRT: RenderTarget) {
        this.depthRenderTarget = depthRT;
        this.idRenderTarget = idRT;
    }

    // Prepare for ID picking by rendering the scene
    prepareIdPick(splat: Splat, op: 'add' | 'remove' | 'set') {
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
        this.device.scope.resolve('pickMode').setValue(['add', 'remove', 'set'].indexOf(op));
        this.device.scope.resolve('depthEstimationMode').setValue(0);

        // Render ID picking pass
        const emptyMap = new Map();
        this.idRenderPass.init(this.idRenderTarget);
        this.idRenderPass.update(this.scene.camera.entity.camera, this.scene.app.scene, [worldLayer], emptyMap, false);
        this.idRenderPass.render();

        // Re-enable all splats
        splats.forEach((s: Splat) => {
            s.entity.enabled = true;
        });
    }

    // Pick single splat ID at screen position
    pickId(x: number, y: number): number {
        return this.pickIdRect(x, y, 1, 1)[0];
    }

    // Pick rectangle of splat IDs
    pickIdRect(x: number, y: number, width: number, height: number): number[] {
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

    // Pick depth at screen position and return world position
    async pickDepth(screenX: number, screenY: number, cameraEntity: Entity): Promise<PickDepthResult | null> {
        if (!this.depthRenderTarget) {
            return null;
        }

        const { width, height } = this.depthRenderTarget;
        const canvas = this.scene.canvas;

        // Convert screen coordinates to render target coordinates
        const sx = Math.floor(screenX / canvas.clientWidth * width);
        const sy = Math.floor(screenY / canvas.clientHeight * height);

        // Render depth pass
        this.renderDepthPass(cameraEntity);

        // Read depth at position
        const depth = await this.readDepth(sx, sy, cameraEntity);

        if (depth === null) {
            return null;
        }

        // Construct ray from camera through screen point
        getRay(cameraEntity, screenX, screenY, ray);

        // Convert linear depth (view-space z distance) to ray distance
        const forward = cameraEntity.forward;
        const dotProduct = ray.direction.dot(forward);
        const t = depth / dotProduct;

        // World position = ray origin + ray direction * t
        const position = new Vec3();
        position.copy(ray.origin).add(vec.copy(ray.direction).mulScalar(t));

        // Find which splat is at this position (for compatibility with existing API)
        const splats = this.scene.getElementsByType(ElementType.splat);
        const closestSplat = splats.length > 0 ? splats[0] as Splat : null;

        return {
            splat: closestSplat,
            position: position,
            distance: t
        };
    }

    // Render depth pass for all splats
    private renderDepthPass(cameraEntity: Entity) {
        if (!this.depthRenderTarget) {
            return;
        }

        const worldLayer = this.scene.app.scene.layers.getLayerByName('World');
        const emptyMap = new Map();

        // Set depth estimation mode uniform
        this.device.scope.resolve('depthEstimationMode').setValue(1);
        this.device.scope.resolve('pickMode').setValue(2); // 'set' mode - don't skip any visible splats

        // Render scene with depth pass
        this.depthRenderPass.init(this.depthRenderTarget);
        this.depthRenderPass.setClearColor(depthClearColor);
        this.depthRenderPass.update(cameraEntity.camera, this.scene.app.scene, [worldLayer], emptyMap, false);
        this.depthRenderPass.render();

        // Reset depth estimation mode
        this.device.scope.resolve('depthEstimationMode').setValue(0);
    }

    // Read depth at a specific pixel and return linear depth value
    private async readDepth(x: number, y: number, cameraEntity: Entity): Promise<number | null> {
        if (!this.depthRenderTarget) {
            return null;
        }

        const rt = this.depthRenderTarget;
        const colorBuffer = rt.colorBuffer;

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

        // Get camera near/far for denormalization
        const near = cameraEntity.camera.nearClip;
        const far = cameraEntity.camera.farClip;

        // Divide by alpha to get normalized depth, then denormalize to linear depth
        const normalizedDepth = r / alpha;
        const depth = normalizedDepth * (far - near) + near;

        return depth;
    }

    // Clean up resources
    destroy() {
        this.depthRenderPass?.destroy();
        this.idRenderPass?.destroy();
    }
}

export { Picker, PickDepthResult };
