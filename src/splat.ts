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

uniform sampler2D splatState;

flat varying highp uint vertexState;

#ifdef PICK_PASS
flat varying highp uint vertexId;
#endif

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
    color = getColor();

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

#ifdef PICK_PASS
    flat varying highp uint vertexId;
#endif

flat varying highp uint vertexState;

uniform float pickerAlpha;
uniform float ringSize;
float PI = 3.14159;

void main(void)
{
    if ((vertexState & uint(4)) == uint(4)) {
        // deleted
        discard;
    }

    float A = dot(texCoord, texCoord);
    if (A > 4.0) {
        discard;
    }
    float B = exp(-A) * color.a;
    #ifdef PICK_PASS
        if (B < pickerAlpha ||
            // hidden
            (vertexState & uint(2)) == uint(2)) {
            discard;
        }
        gl_FragColor = vec4(
            float(vertexId & uint(255)) / 255.0,
            float((vertexId >> 8) & uint(255)) / 255.0,
            float((vertexId >> 16) & uint(255)) / 255.0,
            float((vertexId >> 24) & uint(255)) / 255.0
        );
    #else
        vec3 c;
        float alpha;

        if ((vertexState & uint(2)) == uint(2)) {
            // hidden
            c = vec3(0.0, 0.0, 0.0);
            alpha = B * 0.05;
        } else {
            if ((vertexState & uint(1)) == uint(1)) {
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

    constructor(asset: Asset) {
        super(ElementType.splat);

        const splatResource = asset.resource as GSplatResource;

        this.asset = asset;
        this.splatData = splatResource.splatData;
        this.pivot = new Entity('splatPivot');
        this.entity = splatResource.instantiate({
            vertex: vertexShader,
            fragment: fragmentShader
        });

        const instance = this.entity.gsplat.instance;

        // added per-splat state channel
        // bit 1: selected
        // bit 2: deleted
        // bit 3: hidden
        this.splatData.addProp('state', new Uint8Array(this.splatData.numSplats));

        // create the state texture
        this.stateTexture = new Texture(splatResource.device, {
            name: 'splatState',
            width: instance.splat.colorTexture.width,
            height: instance.splat.colorTexture.height,
            format: PIXELFORMAT_L8,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });

        this.localBoundStorage = instance.splat.aabb;
        this.worldBoundStorage = instance.meshInstance._aabb;

        instance.meshInstance._updateAabb = false;

        instance.material.setParameter('splatState', this.stateTexture);

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
    }

    remove() {
        this.splatDebug.destroy();
        this.splatDebug = null;

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
