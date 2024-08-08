import {
    createShaderFromCode,
    CULLFACE_NONE,
    BoundingBox,
    Entity,
    Material,
    Vec3
} from 'playcanvas';
import { Element, ElementType } from './element';
import { Serializer } from './serializer';

const vsCode = /* glsl */ `
    attribute vec3 vertex_position;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    varying vec3 fragWorld;

    void main() {
        vec4 world = matrix_model * vec4(vertex_position, 1.0);
        gl_Position = matrix_viewProjection * world;
        fragWorld = world.xyz;
    }
`;

const fsCode = /* glsl */ `
    bool intersectSphere(out float t0, out float t1, vec3 pos, vec3 dir, vec4 sphere) {
        vec3 L = sphere.xyz - pos;
        float tca = dot(L, dir);

        float d2 = sphere.w * sphere.w - (dot(L, L) - tca * tca);
        if (d2 < 0.0) {
            return false;
        }

        float thc = sqrt(d2);
        t0 = tca - thc;
        t1 = tca + thc;
        if (t1 < 0.0) {
            return false;
        }

        return true;
    }

    float calcDepth(in vec3 pos, in mat4 viewProjection) {
        vec4 v = viewProjection * vec4(pos, 1.0);
        return (v.z / v.w) * 0.5 + 0.5;
    }

    float noise(vec2 fragCoord, sampler2D noiseTex) {
        vec2 uv = fract(fragCoord / 32.0);
        return texture2DLodEXT(noiseTex, uv, 0.0).y;
    }

    vec2 calcAzimuthElev(in vec3 dir) {
        float azimuth = atan(dir.z, dir.x);
        float elev = asin(dir.y);
        return vec2(azimuth, elev) * 180.0 / 3.14159;
    }

    uniform sampler2D blueNoiseTex32;
    uniform vec3 view_position;
    uniform mat4 matrix_viewProjection;
    uniform vec4 sphere;

    varying vec3 fragWorld;

    bool strips(vec3 lp) {
        vec2 ae = calcAzimuthElev(normalize(lp));

        float spacing = 180.0 / (2.0 * 3.14159 * sphere.w);
        float size = 0.03;
        return fract(ae.x / spacing) > size &&
               fract(ae.y / spacing) > size;
    }

    void behind(vec3 ray, float t) {
        vec3 wp = view_position + ray * t;
        if (strips(wp - sphere.xyz) || noise(gl_FragCoord.yx, blueNoiseTex32) < 0.125) {
            discard;
        }

        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        gl_FragDepth = calcDepth(wp, matrix_viewProjection);
    }

    void front(vec3 ray, float t0, float t1) {
        if (t0 < 0.0) {
            behind(ray, t1);
        } else {
            vec3 wp = view_position + ray * t0;
            if (strips(wp - sphere.xyz) || noise(gl_FragCoord.xy, blueNoiseTex32) < 0.6) {
                behind(ray, t1);
            } else {
                gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
                gl_FragDepth = calcDepth(wp, matrix_viewProjection);
            }
        }
    }

    void main() {
        vec3 ray = normalize(fragWorld - view_position);

        float t0, t1;
        if (!intersectSphere(t0, t1, view_position, ray, sphere)) {
            discard;
        }

        front(ray, t0, t1);
    }
`;

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

        const shader = createShaderFromCode(
            device,
            vsCode,
            fsCode,
            'sphere-shape'
        );

        const material = new Material();
        material.shader = shader;
        material.cull = CULLFACE_NONE;
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
