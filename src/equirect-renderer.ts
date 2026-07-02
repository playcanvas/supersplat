import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_LINEAR,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    SEMANTIC_POSITION,
    drawQuadWithShader,
    BlendState,
    GraphicsDevice,
    Quat,
    RenderTarget,
    Shader,
    ShaderUtils,
    Texture
} from 'playcanvas';

import { faceFov, vertexShader, fragmentShader } from './shaders/equirect-shader';

// renders the six cube faces of a panorama to individual 2d textures and
// projects them to an equirectangular target. faces are rendered wider than
// 90° (see shaders/equirect-shader.ts) so the projection can blend the
// overlap, feathering away per-face splat shape and sort order differences at
// face boundaries. face order and the (s, t) bases used by the projection
// shader are defined together in shaders/equirect-shader.ts.
class EquirectRenderer {
    // fov of each face camera in degrees; must match the projection shader
    static faceFov = faceFov;

    // capture-space rotations for the six face cameras: front (-Z), right (+X),
    // back (+Z), left (-X), up (+Y), down (-Y). multiply by the capture
    // orientation to get the world-space face rotation.
    static faceRotations = [
        new Quat().setFromEulerAngles(0, 0, 0),
        new Quat().setFromEulerAngles(0, -90, 0),
        new Quat().setFromEulerAngles(0, 180, 0),
        new Quat().setFromEulerAngles(0, 90, 0),
        new Quat().setFromEulerAngles(90, 0, 0),
        new Quat().setFromEulerAngles(-90, 0, 0)
    ];

    device: GraphicsDevice;
    faceTargets: RenderTarget[];
    equirectTarget: RenderTarget;
    shader: Shader;

    constructor(device: GraphicsDevice, faceSize: number, width: number, height: number) {
        this.device = device;

        const createTexture = (name: string, width: number, height: number, filter: number) => {
            return new Texture(device, {
                name,
                width,
                height,
                format: PIXELFORMAT_RGBA8,
                mipmaps: false,
                minFilter: filter,
                magFilter: filter,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        };

        this.faceTargets = [];
        for (let i = 0; i < 6; ++i) {
            this.faceTargets.push(new RenderTarget({
                colorBuffer: createTexture(`equirectFace${i}`, faceSize, faceSize, FILTER_LINEAR),
                depth: false,
                autoResolve: false
            }));
        }

        this.equirectTarget = new RenderTarget({
            colorBuffer: createTexture('equirectColor', width, height, FILTER_NEAREST),
            depth: false,
            autoResolve: false
        });

        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'equirectShader',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexGLSL: vertexShader,
            fragmentGLSL: fragmentShader
        });
    }

    // project the six captured faces to the equirectangular target
    project() {
        const { device, equirectTarget } = this;

        for (let i = 0; i < 6; ++i) {
            device.scope.resolve(`uFace${i}`).setValue(this.faceTargets[i].colorBuffer);
        }
        device.scope.resolve('uTargetSize').setValue([equirectTarget.width, equirectTarget.height]);

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, equirectTarget, this.shader);
    }

    // read the projected equirectangular pixels back to the cpu
    read(data: Uint8Array) {
        const { equirectTarget } = this;
        return equirectTarget.colorBuffer.read(0, 0, equirectTarget.width, equirectTarget.height, {
            renderTarget: equirectTarget,
            data
        });
    }

    destroy() {
        this.faceTargets.forEach((target) => {
            target.colorBuffer.destroy();
            target.destroy();
        });
        this.equirectTarget.colorBuffer.destroy();
        this.equirectTarget.destroy();
        this.faceTargets = [];
    }
}

export { EquirectRenderer };
