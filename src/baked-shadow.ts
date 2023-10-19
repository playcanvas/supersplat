import {
    BAKE_COLOR,
    BLEND_NORMAL,
    SHADOW_PCF3 as SHADOW_TYPE,
    Color,
    Entity,
    StandardMaterial,
    shaderChunks,
    shaderChunksLightmapper
} from 'playcanvas';
import {Element, ElementType} from './element';

const basePS = (shaderChunks as any).basePS + `uniform float shadowIntensity;\n`;

const endPS = `
    gl_FragColor.rgb = vec3(0.0);
    litArgs_opacity = mix(shadowIntensity, 0.0, combineColor(litArgs_albedo, litArgs_sheen_specularity, litArgs_clearcoat_specularity).r);
`;

const bakeLmEndPS = `
    // shadow0      - is the shadow term for this pass
    // light0_color - lightmapper scaling factor based on total number of passes
    // dLightmap    - contains the summed result of previous passes in soft (summed) rendering
    dDiffuseLight = vec3(shadow0) * light0_color + litArgs_lightmap;
`;

class BakedShadow extends Element {
    material: StandardMaterial;
    plane: Entity;
    light: Entity;

    constructor() {
        super(ElementType.shadow);

        this.material = new StandardMaterial();
        this.material.useSkybox = false;
        this.material.blendType = BLEND_NORMAL;
        this.material.chunks.basePS = basePS;
        this.material.chunks.endPS = endPS;
        this.material.depthWrite = false;
        this.material.useLighting = false;
        this.material.update();

        // @ts-ignore
        shaderChunksLightmapper.bakeLmEndPS = bakeLmEndPS + shaderChunksLightmapper.bakeLmEndPS;

        this.plane = new Entity('ShadowPlane');
        this.plane.addComponent('render', {
            type: 'plane',
            castShadows: false,
            castShadowsLightmap: false,
            lightmapped: true,
            material: this.material,
            enabled: false
        });

        this.light = new Entity('ShadowLight');
        this.light.addComponent('light', {
            type: 'directional',
            affectLightmapped: true,
            castShadows: true,
            normalOffsetBias: 0.0,
            shadowBias: 0.0,
            shadowDistance: 10,
            shadowResolution: 2048,
            shadowType: SHADOW_TYPE,
            color: new Color(1, 1, 1),
            intensity: 1.0,
            bake: true,
            bakeNumSamples: 32,
            bakeArea: 45,
            bakeDir: false,
            enabled: true
        });
    }

    destroy() {
        super.destroy();
        this.plane.destroy();
        this.light.destroy();
    }

    add() {
        this.scene.app.root.addChild(this.plane);
        this.scene.app.root.addChild(this.light);

        this.scene.on('bound:updated', this.regenerate, this);
    }

    remove() {
        this.scene.off('bound:updated', this.regenerate, this);

        this.scene.app.root.removeChild(this.plane);
        this.scene.app.root.removeChild(this.light);
    }

    regenerate() {
        const scene = this.scene.app.scene;
        const bound = this.scene.bound;
        const center = bound.center;

        const len = Math.sqrt(bound.halfExtents.x * bound.halfExtents.x + bound.halfExtents.z * bound.halfExtents.z);
        this.plane.setLocalScale(len * 8, 1, len * 8);
        this.plane.setLocalPosition(center.x, Math.min(0, bound.getMin().y), center.z);

        // global settings
        scene.lightmapMode = BAKE_COLOR;
        scene.lightmapMaxResolution = 2048;
        scene.lightmapSizeMultiplier = 2048;
        scene.lightmapHDR = true;

        // prepares scene for lightmapping
        this.light.enabled = true;
        this.plane.render.enabled = true;

        // bake
        this.scene.app.lightmapper.bake(null, BAKE_COLOR);

        // restore the scene for rendering
        this.light.enabled = false;
    }

    onPreRender() {
        this.material.setParameter('shadowIntensity', this.scene.config.shadow.intensity);
    }
}

export {BakedShadow};
