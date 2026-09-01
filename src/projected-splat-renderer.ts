import {
    BLEND_NONE,
    BLEND_PREMULTIPLIED,
    BUFFERUSAGE_COPY_DST,
    BUFFERUSAGE_COPY_SRC,
    CULLFACE_NONE,
    PIXELFORMAT_R32U,
    PIXELFORMAT_RGBA32U,
    PRIMITIVE_TRIANGLES,
    SAMPLETYPE_FLOAT,
    SAMPLETYPE_UINT,
    SAMPLETYPE_UNFILTERABLE_FLOAT,
    SEMANTIC_POSITION,
    SHADERLANGUAGE_WGSL,
    SHADERSTAGE_COMPUTE,
    UNIFORMTYPE_FLOAT,
    UNIFORMTYPE_INT,
    UNIFORMTYPE_MAT4,
    UNIFORMTYPE_UINT,
    UNIFORMTYPE_UVEC4,
    UNIFORMTYPE_VEC2,
    UNIFORMTYPE_VEC3,
    UNIFORMTYPE_VEC4,
    BindGroupFormat,
    BindStorageBufferFormat,
    BindStorageTextureFormat,
    BindTextureFormat,
    BindUniformBufferFormat,
    Camera,
    Compute,
    ComputeRadixSort,
    Entity,
    GraphicsDevice,
    Mat4,
    Mesh,
    MeshInstance,
    Shader,
    ShaderMaterial,
    StorageBuffer,
    Texture,
    UniformBufferFormat,
    UniformFormat,
    Vec2
} from 'playcanvas';

import { createGradeTerms, gradeRows, gradeTerms, type GradeParams } from './color-grade';
import { maskByteSize } from './data-processor/histogram-config';
import type { Scene } from './scene';
import { footprintIntersect } from './shaders/footprint-intersect';
import { projectedSplatIndirectArgs } from './shaders/projected-splat-indirect-args';
import { projectedSplatProjector } from './shaders/projected-splat-projector';
import { fragmentShader, vertexShader } from './shaders/projected-splat-shader';
import type { Splat } from './splat';

const INSTANCE_SIZE = 128;
const WORKGROUP_SIZE = 256;
const ENTRY_ALIGNMENT = 256;

// significant bits in a sort key: sortKeys stores (~depth) >> 12, so the top 12
// bits are always zero and sorting more than this cannot change the ordering
const SORT_KEY_BITS = 20;

const roundUp = (value: number, alignment: number) => Math.ceil(value / alignment) * alignment;

type ProjectorVariant = {
    shader: Shader;
    bindGroupFormat: BindGroupFormat;
    uniformBufferFormat: UniformBufferFormat;
};

type Placement = {
    splat: Splat;
    count: number;
    entryBase: number;
    // entries reserved in the global cache. Always >= count and never shrinks, so
    // removing instances doesn't force a realloc of the whole cache; the projector
    // dispatches over the reservation and invalidates the tail
    entryCapacity: number;
    // first instance of this placement's group within the splat's instance list
    instanceBase: number;
    // each placement owns its Compute: a Compute's uniform buffer is a single
    // persistent GPU buffer written at dispatch-record time, so sharing one
    // instance would make every dispatch of the frame read the uniforms of the
    // last placement recorded
    compute: Compute | null;
    bands: number;
};

type ProjectedRendererStats = {
    placements: number;
    projectedSplats: number;
    sourceBytes: number;
    editingBytes: number;
    cacheBytes: number;
    keyBytes: number;
    estimatedRadixBytes: number;
    totalTransientBytes: number;
    totalSplatGpuBytes: number;
    submissionCpuMs: number;
    gpuFrameMs: number;
};

const createQuadMesh = (device: GraphicsDevice) => {
    const positions = new Float32Array(INSTANCE_SIZE * 4 * 3);
    const indices = new Uint32Array(INSTANCE_SIZE * 6);
    for (let i = 0; i < INSTANCE_SIZE; ++i) {
        positions.set([
            -1, -1, i,
            1, -1, i,
            1, 1, i,
            -1, 1, i
        ], i * 12);
        const vertex = i * 4;
        indices.set([
            vertex, vertex + 1, vertex + 2,
            vertex, vertex + 2, vertex + 3
        ], i * 6);
    }

    const mesh = new Mesh(device);
    mesh.setPositions(positions, 3);
    mesh.setIndices(indices);
    mesh.update(PRIMITIVE_TRIANGLES);
    return mesh;
};

class ProjectedSplatRenderer {
    private readonly scene: Scene;
    private readonly device: GraphicsDevice;
    private readonly placements: Placement[] = [];
    private readonly variants = new Map<number, ProjectorVariant>();
    // the colour panel's pending grade, packed as three vec4 rows; reused per frame
    private readonly previewTerms = createGradeTerms();
    private readonly previewRows = new Float32Array(12);
    private readonly shaderProjection = new Mat4();
    private readonly viewProjection = new Mat4();
    private readonly dispatchSize = new Vec2();
    private readonly sorter: ComputeRadixSort;
    private readonly material: ShaderMaterial;
    private readonly mesh: Mesh;
    private readonly meshInstance: MeshInstance;
    private readonly entity: Entity;

    private sortKeys: StorageBuffer | null = null;
    // entry index per compact slot: the sort payload, and what the stochastic draw
    // reads directly. Keeping the entry index means gaussian ids are unchanged by
    // compaction, so picking, rings and the stochastic dither all still work
    private compactEntries: StorageBuffer | null = null;
    // single u32 the projector atomically appends into, consumed by the indirect
    // draw args, the sort's element count and the vertex shader's bounds check
    private splatCounter: StorageBuffer | null = null;
    private argsCompute: Compute | null = null;
    private argsShader: Shader | null = null;
    private argsBindGroupFormat: BindGroupFormat | null = null;
    private footprintCompute: Compute | null = null;
    private footprintShader: Shader | null = null;
    private footprintBindGroupFormat: BindGroupFormat | null = null;
    private footprintOutput: StorageBuffer | null = null;
    private footprintIntervals: StorageBuffer | null = null;
    // indirect draw slot claimed by the last rendered frame. Draw commands are
    // bound per frame, so the pick passes - which render on user input, outside a
    // frame - have to re-arm them from the same slot
    private drawSlot = -1;
    private forceSorted = false;
    private cacheA: Texture | null = null;
    private cacheB: Texture | null = null;
    private cacheWidth = 1;
    private cacheHeight = 1;
    private capacity = 0;
    private layoutDirty = true;
    private submissionCpuMs = 0;
    private stochastic = false;

    constructor(scene: Scene) {
        this.scene = scene;
        this.device = scene.graphicsDevice;

        // indirect only: the survivor count lives on the gpu, so every sort this
        // renderer issues is an indirect dispatch
        this.sorter = new ComputeRadixSort(this.device, { indirect: true } as any);
        this.splatCounter = new StorageBuffer(this.device, 4, BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST);

        this.material = new ShaderMaterial({
            uniqueName: 'ProjectedSplatMaterial',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexWGSL: vertexShader,
            fragmentWGSL: fragmentShader,
            fragmentOutputTypes: ['vec4', 'vec4']
        });
        this.material.blendType = BLEND_PREMULTIPLIED;
        this.material.cull = CULLFACE_NONE;
        this.material.depthWrite = false;
        this.material.depthTest = true;
        this.material.setParameter('cacheWidth', 1);
        this.material.setParameter('viewportSize', [1, 1, 2, 2]);
        this.material.setParameter('clipZParams', [0, 0, 0, 0]);
        this.material.setParameter('pickBase', 0);
        this.material.setParameter('pickCount', 0);
        this.material.setParameter('pickOp', 2);
        this.material.setParameter('outlineMode', 0);
        this.material.setParameter('showGaussians', 1);
        this.material.setParameter('showSelectedGaussians', 0);
        this.material.setParameter('ringSize', 0);
        this.material.setParameter('ringSelectionOnly', 0);
        this.material.setParameter('ringColor', [0, 0, 0, 0]);
        this.material.setParameter('selectedRingColor', [0, 0, 0, 0]);
        this.material.setParameter('ringsBase', 0);
        this.material.setParameter('ringsCount', 0);
        this.material.setParameter('pickMode', 0);
        this.material.setParameter('pickFootprint', 1);
        this.material.setParameter('cameraParams', [0, 1, 0, 0]);
        this.material.update();

        this.mesh = createQuadMesh(this.device);
        this.meshInstance = new MeshInstance(this.mesh, this.material, null);
        this.meshInstance.cull = false;
        this.meshInstance.setInstancing(true, false);
        this.meshInstance.instancingCount = 0;

        this.entity = new Entity('projectedSplatRenderer');
        this.entity.addComponent('render', {
            meshInstances: [this.meshInstance],
            layers: [scene.splatLayer.id]
        });
        this.entity.enabled = false;
        scene.app.root.addChild(this.entity);

        scene.events.function('splat.projectedRendererStats', () => this.stats);
    }

    add(splat: Splat) {
        // one placement per instance group; a group is a contiguous run of
        // instances sharing a static source, and there is exactly one until
        // cloning can mix sources into a single splat
        this.placements.push({
            splat,
            count: splat.instances.count,
            entryBase: 0,
            entryCapacity: 0,
            instanceBase: 0,
            compute: null,
            bands: -1
        });
        this.layoutDirty = true;
    }

    remove(splat: Splat) {
        const index = this.placements.findIndex(placement => placement.splat === splat);
        if (index !== -1) {
            this.placements[index].compute?.destroy();
            this.placements.splice(index, 1);
            this.layoutDirty = true;
        }
    }

    // pick up a change in a splat's live instance count. called after every edit,
    // so it must stay a no-op when nothing moved
    replace(splat: Splat) {
        const placement = this.placements.find(item => item.splat === splat);
        if (placement && placement.count !== splat.instances.count) {
            placement.count = splat.instances.count;
            this.layoutDirty = true;
        }
    }

    // Project and sort once, outside the frame loop, for a depth pick. The pick
    // composites front to back, which only means anything in sorted order, and a
    // stochastic frame leaves the compact list in atomicAdd order. Projection and
    // sort are global - which splat is being picked is a shader-side filter - so
    // one call covers a whole multi-splat pick. It also refreshes the indirect
    // args, so the pick draw no longer leans on the previous frame's.
    renderSortedForPick() {
        this.forceSorted = true;
        this.render();
        this.forceSorted = false;
    }

    preparePick(splat: Splat, pickOp: number, depth: boolean) {
        if (this.drawSlot >= 0) {
            this.meshInstance.setIndirect(null, this.drawSlot, 1);
        }
        const placement = this.placements.find(item => item.splat === splat);
        this.material.setParameter('pickBase', placement?.entryBase ?? 0);
        this.material.setParameter('pickCount', placement?.count ?? 0);
        this.material.setParameter('pickOp', pickOp);
        this.material.setParameter('pickMode', depth ? 1 : 0);
        // id picks select by the footprint value when it is fractional. At 0
        // (centers mode) the id pass is the full-size occlusion surface for the
        // visibility compute, and depth estimation always uses true footprints,
        // so both render at 1
        const footprint = (this.scene.events.invoke('selection.footprint') as number) ?? 1;
        this.material.setParameter('pickFootprint', depth || footprint === 0 ? 1 : footprint);
    }

    finishPick() {
        this.material.setParameter('pickBase', 0);
        this.material.setParameter('pickCount', this.capacity);
        this.material.setParameter('pickOp', 2);
        this.material.setParameter('pickMode', 0);
        this.material.setParameter('pickFootprint', 1);
    }

    // Switch between the default sorted premultiplied-alpha renderer and the
    // experimental 1 spp stochastic-transparency renderer (opaque, depth-tested,
    // no per-frame sort). Recompiles the material variant only when the mode
    // actually changes.
    private setStochastic(value: boolean) {
        if (value === this.stochastic) {
            return;
        }
        this.stochastic = value;
        this.material.setDefine('STOCHASTIC', value ? '' : undefined);
        this.material.blendType = value ? BLEND_NONE : BLEND_PREMULTIPLIED;
        this.material.depthWrite = value;
        this.material.update();
    }

    private getVariant(bands: number) {
        let variant = this.variants.get(bands);
        if (variant) {
            return variant;
        }

        const textureFormats = [
            new BindTextureFormat('transformA', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindTextureFormat('transformB', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_FLOAT, false),
            new BindTextureFormat('splatColor', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_FLOAT, false),
            new BindTextureFormat('transformPalette', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UNFILTERABLE_FLOAT, false),
            new BindTextureFormat('colorPalette', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UNFILTERABLE_FLOAT, false)
        ];
        if (bands > 0) {
            textureFormats.push(new BindTextureFormat('splatSH_1to3', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false));
        }
        if (bands > 1) {
            textureFormats.push(new BindTextureFormat('splatSH_4to7', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false));
            textureFormats.push(new BindTextureFormat('splatSH_8to11', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false));
        }
        if (bands > 2) {
            textureFormats.push(new BindTextureFormat('splatSH_12to15', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false));
        }

        const uniformBufferFormat = new UniformBufferFormat(this.device, [
            new UniformFormat('numSplats', UNIFORMTYPE_UINT),
            new UniformFormat('entryBase', UNIFORMTYPE_UINT),
            new UniformFormat('entryCount', UNIFORMTYPE_UINT),
            new UniformFormat('instanceBase', UNIFORMTYPE_UINT),
            new UniformFormat('sourceWidth', UNIFORMTYPE_UINT),
            new UniformFormat('cacheWidth', UNIFORMTYPE_UINT),
            new UniformFormat('viewport', UNIFORMTYPE_VEC2),
            new UniformFormat('isOrtho', UNIFORMTYPE_UINT),
            new UniformFormat('focal', UNIFORMTYPE_VEC2),
            new UniformFormat('model', UNIFORMTYPE_MAT4),
            new UniformFormat('view', UNIFORMTYPE_MAT4),
            new UniformFormat('viewProj', UNIFORMTYPE_MAT4),
            new UniformFormat('cameraPosition', UNIFORMTYPE_VEC3),
            new UniformFormat('previewMode', UNIFORMTYPE_UINT),
            new UniformFormat('colorAlpha', UNIFORMTYPE_FLOAT),
            new UniformFormat('colorRow0', UNIFORMTYPE_VEC4),
            new UniformFormat('colorRow1', UNIFORMTYPE_VEC4),
            new UniformFormat('colorRow2', UNIFORMTYPE_VEC4),
            new UniformFormat('lockedColor', UNIFORMTYPE_VEC4),
            new UniformFormat('visible', UNIFORMTYPE_UINT),
            new UniformFormat('selectionEnabled', UNIFORMTYPE_UINT),
            new UniformFormat('pickOp', UNIFORMTYPE_INT),
            new UniformFormat('minPixelSize', UNIFORMTYPE_FLOAT)
        ]);
        const bindGroupFormat = new BindGroupFormat(this.device, [
            new BindStorageBufferFormat('sortKeys', SHADERSTAGE_COMPUTE),
            new BindStorageBufferFormat('compactEntries', SHADERSTAGE_COMPUTE),
            new BindStorageBufferFormat('splatCounter', SHADERSTAGE_COMPUTE),
            new BindStorageTextureFormat('cacheA', PIXELFORMAT_RGBA32U),
            new BindStorageTextureFormat('cacheB', PIXELFORMAT_R32U),
            new BindStorageBufferFormat('instanceSource', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('instanceFlags', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('instancePalette', SHADERSTAGE_COMPUTE, true),
            ...textureFormats,
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE)
        ]);
        const shader = new Shader(this.device, {
            name: `ProjectedSplatProjector-${bands}`,
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: projectedSplatProjector(bands),
            computeBindGroupFormat: bindGroupFormat,
            computeUniformBufferFormats: { uniforms: uniformBufferFormat }
        } as any);
        variant = { shader, bindGroupFormat, uniformBufferFormat };
        this.variants.set(bands, variant);
        return variant;
    }

    // the shader (and its pipeline) is shared per band count, the Compute - and
    // with it the uniform buffer and bind group - is per placement
    private getCompute(placement: Placement, bands: number) {
        if (!placement.compute || placement.bands !== bands) {
            placement.compute?.destroy();
            placement.compute = new Compute(this.device, this.getVariant(bands).shader, `ProjectedSplatProjector-${bands}`);
            placement.bands = bands;
        }
        return placement.compute;
    }

    // gpu-driven arguments: one workgroup turns the projector's survivor count into
    // the indexed draw args and the sort's dispatch args
    private getArgsCompute() {
        if (!this.argsCompute) {
            const uniformBufferFormat = new UniformBufferFormat(this.device, [
                new UniformFormat('drawSlot', UNIFORMTYPE_UINT),
                new UniformFormat('indexCount', UNIFORMTYPE_UINT),
                new UniformFormat('sortSlotBase', UNIFORMTYPE_UINT),
                new UniformFormat('pad0', UNIFORMTYPE_UINT),
                new UniformFormat('sortIndirectInfo', UNIFORMTYPE_UVEC4)
            ]);
            const bindGroupFormat = new BindGroupFormat(this.device, [
                new BindStorageBufferFormat('splatCounter', SHADERSTAGE_COMPUTE, true),
                new BindStorageBufferFormat('indirectDrawArgs', SHADERSTAGE_COMPUTE),
                new BindStorageBufferFormat('indirectDispatchArgs', SHADERSTAGE_COMPUTE),
                new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE)
            ]);
            this.argsShader = new Shader(this.device, {
                name: 'ProjectedSplatIndirectArgs',
                shaderLanguage: SHADERLANGUAGE_WGSL,
                cshader: projectedSplatIndirectArgs(INSTANCE_SIZE),
                computeBindGroupFormat: bindGroupFormat,
                computeUniformBufferFormats: { uniforms: uniformBufferFormat }
            } as any);
            this.argsBindGroupFormat = bindGroupFormat;
            this.argsCompute = new Compute(this.device, this.argsShader, 'ProjectedSplatIndirectArgs');
        }
        return this.argsCompute;
    }

    private getFootprintCompute() {
        if (!this.footprintCompute) {
            const uniformBufferFormat = new UniformBufferFormat(this.device, [
                new UniformFormat('cacheWidth', UNIFORMTYPE_UINT),
                new UniformFormat('viewport', UNIFORMTYPE_VEC2),
                new UniformFormat('entryBase', UNIFORMTYPE_UINT),
                new UniformFormat('entryCount', UNIFORMTYPE_UINT),
                new UniformFormat('regionY0', UNIFORMTYPE_INT),
                new UniformFormat('regionY1', UNIFORMTYPE_INT),
                new UniformFormat('footprint', UNIFORMTYPE_FLOAT),
                new UniformFormat('outputWords', UNIFORMTYPE_UINT)
            ]);
            const bindGroupFormat = new BindGroupFormat(this.device, [
                new BindStorageBufferFormat('result', SHADERSTAGE_COMPUTE),
                new BindStorageBufferFormat('compactEntries', SHADERSTAGE_COMPUTE, true),
                new BindStorageBufferFormat('splatCounter', SHADERSTAGE_COMPUTE, true),
                new BindStorageBufferFormat('intervals', SHADERSTAGE_COMPUTE, true),
                new BindTextureFormat('cacheA', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
                new BindTextureFormat('cacheB', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
                new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE)
            ]);
            this.footprintShader = new Shader(this.device, {
                name: 'FootprintIntersect',
                shaderLanguage: SHADERLANGUAGE_WGSL,
                cshader: footprintIntersect,
                computeBindGroupFormat: bindGroupFormat,
                computeUniformBufferFormats: { uniforms: uniformBufferFormat }
            } as any);
            this.footprintBindGroupFormat = bindGroupFormat;
            this.footprintCompute = new Compute(this.device, this.footprintShader, 'FootprintIntersect');
        }
        return this.footprintCompute;
    }

    // Through-mode footprint selection: test every projected splat's screen
    // ellipse, scaled by the footprint factor, against the gesture region
    // (per-row x-intervals in render-target pixels). Returns the per-instance
    // byte mask consumed by SelectOp. No depth test - selects through all
    // layers, like the centers intersect, but by footprint instead of center.
    async footprintIntersect(
        splat: Splat,
        region: { y0: number, y1: number, intervals: Uint32Array },
        footprint: number
    ): Promise<Uint8Array | null> {
        const placement = this.placements.find(item => item.splat === splat);
        if (!placement) {
            return null;
        }

        // re-project so the cache matches the current camera even if no frame
        // rendered since it moved
        this.renderSortedForPick();

        const byteSize = maskByteSize(placement.count);
        if (!this.footprintOutput || this.footprintOutput.byteSize !== byteSize) {
            this.footprintOutput?.destroy();
            this.footprintOutput = new StorageBuffer(
                this.device, byteSize, BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC);
        }
        this.footprintOutput.clear();

        if (!this.footprintIntervals || this.footprintIntervals.byteSize < region.intervals.byteLength) {
            this.footprintIntervals?.destroy();
            this.footprintIntervals = new StorageBuffer(
                this.device, region.intervals.byteLength, BUFFERUSAGE_COPY_DST);
        }
        this.footprintIntervals.write(0, region.intervals, 0, region.intervals.length);

        const compute = this.getFootprintCompute();
        compute.setParameter('result', this.footprintOutput);
        compute.setParameter('compactEntries', this.compactEntries);
        compute.setParameter('splatCounter', this.splatCounter);
        compute.setParameter('intervals', this.footprintIntervals);
        compute.setParameter('cacheA', this.cacheA);
        compute.setParameter('cacheB', this.cacheB);
        compute.setParameter('cacheWidth', this.cacheWidth);
        compute.setParameter('viewport', [this.scene.targetSize.width, this.scene.targetSize.height]);
        compute.setParameter('entryBase', placement.entryBase);
        compute.setParameter('entryCount', placement.count);
        compute.setParameter('regionY0', region.y0);
        compute.setParameter('regionY1', region.y1);
        compute.setParameter('footprint', footprint);
        compute.setParameter('outputWords', byteSize / 4);
        Compute.calcDispatchSize(Math.ceil(this.capacity / WORKGROUP_SIZE), this.dispatchSize);
        compute.setupDispatch(this.dispatchSize.x, this.dispatchSize.y);
        this.device.computeDispatch([compute], 'footprintIntersect');

        const readback = this.footprintOutput.read(0, byteSize, null, false);
        (this.device as any).submit();
        return await readback as Uint8Array;
    }

    private rebuildLayout() {
        let count = 0;
        for (const placement of this.placements) {
            if (placement.count > placement.entryCapacity) {
                // grow geometrically so repeated appends don't realloc every time
                placement.entryCapacity = roundUp(
                    Math.max(placement.count, Math.ceil(placement.entryCapacity * 1.25)),
                    ENTRY_ALIGNMENT
                );
            }
            placement.entryBase = count;
            count += placement.entryCapacity;
        }

        if (count !== this.capacity) {
            this.sortKeys?.destroy();
            this.compactEntries?.destroy();
            this.cacheA?.destroy();
            this.cacheB?.destroy();
            this.sortKeys = null;
            this.compactEntries = null;
            this.cacheA = null;
            this.cacheB = null;
            this.capacity = count;

            if (count > 0) {
                this.cacheWidth = Math.min(this.device.maxTextureSize, Math.ceil(Math.sqrt(count)));
                this.cacheHeight = Math.ceil(count / this.cacheWidth);
                this.cacheA = new Texture(this.device, {
                    name: 'ProjectedSplatCacheA',
                    width: this.cacheWidth,
                    height: this.cacheHeight,
                    format: PIXELFORMAT_RGBA32U,
                    mipmaps: false,
                    storage: true
                });
                this.cacheB = new Texture(this.device, {
                    name: 'ProjectedSplatCacheB',
                    width: this.cacheWidth,
                    height: this.cacheHeight,
                    format: PIXELFORMAT_R32U,
                    mipmaps: false,
                    storage: true
                });
                this.sortKeys = new StorageBuffer(
                    this.device,
                    count * 4,
                    BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST
                );
                this.compactEntries = new StorageBuffer(
                    this.device,
                    count * 4,
                    BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST
                );
                this.sorter.capacity = count;
            }
        }

        // The forward draw is gpu-driven, but indirect draw commands are bound per
        // frame (the engine clears them in frameEnd), so passes that render outside
        // a frame - the id and depth picker - fall back to this count. It has to
        // cover the whole capacity for them: the vertex shader trims the draw to
        // the live count either way, so this only costs the picker, never a frame.
        this.meshInstance.instancingCount = Math.ceil(count / INSTANCE_SIZE);
        this.entity.enabled = count > 0;
        this.layoutDirty = false;
        this.scene.events.fire('splat.projectedRendererResized', this.stats);
    }

    render() {
        if (this.layoutDirty) {
            this.rebuildLayout();
        }
        if (this.capacity === 0 || !this.sortKeys || !this.compactEntries || !this.cacheA || !this.cacheB) {
            return;
        }

        const start = performance.now();
        const { camera, targetSize, events } = this.scene;
        const cameraComponent = camera.camera;
        const view = cameraComponent.viewMatrix;
        // match the depth convention of engine-drawn meshes: the forward
        // renderer maps clip z to WebGPU's 0..1 range (setCameraUniforms), so
        // splat depth must be produced with the same transform to test
        // correctly against the depth they write (grid, tool overlays)
        const proj = Camera.applyShaderProjectionTransform(
            cameraComponent.projectionMatrix, this.shaderProjection, false, this.device.isWebGPU);
        this.viewProjection.mul2(proj, view);
        const cameraPosition = camera.mainCamera.getPosition();
        const projection = cameraComponent.projectionMatrix.data;
        const viewport = [targetSize.width, targetSize.height];
        const focal = [
            Math.abs(projection[0]) * targetSize.width * 0.5,
            Math.abs(projection[5]) * targetSize.height * 0.5
        ];
        const selectedSplat = events.invoke('selection') as Splat;
        const selectedColor = events.invoke('selectedClr');
        const unselectedColor = events.invoke('unselectedClr');
        const lockedColor = events.invoke('lockedClr');
        const viewBands = events.invoke('view.bands') as number;
        const minPixelSize = (events.invoke('view.minPixelSize') as number) ?? 0;

        // the colour panel's uncommitted grade, previewed on the layer it targets.
        // Packed once per frame: it is the same for every placement, only the
        // preview mode differs.
        const pending = events.invoke('colorPanel.pending') as GradeParams;
        const outlineSelection = events.invoke('view.outlineSelection') || !!pending;
        if (pending) {
            gradeRows(gradeTerms(pending, this.previewTerms), this.previewRows);
        }

        // motion-adaptive: fast stochastic (no-sort) while interacting, clean
        // sorted & blended when the scene settles (driven by Scene.onUpdate)
        this.setStochastic(this.scene.movingRender && !this.forceSorted);

        let ringsBase = 0;
        let ringsCount = 0;

        // the projector appends survivors, so the count starts each frame at zero.
        // The clear is recorded on the shared command encoder, which orders it
        // ahead of the dispatches below
        this.splatCounter.clear();

        for (const placement of this.placements) {
            const { splat } = placement;
            const { instances } = splat;
            const resource = splat.resource;
            const bands = Math.min(viewBands, resource.shBands);
            const compute = this.getCompute(placement, bands);
            const selectionEnabled = selectedSplat === splat && camera.renderOverlays;
            // only the layer the panel is editing previews, and an empty selection
            // means the whole layer - the rule SplatsColorOp applies
            const previewMode = (pending && selectedSplat === splat) ?
                (instances.numSelected === 0 ? 2 : 1) : 0;

            if (selectionEnabled) {
                ringsBase = placement.entryBase;
                ringsCount = placement.count;
            }

            compute.setParameter('sortKeys', this.sortKeys);
            compute.setParameter('compactEntries', this.compactEntries);
            compute.setParameter('splatCounter', this.splatCounter);
            compute.setParameter('cacheA', this.cacheA);
            compute.setParameter('cacheB', this.cacheB);
            compute.setParameter('instanceSource', instances.instanceSource);
            compute.setParameter('instanceFlags', instances.instanceFlags);
            compute.setParameter('instancePalette', instances.instancePalette);
            compute.setParameter('transformA', resource.getTexture('transformA'));
            compute.setParameter('transformB', resource.getTexture('transformB'));
            compute.setParameter('splatColor', resource.getTexture('splatColor'));
            compute.setParameter('transformPalette', splat.transformPalette.texture);
            compute.setParameter('colorPalette', splat.colorPalette.texture);
            if (bands > 0) {
                compute.setParameter('splatSH_1to3', resource.getTexture('splatSH_1to3'));
            }
            if (bands > 1) {
                compute.setParameter('splatSH_4to7', resource.getTexture('splatSH_4to7'));
                compute.setParameter('splatSH_8to11', resource.getTexture('splatSH_8to11'));
            }
            if (bands > 2) {
                compute.setParameter('splatSH_12to15', resource.getTexture('splatSH_12to15'));
            }

            compute.setParameter('numSplats', placement.count);
            compute.setParameter('entryBase', placement.entryBase);
            compute.setParameter('entryCount', placement.entryCapacity);
            compute.setParameter('instanceBase', placement.instanceBase);
            compute.setParameter('sourceWidth', resource.textureDimensions.x);
            compute.setParameter('cacheWidth', this.cacheWidth);
            compute.setParameter('viewport', viewport);
            compute.setParameter('isOrtho', cameraComponent.projection === 1 ? 1 : 0);
            compute.setParameter('focal', focal);
            compute.setParameter('model', splat.entity.getWorldTransform().data);
            compute.setParameter('view', view.data);
            compute.setParameter('viewProj', this.viewProjection.data);
            compute.setParameter('cameraPosition', [cameraPosition.x, cameraPosition.y, cameraPosition.z]);
            compute.setParameter('previewMode', previewMode);
            compute.setParameter('colorAlpha', previewMode ? this.previewTerms.transparency : 1);
            compute.setParameter('colorRow0', this.previewRows.subarray(0, 4));
            compute.setParameter('colorRow1', this.previewRows.subarray(4, 8));
            compute.setParameter('colorRow2', this.previewRows.subarray(8, 12));
            compute.setParameter('lockedColor', [lockedColor.r, lockedColor.g, lockedColor.b, lockedColor.a]);
            compute.setParameter('visible', splat.visible ? 1 : 0);
            compute.setParameter('selectionEnabled', selectionEnabled ? 1 : 0);
            compute.setParameter('pickOp', -1);
            compute.setParameter('minPixelSize', minPixelSize);

            const workgroups = Math.ceil(placement.entryCapacity / WORKGROUP_SIZE);
            Compute.calcDispatchSize(workgroups, this.dispatchSize);
            compute.setupDispatch(this.dispatchSize.x, this.dispatchSize.y);
            this.device.computeDispatch([compute], `project-splats-${splat.uid}`);
        }

        // Turn the survivor count into indirect draw and sort arguments. Indirect
        // slots are recycled at frame end, so they are claimed fresh every frame.
        const sortInfo = this.sorter.prepareIndirect();
        const drawSlot = (this.device as any).getIndirectDrawSlot();
        this.drawSlot = drawSlot;
        const sortSlotBase = (this.device as any).getIndirectDispatchSlot(sortInfo[0]);
        const args = this.getArgsCompute();
        args.setParameter('splatCounter', this.splatCounter);
        args.setParameter('indirectDrawArgs', (this.device as any).indirectDrawBuffer);
        args.setParameter('indirectDispatchArgs', (this.device as any).indirectDispatchBuffer);
        args.setParameter('drawSlot', drawSlot);
        args.setParameter('indexCount', INSTANCE_SIZE * 6);
        args.setParameter('sortSlotBase', sortSlotBase);
        args.setParameter('pad0', 0);
        // sorter-owned Uint32Array, uploaded as a vec4u - setParameter's types only cover f32 arrays
        args.setParameter('sortIndirectInfo', sortInfo as any);
        args.setupDispatch(1, 1);
        this.device.computeDispatch([args], 'ProjectedSplatIndirectArgs');
        this.meshInstance.setIndirect(null, drawSlot, 1);
        this.material.setParameter('compactEntries', this.compactEntries);
        this.material.setParameter('splatCount', this.splatCounter);

        if (!this.stochastic) {
            // the sort requires numBits to be a multiple of the active backend's
            // radix width, and the backend is chosen from the device: 4 bits for
            // the portable multipass sorter, 8 for OneSweep (NVIDIA only). A
            // non-multiple is undefined behaviour and hangs OneSweep's lookback
            // loop, which surfaces as a D3D12 device-removed TDR - and the
            // engine's guard is a Debug.assert, so release builds fail silently.
            // Rounding up is free: the extra bits of the key are always zero.
            const sortBits = roundUp(SORT_KEY_BITS, this.sorter.radixBits);
            // capacity is the worst-case element count; the live count comes from
            // splatCounter, and compactEntries seeds the payload so the sorted
            // output is cache entry indices, exactly as before compaction
            const sortedIndices = this.sorter.sortIndirect(
                this.sortKeys, this.capacity, sortBits, sortSlotBase,
                this.splatCounter, this.compactEntries, true, true);
            this.material.setParameter('sortedIndices', sortedIndices);
        }
        this.material.setParameter('cacheA', this.cacheA);
        this.material.setParameter('cacheB', this.cacheB);
        this.material.setParameter('cacheWidth', this.cacheWidth);
        this.finishPick();
        this.material.setParameter('viewportSize', [
            targetSize.width,
            targetSize.height,
            2 / targetSize.width,
            2 / targetSize.height
        ]);
        this.material.setParameter('outlineMode', outlineSelection ? 1 : 0);
        // the master overlay switch (tab) shows the raw scene: gaussians render
        // regardless of the profile flag and the non-selection rings hide
        const overlay = events.invoke('view.overlay');
        this.material.setParameter('showGaussians', events.invoke('view.gaussians') || !overlay || pending ? 1 : 0);
        this.material.setParameter('showSelectedGaussians', events.invoke('view.selectionColor') && !pending ? 1 : 0);
        const showAllRings = events.invoke('view.rings') && overlay;
        const showSelectedRings = events.invoke('view.selectionRings') &&
            (selectedSplat?.instances.numSelected ?? 0) > 0;
        const showRings = showAllRings || showSelectedRings;
        this.material.setParameter('ringSize', showRings ? events.invoke('view.ringSize') * 0.01 : 0);
        this.material.setParameter('ringSelectionOnly', showAllRings ? 0 : 1);
        // the colour alphas carry blend weights, not opacity. The gaussian
        // tints blend the fill from the splat's own colour toward the flat
        // unselected colour, then toward the selection colour; the vertex
        // shader applies them inside the selection entry range (ringsBase /
        // ringsCount), which stands in for the projector's per-placement
        // selectionEnabled
        this.material.setParameter('selectedColor', events.invoke('view.selectionColor') && !pending ? [
            selectedColor.r,
            selectedColor.g,
            selectedColor.b,
            events.invoke('view.splatsSelectionBlend') * (selectedSplat?.selectionAlpha ?? 1)
        ] : [0, 0, 0, 0]);
        this.material.setParameter('unselectedColor', !pending ? [
            unselectedColor.r,
            unselectedColor.g,
            unselectedColor.b,
            events.invoke('view.splatsColorBlend')
        ] : [0, 0, 0, 0]);
        // the ring blends start from the splat's own colour too, so they stay
        // independent of the gaussian tints
        this.material.setParameter('ringColor', [
            unselectedColor.r,
            unselectedColor.g,
            unselectedColor.b,
            events.invoke('view.ringsColorBlend')
        ]);
        this.material.setParameter('selectedRingColor', [
            selectedColor.r,
            selectedColor.g,
            selectedColor.b,
            events.invoke('view.selectionRings') ? events.invoke('view.ringsSelectionBlend') * (selectedSplat?.selectionAlpha ?? 1) : 0
        ]);
        this.material.setParameter('ringsBase', ringsBase);
        this.material.setParameter('ringsCount', ringsCount);
        this.material.setParameter('cameraParams', [1 / cameraComponent.farClip, cameraComponent.farClip, cameraComponent.nearClip, cameraComponent.projection]);
        // clip z is affine in view depth for perspective/ortho projections:
        // z = -m22 * depth + m23, taken from the WebGPU-transformed projection
        const shaderProj = this.shaderProjection.data;
        this.material.setParameter('clipZParams', [-shaderProj[10], shaderProj[14], cameraComponent.projection === 1 ? 1 : 0, 0]);
        this.submissionCpuMs = performance.now() - start;
    }

    get stats(): ProjectedRendererStats {
        const cacheBytes = this.cacheWidth * this.cacheHeight * 20 * (this.capacity > 0 ? 1 : 0);
        // 4 bytes of sort key plus 4 of compacted entry index, per slot
        const keyBytes = this.capacity * 8;
        const estimatedRadixBytes = this.capacity * 12;
        const resources = new Set(this.placements.map(placement => placement.splat.resource));
        const splats = new Set(this.placements.map(placement => placement.splat));
        const sourceBytes = Array.from(resources).reduce((sum, resource) => {
            return sum + Array.from(resource.streams.textures.values()).reduce((textureSum, texture) => textureSum + texture.gpuSize, 0);
        }, 0);
        // the instance list (source row + flags + palette indices) is the whole
        // of the per-gaussian editable data now
        const editingBytes = Array.from(splats).reduce((sum, splat) => sum + splat.instances.byteSize, 0);
        const totalTransientBytes = cacheBytes + keyBytes + estimatedRadixBytes;
        return {
            placements: this.placements.length,
            projectedSplats: this.capacity,
            sourceBytes,
            editingBytes,
            cacheBytes,
            keyBytes,
            estimatedRadixBytes,
            totalTransientBytes,
            totalSplatGpuBytes: sourceBytes + editingBytes + totalTransientBytes,
            submissionCpuMs: this.submissionCpuMs,
            gpuFrameMs: (this.device.gpuProfiler as any)._frameTime ?? 0
        };
    }

    destroy() {
        for (const placement of this.placements) {
            placement.compute?.destroy();
        }
        for (const variant of this.variants.values()) {
            variant.shader.destroy();
            variant.bindGroupFormat.destroy();
        }
        this.sortKeys?.destroy();
        this.compactEntries?.destroy();
        this.splatCounter?.destroy();
        this.argsCompute?.destroy();
        this.argsShader?.destroy();
        this.argsBindGroupFormat?.destroy();
        this.footprintCompute?.destroy();
        this.footprintShader?.destroy();
        this.footprintBindGroupFormat?.destroy();
        this.footprintOutput?.destroy();
        this.footprintIntervals?.destroy();
        this.cacheA?.destroy();
        this.cacheB?.destroy();
        this.sorter.destroy();
        this.entity.destroy();
        this.meshInstance.destroy();
        this.material.destroy();
    }
}

export { ProjectedSplatRenderer };
export type { ProjectedRendererStats };
