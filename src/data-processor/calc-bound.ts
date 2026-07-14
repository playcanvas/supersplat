import {
    ADDRESS_CLAMP_TO_EDGE,
    PIXELFORMAT_RGBA32F,
    SEMANTIC_POSITION,
    drawQuadWithShader,
    BoundingBox,
    GraphicsDevice,
    RenderTarget,
    ScopeSpace,
    Shader,
    ShaderUtils,
    Texture,
    Vec3,
    BlendState
} from 'playcanvas';

import { vertexShader, fragmentShader } from '../shaders/bound-shader';
import { Splat } from '../splat';

const v1 = new Vec3();
const v2 = new Vec3();
const v3 = new Vec3();
const v4 = new Vec3();

const resolve = (scope: ScopeSpace, values: any) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

class CalcBound {
    private device: GraphicsDevice;
    private splatParams = new Int32Array(3);
    private shader: Shader = null;
    private selectedMinTexture: Texture = null;
    private selectedMaxTexture: Texture = null;
    private visibleMinTexture: Texture = null;
    private visibleMaxTexture: Texture = null;
    private renderTarget: RenderTarget = null;
    private selectedMinRenderTarget: RenderTarget = null;
    private selectedMaxRenderTarget: RenderTarget = null;
    private visibleMinRenderTarget: RenderTarget = null;
    private visibleMaxRenderTarget: RenderTarget = null;
    private selectedMinData: Float32Array = null;
    private selectedMaxData: Float32Array = null;
    private visibleMinData: Float32Array = null;
    private visibleMaxData: Float32Array = null;

    constructor(device: GraphicsDevice) {
        this.device = device;
    }

    private getResources(width: number) {
        const { device } = this;

        if (!this.shader) {
            this.shader = ShaderUtils.createShader(device, {
                uniqueName: 'calcBoundShader',
                attributes: {
                    vertex_position: SEMANTIC_POSITION
                },
                vertexGLSL: vertexShader,
                fragmentGLSL: fragmentShader
            });
        }

        if (!this.selectedMinTexture || this.selectedMinTexture.width !== width) {
            if (this.selectedMinTexture) {
                this.selectedMinTexture.destroy();
                this.selectedMaxTexture.destroy();
                this.visibleMinTexture.destroy();
                this.visibleMaxTexture.destroy();
                this.renderTarget.destroy();
                this.selectedMinRenderTarget.destroy();
                this.selectedMaxRenderTarget.destroy();
                this.visibleMinRenderTarget.destroy();
                this.visibleMaxRenderTarget.destroy();
            }

            const createTexture = (name: string) => {
                return new Texture(device, {
                    name,
                    width,
                    height: 1,
                    format: PIXELFORMAT_RGBA32F,
                    mipmaps: false,
                    addressU: ADDRESS_CLAMP_TO_EDGE,
                    addressV: ADDRESS_CLAMP_TO_EDGE
                });
            };

            this.selectedMinTexture = createTexture('calcBoundSelectedMin');
            this.selectedMaxTexture = createTexture('calcBoundSelectedMax');
            this.visibleMinTexture = createTexture('calcBoundVisibleMin');
            this.visibleMaxTexture = createTexture('calcBoundVisibleMax');

            this.renderTarget = new RenderTarget({
                colorBuffers: [this.selectedMinTexture, this.selectedMaxTexture, this.visibleMinTexture, this.visibleMaxTexture],
                depth: false
            });

            this.selectedMinRenderTarget = new RenderTarget({
                colorBuffer: this.selectedMinTexture,
                depth: false
            });

            this.selectedMaxRenderTarget = new RenderTarget({
                colorBuffer: this.selectedMaxTexture,
                depth: false
            });

            this.visibleMinRenderTarget = new RenderTarget({
                colorBuffer: this.visibleMinTexture,
                depth: false
            });

            this.visibleMaxRenderTarget = new RenderTarget({
                colorBuffer: this.visibleMaxTexture,
                depth: false
            });

            this.selectedMinData = new Float32Array(width * 4);
            this.selectedMaxData = new Float32Array(width * 4);
            this.visibleMinData = new Float32Array(width * 4);
            this.visibleMaxData = new Float32Array(width * 4);
        }

        return {
            shader: this.shader,
            selectedMinTexture: this.selectedMinTexture,
            selectedMaxTexture: this.selectedMaxTexture,
            visibleMinTexture: this.visibleMinTexture,
            visibleMaxTexture: this.visibleMaxTexture,
            renderTarget: this.renderTarget,
            selectedMinRenderTarget: this.selectedMinRenderTarget,
            selectedMaxRenderTarget: this.selectedMaxRenderTarget,
            visibleMinRenderTarget: this.visibleMinRenderTarget,
            visibleMaxRenderTarget: this.visibleMaxRenderTarget,
            selectedMinData: this.selectedMinData,
            selectedMaxData: this.selectedMaxData,
            visibleMinData: this.visibleMinData,
            visibleMaxData: this.visibleMaxData
        };
    }

    async run(splat: Splat, selectionBound: BoundingBox, localBound: BoundingBox): Promise<void> {
        const device = splat.scene.graphicsDevice;
        const { scope } = device;

        const numSplats = splat.splatData.numSplats;
        const transformA = (splat.entity.gsplat.instance.resource as any).getTexture('transformA');
        const splatTransform = splat.transformTexture;
        const transformPalette = splat.transformPalette.texture;
        const splatState = splat.stateTexture;

        this.splatParams[0] = transformA.width;
        this.splatParams[1] = transformA.height;
        this.splatParams[2] = numSplats;

        // get resources
        const resources = this.getResources(transformA.width);

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
                immediate: false
            }),
            resources.selectedMaxTexture.read(0, 0, transformA.width, 1, {
                renderTarget: resources.selectedMaxRenderTarget,
                data: resources.selectedMaxData,
                immediate: false
            }),
            resources.visibleMinTexture.read(0, 0, transformA.width, 1, {
                renderTarget: resources.visibleMinRenderTarget,
                data: resources.visibleMinData,
                immediate: false
            }),
            resources.visibleMaxTexture.read(0, 0, transformA.width, 1, {
                renderTarget: resources.visibleMaxRenderTarget,
                data: resources.visibleMaxData,
                immediate: false
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
}

export { CalcBound };
