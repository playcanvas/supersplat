import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    CULLFACE_FRONT,
    BlendState,
    BoundingBox,
    Entity,
    ShaderMaterial,
    Vec3
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader } from './shaders/box-shape-shader';

const v = new Vec3();
const bound = new BoundingBox();

class BoxShape extends Element {
    _lenX = 1;
    _lenY = 1;
    _lenZ = 1;
    pivot: Entity;
    material: ShaderMaterial;

    constructor() {
        super(ElementType.debug);

        this.pivot = new Entity('boxPivot');
        this.pivot.addComponent('render', {
            type: 'box'
        });
        this.pivot.setLocalScale(this._lenX * 2, this._lenY * 2, this._lenZ * 2);
    }

    add() {
        const material = new ShaderMaterial({
            uniqueName: 'boxShape',
            vertexCode: vertexShader,
            fragmentCode: fragmentShader
        });
        material.cull = CULLFACE_FRONT;
        material.blendState = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA
        );
        material.update();

        this.pivot.render.meshInstances[0].material = material;
        this.pivot.render.layers = [this.scene.debugLayer.id];

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
        serializer.pack(this.lenX);
        serializer.pack(this.lenY);
        serializer.pack(this.lenZ);
    }

    onPreRender() {
        this.pivot.getWorldTransform().getTranslation(v);
        this.material.setParameter('box', [v.x, v.y, v.z, 0]);
        this.material.setParameter('aabb', [this._lenX, this._lenY, this._lenZ, 0]);

        const device = this.scene.graphicsDevice;
        device.scope.resolve('targetSize').setValue([device.width, device.height]);
    }

    moved() {
        this.updateBound();
    }

    updateBound() {
        bound.center.copy(this.pivot.getPosition());
        bound.halfExtents.set(this._lenX, this._lenY, this._lenZ);
        this.scene.boundDirty = true;
    }

    get worldBound(): BoundingBox | null {
        return bound;
    }

    set lenX(lenX: number) {
        this._lenX = lenX;

        this.pivot.setLocalScale(this._lenX * 2, this._lenY * 2, this._lenZ * 2);
        this.updateBound();
    }

    set lenY(lenY: number) {
        this._lenY = lenY;

        this.pivot.setLocalScale(this._lenX * 2, this._lenY * 2, this._lenZ * 2);
        this.updateBound();
    }

    set lenZ(lenZ: number) {
        this._lenZ = lenZ;

        this.pivot.setLocalScale(this._lenX * 2, this._lenY * 2, this._lenZ * 2);
        this.updateBound();
    }

    get lenX() {
        return this._lenX;
    }

    get lenY() {
        return this._lenY;
    }

    get lenZ() {
        return this._lenZ;
    }
}

export { BoxShape };
