import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_L8,
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

const vertexShader = /*glsl*/`
uniform vec3 view_position;

uniform sampler2D splatColor;
uniform sampler2D splatState;

varying mediump vec2 texCoord;
varying mediump vec4 color;
flat varying highp uint vertexState;
#ifdef PICK_PASS
    flat varying highp uint vertexId;
#endif

mediump vec4 discardVec = vec4(0.0, 0.0, 2.0, 1.0);

void main(void)
{
    // calculate splat uv
    if (!calcSplatUV()) {
        gl_Position = discardVec;
        return;
    }

    // get center
    vec3 center = getCenter();

    // handle transforms
    mat4 model_view = matrix_view * matrix_model;
    vec4 splat_cam = model_view * vec4(center, 1.0);
    vec4 splat_proj = matrix_projection * splat_cam;

    // cull behind camera
    if (splat_proj.z < -splat_proj.w) {
        gl_Position = discardVec;
        return;
    }

    // get covariance
    vec3 covA, covB;
    getCovariance(covA, covB);

    vec4 v1v2 = calcV1V2(splat_cam.xyz, covA, covB, transpose(mat3(model_view)));

    // get color
    color = texelFetch(splatColor, splatUV, 0);

    // calculate scale based on alpha
    // float scale = min(1.0, sqrt(-log(1.0 / 255.0 / color.a)) / 2.0);

    // v1v2 *= scale;

    // early out tiny splats
    if (dot(v1v2.xy, v1v2.xy) < 4.0 && dot(v1v2.zw, v1v2.zw) < 4.0) {
        gl_Position = discardVec;
        return;
    }

    gl_Position = splat_proj + vec4((vertex_position.x * v1v2.xy + vertex_position.y * v1v2.zw) / viewport * splat_proj.w, 0, 0);

    texCoord = vertex_position.xy * 0.5; // * scale;

    #ifdef USE_SH1
        vec4 worldCenter = matrix_model * vec4(center, 1.0);
        vec3 viewDir = normalize((worldCenter.xyz / worldCenter.w - view_position) * mat3(matrix_model));
        color.xyz = max(color.xyz + evalSH(viewDir), 0.0);
    #endif

    #ifndef DITHER_NONE
        id = float(splatId);
    #endif

    vertexState = uint(texelFetch(splatState, splatUV, 0).r * 255.0);

    #ifdef PICK_PASS
        vertexId = splatId;
    #endif
}
`;

const fragmentShader = /*glsl*/`
varying mediump vec2 texCoord;
varying mediump vec4 color;

flat varying highp uint vertexState;
#ifdef PICK_PASS
    flat varying highp uint vertexId;
#endif

uniform float pickerAlpha;
uniform float ringSize;

void main(void)
{
    mediump float A = dot(texCoord, texCoord);
    if (A > 1.0) {
        discard;
    }

    mediump float B = exp(-A * 4.0) * color.a;

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
            // frozen/hidden
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

            if (ringSize > 0.0) {
                // rings mode
                if (A < 1.0 - ringSize) {
                    alpha = max(0.05, B);
                } else {
                    alpha = 0.6;
                }
            } else {
                // centers mode
                alpha = B;
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
const mat3 = new Mat3();

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
                vertex: vertexShader,
                fragment: fragmentShader,
                defines: ['USE_SH1', 'USE_SH2', 'USE_SH3'].splice(0, bands)
            };
        };

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

        this.rebuildMaterial = (bands: number) => {
            // @ts-ignore
            instance.createMaterial(getMaterialOptions(instance.splat.hasSH ? bands : 0));

            const material = instance.material;
            material.setParameter('splatState', this.stateTexture);
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

        const center = this.localBoundStorage.center;
        this.entity.getWorldTransform().transformPoint(center, vec);

        this.pivot.setLocalPosition(vec);
        this.entity.setLocalPosition(-vec.x, -vec.y, -vec.z);

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
        mat.invert(this.entity.getWorldTransform()).transformPoint(position, veca);
        this.entity.getLocalRotation().transformVector(veca, veca);
        this.entity.setLocalPosition(-veca.x, -veca.y, -veca.z);
        this.pivot.setLocalPosition(position);

        this.scene.events.fire('splat.moved', this);
    }

    getPivot() {
        return this.pivot.getLocalPosition();
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
