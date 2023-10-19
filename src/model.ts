import {
    Asset,
    BoundingBox,
    Entity,
    Mat4,
    Mesh,
    MeshInstance,
    RenderComponent,
    StandardMaterial,
    Vec3
} from 'playcanvas';
import {Element, ElementType} from './element';
import {Serializer} from './serializer';
import {Gem} from './gem';
import {Debug} from './debug';

// regex for detecting a left and a right shoe node, taken from vertebrae:
// https://github.sc-corp.net/Snapchat/arbiz-asset-service/blob/main/internal/app/arbizassetservice/utils/constants/default_model_spec.go#L34
const leftRegex = /left|_L$/i;
const rightRegex = /right|_R$/i;
const vec = new Vec3();
const mat = new Mat4();
const bound = new BoundingBox();

// calculate mesh sort distance by node origin (instead of the default bounding box origin)
const calculateSortDistance = (drawCall: any, cameraPosition: Vec3, cameraForward: Vec3) => {
    return vec.sub2(drawCall.node.getPosition(), cameraPosition).dot(cameraForward);
};

class Model extends Element {
    asset: Asset;
    gemMaterials: Set<StandardMaterial>;
    entity: Entity;
    root: any;
    animTracks: string[] = [];
    gemNodes: Entity[] = [];

    constructor(asset: Asset, gemMaterials: Set<StandardMaterial>) {
        super(ElementType.model);

        this.asset = asset;
        this.gemMaterials = gemMaterials;
        this.root = asset.resource.instantiateRenderEntity();
        this.entity = new Entity('modelRoot');
        this.entity.addChild(this.root);

        // initialize animations
        if (asset.resource.animations?.length > 0) {
            const anim = this.root.addComponent('anim', {
                activate: false,
                speed: 1.0
            });

            anim.rootBone = this.root;
            asset.resource.animations.forEach((animTrack: any, i: number) => {
                anim.assignAnimation(`track_${i}`, animTrack.resource);
                this.animTracks.push(animTrack.resource.name);
            });

            // automatically play the first animation
            this.play(0);
        }
    }

    calcBound(result: BoundingBox) {
        let valid = false;
        this.entity.findComponents('render').forEach((r: RenderComponent) => {
            if (r.entity.enabled) {
                r.meshInstances.forEach((meshInstance: MeshInstance) => {
                    if (!valid) {
                        valid = true;
                        result.copy(meshInstance.aabb);
                    } else {
                        result.add(meshInstance.aabb);
                    }
                });
            }
        });
        return valid;
    }

    play(track?: number) {
        const anim = this.root.anim;
        if (anim) {
            if (track) {
                anim.baseLayer.transition(`track_${track}`);
            }
            anim.playing = true;
            anim.baseLayer.play();
        }
    }

    pause() {
        const anim = this.root.anim;
        if (anim) {
            anim.playing = false;
            anim.baseLayer.pause();
        }
    }

    destroy() {
        super.destroy();
        this.entity.destroy();
        this.asset.registry.remove(this.asset);
        this.asset.unload();
    }

    add() {
        const config = this.scene.config;

        // TEMP: if this model is detected to contain a shoe, hide the left one
        const children = this.root.children;
        if (config.model.hideLeftShoe && children.length === 2) {
            const leftIndex =
                leftRegex.test(children[0].name) && rightRegex.test(children[1].name)
                    ? 0
                    : leftRegex.test(children[1].name) && rightRegex.test(children[0].name)
                    ? 1
                    : -1;
            if (leftIndex === 0 || leftIndex === 1) {
                children[leftIndex].enabled = false;
            }
        }

        this.initializeGems();

        // add the entity to the scene
        this.scene.contentRoot.addChild(this.entity);

        // manually add shadow casters to shadow layer
        this.entity.findComponents('render').forEach((component: RenderComponent) => {
            if (component.entity.enabled) {
                this.scene.shadowLayer.shadowCasters = this.scene.shadowLayer.shadowCasters.concat(
                    component.meshInstances
                );
            }

            // override default sort distance calculation
            component.meshInstances.forEach((meshInstance: MeshInstance) => {
                meshInstance.calculateSortDistance = calculateSortDistance;
            });
        });

        this.calcBound(bound);

        // center the object to the world origin
        if (bound) {
            vec.set(-bound.center.x, -bound.getMin().y, -bound.center.z);
        } else {
            vec.copy(Vec3.ZERO);
        }

        // apply model settings
        const p = config.model.position;
        const r = config.model.rotation;
        const s = config.model.scale;

        if (p) {
            vec.x += p.x;
            vec.y += p.y;
            vec.z += p.z;
        }
        this.entity.setLocalPosition(vec.x, vec.y, vec.z);
        if (r) this.entity.setLocalEulerAngles(r.x, r.y, r.z);
        if (s) this.entity.setLocalScale(s, s, s);
    }

    initializeGems() {
        if (this.gemMaterials.size === 0) {
            return;
        }

        const gems = new Map<Mesh, Gem>();

        // detect and process gem meshes
        this.root.forEach((node: Entity) => {
            node?.render?.meshInstances?.forEach((meshInstance: MeshInstance) => {
                const material = meshInstance.material as StandardMaterial;
                if (this.gemMaterials.has(material)) {
                    const mesh = meshInstance.mesh;

                    if (!gems.has(mesh)) {
                        gems.set(mesh, Gem.createFromMesh(mesh, this.scene.graphicsDevice));
                    }
                    const gem = gems.get(mesh);

                    meshInstance.mesh = gem.mesh;
                    meshInstance.material = gem.material;

                    const transform = node.getWorldTransform().clone().invert();
                    // @ts-ignore
                    meshInstance.setParameter('matrix_model_inverse', transform.data);
                    meshInstance.setParameter('gem_absorption', [
                        // convert baseColorFactor from sRGB to linear and scale for absorption
                        (1.0 - Math.pow(material.diffuse.r, 2.2)) * 600,
                        (1.0 - Math.pow(material.diffuse.g, 2.2)) * 600,
                        (1.0 - Math.pow(material.diffuse.b, 2.2)) * 600
                    ]);

                    this.gemNodes.push(node);
                }
            });
        });

        // print stats in debug mode only
        Debug.exec(() => {
            console.log(`gem types=${gems.size}, instances=${this.gemNodes.length}`);
        });
    }

    remove() {
        this.entity.findComponents('render').forEach((component: RenderComponent) => {
            this.scene.shadowLayer.shadowCasters = this.scene.shadowLayer.shadowCasters.filter(
                (meshInstance: MeshInstance) => {
                    return component.meshInstances.indexOf(meshInstance) === -1;
                }
            );
        });
        this.scene.contentRoot.removeChild(this.entity);
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.root?.anim?.baseLayer?.activeStateCurrentTime);
    }

    onUpdate(/* deltaTime: number */) {
        this.gemNodes.forEach((gemNode: Entity) => {
            mat.copy(gemNode.getWorldTransform());
            mat.invert();

            const param = gemNode.render.meshInstances[0].getParameter('matrix_model_inverse') as any;
            const matrixData = param.data as Float32Array;
            matrixData.set(mat.data);
        });
    }
}

export {Model};
