import {
    BLEND_NORMAL,
    BoundingBox,
    CULLFACE_NONE,
    Entity,
    FUNC_LESS,
    Mesh,
    MeshInstance,
    PRIMITIVE_TRIANGLES,
    RENDERSTYLE_WIREFRAME,
    ShaderMaterial
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { vertexShader, prepassFragmentShader, solidFragmentShader, wireFragmentShader } from './shaders/collision-mesh-shader';

type CollisionMeshRenderMode = 'wireframe' | 'solid' | 'both';

// Renders the generated collision mesh in the viewport. The mesh data is in
// world space so the entity stays at identity. It renders on the overlay
// layer (after the splat pass, without clearing depth), so the semi-transparent
// solid blends over splats behind it while splats in front still occlude it.
//
// A single Mesh is shared by three MeshInstances:
// - a depth-only prepass, pushed back with polygon offset, which lays down the
//   nearest mesh surface
// - a blended solid, depth-tested against the prepass so only one layer shades
// - a wireframe (via renderStyle), depth-tested against the offset prepass so
//   it survives only on front faces (hidden-line look without z-fighting)
class CollisionMesh extends Element {
    entity: Entity;
    prepassMaterial: ShaderMaterial;
    solidMaterial: ShaderMaterial;
    wireMaterial: ShaderMaterial;
    mesh: Mesh | null = null;
    prepassInstance: MeshInstance | null = null;
    solidInstance: MeshInstance | null = null;
    wireInstance: MeshInstance | null = null;
    version = 0;

    private _renderMode: CollisionMeshRenderMode = 'both';
    private _visible = true;
    private _opacity = 0.5;

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const { scene } = this;

        this.prepassMaterial = new ShaderMaterial({
            uniqueName: 'collisionMeshPrepassMaterial',
            vertexGLSL: vertexShader,
            fragmentGLSL: prepassFragmentShader
        });
        this.prepassMaterial.cull = CULLFACE_NONE;
        this.prepassMaterial.redWrite = false;
        this.prepassMaterial.greenWrite = false;
        this.prepassMaterial.blueWrite = false;
        this.prepassMaterial.alphaWrite = false;
        this.prepassMaterial.depthWrite = true;
        this.prepassMaterial.depthTest = true;
        // push the prepass depth back so the solid and wireframe pass the
        // depth test on front faces (polygon offset affects filled triangles
        // only, never lines)
        this.prepassMaterial.depthBias = 2;
        this.prepassMaterial.slopeDepthBias = 1;
        this.prepassMaterial.update();

        this.solidMaterial = new ShaderMaterial({
            uniqueName: 'collisionMeshSolidMaterial',
            vertexGLSL: vertexShader,
            fragmentGLSL: solidFragmentShader
        });
        this.solidMaterial.cull = CULLFACE_NONE;
        this.solidMaterial.blendType = BLEND_NORMAL;
        this.solidMaterial.depthWrite = false;
        this.solidMaterial.depthTest = true;
        // strict less: passes against the pushed-back prepass but fails at
        // the wireframe's own depth, keeping the lines crisp under the blend
        this.solidMaterial.depthFunc = FUNC_LESS;
        this.solidMaterial.setParameter('uOpacity', this._opacity);
        this.solidMaterial.update();

        this.wireMaterial = new ShaderMaterial({
            uniqueName: 'collisionMeshWireMaterial',
            vertexGLSL: vertexShader,
            fragmentGLSL: wireFragmentShader
        });
        // blended (at full alpha) so the wireframe renders in the transparent
        // bucket, where draw buckets order it after the solid - line and
        // triangle rasterization interpolate depth differently, so depth
        // testing alone cannot keep the lines crisp on top of the solid
        this.wireMaterial.blendType = BLEND_NORMAL;
        this.wireMaterial.depthWrite = false;
        this.wireMaterial.depthTest = true;
        this.wireMaterial.update();

        this.entity = new Entity('collisionMesh');
        this.entity.addComponent('render', {
            meshInstances: [],
            layers: [scene.overlayLayer.id]
        });
        this.entity.enabled = false;

        scene.app.root.addChild(this.entity);
    }

    remove() {
        this.clear();
        this.entity?.destroy();
        this.entity = null;
    }

    setData(positions: Float32Array, indices: Uint32Array) {
        const { scene } = this;

        const mesh = new Mesh(scene.graphicsDevice);
        mesh.setPositions(positions);
        mesh.setIndices(indices);
        mesh.update(PRIMITIVE_TRIANGLES);

        const prepassInstance = new MeshInstance(mesh, this.prepassMaterial, null);
        const solidInstance = new MeshInstance(mesh, this.solidMaterial, null);
        const wireInstance = new MeshInstance(mesh, this.wireMaterial, null);

        // the prepass is the only opaque instance and renders first. solid and
        // wireframe are both blended; the transparent bucket sorts descending,
        // so the wireframe's lower bucket makes it render after the solid
        solidInstance.drawBucket = 128;
        wireInstance.drawBucket = 64;

        this.entity.render.meshInstances = [prepassInstance, solidInstance, wireInstance];

        // set after assigning to the render component, which forces its own
        // (solid) render style on assigned mesh instances
        wireInstance.renderStyle = RENDERSTYLE_WIREFRAME;

        this.destroyGeometry();

        this.mesh = mesh;
        this.prepassInstance = prepassInstance;
        this.solidInstance = solidInstance;
        this.wireInstance = wireInstance;

        this.version++;
        scene.boundDirty = true;
        scene.forceRender = true;
    }

    clear() {
        if (!this.mesh) {
            return;
        }

        if (this.entity?.render) {
            this.entity.render.meshInstances = [];
        }
        this.destroyGeometry();

        this.version++;
        if (this.scene) {
            this.scene.boundDirty = true;
            this.scene.forceRender = true;
        }
    }

    // destroying the mesh instances releases the shared mesh via refcounting
    private destroyGeometry() {
        this.prepassInstance?.destroy();
        this.solidInstance?.destroy();
        this.wireInstance?.destroy();
        this.prepassInstance = null;
        this.solidInstance = null;
        this.wireInstance = null;
        this.mesh = null;
    }

    get triangleCount() {
        return this.mesh ? this.mesh.primitive[0].count / 3 : 0;
    }

    set renderMode(value: CollisionMeshRenderMode) {
        if (value !== this._renderMode) {
            this._renderMode = value;
            if (this.scene) {
                this.scene.forceRender = true;
            }
        }
    }

    get renderMode() {
        return this._renderMode;
    }

    set visible(value: boolean) {
        if (value !== this._visible) {
            this._visible = value;
            if (this.scene) {
                this.scene.forceRender = true;
            }
        }
    }

    get visible() {
        return this._visible;
    }

    set opacity(value: number) {
        if (value !== this._opacity) {
            this._opacity = value;
            this.solidMaterial?.setParameter('uOpacity', value);
            if (this.scene) {
                this.scene.forceRender = true;
            }
        }
    }

    get opacity() {
        return this._opacity;
    }

    serialize(serializer: Serializer) {
        serializer.pack(this.version, this._visible, this._renderMode, this._opacity);
    }

    onPreRender() {
        const show = !!this.mesh && this._visible && this.scene.camera.renderOverlays;
        this.entity.enabled = show;
        if (show) {
            const solid = this._renderMode !== 'wireframe';
            this.prepassInstance.visible = solid;
            this.solidInstance.visible = solid;
            this.wireInstance.visible = this._renderMode !== 'solid';
        }
    }

    get worldBound(): BoundingBox | null {
        // mesh data is world space and the entity is at identity
        return this.mesh ? this.mesh.aabb : null;
    }
}

export { CollisionMesh, CollisionMeshRenderMode };
