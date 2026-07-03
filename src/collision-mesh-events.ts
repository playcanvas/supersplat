import {
    MemoryFileSystem,
    processDataTable,
    logger as splatTransformLogger,
    writeVoxel
} from '@playcanvas/splat-transform';
import { BoundingBox, Vec3 } from 'playcanvas';

import { CollisionMesh, CollisionMeshRenderMode } from './collision-mesh';
import { Element, ElementType } from './element';
import { Events } from './events';
import { BrowserFileSystem } from './io/write/browser-file-system';
import { parseGlb } from './parse-glb';
import { Scene } from './scene';
import { Splat } from './splat';
import { createGpuDevice, createProgressRenderer, extractDataTable } from './splat-serialize';
import { i18n } from './ui/localization';

type CollisionMeshOptions = {
    seed: { x: number, y: number, z: number };
    voxelSize: number;
    opacityCutoff: number;
    style: 'smooth' | 'faces';
    clusterFilter: boolean;
    fillMode: 'none' | 'exterior' | 'floor';
    fillRadius: number;
    floorFillDilation: number;
    carve: boolean;
    carveHeight: number;
    carveRadius: number;
};

// keep the voxel grid to a sane size - beyond this the library allocates
// heavily and generation times become impractical
const MAX_VOXELS_PER_AXIS = 1500;

const registerCollisionMeshEvents = (events: Events, scene: Scene) => {
    const collisionMesh = new CollisionMesh();
    scene.add(collisionMesh);

    let generating = false;
    let glbBytes: Uint8Array | null = null;
    let stale = false;
    let splatSignature = '';

    const setStale = (value: boolean) => {
        if (value !== stale) {
            stale = value;
            events.fire('collisionMesh.staleChanged', stale);
        }
    };

    const showError = (message: string) => {
        return events.invoke('showPopup', {
            type: 'error',
            header: i18n.t('popup.error'),
            message
        });
    };

    // signature of the splat data the mesh is generated from. selection-only
    // changes must not alter it (numSelected is deliberately excluded).
    const calcSplatSignature = () => {
        return (events.invoke('scene.splats') as Splat[])
        .map(splat => `${splat.uid}:${splat.numSplats}:${splat.state.numLocked}`)
        .join('|');
    };

    // staleness only ever escalates - it is cleared by a successful generate
    const markStale = () => {
        if (collisionMesh.mesh) {
            setStale(true);
        }
    };

    // state changes include selection, which does not affect the mesh - only
    // mark stale when the signature actually changed
    const checkStale = () => {
        if (collisionMesh.mesh && calcSplatSignature() !== splatSignature) {
            setStale(true);
        }
    };

    events.function('collisionMesh.generate', async (options: CollisionMeshOptions) => {
        if (generating) {
            return false;
        }

        const splats = events.invoke('scene.splats') as Splat[];
        if (splats.length === 0) {
            return false;
        }

        // guard against impractically small voxel sizes for the scene extent
        const bound = new BoundingBox();
        splats.forEach((splat, i) => {
            if (i === 0) {
                bound.copy(splat.worldBound);
            } else {
                bound.add(splat.worldBound);
            }
        });
        const maxExtent = 2 * Math.max(bound.halfExtents.x, bound.halfExtents.y, bound.halfExtents.z);
        if (maxExtent / options.voxelSize > MAX_VOXELS_PER_AXIS) {
            await showError(i18n.t('panel.collision-mesh.voxel-size-too-small'));
            return false;
        }

        generating = true;
        events.fire('collisionMesh.generating', true);

        splatTransformLogger.setRenderer(createProgressRenderer(i18n.t('panel.collision-mesh.generating'), events));

        try {
            const needsSeed = options.clusterFilter || options.fillMode !== 'none' || options.carve;
            const seed = needsSeed ? new Vec3(options.seed.x, options.seed.y, options.seed.z) : null;

            let dataTable = extractDataTable(splats, { maxSHBands: 0, visibleOnly: true });

            // remove disconnected splat clusters (keeps the cluster at the seed)
            if (options.clusterFilter) {
                dataTable = await processDataTable(dataTable, [{
                    kind: 'filterCluster',
                    seed
                }], {
                    createDevice: createGpuDevice
                });
            }

            // voxelize and extract the collision mesh. the octree files also
            // produced by writeVoxel are discarded - only the GLB is kept.
            const memFs = new MemoryFileSystem();
            await writeVoxel({
                filename: 'scene.voxel.json',
                dataTable,
                voxelResolution: options.voxelSize,
                opacityCutoff: options.opacityCutoff,
                collisionMesh: options.style,
                floorFill: options.fillMode === 'floor',
                floorFillDilation: options.floorFillDilation,
                navExteriorRadius: options.fillMode === 'exterior' ? options.fillRadius : undefined,
                navCapsule: options.carve ? { height: options.carveHeight, radius: options.carveRadius } : undefined,
                navSeed: seed ?? undefined,
                createDevice: createGpuDevice
            }, memFs);

            const glb = memFs.results.get('scene.collision.glb');
            if (!glb) {
                throw new Error(i18n.t('panel.collision-mesh.no-triangles'));
            }

            const { positions, indices } = parseGlb(glb);

            glbBytes = glb;
            collisionMesh.setData(positions, indices);
            splatSignature = calcSplatSignature();
            setStale(false);
            events.fire('collisionMesh.changed');

            return true;
        } catch (error) {
            // writers leave their top-level logger scope open on error; unwind
            // so the progress dialog is dismissed before the popup shows
            splatTransformLogger.unwindAll(true);
            await showError(`${error.message ?? error}`);
            return false;
        } finally {
            generating = false;
            events.fire('collisionMesh.generating', false);
        }
    });

    events.function('collisionMesh.generating', () => {
        return generating;
    });

    events.function('collisionMesh.exists', () => {
        return !!collisionMesh.mesh;
    });

    events.function('collisionMesh.triangleCount', () => {
        return collisionMesh.triangleCount;
    });

    events.function('collisionMesh.stale', () => {
        return stale;
    });

    const setVisible = (visible: boolean) => {
        if (visible !== collisionMesh.visible) {
            collisionMesh.visible = visible;
            events.fire('collisionMesh.visible', visible);
        }
    };

    events.function('collisionMesh.visible', () => {
        return collisionMesh.visible;
    });

    events.on('collisionMesh.setVisible', (visible: boolean) => {
        setVisible(visible);
    });

    const setRenderMode = (renderMode: CollisionMeshRenderMode) => {
        if (renderMode !== collisionMesh.renderMode) {
            collisionMesh.renderMode = renderMode;
            events.fire('collisionMesh.renderMode', renderMode);
        }
    };

    events.function('collisionMesh.renderMode', () => {
        return collisionMesh.renderMode;
    });

    events.on('collisionMesh.setRenderMode', (renderMode: CollisionMeshRenderMode) => {
        setRenderMode(renderMode);
    });

    const setOpacity = (opacity: number) => {
        if (opacity !== collisionMesh.opacity) {
            collisionMesh.opacity = opacity;
            events.fire('collisionMesh.opacity', opacity);
        }
    };

    events.function('collisionMesh.opacity', () => {
        return collisionMesh.opacity;
    });

    events.on('collisionMesh.setOpacity', (opacity: number) => {
        setOpacity(opacity);
    });

    const clear = () => {
        if (collisionMesh.mesh) {
            collisionMesh.clear();
            glbBytes = null;
            setStale(false);
            events.fire('collisionMesh.changed');
        }
    };

    events.on('collisionMesh.remove', () => {
        clear();
    });

    events.function('collisionMesh.export', async () => {
        if (!glbBytes) {
            return;
        }

        const docName = events.invoke('doc.name') as string | null;
        const filename = `${docName ?? 'scene'}.collision.glb`;

        try {
            let stream: FileSystemWritableFileStream | undefined;
            if (window.showSaveFilePicker) {
                const fileHandle = await window.showSaveFilePicker({
                    id: 'SuperSplatCollisionMeshExport',
                    types: [{
                        description: 'glTF Binary File',
                        accept: {
                            'model/gltf-binary': ['.glb']
                        }
                    }],
                    suggestedName: filename
                });
                stream = await fileHandle.createWritable();
            }

            const fs = new BrowserFileSystem(filename, stream);
            const writer = fs.createWriter(filename);
            await writer.write(glbBytes);
            await writer.close();
        } catch (error) {
            if (error.name !== 'AbortError') {
                await showError(`${error.message ?? error}`);
            }
        }
    });

    // clear the preview when the scene is reset (doc new/load/open)
    events.on('scene.clear', () => {
        clear();
    });

    // the preview does not update automatically when splats change - just
    // show a hint so the user knows to regenerate
    events.on('splat.stateChanged', checkStale);
    events.on('splat.visibility', checkStale);
    events.on('splat.moved', markStale);
    events.on('splat.positionsChanged', markStale);
    events.on('splat.replaced', markStale);
    events.on('scene.elementAdded', (element: Element) => {
        if (element.type === ElementType.splat) {
            markStale();
        }
    });
    events.on('scene.elementRemoved', (element: Element) => {
        if (element.type === ElementType.splat) {
            markStale();
        }
    });
};

export { registerCollisionMeshEvents, CollisionMeshOptions };
