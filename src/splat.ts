import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_L8,
    Asset,
    BoundingBox,
    Entity,
    GSplatData,
    GSplatResource,
    Texture,
    Vec3
} from 'playcanvas';
import { Element, ElementType } from "./element";
import { Serializer } from "./serializer";
import { State } from './edit-ops';

const vertexShader = /*glsl*/`

uniform sampler2D splatState;

flat varying highp uint vertexState;

#ifdef PICK_PASS
flat varying highp uint vertexId;
#endif

void main(void)
{
    // evaluate center of the splat in object space
    vec3 centerLocal = evalCenter();

    // evaluate the rest of the splat using world space center
    vec4 centerWorld = matrix_model * vec4(centerLocal, 1.0);

    gl_Position = evalSplat(centerWorld);

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

class Splat extends Element {
    asset: Asset;
    splatData: GSplatData;
    entity: Entity;
    root: Entity;
    changedCounter = 0;
    stateTexture: Texture;

    constructor(asset: Asset) {
        super(ElementType.splat);

        const splatResource = asset.resource as GSplatResource;

        this.asset = asset;
        this.splatData = splatResource.splatData;
        this.entity = new Entity('splatRoot');
        this.root = splatResource.instantiate({
            vertex: vertexShader,
            fragment: fragmentShader
        });

        // create the state texture
        this.stateTexture = new Texture(splatResource.device, {
            name: 'splatState',
            width: this.root.gsplat.instance.splat.colorTexture.width,
            height: this.root.gsplat.instance.splat.colorTexture.height,
            format: PIXELFORMAT_L8,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        splatResource.device.scope.resolve('splatState').setValue(this.stateTexture);

        // when sort changes, re-render the scene
        this.root.gsplat.instance.sorter.on('updated', () => {
            this.changedCounter++;
        });

        this.entity.addChild(this.root);
    }

    destroy() {
        super.destroy();
        this.entity.destroy();
        this.asset.registry.remove(this.asset);
        this.asset.unload();
    }

    updateState(state: Uint8Array) {
        const data = this.stateTexture.lock();
        data.set(state);
        this.stateTexture.unlock();
    }

    get localBound() {
        return this.root.gsplat.instance.splat.aabb;
    }

    get worldBound() {
        return this.root.gsplat.instance.meshInstance.aabb;
    }

    get worldTransform() {
        return this.root.getWorldTransform();
    }

    add() {
        // add the entity to the scene
        this.scene.contentRoot.addChild(this.entity);

        const localBound = this.localBound;
        this.entity.setLocalPosition(localBound.center.x, localBound.center.y, localBound.center.z);
        this.root.setLocalPosition(-localBound.center.x, -localBound.center.y, -localBound.center.z);
    }

    remove() {
        this.scene.contentRoot.removeChild(this.entity);
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.changedCounter);
    }

    calcBound(result: BoundingBox) {
        result.copy(this.worldBound);
        return true;
    }

    // recalculate the local space splat aabb and update engine/root transforms so it
    // remains centered on the splat but doesn't move in world space.
    recalcBound() {
        // it's faster to calculate bound of splat centers
        const state = this.splatData.getProp('state') as Uint8Array;

        const localBound = this.localBound;
        if (!this.splatData.calcAabb(localBound, (i: number) => (state[i] & State.deleted) === 0)) {
            localBound.center.set(0, 0, 0);
            localBound.halfExtents.set(0.5, 0.5, 0.5);
        }

        // calculate meshinstance aabb (transformed local bound)
        const meshInstance = this.root.gsplat.instance.meshInstance;
        meshInstance._aabb.setFromTransformedAabb(localBound, this.entity.getWorldTransform());

        // calculate movement in local space
        vec.add2(this.root.getLocalPosition(), localBound.center);
        this.entity.getWorldTransform().transformVector(vec, vec);
        vec.add(this.entity.getLocalPosition());

        // update transforms so base entity node is oriented to the center of the mesh
        this.entity.setLocalPosition(vec);
        this.root.setLocalPosition(-localBound.center.x, -localBound.center.y, -localBound.center.z);
    }

    focalPoint() {
        return this.asset.resource?.getFocalPoint?.();
    }
}

export { Splat };
