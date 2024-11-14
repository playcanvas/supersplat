import { LAYERID_SKYBOX, Asset, Texture, Quat } from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';

const quat = new Quat();

class Env extends Element {
    asset: Asset;
    envAtlas: Texture;

    constructor(asset: Asset) {
        super(ElementType.other);
        this.envAtlas = asset.resource;
    }

    destroy() {
        super.destroy();
        this.asset.registry.remove(this.asset);
        this.asset.unload();
        this.envAtlas.destroy();
    }

    add() {
        this.scene.app.scene.envAtlas = this.envAtlas;
        this.scene.graphicsDevice.scope.resolve('texture_envAtlas').setValue(this.envAtlas);

        // apply scene config
        const config = this.scene.config;
        this.show = false;
        this.intensity = config.env?.intensity || 1.0;
        this.rotation = config.env?.rotation || -90;
    }

    remove() {
        this.scene.app.scene.envAtlas = null;
    }

    serialize(serializer: Serializer) {
        serializer.pack(this.show, this.intensity, this.rotation);
    }

    // show
    set show(value: boolean) {
        this.scene.app.scene.layers.getLayerById(LAYERID_SKYBOX).enabled = value;
    }

    get show() {
        return this.scene.app.scene.layers.getLayerById(LAYERID_SKYBOX).enabled;
    }

    // intensity
    set intensity(exposure: number) {
        this.scene.app.scene.skyboxIntensity = exposure;
    }

    get intensity() {
        return this.scene.app.scene.skyboxIntensity;
    }

    // rotation
    set rotation(angle: number) {
        quat.setFromEulerAngles(0, angle, 0);
        this.scene.app.scene.skyboxRotation = quat;
    }

    get rotation() {
        return this.scene.app.scene.skyboxRotation.getEulerAngles().y;
    }
}

export { Env };
