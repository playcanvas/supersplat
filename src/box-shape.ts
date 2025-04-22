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
    _lenX = 2;
    _lenY = 2;
    _lenZ = 2;
    pivot: Entity;
    material: ShaderMaterial;

    constructor() {
        super(ElementType.debug);

        this.pivot = new Entity('boxPivot');
        this.pivot.addComponent('render', {
            type: 'box'
        });
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
        this.pivot.setLocalScale(this._lenX, this._lenY, this._lenZ);
        this.pivot.getWorldTransform().getTranslation(v);
        this.material.setParameter('boxCen', [v.x, v.y, v.z]);
        this.material.setParameter('boxLen', [this._lenX * 0.5, this._lenY * 0.5, this._lenZ  * 0.5]);

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
        this.updateBound();
    }

    get lenX() {
        return this._lenX;
    }

    set lenY(lenY: number) {
        this._lenY = lenY;
        this.updateBound();
    }

    get lenY() {
        return this._lenY;
    }

    set lenZ(lenZ: number) {
        this._lenZ = lenZ;
        this.updateBound();
    }

    get lenZ() {
        return this._lenZ;
    }
}

export { BoxShape };
