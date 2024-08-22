import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_L8,
    PIXELFORMAT_RGBA32U,
    Asset,
    BoundingBox,
    Color,
    Entity,
    GSplatData,
    GSplatResource,
    Mat3,
    Mat4,
    Quat,
    Texture,
    Vec3
} from 'playcanvas';
import { Element, ElementType } from "./element";
import { SplatDebug } from "./splat-debug";
import { Serializer } from "./serializer";
import { State } from './edit-ops';
import { SHRotation } from './sh-utils';

const vertexShader = /*glsl*/`

uniform sampler2D splatState;
uniform vec3 view_position;

flat varying highp uint vertexState;

#ifdef PICK_PASS
flat varying highp uint vertexId;
#endif

#if defined(USE_SH1)
    uniform highp usampler2D splatSH_1to3;
#if defined(USE_SH2)
    uniform highp usampler2D splatSH_4to7;
    uniform highp usampler2D splatSH_8to11;
#if defined(USE_SH3)
    uniform highp usampler2D splatSH_12to15;
#endif
#endif
#endif

#define SH_C0 0.28209479177387814f

#define SH_C1 0.4886025119029199f

#define SH_C2_0 1.0925484305920792f
#define SH_C2_1 -1.0925484305920792f
#define SH_C2_2 0.31539156525252005f
#define SH_C2_3 -1.0925484305920792f
#define SH_C2_4 0.5462742152960396f

#define SH_C3_0 -0.5900435899266435f
#define SH_C3_1 2.890611442640554f
#define SH_C3_2 -0.4570457994644658f
#define SH_C3_3 0.3731763325901154f
#define SH_C3_4 -0.4570457994644658f
#define SH_C3_5 1.445305721320277f
#define SH_C3_6 -0.5900435899266435f

vec3 unpack111011(uint bits) {
    return vec3(
        float(bits >> 21u) / 2047.0,
        float((bits >> 11u) & 0x3ffu) / 1023.0,
        float(bits & 0x7ffu) / 2047.0
    );
}


// fetch quantized spherical harmonic coefficients
void fetchScale(in highp usampler2D sampler, out float scale, out vec3 a, out vec3 b, out vec3 c) {
    uvec4 t = texelFetch(sampler, splatUV, 0);
    scale = uintBitsToFloat(t.x);
    a = unpack111011(t.y) * 2.0 - 1.0;
    b = unpack111011(t.z) * 2.0 - 1.0;
    c = unpack111011(t.w) * 2.0 - 1.0;
}

// fetch quantized spherical harmonic coefficients
void fetch(in highp usampler2D sampler, out vec3 a, out vec3 b, out vec3 c, out vec3 d) {
    uvec4 t = texelFetch(sampler, splatUV, 0);
    a = unpack111011(t.x) * 2.0 - 1.0;
    b = unpack111011(t.y) * 2.0 - 1.0;
    c = unpack111011(t.z) * 2.0 - 1.0;
    d = unpack111011(t.w) * 2.0 - 1.0;
}

vec4 evalColor(vec3 dir) {
    float x = dir.x;
    float y = dir.y;
    float z = dir.z;

    vec3 result = vec3(0.0);

    // see https://github.com/graphdeco-inria/gaussian-splatting/blob/main/utils/sh_utils.py
#if defined(USE_SH1)
    // 1st degree
    float scale;
    vec3 sh1, sh2, sh3;
    fetchScale(splatSH_1to3, scale, sh1, sh2, sh3);
    result += SH_C1 * (-sh1 * y + sh2 * z - sh3 * x);

#if defined(USE_SH2)
    float xx = x * x;
    float yy = y * y;
    float zz = z * z;
    float xy = x * y;
    float yz = y * z;
    float xz = x * z;

    // 2nd degree
    vec3 sh4, sh5, sh6, sh7;
    vec3 sh8, sh9, sh10, sh11;
    fetch(splatSH_4to7, sh4, sh5, sh6, sh7);
    fetch(splatSH_8to11, sh8, sh9, sh10, sh11);
    result +=
        sh4 * (SH_C2_0 * xy) *  +
        sh5 * (SH_C2_1 * yz) +
        sh6 * (SH_C2_2 * (2.0 * zz - xx - yy)) +
        sh7 * (SH_C2_3 * xz) +
        sh8 * (SH_C2_4 * (xx - yy));

#if defined(USE_SH3)
    // 3rd degree
    vec3 sh12, sh13, sh14, sh15;
    fetch(splatSH_12to15, sh12, sh13, sh14, sh15);
    result +=
        sh9  * (SH_C3_0 * y * (3.0 * xx - yy)) +
        sh10 * (SH_C3_1 * xy * z) +
        sh11 * (SH_C3_2 * y * (4.0 * zz - xx - yy)) +
        sh12 * (SH_C3_3 * z * (2.0 * zz - 3.0 * xx - 3.0 * yy)) +
        sh13 * (SH_C3_4 * x * (4.0 * zz - xx - yy)) +
        sh14 * (SH_C3_5 * z * (xx - yy)) +
        sh15 * (SH_C3_6 * x * (xx - 3.0 * yy));
#endif
#endif
    result *= scale;
#endif

    vec4 color = texelFetch(splatColor, splatUV, 0);

    return vec4(max(result + color.rgb, 0.0), color.a);
}

vec4 discardVec = vec4(0.0, 0.0, 2.0, 1.0);

void main(void)
{
    // calculate splat uv
    if (!calcSplatUV()) {
        gl_Position = discardVec;
        return;
    }

    // read data
    readData();

    vec4 pos;
    if (!evalSplat(pos)) {
        gl_Position = discardVec;
        return;
    }

    gl_Position = pos;

    texCoord = vertex_position.xy;

    #ifndef DITHER_NONE
        id = float(splatId);
    #endif

    vertexState = uint(texelFetch(splatState, splatUV, 0).r * 255.0);

    vec4 worldPos = matrix_model * vec4(center, 1.0);
    vec3 worldDir = worldPos.xyz / worldPos.w - view_position;
    vec3 modelDir = normalize(worldDir * mat3(matrix_model));

    color = evalColor(modelDir);

    #ifdef PICK_PASS
        vertexId = splatId;
    #endif
}
`;

const fragmentShader = /*glsl*/`

#ifdef PICK_PASS
    flat varying highp uint vertexId;
#endif

flat varying highp uint vertexState;

uniform float pickerAlpha;
uniform float ringSize;
float PI = 3.14159;

void main(void)
{
    if ((vertexState & 4u) == 4u) {
        // deleted
        discard;
    }

    float A = dot(texCoord, texCoord);
    if (A > 4.0) {
        discard;
    }

    float B = exp(-A) * color.a;

    #ifdef PICK_PASS
        if (B < pickerAlpha || (vertexState & 2u) == 2u) {
            // hidden
            discard;
        }
        gl_FragColor = vec4(
            float(vertexId & 255u) / 255.0,
            float((vertexId >> 8) & 255u) / 255.0,
            float((vertexId >> 16) & 255u) / 255.0,
            float((vertexId >> 24) & 255u) / 255.0
        );
    #else
        vec3 c;
        float alpha;

        if ((vertexState & 2u) == 2u) {
            // hidden
            c = vec3(0.0, 0.0, 0.0);
            alpha = B * 0.05;
        } else {
            if ((vertexState & 1u) == 1u) {
                // selected
                c = vec3(1.0, 1.0, 0.0);
            } else {
                // normal
                c = color.xyz;
            }

            alpha = B;

            if (ringSize > 0.0) {
                if (A < 4.0 - ringSize * 4.0) {
                    alpha = max(0.05, B);
                } else {
                    alpha = 0.6;
                }
            }
        }

        gl_FragColor = vec4(c, alpha);
    #endif
}
`;

const vec = new Vec3();
const veca = new Vec3();
const vecb = new Vec3();
const mat = new Mat4();

const boundingPoints =
    [-1, 1].map((x) => {
        return [-1, 1].map((y) => {
            return [-1, 1].map((z) => {
                return [
                    new Vec3(x, y, z), new Vec3(x * 0.75, y, z),
                    new Vec3(x, y, z), new Vec3(x, y * 0.75, z),
                    new Vec3(x, y, z), new Vec3(x, y, z * 0.75)
                ];
            });
        });
    }).flat(3);

class Splat extends Element {
    asset: Asset;
    splatData: GSplatData;
    splatDebug: SplatDebug;
    pivot: Entity;
    entity: Entity;
    changedCounter = 0;
    stateTexture: Texture;
    localBoundStorage: BoundingBox;
    worldBoundStorage: BoundingBox;
    localBoundDirty = true;
    worldBoundDirty = true;
    visible_ = true;

    rebuildMaterial: (bands: number) => void;

    constructor(asset: Asset) {
        super(ElementType.splat);

        const splatResource = asset.resource as GSplatResource;
        const splatData = splatResource.splatData;

        // get material options object for a shader that renders with the given number of bands
        const getMaterialOptions = (bands: number) => {
            return {
                vertex: [
                    bands > 0 ? '#define USE_SH1' : '',
                    bands > 1 ? '#define USE_SH2' : '',
                    bands > 2 ? '#define USE_SH3' : '',
                    vertexShader
                ].join('\n'),
                fragment: fragmentShader
            };
        };

        const src: Float32Array[] = [];
        for (let i = 0; i < 45; ++i) {
            src.push(splatData.getProp(`f_rest_${i}`) as Float32Array);
        }

        const hasSH = src.every((x) => x);

        this.asset = asset;
        this.splatData = splatData;
        this.pivot = new Entity('splatPivot');
        this.entity = splatResource.instantiate(getMaterialOptions(0));

        const instance = this.entity.gsplat.instance;

        // added per-splat state channel
        // bit 1: selected
        // bit 2: deleted
        // bit 3: hidden
        this.splatData.addProp('state', new Uint8Array(this.splatData.numSplats));

        const w = instance.splat.colorTexture.width;
        const h = instance.splat.colorTexture.height;

        // pack spherical harmonic data
        const createTexture = (name: string, format: number) => {
            return new Texture(splatResource.device, {
                name: name,
                width: w,
                height: h,
                format: format,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        };

        // create the state texture
        this.stateTexture = createTexture('splatState', PIXELFORMAT_L8);

        let sh1to3: Texture;
        let sh4to7: Texture;
        let sh8to11: Texture;
        let sh12to15: Texture;

        // expect all SH or none
        if (hasSH) {
            // apply load-time transform to SH coefficients
            const m4 = new Mat4();
            m4.setScale(-1, -1, 1);

            const m3 = new Mat3();
            m3.setFromMat4(m4);

            const rot = new SHRotation(m3);

            const sh = [];
            for (let i = 0; i < this.splatData.numSplats; ++i) {
                for (let c = 0; c < 3; ++c) {
                    for (let d = 0; d < 15; ++d) {
                        sh[d + 1] = src[c * 15 + d][i];
                    }

                    rot.apply(sh, sh);

                    for (let d = 0; d < 15; ++d) {
                        src[c * 15 + d][i] = sh[d + 1];
                    }
                }
            }

            // create the spherical harmonic textures
            sh1to3 = createTexture('splatSH_1to3', PIXELFORMAT_RGBA32U);
            sh4to7 = createTexture('splatSH_4to7', PIXELFORMAT_RGBA32U);
            sh8to11 = createTexture('splatSH_8to11', PIXELFORMAT_RGBA32U);
            sh12to15 = createTexture('splatSH_12to15', PIXELFORMAT_RGBA32U);

            const sh1to3Data = sh1to3.lock();
            const sh4to7Data = sh4to7.lock();
            const sh8to11Data = sh8to11.lock();
            const sh12to15Data = sh12to15.lock();

            const packUnorm = (value: number, bits: number) => {
                const t = (1 << bits) - 1;
                return Math.max(0, Math.min(t, Math.floor(value * t + 0.5)));
            };

            const pack = (coef: number, idx: number, m: number) => {
                const r = src[coef     ][idx] / m;
                const g = src[coef + 15][idx] / m;
                const b = src[coef + 30][idx] / m;

                return packUnorm(r * 0.5 + 0.5, 11) << 21 |
                       packUnorm(g * 0.5 + 0.5, 10) << 11 |
                       packUnorm(b * 0.5 + 0.5, 11);
            };

            const float32 = new Float32Array(1);
            const uint32 = new Uint32Array(float32.buffer);

            for (let i = 0; i < this.splatData.numSplats; ++i) {
                let m = Math.abs(src[0][i]);
                for (let j = 1; j < 45; ++j) {
                    m = Math.max(m, Math.abs(src[j][i]));
                }

                if (m === 0) {
                    continue;
                }

                float32[0] = m;

                sh1to3Data[i * 4 + 0] = uint32[0];
                sh1to3Data[i * 4 + 1] = pack(0, i, m);
                sh1to3Data[i * 4 + 2] = pack(1, i, m);
                sh1to3Data[i * 4 + 3] = pack(2, i, m);

                sh4to7Data[i * 4 + 0] = pack(3, i, m);
                sh4to7Data[i * 4 + 1] = pack(4, i, m);
                sh4to7Data[i * 4 + 2] = pack(5, i, m);
                sh4to7Data[i * 4 + 3] = pack(6, i, m);

                sh8to11Data[i * 4 + 0] = pack(7, i, m);
                sh8to11Data[i * 4 + 1] = pack(8, i, m);
                sh8to11Data[i * 4 + 2] = pack(9, i, m);
                sh8to11Data[i * 4 + 3] = pack(10, i, m);

                sh12to15Data[i * 4 + 0] = pack(11, i, m);
                sh12to15Data[i * 4 + 1] = pack(12, i, m);
                sh12to15Data[i * 4 + 2] = pack(13, i, m);
                sh12to15Data[i * 4 + 3] = pack(14, i, m);
            }

            sh1to3.unlock();
            sh4to7.unlock();
            sh8to11.unlock();
            sh12to15.unlock();
        }

        this.rebuildMaterial = (bands: number) => {
            const instance = this.entity.gsplat.instance;
            instance.createMaterial(getMaterialOptions(hasSH ? bands : 0));

            const material = instance.material;
            material.setParameter('splatState', this.stateTexture);

            if (hasSH) {
                material.setParameter(`splatSH_1to3`, sh1to3);
                material.setParameter(`splatSH_4to7`, sh4to7);
                material.setParameter(`splatSH_8to11`, sh8to11);
                material.setParameter(`splatSH_12to15`, sh12to15);
            }

            material.update();
        };

        this.localBoundStorage = instance.splat.aabb;
        this.worldBoundStorage = instance.meshInstance._aabb;

        instance.meshInstance._updateAabb = false;

        // when sort changes, re-render the scene
        instance.sorter.on('updated', () => {
            this.changedCounter++;
        });

        this.pivot.addChild(this.entity);
    }

    destroy() {
        super.destroy();
        this.pivot.destroy();
        this.asset.registry.remove(this.asset);
        this.asset.unload();
    }

    updateState(recalcBound = false) {
        const state = this.splatData.getProp('state') as Uint8Array;

        // write state data to gpu texture
        const data = this.stateTexture.lock();
        data.set(state);
        this.stateTexture.unlock();

        // update splat debug visual
        this.splatDebug.update();

        // handle splats being added or removed
        if (recalcBound) {
            this.localBoundDirty = true;
            this.worldBoundDirty = true;
            this.scene.boundDirty = true;

            // count number of still-visible splats
            let numSplats = 0;
            for (let i = 0; i < state.length; ++i) {
                if ((state[i] & State.deleted) === 0) {
                    numSplats++;
                }
            }

            let mapping;

            // create a sorter mapping to remove deleted splats
            if (numSplats !== state.length) {
                mapping = new Uint32Array(numSplats);
                let idx = 0;
                for (let i = 0; i < state.length; ++i) {
                    if ((state[i] & State.deleted) === 0) {
                        mapping[idx++] = i;
                    }
                }
            }

            // update sorting instance
            this.entity.gsplat.instance.sorter.setMapping(mapping);
        }

        this.scene.forceRender = true;

        this.scene.events.fire('splat.stateChanged', this);
    }

    get worldTransform() {
        return this.entity.getWorldTransform();
    }

    get filename() {
        return this.asset.file.filename;
    }

    getSplatWorldPosition(splatId: number, result: Vec3) {
        if (splatId >= this.splatData.numSplats) {
            return false;
        }

        result.set(
            this.splatData.getProp('x')[splatId],
            this.splatData.getProp('y')[splatId],
            this.splatData.getProp('z')[splatId]
        );

        this.worldTransform.transformPoint(result, result);

        return true;
    }

    add() {
        this.splatDebug = new SplatDebug(this.scene, this.entity, this.splatData);

        // add the entity to the scene
        this.scene.contentRoot.addChild(this.pivot);

        const localBound = this.localBoundStorage;
        this.pivot.setLocalPosition(localBound.center.x, localBound.center.y, localBound.center.z);
        this.entity.setLocalPosition(-localBound.center.x, -localBound.center.y, -localBound.center.z);

        this.localBoundDirty = true;
        this.worldBoundDirty = true;
        this.scene.boundDirty = true;

        this.scene.events.on('view.bands', this.rebuildMaterial, this);
        this.rebuildMaterial(this.scene.events.invoke('view.bands'));
    }

    remove() {
        this.splatDebug.destroy();
        this.splatDebug = null;

        this.scene.events.off('view.bands', this.rebuildMaterial, this);

        this.scene.contentRoot.removeChild(this.pivot);
        this.scene.boundDirty = true;
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.pivot.getWorldTransform().data);
        serializer.pack(this.changedCounter);
        serializer.pack(this.visible);
    }

    onPreRender() {
        const events = this.scene.events;
        const selected = events.invoke('selection') === this;
        const cameraMode = events.invoke('camera.mode');
        const splatSize = events.invoke('camera.debug') ? events.invoke('camera.splatSize') : 0;

        // configure rings rendering
        const material = this.entity.gsplat.instance.material;
        material.setParameter('ringSize', (selected && cameraMode === 'rings' && splatSize > 0) ? 0.04 : 0);

        if (this.visible && selected) {
            // render splat centers
            if (cameraMode === 'centers' && splatSize > 0) {
                this.splatDebug.splatSize = splatSize;
                this.scene.app.drawMeshInstance(this.splatDebug.meshInstance);
            }

            // render bounding box
            if (events.invoke('camera.bound')) {
                const bound = this.localBound;
                const scale = new Mat4().setTRS(bound.center, Quat.IDENTITY, bound.halfExtents);
                scale.mul2(this.entity.getWorldTransform(), scale);

                for (let i = 0; i < boundingPoints.length / 2; i++) {
                    const a = boundingPoints[i * 2];
                    const b = boundingPoints[i * 2 + 1];
                    scale.transformPoint(a, veca);
                    scale.transformPoint(b, vecb);

                    this.scene.app.drawLine(veca, vecb, Color.WHITE, true, this.scene.debugLayer);
                }
            }
        }

        this.pivot.enabled = this.visible;
    }

    focalPoint() {
        return this.asset.resource?.getFocalPoint?.();
    }

    move(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        const pivot = this.pivot;
        if (position) {
            pivot.setLocalPosition(position);
        }
        if (rotation) {
            pivot.setLocalRotation(rotation);
        }
        if (scale) {
            pivot.setLocalScale(scale);
        }

        this.worldBoundDirty = true;
        this.scene.boundDirty = true;

        this.scene.events.fire('splat.moved', this);
    }

    // get local space bound
    get localBound() {
        if (this.localBoundDirty) {
            const state = this.splatData.getProp('state') as Uint8Array;
            const localBound = this.localBoundStorage;

            if (!this.splatData.calcAabb(localBound, (i: number) => (state[i] & State.deleted) === 0)) {
                localBound.center.set(0, 0, 0);
                localBound.halfExtents.set(0.5, 0.5, 0.5);
            }

            this.localBoundDirty = false;

            // align the pivot point to the splat center
            this.entity.getWorldTransform().transformPoint(localBound.center, vec);
            this.setPivot(vec);
        }

        return this.localBoundStorage;
    }

    // get world space bound
    get worldBound() {
        if (this.worldBoundDirty) {
            // calculate meshinstance aabb (transformed local bound)
            this.worldBoundStorage.setFromTransformedAabb(this.localBound, this.entity.getWorldTransform());

            // flag scene bound as dirty
            this.worldBoundDirty = false;
        }

        return this.worldBoundStorage;
    }

    // set the world-space location of the pivot point
    setPivot(position: Vec3) {
        const world = this.entity.getWorldTransform();
        mat.invert(world);
        mat.transformPoint(position, veca);
        this.entity.setLocalPosition(-veca.x, -veca.y, -veca.z);
        this.pivot.setLocalPosition(position);

        this.scene.events.fire('splat.moved', this);
    }

    get visible() {
        return this.visible_;
    }

    set visible(value: boolean) {
        if (value !== this.visible) {
            this.visible_ = value;
            this.scene.events.fire('splat.vis', this);
        }
    }
}

export { Splat };
