import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_L8,
    Asset,
    BoundingBox,
    Entity,
    GSplatData,
    GSplatResource,
    Quat,
    Texture,
    Vec3,
    WebglGraphicsDevice
} from 'playcanvas';
import { Element, ElementType } from "./element";
import { SplatDebug } from "./splat-debug";
import { Serializer } from "./serializer";
import { State } from './edit-ops';

const vertexShader = /*glsl*/`

uniform sampler2D splatState;

flat varying highp uint vertexState;
varying highp vec3 v_vertexPosition;

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
    v_vertexPosition = gl_Position;

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
varying vec3 vertexPosition;

uniform float pickerAlpha;
uniform float ringSize;
uniform float shCoefficients[9];
uniform vec3 baseColors[3];
uniform vec3 cameraPosition[3];

float PI = 3.14159;

// Function to calculate the SH color given its level 0 and 1 coeficients (0-8) and the direction of the camera to the vertex
vec3 sh(const vec3 sph[9], const in vec3 direction) {
  float x = direction.x;
  float y = direction.y;
  float z = direction.z;

  vec3 result = (
    sph[0] +

    sph[1] * x +
    sph[2] * y +
    sph[3] * z +

    sph[4] * z * x +
    sph[5] * y * z +
    sph[6] * y * x +
    sph[7] * (3.0 * z * z - 1.0) +
    sph[8] * (x*x - y*y)
  );

  return max(result, vec3(0.0));
}

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
                // Calculate the direction vector
                vec3 directionVector = cameraPosition - vertexPosition;
                vec3 normalizedDirectionVector = normalize(directionVector);

                // Calculate the SH information
                vec3 shvector = sh(shCoefficients, normalizedDirectionVector)

                // Mix SH information with the base color. Could use the baseColor uniform or the one given by the model
                c = color.xyz * shvector;
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
    splatDebug: SplatDebug;
    entity: Entity;
    root: Entity;
    changedCounter = 0;
    stateTexture: Texture;
    localBoundStorage: BoundingBox;
    worldBoundStorage: BoundingBox;
    localBoundDirty = true;
    worldBoundDirty = true;

    constructor(asset: Asset) {
        super(ElementType.splat);

        const splatResource = asset.resource as GSplatResource;

        this.asset = asset;
        this.splatData = splatResource.splatData;
        this.entity = new Entity('splatParent');

        // Filter the corresponding coeficient information

        const splatDataElements = this.splatData.elements[0];
        if (splatDataElements) {
            let resultCoeficients = [];
            let shKeys = ['f_rest_0', 'f_rest_1', 'f_rest_2', 'f_rest_3', 'f_rest_4', 'f_rest_5', 'f_rest_6', 'f_rest_7', 'f_rest_8'];
            const shFilteredObject = Object.fromEntries(Object.entries(splatDataElements).filter(([k]) => shKeys.includes(k)));
            let rgbKeys = ['f_dc_0', 'f_dc_1', 'f_dc_2'];
            const rgbFilteredObject = Object.fromEntries(Object.entries(splatDataElements).filter(([k]) => rgbKeys.includes(k)));
            //TO DO - Filter only by the index of an element and then use that to set the Uniforms.
            // this.scene.graphicsDevice.scope.resolve('shCoefficients').setValue(shFilteredObject);
            // this.scene.graphicsDevice.scope.resolve('baseColors').setValue(rgbFilteredObject);
        }

        this.root = splatResource.instantiate({
            vertex: vertexShader,
            fragment: fragmentShader
        });

        const instance = this.root.gsplat.instance;

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

        this.entity.addChild(this.root);
    }

    destroy() {
        super.destroy();
        this.entity.destroy();
        this.asset.registry.remove(this.asset);
        this.asset.unload();
    }

    updateState(recalcBound = false) {
        const state = this.splatData.getProp('state') as Uint8Array;
        const data = this.stateTexture.lock();
        data.set(state);
        this.stateTexture.unlock();

        this.splatDebug.update();

        if (recalcBound) {
            this.localBoundDirty = true;
            this.worldBoundDirty = true;
            this.scene.boundDirty = true;
        }

        this.scene.forceRender = true;
    }

    get worldTransform() {
        return this.root.getWorldTransform();
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
        this.splatDebug = new SplatDebug(this.scene, this.root, this.splatData);

        // add the entity to the scene
        this.scene.contentRoot.addChild(this.entity);

        const localBound = this.localBoundStorage;
        this.entity.setLocalPosition(localBound.center.x, localBound.center.y, localBound.center.z);
        this.root.setLocalPosition(-localBound.center.x, -localBound.center.y, -localBound.center.z);

        this.localBoundDirty = true;
        this.worldBoundDirty = true;
        this.scene.boundDirty = true;
    }

    remove() {
        this.splatDebug.destroy();
        this.splatDebug = null;

        this.scene.contentRoot.removeChild(this.entity);
        this.scene.boundDirty = true;
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.changedCounter);
    }

    onPreRender() {
        const events = this.scene.events;
        const selected = events.invoke('selection') === this;
        const cameraMode = events.invoke('camera.mode');
        const splatSize = events.invoke('splatSize');
        
        
        // configure rings rendering
        const material = this.root.gsplat.instance.material;
        material.setParameter('ringSize', (selected && cameraMode === 'rings' && splatSize > 0) ? 0.04 : 0);
        
        // Add coeficient values to the vertex
        const splatDataElements = this.splatData.elements[0];
        if(splatDataElements){
            let resultCoeficients = [];
        }
        material.setParameter('ringSize', (selected && cameraMode === 'rings' && splatSize > 0) ? 0.04 : 0);


        // render splat centers
        if (selected && cameraMode === 'centers' && splatSize > 0) {
            this.splatDebug.splatSize = splatSize;
            this.scene.app.drawMeshInstance(this.splatDebug.meshInstance);
        }
    }

    focalPoint() {
        return this.asset.resource?.getFocalPoint?.();
    }

    move(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        const entity = this.entity;
        if (position) {
            entity.setLocalPosition(position);
        }
        if (rotation) {
            entity.setLocalRotation(rotation);
        }
        if (scale) {
            entity.setLocalScale(scale);
        }

        this.worldBoundDirty = true;
        this.scene.boundDirty = true;
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
        }

        return this.localBoundStorage;
    }

    // get world space bound
    get worldBound() {
        if (this.worldBoundDirty) {
            const localBound = this.localBound;

            // calculate movement in local space
            vec.add2(this.root.getLocalPosition(), localBound.center);
            this.entity.getWorldTransform().transformVector(vec, vec);
            vec.add(this.entity.getLocalPosition());

            // update transforms so base entity node is oriented to the center of the mesh
            this.entity.setLocalPosition(vec);
            this.root.setLocalPosition(-localBound.center.x, -localBound.center.y, -localBound.center.z);

            // calculate meshinstance aabb (transformed local bound)
            this.worldBoundStorage.setFromTransformedAabb(localBound, this.root.getWorldTransform());

            // flag scene bound as dirty
            this.worldBoundDirty = false;
        }

        return this.worldBoundStorage;
    }
}

export { Splat };
