import {
    BLEND_NORMAL,
    SHADOW_VSM16 as SHADOW_TYPE,
    SHADOWUPDATE_THISFRAME,
    Entity,
    StandardMaterial,
    Layer,
    shaderChunks
} from 'playcanvas';
import {Element, ElementType} from './element';

const basePS = (shaderChunks as any).basePS + `uniform float shadowIntensity;\n`;

const endPS = `
    litArgs_opacity = mix(shadowIntensity, 0.0, shadow0);
    gl_FragColor.rgb = vec3(0.0);
`;

const fadeEndPS = `
    // fade out shadow at glancing angles
    float v = saturate(dViewDirW.y * 6.0) * 2.0;
    float fade = (v < 1.0) ? (v * v * 0.5) : ((v - 1.0) * (v - 3.0) - 1.0) * -0.5;
    litArgs_opacity = mix(0.0, shadowIntensity, (1.0 - shadow0) * fade);
    gl_FragColor.rgb = vec3(0.0);
`;

class VsmShadow extends Element {
    layer: Layer;
    material: StandardMaterial;
    plane: Entity;
    light: Entity;

    constructor() {
        super(ElementType.shadow);

        this.material = new StandardMaterial();
        this.material.useSkybox = false;
        this.material.blendType = BLEND_NORMAL;
        this.material.chunks.basePS = basePS;
        this.material.depthWrite = false;
        this.material.diffuse.set(0, 0, 0);
        this.material.specular.set(0, 0, 0);

        this.plane = new Entity('ShadowPlane');
        this.plane.addComponent('render', {
            type: 'plane',
            castShadows: false,
            material: this.material
        });

        this.light = new Entity('ShadowLight');
        this.light.addComponent('light', {
            type: 'directional',
            castShadows: true,
            shadowResolution: 1024,
            shadowType: SHADOW_TYPE,
            shadowUpdateMode: SHADOWUPDATE_THISFRAME,
            vsmBlurSize: 64,
            enabled: true
        });
    }

    destroy() {
        super.destroy();
        this.plane.destroy();
        this.light.destroy();
    }

    add() {
        this.scene.contentRoot.addChild(this.plane);
        this.scene.contentRoot.addChild(this.light);
        this.plane.render.layers = [this.scene.shadowLayer.id];
        this.light.light.layers = [this.scene.shadowLayer.id];

        // apply scene config
        this.material.chunks.endPS = this.scene.config.shadow?.fade ?? true ? fadeEndPS : endPS;
        this.material.update();

        this.scene.on('bound:updated', this.regenerate, this);
    }

    remove() {
        this.scene.off('bound:updated', this.regenerate, this);

        this.light.light.layers = [];
        this.plane.render.layers = [];
        this.scene.contentRoot.removeChild(this.plane);
        this.scene.contentRoot.removeChild(this.light);
    }

    regenerate() {
        const bound = this.scene.bound;
        const center = bound.center;
        const len = Math.sqrt(bound.halfExtents.x * bound.halfExtents.x + bound.halfExtents.z * bound.halfExtents.z);

        this.plane.setLocalScale(len * 4, 1, len * 4);
        this.plane.setPosition(center.x, bound.getMin().y, center.z);

        const sceneSize = bound.halfExtents.length();

        this.light.light.normalOffsetBias = sceneSize / 1024;
        this.light.light.shadowBias = 0;
        this.light.light.shadowDistance =
            sceneSize + this.scene.camera.focusDistance * this.scene.config.controls.maxZoom;
    }

    onPreRender() {
        this.material.setParameter('shadowIntensity', this.scene.config.shadow.intensity);
    }
}

export {VsmShadow};
