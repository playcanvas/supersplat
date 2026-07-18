import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    CULLFACE_NONE,
    FILTER_LINEAR,
    PIXELFORMAT_RGBA8,
    PRIMITIVE_TRIANGLES,
    BlendState,
    Color,
    Entity,
    GraphicsDevice,
    Mesh,
    MeshInstance,
    ShaderMaterial,
    Texture,
    Vec3
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import {
    dotVertexShader,
    dotFragmentShader,
    lineVertexShader,
    lineFragmentShader,
    fillVertexShader,
    fillFragmentShader
} from './shaders/tool-overlay-shader';

// screen-space sizes in pixels
const DOT_SIZE = 12;
const LINE_WIDTH = 2;
const LINE_OUTLINE_WIDTH = 5;

// opacity of the ghost pass, drawn over the splats where the base pass is occluded
const GHOST_OPACITY = 0.25;

const va = new Vec3();
const vb = new Vec3();
const dir = new Vec3();
const perp = new Vec3();
const right = new Vec3();
const up = new Vec3();
const tmp = new Vec3();

// geometry sink filled by the overlay's provider each frame, in world space
class OverlayWriter {
    dots: number[] = [];
    segments: number[] = [];
    fills: number[] = [];

    reset() {
        this.dots.length = 0;
        this.segments.length = 0;
        this.fills.length = 0;
    }

    dot(p: Vec3) {
        this.dots.push(p.x, p.y, p.z);
    }

    segment(a: Vec3, b: Vec3) {
        this.segments.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }

    fill(a: Vec3, b: Vec3, c: Vec3) {
        this.fills.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
}

// a round marker texture matching the previous svg styling: white fill, black rim
const createDotTexture = (device: GraphicsDevice, size = 64) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const center = size * 0.5;
    const radius = size * 0.5 - 2;
    const rim = size * 0.15;

    ctx.beginPath();
    ctx.arc(center, center, radius - rim * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.lineWidth = rim;
    ctx.strokeStyle = 'black';
    ctx.stroke();

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    // color the fully transparent pixels black so edge filtering blends correctly
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
        }
    }

    return new Texture(device, {
        width: size,
        height: size,
        format: PIXELFORMAT_RGBA8,
        magFilter: FILTER_LINEAR,
        minFilter: FILTER_LINEAR,
        mipmaps: false,
        levels: [new Uint8Array(data.buffer)]
    });
};

// Shared in-scene rendering for viewport tools (measure, orient): screen-sized
// dots, outlined lines and translucent fills, all placed in the world so
// gaussians occlude them. The geometry renders twice: a base pass on the world
// layer (covered by gaussians in front of it, like the grid), and a dim ghost
// pass after the splat layer so occluded parts stay faintly visible.
class ToolOverlay extends Element {
    // fills the writer with world-space geometry for the current frame
    provider: (writer: OverlayWriter) => void = () => {};

    fillColor = new Color(1, 0.4, 0, 0.6);

    private writer = new OverlayWriter();
    private baseEntity: Entity;
    private ghostEntity: Entity;
    private dotMesh: Mesh;
    private lineMesh: Mesh;
    private outlineMesh: Mesh;
    private fillMesh: Mesh;
    private texture: Texture;
    private initialized = false;

    constructor() {
        super(ElementType.debug);
        this.baseEntity = new Entity('toolOverlayBase');
        this.ghostEntity = new Entity('toolOverlayGhost');
    }

    add() {
        if (!this.initialized) {
            this.initialize();
        }
        this.scene.contentRoot.addChild(this.baseEntity);
        this.scene.contentRoot.addChild(this.ghostEntity);
    }

    remove() {
        this.scene.contentRoot.removeChild(this.baseEntity);
        this.scene.contentRoot.removeChild(this.ghostEntity);
    }

    private initialize() {
        const device = this.scene.graphicsDevice;
        const blend = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA
        );

        this.texture = createDotTexture(device);

        const makeMaterial = (name: string, vertex: string, fragment: string, ghost: boolean) => {
            const material = new ShaderMaterial({
                uniqueName: name,
                vertexGLSL: vertex,
                fragmentGLSL: fragment
            });
            material.cull = CULLFACE_NONE;
            if (ghost) {
                material.blendState = blend;
                material.depthTest = false;
                material.depthWrite = false;
            }
            material.update();
            return material;
        };

        const dotBase = makeMaterial('toolOverlayDotBase', dotVertexShader, dotFragmentShader, false);
        dotBase.setParameter('dotTexture', this.texture);
        dotBase.setParameter('ghost', 0);

        const dotGhost = makeMaterial('toolOverlayDotGhost', dotVertexShader, dotFragmentShader, true);
        dotGhost.setParameter('dotTexture', this.texture);
        dotGhost.setParameter('ghost', GHOST_OPACITY);

        // explicit depth strata (ndc): dots in front, then the line core, the
        // line outline and (deeper still, biased in its shader) the fill
        const lineBase = makeMaterial('toolOverlayLineBase', lineVertexShader, lineFragmentShader, false);
        lineBase.setParameter('lineColor', [1, 1, 1, 1]);
        lineBase.setParameter('depthBias', 1e-4);

        const lineGhost = makeMaterial('toolOverlayLineGhost', lineVertexShader, lineFragmentShader, true);
        lineGhost.setParameter('lineColor', [1, 1, 1, GHOST_OPACITY]);
        lineGhost.setParameter('depthBias', 0);

        const outlineBase = makeMaterial('toolOverlayOutlineBase', lineVertexShader, lineFragmentShader, false);
        outlineBase.setParameter('lineColor', [0, 0, 0, 1]);
        outlineBase.setParameter('depthBias', 2e-4);

        const fillBase = makeMaterial('toolOverlayFillBase', fillVertexShader, fillFragmentShader, false);
        fillBase.blendState = blend;
        fillBase.setParameter('fillColor', [this.fillColor.r, this.fillColor.g, this.fillColor.b, this.fillColor.a]);

        const makeMesh = () => {
            const mesh = new Mesh(device);
            mesh.setPositions([0, 0, 0, 0, 0, 0, 0, 0, 0]);
            mesh.update(PRIMITIVE_TRIANGLES);
            return mesh;
        };

        this.dotMesh = makeMesh();
        this.lineMesh = makeMesh();
        this.outlineMesh = makeMesh();
        this.fillMesh = makeMesh();

        const makeInstances = (meshes: [Mesh, ShaderMaterial][]) => {
            return meshes.map(([mesh, material]) => {
                const meshInstance = new MeshInstance(mesh, material);
                meshInstance.visible = false;
                return meshInstance;
            });
        };

        this.baseEntity.addComponent('render', {
            meshInstances: makeInstances([
                [this.fillMesh, fillBase],
                [this.outlineMesh, outlineBase],
                [this.lineMesh, lineBase],
                [this.dotMesh, dotBase]
            ])
        });
        this.baseEntity.render.layers = [this.scene.worldLayer.id];

        this.ghostEntity.addComponent('render', {
            meshInstances: makeInstances([
                [this.lineMesh, lineGhost],
                [this.dotMesh, dotGhost]
            ])
        });
        this.ghostEntity.render.layers = [this.scene.overlayLayer.id];

        this.initialized = true;
    }

    serialize(serializer: Serializer): void {
        const { writer } = this;
        writer.reset();
        this.provider(writer);
        serializer.pack(writer.dots.length, writer.segments.length, writer.fills.length);
        serializer.packa(writer.dots);
        serializer.packa(writer.segments);
        serializer.packa(writer.fills);
    }

    onPreRender() {
        const { writer } = this;
        writer.reset();
        this.provider(writer);

        const { camera } = this.scene;
        const cameraTransform = camera.mainCamera.getWorldTransform();
        cameraTransform.getX(right).normalize();
        cameraTransform.getY(up).normalize();
        const cameraPos = camera.mainCamera.getPosition();
        const cameraFwd = camera.mainCamera.forward;

        // world size of one screen pixel at the near plane (perspective scales by view depth)
        const clientHeight = Math.max(1, this.scene.canvas.clientHeight);
        const proj = camera.camera.projectionMatrix;
        const pixelScale = (2 / proj.data[5]) / clientHeight;
        const worldSize = (px: number, depth: number) => px * pixelScale * (camera.ortho ? 1 : depth);

        const viewDepth = (p: Vec3) => tmp.sub2(p, cameraPos).dot(cameraFwd);

        // dots: camera-facing quads with constant screen-space size
        const dotPositions: number[] = [];
        const dotUvs: number[] = [];
        const { dots } = writer;
        for (let i = 0; i < dots.length; i += 3) {
            vb.set(dots[i], dots[i + 1], dots[i + 2]);
            const depth = viewDepth(vb);
            if (depth <= 0) {
                continue;
            }
            const s = worldSize(DOT_SIZE, depth) * 0.5;
            for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
                dotPositions.push(
                    vb.x + (right.x * cx + up.x * cy) * s,
                    vb.y + (right.y * cx + up.y * cy) * s,
                    vb.z + (right.z * cx + up.z * cy) * s
                );
                dotUvs.push(cx * 0.5 + 0.5, cy * 0.5 + 0.5);
            }
        }

        // lines: camera-facing ribbons with constant screen-space width
        const linePositions: number[] = [];
        const outlinePositions: number[] = [];
        const { segments } = writer;
        for (let i = 0; i < segments.length; i += 6) {
            va.set(segments[i], segments[i + 1], segments[i + 2]);
            vb.set(segments[i + 3], segments[i + 4], segments[i + 5]);
            const depthA = viewDepth(va);
            const depthB = viewDepth(vb);
            if (depthA <= 0 || depthB <= 0) {
                continue;
            }

            dir.sub2(vb, va);
            if (camera.ortho) {
                perp.cross(dir, cameraFwd);
            } else {
                tmp.sub2(va, cameraPos);
                perp.cross(dir, tmp);
            }
            if (perp.lengthSq() < 1e-12) {
                continue;
            }
            perp.normalize();

            const ribbon = (out: number[], width: number) => {
                const wa = worldSize(width, depthA) * 0.5;
                const wb = worldSize(width, depthB) * 0.5;
                const ax0 = va.x - perp.x * wa, ay0 = va.y - perp.y * wa, az0 = va.z - perp.z * wa;
                const ax1 = va.x + perp.x * wa, ay1 = va.y + perp.y * wa, az1 = va.z + perp.z * wa;
                const bx0 = vb.x - perp.x * wb, by0 = vb.y - perp.y * wb, bz0 = vb.z - perp.z * wb;
                const bx1 = vb.x + perp.x * wb, by1 = vb.y + perp.y * wb, bz1 = vb.z + perp.z * wb;
                out.push(
                    ax0, ay0, az0, bx0, by0, bz0, bx1, by1, bz1,
                    ax0, ay0, az0, bx1, by1, bz1, ax1, ay1, az1
                );
            };

            ribbon(linePositions, LINE_WIDTH);
            ribbon(outlinePositions, LINE_OUTLINE_WIDTH);
        }

        const updateMesh = (mesh: Mesh, positions: number[], uvs?: number[]) => {
            const visible = positions.length > 0;
            if (visible) {
                mesh.setPositions(positions);
                if (uvs) {
                    mesh.setUvs(0, uvs);
                }
                mesh.update(PRIMITIVE_TRIANGLES);
            }
            for (const entity of [this.baseEntity, this.ghostEntity]) {
                entity.render?.meshInstances.forEach((meshInstance) => {
                    if (meshInstance.mesh === mesh) {
                        meshInstance.visible = visible;
                    }
                });
            }
        };

        updateMesh(this.dotMesh, dotPositions, dotUvs);
        updateMesh(this.lineMesh, linePositions);
        updateMesh(this.outlineMesh, outlinePositions);
        updateMesh(this.fillMesh, writer.fills);
    }
}

export { ToolOverlay, OverlayWriter };
