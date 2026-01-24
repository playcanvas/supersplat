import {
    ADDRESS_CLAMP_TO_EDGE,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_RGBA32F,
    SEMANTIC_POSITION,
    drawQuadWithShader,
    BoundingBox,
    GraphicsDevice,
    GSplatResource,
    Mat4,
    RenderTarget,
    ScopeSpace,
    Shader,
    ShaderUtils,
    Texture,
    Vec3,
    BlendState
} from 'playcanvas';

import { vertexShader as boundVS, fragmentShader as boundFS } from './shaders/bound-shader';
import { vertexShader as intersectionVS, fragmentShader as intersectionFS } from './shaders/intersection-shader';
import { vertexShader as positionVS, fragmentShader as positionFS } from './shaders/position-shader';
import { Splat } from './splat';

type MaskOptions = {
    mask: Texture;
};

type RectOptions = {
    rect: { x1: number, y1: number, x2: number, y2: number };
};

type SphereOptions = {
    sphere: { x: number, y: number, z: number, radius: number };
};

type BoxOptions = {
    box: { x: number, y: number, z: number, lenx: number, leny: number, lenz: number };
};

const v1 = new Vec3();
const v2 = new Vec3();
const v3 = new Vec3();
const v4 = new Vec3();

const resolve = (scope: ScopeSpace, values: any) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

type IntersectResources = {
    shader: Shader;
    texture: Texture;
    renderTarget: RenderTarget;
    data: Uint8Array;
};

type BoundResources = {
    shader: Shader;
    selectedMinTexture: Texture;
    selectedMaxTexture: Texture;
    visibleMinTexture: Texture;
    visibleMaxTexture: Texture;
    renderTarget: RenderTarget;
    selectedMinRenderTarget: RenderTarget;
    selectedMaxRenderTarget: RenderTarget;
    visibleMinRenderTarget: RenderTarget;
    visibleMaxRenderTarget: RenderTarget;
    selectedMinData: Float32Array;
    selectedMaxData: Float32Array;
    visibleMinData: Float32Array;
    visibleMaxData: Float32Array;
};

type PositionResources = {
    shader: Shader;
    texture: Texture;
    renderTarget: RenderTarget;
    data: Float32Array;
};

// gpu processor for splat data
class DataProcessor {
    device: GraphicsDevice;
    dummyTexture: Texture;
    viewProjectionMat = new Mat4();
    splatParams = new Int32Array(3);
    copyShader: Shader;

    // promise for pending bound calculation (serializes all calcBound calls)
    private calcBoundPromise: Promise<void> | null = null;

    getIntersectResources: (width: number, numSplats: number) => IntersectResources;
    getBoundResources: (splatTextureWidth: number) => BoundResources;
    getPositionResources: (width: number, height: number, numSplats: number) => PositionResources;

    constructor(device: GraphicsDevice) {
        this.device = device;
        this.dummyTexture = new Texture(device, {
            width: 1,
            height: 1,
            format: PIXELFORMAT_RGBA8
        });

        const createTexture = (name: string, width: number, height: number, format: number) => {
            return new Texture(device, {
                name,
                width,
                height,
                format,
                mipmaps: false,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        };

        this.copyShader = ShaderUtils.createShader(device, {
            uniqueName: 'copyShader',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexGLSL: `
                attribute vec2 vertex_position;
                void main(void) {
                    gl_Position = vec4(vertex_position, 0.0, 1.0);
                }
            `,
            fragmentGLSL: `
                uniform sampler2D colorTex;
                void main(void) {
                    ivec2 texel = ivec2(gl_FragCoord.xy);
                    gl_FragColor = texelFetch(colorTex, texel, 0);
                }
            `
        });

        // intersection test

        this.getIntersectResources = (() => {
            let shader: Shader = null;
            let texture: Texture = null;
            let renderTarget: RenderTarget = null;
            let data: Uint8Array = null;

            return (width: number, numSplats: number) => {
                if (!shader) {
                    shader = ShaderUtils.createShader(device, {
                        uniqueName: 'intersectByMaskShader',
                        attributes: {
                            vertex_position: SEMANTIC_POSITION
                        },
                        vertexGLSL: intersectionVS,
                        fragmentGLSL: intersectionFS
                    });
                }

                const resultWidth = Math.max(1, Math.floor(width / 2));
                const resultHeight = Math.ceil(numSplats / (resultWidth * 4));

                if (!texture || texture.width !== resultWidth || texture.height !== resultHeight) {
                    if (texture) {
                        texture.destroy();
                        renderTarget.destroy();
                    }

                    texture = createTexture('intersectTexture', resultWidth, resultHeight, PIXELFORMAT_RGBA8);
                    renderTarget = new RenderTarget({
                        colorBuffer: texture,
                        depth: false
                    });

                    data = new Uint8Array(resultWidth * resultHeight * 4);
                }

                return { shader, texture, renderTarget, data };
            };
        })();

        // calc bound

        this.getBoundResources = (() => {
            let shader: Shader = null;
            let selectedMinTexture: Texture = null;
            let selectedMaxTexture: Texture = null;
            let visibleMinTexture: Texture = null;
            let visibleMaxTexture: Texture = null;
            let renderTarget: RenderTarget = null;
            let selectedMinRenderTarget: RenderTarget = null;
            let selectedMaxRenderTarget: RenderTarget = null;
            let visibleMinRenderTarget: RenderTarget = null;
            let visibleMaxRenderTarget: RenderTarget = null;
            let selectedMinData: Float32Array = null;
            let selectedMaxData: Float32Array = null;
            let visibleMinData: Float32Array = null;
            let visibleMaxData: Float32Array = null;

            return (width: number) => {
                if (!shader) {
                    shader = ShaderUtils.createShader(device, {
                        uniqueName: 'calcBoundShader',
                        attributes: {
                            vertex_position: SEMANTIC_POSITION
                        },
                        vertexGLSL: boundVS,
                        fragmentGLSL: boundFS
                    });
                }

                if (!selectedMinTexture || selectedMinTexture.width !== width) {
                    if (selectedMinTexture) {
                        selectedMinTexture.destroy();
                        selectedMaxTexture.destroy();
                        visibleMinTexture.destroy();
                        visibleMaxTexture.destroy();
                        renderTarget.destroy();
                        selectedMinRenderTarget.destroy();
                        selectedMaxRenderTarget.destroy();
                        visibleMinRenderTarget.destroy();
                        visibleMaxRenderTarget.destroy();
                    }

                    selectedMinTexture = createTexture('calcBoundSelectedMin', width, 1, PIXELFORMAT_RGBA32F);
                    selectedMaxTexture = createTexture('calcBoundSelectedMax', width, 1, PIXELFORMAT_RGBA32F);
                    visibleMinTexture = createTexture('calcBoundVisibleMin', width, 1, PIXELFORMAT_RGBA32F);
                    visibleMaxTexture = createTexture('calcBoundVisibleMax', width, 1, PIXELFORMAT_RGBA32F);

                    renderTarget = new RenderTarget({
                        colorBuffers: [selectedMinTexture, selectedMaxTexture, visibleMinTexture, visibleMaxTexture],
                        depth: false
                    });

                    selectedMinRenderTarget = new RenderTarget({
                        colorBuffer: selectedMinTexture,
                        depth: false
                    });

                    selectedMaxRenderTarget = new RenderTarget({
                        colorBuffer: selectedMaxTexture,
                        depth: false
                    });

                    visibleMinRenderTarget = new RenderTarget({
                        colorBuffer: visibleMinTexture,
                        depth: false
                    });

                    visibleMaxRenderTarget = new RenderTarget({
                        colorBuffer: visibleMaxTexture,
                        depth: false
                    });

                    selectedMinData = new Float32Array(width * 4);
                    selectedMaxData = new Float32Array(width * 4);
                    visibleMinData = new Float32Array(width * 4);
                    visibleMaxData = new Float32Array(width * 4);
                }

                return {
                    shader,
                    selectedMinTexture,
                    selectedMaxTexture,
                    visibleMinTexture,
                    visibleMaxTexture,
                    renderTarget,
                    selectedMinRenderTarget,
                    selectedMaxRenderTarget,
                    visibleMinRenderTarget,
                    visibleMaxRenderTarget,
                    selectedMinData,
                    selectedMaxData,
                    visibleMinData,
                    visibleMaxData
                };
            };
        })();

        // calc position

        this.getPositionResources = (() => {
            let shader: Shader = null;
            let texture: Texture = null;
            let renderTarget: RenderTarget = null;
            let data: Float32Array = null;

            return (width: number, height: number, numSplats: number) => {
                if (!shader) {
                    shader = ShaderUtils.createShader(device, {
                        uniqueName: 'calcPositionShader',
                        attributes: {
                            vertex_position: SEMANTIC_POSITION
                        },
                        vertexGLSL: positionVS,
                        fragmentGLSL: positionFS
                    });
                }

                if (!texture || texture.width !== width || texture.height !== height) {
                    if (texture) {
                        texture.destroy();
                        renderTarget.destroy();
                    }

                    texture = createTexture('positionTex', width, height, PIXELFORMAT_RGBA32F);
                    renderTarget = new RenderTarget({
                        colorBuffer: texture,
                        depth: false
                    });
                    data = new Float32Array(width * height * 4);
                }

                return { shader, texture, renderTarget, data };
            };
        })();
    }

    // calculate the intersection of a mask canvas with splat centers
    async intersect(options: MaskOptions | RectOptions | SphereOptions | BoxOptions, splat: Splat) {
        const { device } = this;
        const { scope } = device;

        const numSplats = splat.splatData.numSplats;
        const transformA = (splat.entity.gsplat.instance.resource as GSplatResource).transformATexture;
        const splatTransform = splat.transformTexture;
        const transformPalette = splat.transformPalette.texture;

        // update view projection matrix
        const camera = splat.scene.camera.camera;
        this.viewProjectionMat.mul2(camera.projectionMatrix, camera.viewMatrix);

        // allocate resources
        const resources = this.getIntersectResources(transformA.width, numSplats);

        resolve(scope, {
            transformA,
            splatTransform,
            transformPalette,
            splat_params: [transformA.width, numSplats],
            matrix_model: splat.entity.getWorldTransform().data,
            matrix_viewProjection: this.viewProjectionMat.data,
            output_params: [resources.texture.width, resources.texture.height]
        });

        const maskOptions = options as MaskOptions;

        if (maskOptions.mask) {
            resolve(scope, {
                mode: 0,
                mask: maskOptions.mask,
                mask_params: [maskOptions.mask.width, maskOptions.mask.height]
            });
        } else {
            resolve(scope, {
                mask: this.dummyTexture,
                mask_params: [0, 0]
            });
        }

        const rectOptions = options as RectOptions;
        if (rectOptions.rect) {
            resolve(scope, {
                mode: 1,
                rect_params: [
                    rectOptions.rect.x1 * 2.0 - 1.0,
                    rectOptions.rect.y1 * 2.0 - 1.0,
                    rectOptions.rect.x2 * 2.0 - 1.0,
                    rectOptions.rect.y2 * 2.0 - 1.0
                ]
            });
        } else {
            resolve(scope, {
                rect_params: [0, 0, 0, 0]
            });
        }

        const sphereOptions = options as SphereOptions;
        if (sphereOptions.sphere) {
            resolve(scope, {
                mode: 2,
                sphere_params: [
                    sphereOptions.sphere.x,
                    sphereOptions.sphere.y,
                    sphereOptions.sphere.z,
                    sphereOptions.sphere.radius
                ]
            });
        } else {
            resolve(scope, {
                sphere_params: [0, 0, 0, 0]
            });
        }

        const boxOptions = options as BoxOptions;
        if (boxOptions.box) {
            resolve(scope, {
                mode: 3,
                box_params: [
                    boxOptions.box.x,
                    boxOptions.box.y,
                    boxOptions.box.z,
                    0
                ],
                aabb_params: [
                    boxOptions.box.lenx * 0.5,
                    boxOptions.box.leny * 0.5,
                    boxOptions.box.lenz * 0.5,
                    0
                ]
            });
        } else {
            resolve(scope, {
                box_params: [0, 0, 0, 0],
                aabb_params: [0, 0, 0, 0]
            });
        }

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, resources.renderTarget, resources.shader);

        const data = await resources.texture.read(0, 0, resources.texture.width, resources.texture.height, {
            renderTarget: resources.renderTarget,
            data: resources.data,
            immediate: true
        });

        return data;
    }

    // use gpu to calculate both selected and visible bounds in a single pass
    // (serialized - only one calculation runs at a time)
    async calcBound(splat: Splat, selectionBound: BoundingBox, localBound: BoundingBox): Promise<void> {
        // await any pending calculation to serialize
        if (this.calcBoundPromise) {
            await this.calcBoundPromise;
        }

        // run this calculation
        const promise = this.calcBoundInternal(splat, selectionBound, localBound);
        this.calcBoundPromise = promise;
        await promise;
        this.calcBoundPromise = null;
    }

    // internal implementation of calcBound
    private async calcBoundInternal(splat: Splat, selectionBound: BoundingBox, localBound: BoundingBox): Promise<void> {
        const device = splat.scene.graphicsDevice;
        const { scope } = device;

        const numSplats = splat.splatData.numSplats;
        const transformA = (splat.entity.gsplat.instance.resource as GSplatResource).transformATexture;
        const splatTransform = splat.transformTexture;
        const transformPalette = splat.transformPalette.texture;
        const splatState = splat.stateTexture;

        this.splatParams[0] = transformA.width;
        this.splatParams[1] = transformA.height;
        this.splatParams[2] = numSplats;

        // get resources
        const resources = this.getBoundResources(transformA.width);

        resolve(scope, {
            transformA,
            splatTransform,
            transformPalette,
            splatState,
            splat_params: this.splatParams
        });

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, resources.renderTarget, resources.shader);

        // read all 4 textures asynchronously using the public texture.read() API
        const [selectedMinData, selectedMaxData, visibleMinData, visibleMaxData] = await Promise.all([
            resources.selectedMinTexture.read(0, 0, transformA.width, 1, {
                renderTarget: resources.selectedMinRenderTarget,
                data: resources.selectedMinData,
                immediate: true
            }),
            resources.selectedMaxTexture.read(0, 0, transformA.width, 1, {
                renderTarget: resources.selectedMaxRenderTarget,
                data: resources.selectedMaxData,
                immediate: true
            }),
            resources.visibleMinTexture.read(0, 0, transformA.width, 1, {
                renderTarget: resources.visibleMinRenderTarget,
                data: resources.visibleMinData,
                immediate: true
            }),
            resources.visibleMaxTexture.read(0, 0, transformA.width, 1, {
                renderTarget: resources.visibleMaxRenderTarget,
                data: resources.visibleMaxData,
                immediate: true
            })
        ]);

        // resolve selected bounds
        v1.set(Infinity, Infinity, Infinity);
        v2.set(-Infinity, -Infinity, -Infinity);

        for (let i = 0; i < transformA.width; i++) {
            const a = selectedMinData[i * 4];
            const b = selectedMinData[i * 4 + 1];
            const c = selectedMinData[i * 4 + 2];
            if (isFinite(a)) v1.x = Math.min(v1.x, a);
            if (isFinite(b)) v1.y = Math.min(v1.y, b);
            if (isFinite(c)) v1.z = Math.min(v1.z, c);

            const d = selectedMaxData[i * 4];
            const e = selectedMaxData[i * 4 + 1];
            const f = selectedMaxData[i * 4 + 2];
            if (isFinite(d)) v2.x = Math.max(v2.x, d);
            if (isFinite(e)) v2.y = Math.max(v2.y, e);
            if (isFinite(f)) v2.z = Math.max(v2.z, f);
        }

        selectionBound.setMinMax(v1, v2);

        // resolve visible bounds
        v3.set(Infinity, Infinity, Infinity);
        v4.set(-Infinity, -Infinity, -Infinity);

        for (let i = 0; i < transformA.width; i++) {
            const a = visibleMinData[i * 4];
            const b = visibleMinData[i * 4 + 1];
            const c = visibleMinData[i * 4 + 2];
            if (isFinite(a)) v3.x = Math.min(v3.x, a);
            if (isFinite(b)) v3.y = Math.min(v3.y, b);
            if (isFinite(c)) v3.z = Math.min(v3.z, c);

            const d = visibleMaxData[i * 4];
            const e = visibleMaxData[i * 4 + 1];
            const f = visibleMaxData[i * 4 + 2];
            if (isFinite(d)) v4.x = Math.max(v4.x, d);
            if (isFinite(e)) v4.y = Math.max(v4.y, e);
            if (isFinite(f)) v4.z = Math.max(v4.z, f);
        }

        localBound.setMinMax(v3, v4);
    }

    // calculate world-space splat positions
    async calcPositions(splat: Splat) {
        const { device } = this;
        const { scope } = device;

        const numSplats = splat.splatData.numSplats;
        const transformA = (splat.entity.gsplat.instance.resource as GSplatResource).transformATexture;
        const splatTransform = splat.transformTexture;
        const transformPalette = splat.transformPalette.texture;

        // allocate resources
        const resources = this.getPositionResources(transformA.width, transformA.height, numSplats);

        resolve(scope, {
            transformA,
            splatTransform,
            transformPalette,
            splat_params: [transformA.width, numSplats]
        });

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, resources.renderTarget, resources.shader);

        const data = await resources.texture.read(0, 0, resources.texture.width, resources.texture.height, {
            renderTarget: resources.renderTarget,
            data: resources.data,
            immediate: true
        });

        return data;
    }

    copyRt(source: RenderTarget, dest: RenderTarget) {
        const { device } = this;

        resolve(device.scope, {
            colorTex: source.colorBuffer
        });

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, dest, this.copyShader);
    }
}

export { DataProcessor };
