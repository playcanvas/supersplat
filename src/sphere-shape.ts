import {
    CULLFACE_FRONT,
    createShaderFromCode,
    BoundingBox,
    Entity,
    Material,
    Vec3
} from 'playcanvas';
import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader } from './shaders/sphere-shape-shader';

const v = new Vec3();
const bound = new BoundingBox();

class SphereShape extends Element {
    _radius = 1;
    pivot: Entity;
    material: Material;

    constructor() {
        super(ElementType.debug);

        this.pivot = new Entity('spherePivot');
        this.pivot.addComponent('render', {
            type: 'box'
        });
        const r = this._radius * 2;
        this.pivot.setLocalScale(r, r, r);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        const shader = createShaderFromCode(device, vertexShader, fragmentShader, 'sphere-shape');

        const material = new Material();
        material.shader = shader;
        material.cull = CULLFACE_FRONT;
        material.update();

        this.pivot.render.meshInstances[0].material = material;

        this.material = material;

        this.scene.contentRoot.addChild(this.pivot);

        this.updateBound();
    }

    remove() {
        this.scene.contentRoot.removeChild(this.pivot);
        this.scene.boundDirty = true;
    }

    destroy() {

    }

    serialize(serializer: Serializer): void {
        serializer.packa(this.pivot.getWorldTransform().data);
        serializer.pack(this.radius);
    }

    onPreRender() {
        this.pivot.getWorldTransform().getTranslation(v);
        this.material.setParameter('sphere', [v.x, v.y, v.z, this.radius]);

        const device = this.scene.graphicsDevice;
        device.scope.resolve('targetSize').setValue([device.width, device.height]);
    }

    moved() {
        this.updateBound();
    }

    updateBound() {
        bound.center.copy(this.pivot.getPosition());
        bound.halfExtents.set(this.radius, this.radius, this.radius);
        this.scene.boundDirty = true;
    }

    get worldBound(): BoundingBox | null {
        return bound;
    }

    set radius(radius: number) {
        this._radius = radius;

        const r = this._radius * 2;
        this.pivot.setLocalScale(r, r, r);

        this.updateBound();
    }

    get radius() {
        return this._radius;
    }
}

export { SphereShape };
