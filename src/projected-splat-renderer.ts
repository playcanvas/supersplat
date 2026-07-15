import {
    BLEND_PREMULTIPLIED,
    BUFFERUSAGE_COPY_DST,
    BUFFERUSAGE_COPY_SRC,
    CULLFACE_NONE,
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
    UNIFORMTYPE_VEC2,
    UNIFORMTYPE_VEC3,
    UNIFORMTYPE_VEC4,
    BindGroupFormat,
    BindStorageBufferFormat,
    BindStorageTextureFormat,
    BindTextureFormat,
    BindUniformBufferFormat,
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

import type { Scene } from './scene';
import { projectedSplatProjector } from './shaders/projected-splat-projector';
import { fragmentShader, vertexShader } from './shaders/projected-splat-shader';
import type { Splat } from './splat';

const INSTANCE_SIZE = 128;
const WORKGROUP_SIZE = 256;

type ProjectorVariant = {
    compute: Compute;
    bindGroupFormat: BindGroupFormat;
    uniformBufferFormat: UniformBufferFormat;
};

type Placement = {
    splat: Splat;
    count: number;
    entryBase: number;
    sourceIndices: StorageBuffer | null;
};

type ProjectedRendererStats = {
    placements: number;
    projectedSplats: number;
    sourceBytes: number;
    editingBytes: number;
    placementIndexBytes: number;
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
    private readonly viewProjection = new Mat4();
    private readonly dispatchSize = new Vec2();
    private readonly dummyIndices: StorageBuffer;
    private readonly sorter: ComputeRadixSort;
    private readonly material: ShaderMaterial;
    private readonly mesh: Mesh;
    private readonly meshInstance: MeshInstance;
    private readonly entity: Entity;

    private sortKeys: StorageBuffer | null = null;
    private cacheA: Texture | null = null;
    private cacheB: Texture | null = null;
    private cacheWidth = 1;
    private cacheHeight = 1;
    private capacity = 0;
    private layoutDirty = true;
    private submissionCpuMs = 0;

    constructor(scene: Scene) {
        this.scene = scene;
        this.device = scene.graphicsDevice;

        this.dummyIndices = new StorageBuffer(this.device, 4, BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC);
        const dummyIndex = new Uint32Array(1);
        this.dummyIndices.write(0, dummyIndex, 0, dummyIndex.length);
        this.sorter = new ComputeRadixSort(this.device);

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
        this.material.setParameter('numProjectedSplats', 0);
        this.material.setParameter('cacheWidth', 1);
        this.material.setParameter('viewportSize', [1, 1, 2, 2]);
        this.material.setParameter('pickBase', 0);
        this.material.setParameter('pickCount', 0);
        this.material.setParameter('pickOp', 2);
        this.material.setParameter('outlineMode', 0);
        this.material.setParameter('ringSize', 0);
        this.material.setParameter('pickMode', 0);
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

        this.device.gpuProfiler.enabled = true;
        scene.events.function('splat.projectedRendererStats', () => this.stats);
    }

    add(splat: Splat, sourceIndices?: Uint32Array) {
        let indexBuffer: StorageBuffer | null = null;
        if (sourceIndices) {
            indexBuffer = new StorageBuffer(
                this.device,
                Math.max(4, sourceIndices.byteLength),
                BUFFERUSAGE_COPY_DST | BUFFERUSAGE_COPY_SRC
            );
            indexBuffer.write(0, sourceIndices, 0, sourceIndices.length);
        }
        this.placements.push({
            splat,
            count: sourceIndices?.length ?? splat.splatData.numSplats,
            entryBase: 0,
            sourceIndices: indexBuffer
        });
        this.layoutDirty = true;
    }

    remove(splat: Splat) {
        const index = this.placements.findIndex(placement => placement.splat === splat);
        if (index !== -1) {
            this.placements[index].sourceIndices?.destroy();
            this.placements.splice(index, 1);
            this.layoutDirty = true;
        }
    }

    replace(splat: Splat) {
        const placement = this.placements.find(item => item.splat === splat);
        if (placement) {
            placement.count = placement.sourceIndices ? placement.sourceIndices.byteSize / 4 : splat.splatData.numSplats;
            this.layoutDirty = true;
        }
    }

    preparePick(splat: Splat, pickOp: number, depth: boolean) {
        const placement = this.placements.find(item => item.splat === splat);
        this.material.setParameter('pickBase', placement?.entryBase ?? 0);
        this.material.setParameter('pickCount', placement?.count ?? 0);
        this.material.setParameter('pickOp', pickOp);
        this.material.setParameter('pickMode', depth ? 1 : 0);
    }

    finishPick() {
        this.material.setParameter('pickBase', 0);
        this.material.setParameter('pickCount', this.capacity);
        this.material.setParameter('pickOp', 2);
        this.material.setParameter('pickMode', 0);
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
            new BindTextureFormat('splatState', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_FLOAT, false),
            new BindTextureFormat('splatTransform', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindTextureFormat('transformPalette', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UNFILTERABLE_FLOAT, false)
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
            new UniformFormat('sourceWidth', UNIFORMTYPE_UINT),
            new UniformFormat('cacheWidth', UNIFORMTYPE_UINT),
            new UniformFormat('viewport', UNIFORMTYPE_VEC2),
            new UniformFormat('isOrtho', UNIFORMTYPE_UINT),
            new UniformFormat('focal', UNIFORMTYPE_VEC2),
            new UniformFormat('model', UNIFORMTYPE_MAT4),
            new UniformFormat('view', UNIFORMTYPE_MAT4),
            new UniformFormat('viewProj', UNIFORMTYPE_MAT4),
            new UniformFormat('cameraPosition', UNIFORMTYPE_VEC3),
            new UniformFormat('saturation', UNIFORMTYPE_FLOAT),
            new UniformFormat('colorOffset', UNIFORMTYPE_VEC4),
            new UniformFormat('colorScale', UNIFORMTYPE_VEC4),
            new UniformFormat('selectedColor', UNIFORMTYPE_VEC4),
            new UniformFormat('lockedColor', UNIFORMTYPE_VEC4),
            new UniformFormat('indexed', UNIFORMTYPE_UINT),
            new UniformFormat('visible', UNIFORMTYPE_UINT),
            new UniformFormat('selectionEnabled', UNIFORMTYPE_UINT),
            new UniformFormat('pickOp', UNIFORMTYPE_INT)
        ]);
        const bindGroupFormat = new BindGroupFormat(this.device, [
            new BindStorageBufferFormat('sortKeys', SHADERSTAGE_COMPUTE),
            new BindStorageTextureFormat('cacheA', PIXELFORMAT_RGBA32U),
            new BindStorageTextureFormat('cacheB', PIXELFORMAT_RGBA32U),
            new BindStorageBufferFormat('sourceIndices', SHADERSTAGE_COMPUTE, true),
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
        const compute = new Compute(this.device, shader, `ProjectedSplatProjector-${bands}`);
        variant = { compute, bindGroupFormat, uniformBufferFormat };
        this.variants.set(bands, variant);
        return variant;
    }

    private rebuildLayout() {
        let count = 0;
        for (const placement of this.placements) {
            placement.entryBase = count;
            count += placement.count;
        }

        if (count !== this.capacity) {
            this.sortKeys?.destroy();
            this.cacheA?.destroy();
            this.cacheB?.destroy();
            this.sortKeys = null;
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
                    format: PIXELFORMAT_RGBA32U,
                    mipmaps: false,
                    storage: true
                });
                this.sortKeys = new StorageBuffer(
                    this.device,
                    count * 4,
                    BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST
                );
                this.sorter.capacity = count;
            }
        }

        this.meshInstance.instancingCount = Math.ceil(count / INSTANCE_SIZE);
        this.entity.enabled = count > 0;
        this.layoutDirty = false;
        this.scene.events.fire('splat.projectedRendererResized', this.stats);
    }

    render() {
        if (this.layoutDirty) {
            this.rebuildLayout();
        }
        if (this.capacity === 0 || !this.sortKeys || !this.cacheA || !this.cacheB) {
            return;
        }

        const start = performance.now();
        const { camera, targetSize, events } = this.scene;
        const cameraComponent = camera.camera;
        const view = cameraComponent.viewMatrix;
        this.viewProjection.mul2(cameraComponent.projectionMatrix, view);
        const cameraPosition = camera.mainCamera.getPosition();
        const projection = cameraComponent.projectionMatrix.data;
        const viewport = [targetSize.width, targetSize.height];
        const focal = [
            Math.abs(projection[0]) * targetSize.width * 0.5,
            Math.abs(projection[5]) * targetSize.height * 0.5
        ];
        const selectedSplat = events.invoke('selection') as Splat;
        const selectedColor = events.invoke('selectedClr');
        const lockedColor = events.invoke('lockedClr');
        const viewBands = events.invoke('view.bands') as number;

        for (const placement of this.placements) {
            const { splat } = placement;
            const resource = splat.resource;
            const bands = Math.min(viewBands, resource.shBands);
            const compute = this.getVariant(bands).compute;
            const offset = -splat.blackPoint + splat.brightness;
            const scale = 1 / (splat.whitePoint - splat.blackPoint);
            const selectionEnabled = selectedSplat === splat && camera.renderOverlays;

            compute.setParameter('sortKeys', this.sortKeys);
            compute.setParameter('cacheA', this.cacheA);
            compute.setParameter('cacheB', this.cacheB);
            compute.setParameter('sourceIndices', placement.sourceIndices ?? this.dummyIndices);
            compute.setParameter('transformA', resource.getTexture('transformA'));
            compute.setParameter('transformB', resource.getTexture('transformB'));
            compute.setParameter('splatColor', resource.getTexture('splatColor'));
            compute.setParameter('splatState', splat.stateTexture);
            compute.setParameter('splatTransform', splat.transformTexture);
            compute.setParameter('transformPalette', splat.transformPalette.texture);
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
            compute.setParameter('sourceWidth', resource.textureDimensions.x);
            compute.setParameter('cacheWidth', this.cacheWidth);
            compute.setParameter('viewport', viewport);
            compute.setParameter('isOrtho', cameraComponent.projection === 1 ? 1 : 0);
            compute.setParameter('focal', focal);
            compute.setParameter('model', splat.entity.getWorldTransform().data);
            compute.setParameter('view', view.data);
            compute.setParameter('viewProj', this.viewProjection.data);
            compute.setParameter('cameraPosition', [cameraPosition.x, cameraPosition.y, cameraPosition.z]);
            compute.setParameter('saturation', splat.saturation);
            compute.setParameter('colorOffset', [offset, offset, offset, 0]);
            compute.setParameter('colorScale', [
                scale * splat.tintClr.r * (1 + splat.temperature),
                scale * splat.tintClr.g,
                scale * splat.tintClr.b * (1 - splat.temperature),
                splat.transparency
            ]);
            compute.setParameter('selectedColor', selectionEnabled && !events.invoke('view.outlineSelection') ? [
                selectedColor.r,
                selectedColor.g,
                selectedColor.b,
                selectedColor.a * splat.selectionAlpha
            ] : [0, 0, 0, 0]);
            compute.setParameter('lockedColor', [lockedColor.r, lockedColor.g, lockedColor.b, lockedColor.a]);
            compute.setParameter('indexed', placement.sourceIndices ? 1 : 0);
            compute.setParameter('visible', splat.visible ? 1 : 0);
            compute.setParameter('selectionEnabled', selectionEnabled ? 1 : 0);
            compute.setParameter('pickOp', -1);

            const workgroups = Math.ceil(placement.count / WORKGROUP_SIZE);
            Compute.calcDispatchSize(workgroups, this.dispatchSize);
            compute.setupDispatch(this.dispatchSize.x, this.dispatchSize.y);
            this.device.computeDispatch([compute], `project-splats-${splat.uid}`);
        }

        const sortedIndices = this.sorter.sort(this.sortKeys, this.capacity, 20, undefined, true, true);
        this.material.setParameter('sortedIndices', sortedIndices);
        this.material.setParameter('cacheA', this.cacheA);
        this.material.setParameter('cacheB', this.cacheB);
        this.material.setParameter('cacheWidth', this.cacheWidth);
        this.material.setParameter('numProjectedSplats', this.capacity);
        this.finishPick();
        this.material.setParameter('viewportSize', [
            targetSize.width,
            targetSize.height,
            2 / targetSize.width,
            2 / targetSize.height
        ]);
        this.material.setParameter('outlineMode', events.invoke('view.outlineSelection') ? 1 : 0);
        this.material.setParameter('ringSize', events.invoke('camera.mode') === 'rings' ? 0.04 : 0);
        this.material.setParameter('cameraParams', [1 / cameraComponent.farClip, cameraComponent.farClip, cameraComponent.nearClip, cameraComponent.projection]);
        this.submissionCpuMs = performance.now() - start;
    }

    get stats(): ProjectedRendererStats {
        const cacheBytes = this.cacheWidth * this.cacheHeight * 32 * (this.capacity > 0 ? 1 : 0);
        const keyBytes = this.capacity * 4;
        const estimatedRadixBytes = this.capacity * 12;
        const resources = new Set(this.placements.map(placement => placement.splat.resource));
        const splats = new Set(this.placements.map(placement => placement.splat));
        const sourceBytes = Array.from(resources).reduce((sum, resource) => {
            return sum + Array.from(resource.streams.textures.values()).reduce((textureSum, texture) => textureSum + texture.gpuSize, 0);
        }, 0);
        const editingBytes = Array.from(splats).reduce((sum, splat) => {
            return sum + splat.stateTexture.gpuSize + splat.transformTexture.gpuSize;
        }, 0);
        const placementIndexBytes = this.placements.reduce((sum, placement) => sum + (placement.sourceIndices?.byteSize ?? 0), 0);
        const totalTransientBytes = cacheBytes + keyBytes + estimatedRadixBytes;
        return {
            placements: this.placements.length,
            projectedSplats: this.capacity,
            sourceBytes,
            editingBytes,
            placementIndexBytes,
            cacheBytes,
            keyBytes,
            estimatedRadixBytes,
            totalTransientBytes,
            totalSplatGpuBytes: sourceBytes + editingBytes + placementIndexBytes + totalTransientBytes,
            submissionCpuMs: this.submissionCpuMs,
            gpuFrameMs: (this.device.gpuProfiler as any)._frameTime ?? 0
        };
    }

    destroy() {
        for (const placement of this.placements) {
            placement.sourceIndices?.destroy();
        }
        for (const variant of this.variants.values()) {
            variant.compute.shader?.destroy();
            variant.compute.destroy();
            variant.bindGroupFormat.destroy();
        }
        this.sortKeys?.destroy();
        this.cacheA?.destroy();
        this.cacheB?.destroy();
        this.dummyIndices.destroy();
        this.sorter.destroy();
        this.entity.destroy();
        this.meshInstance.destroy();
        this.material.destroy();
    }
}

export { ProjectedSplatRenderer };
export type { ProjectedRendererStats };
