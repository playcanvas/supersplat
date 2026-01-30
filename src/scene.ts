import {
    EVENT_POSTRENDER_LAYER,
    EVENT_PRERENDER_LAYER,
    LAYERID_DEPTH,
    SORTMODE_CUSTOM,
    BoundingBox,
    CameraComponent,
    Color,
    Entity,
    Layer,
    GraphicsDevice,
    MeshInstance,
    Vec3
} from 'playcanvas';

import { AssetLoader } from './asset-loader';
import { Camera } from './camera';
import { DataProcessor } from './data-processor';
import { Element, ElementType, ElementTypeList } from './element';
import { Events } from './events';
import { InfiniteGrid as Grid } from './infinite-grid';
import { Outline } from './outline';
import { PCApp } from './pc-app';
import { SceneConfig } from './scene-config';
import { SceneState } from './scene-state';
import { Splat } from './splat';
import { SplatOverlay } from './splat-overlay';
import { Underlay } from './underlay';

// sort meshInstances by the aabb corner furthest from the camera
const corner = new Vec3();
const specialSort = (instances: MeshInstance[], numInstances: number, cameraPos: Vec3, cameraDir: Vec3) => {
    const distances = new Map<MeshInstance, number>();

    for (let i = 0; i < numInstances; i++) {
        const instance = instances[i];
        const { aabb } = instance;
        const { center, halfExtents } = aabb;

        // loop over all 8 aabb corners and find the furthest distance along the camera view direction
        let maxDist = -Infinity;
        for (let cx = -1; cx <= 1; cx += 2) {
            for (let cy = -1; cy <= 1; cy += 2) {
                for (let cz = -1; cz <= 1; cz += 2) {
                    corner.set(
                        center.x + cx * halfExtents.x,
                        center.y + cy * halfExtents.y,
                        center.z + cz * halfExtents.z
                    );
                    // project camera-to-corner vector onto camera direction
                    const dist = (corner.x - cameraPos.x) * cameraDir.x +
                                    (corner.y - cameraPos.y) * cameraDir.y +
                                    (corner.z - cameraPos.z) * cameraDir.z;
                    if (dist > maxDist) {
                        maxDist = dist;
                    }
                }
            }
        }

        // store in map for reuse during sort
        distances.set(instance, maxDist);
    }

    // sort instances back-to-front by calculated distance (furthest first)
    instances.sort((a, b) => distances.get(b) - distances.get(a));
};

class Scene {
    events: Events;
    config: SceneConfig;
    canvas: HTMLCanvasElement;
    app: PCApp;
    worldLayer: Layer;
    splatLayer: Layer;
    gizmoLayer: Layer;
    sceneState = [new SceneState(), new SceneState()];
    elements: Element[] = [];
    boundStorage = new BoundingBox();
    boundDirty = true;
    forceRender = false;

    lockedRenderMode = false;
    lockedRender = false;

    canvasResize: {width: number; height: number} | null = null;
    targetSize = {
        width: 0,
        height: 0
    };

    dataProcessor: DataProcessor;
    assetLoader: AssetLoader;
    camera: Camera;
    splatOverlay: SplatOverlay;
    grid: Grid;
    outline: Outline;
    underlay: Underlay;

    contentRoot: Entity;
    cameraRoot: Entity;

    constructor(
        events: Events,
        config: SceneConfig,
        canvas: HTMLCanvasElement,
        graphicsDevice: GraphicsDevice
    ) {
        this.events = events;
        this.config = config;
        this.canvas = canvas;

        // configure the playcanvas application. we render to an offscreen buffer so require
        // only the simplest of backbuffers.
        this.app = new PCApp(canvas, { graphicsDevice });

        // only render the scene when instructed
        this.app.autoRender = false;
        // @ts-ignore
        this.app._allowResize = false;
        this.app.scene.clusteredLightingEnabled = false;

        // hack: disable lightmapper first bake until we expose option for this
        // @ts-ignore
        this.app.off('prerender', this.app._firstBake, this.app);

        // @ts-ignore
        this.app.loader.getHandler('texture').imgParser.crossOrigin = 'anonymous';

        // this is required to get full res AR mode backbuffer
        this.app.graphicsDevice.maxPixelRatio = window.devicePixelRatio;

        // configure application canvas
        const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
            if (entries.length > 0) {
                const entry = entries[0];
                if (entry) {
                    if (entry.devicePixelContentBoxSize) {
                        // on non-safari browsers, we are given the pixel-perfect canvas size
                        this.canvasResize = {
                            width: entry.devicePixelContentBoxSize[0].inlineSize,
                            height: entry.devicePixelContentBoxSize[0].blockSize
                        };
                    } else if (entry.contentBoxSize.length > 0) {
                        // on safari browsers we must calculate pixel size from CSS size ourselves
                        // and hope the browser performs the same calculation.
                        const pixelRatio = window.devicePixelRatio;
                        this.canvasResize = {
                            width: Math.ceil(entry.contentBoxSize[0].inlineSize * pixelRatio),
                            height: Math.ceil(entry.contentBoxSize[0].blockSize * pixelRatio)
                        };
                    }
                }
                this.forceRender = true;
            }
        });

        observer.observe(window.document.getElementById('canvas-container'));

        // configure depth layers to handle dynamic refraction
        const depthLayer = this.app.scene.layers.getLayerById(LAYERID_DEPTH);
        this.app.scene.layers.remove(depthLayer);
        this.app.scene.layers.insertOpaque(depthLayer, 2);

        // register application callbacks
        this.app.on('update', (deltaTime: number) => this.onUpdate(deltaTime));
        this.app.on('prerender', () => this.onPreRender());
        this.app.on('postrender', () => this.onPostRender());

        // force render on device restored
        this.app.graphicsDevice.on('devicerestored', () => {
            this.forceRender = true;
        });

        // fire pre and post render events on the camera
        this.app.scene.on(EVENT_PRERENDER_LAYER, (camera: CameraComponent, layer: Layer, transparent: boolean) => {
            camera.fire('preRenderLayer', layer, transparent);
        });

        this.app.scene.on(EVENT_POSTRENDER_LAYER, (camera: CameraComponent, layer: Layer, transparent: boolean) => {
            camera.fire('postRenderLayer', layer, transparent);
        });

        // get the world layer
        this.worldLayer = this.app.scene.layers.getLayerByName('World');

        // splat layer - dedicated layer for splat rendering with MRT
        this.splatLayer = new Layer({
            name: 'Splat',
            opaqueSortMode: SORTMODE_CUSTOM,
            transparentSortMode: SORTMODE_CUSTOM
        });
        this.splatLayer.customCalculateSortValues = specialSort;

        // gizmo layer
        this.gizmoLayer = new Layer({ name: 'Gizmo' });

        const layers = this.app.scene.layers;
        layers.push(this.splatLayer);
        layers.push(this.gizmoLayer);

        this.dataProcessor = new DataProcessor(this.app.graphicsDevice);
        this.assetLoader = new AssetLoader(this.app, events);

        // create root entities
        this.contentRoot = new Entity('contentRoot');
        this.app.root.addChild(this.contentRoot);

        this.cameraRoot = new Entity('cameraRoot');
        this.app.root.addChild(this.cameraRoot);

        // create elements
        this.camera = new Camera();
        this.add(this.camera);

        this.splatOverlay = new SplatOverlay();
        this.add(this.splatOverlay);

        this.grid = new Grid();
        this.add(this.grid);

        this.outline = new Outline();
        this.add(this.outline);
        this.underlay = new Underlay();
        this.add(this.underlay);
    }

    start() {
        // start the app
        this.app.start();
    }

    clear() {
        const splats = this.getElementsByType(ElementType.splat);
        splats.forEach((splat) => {
            this.remove(splat);
            (splat as Splat).destroy();
        });
    }

    // add a scene element
    async add(element: Element) {
        if (!element.scene) {
            // add the new element
            element.scene = this;
            await element.add();
            this.elements.push(element);

            // notify all elements of scene addition
            this.forEachElement(e => e !== element && e.onAdded(element));

            // notify listeners
            this.events.fire('scene.elementAdded', element);
        }
    }

    // remove an element from the scene
    remove(element: Element) {
        if (element.scene === this) {
            // remove from list
            this.elements.splice(this.elements.indexOf(element), 1);

            // notify listeners
            this.events.fire('scene.elementRemoved', element);

            // notify all elements of scene removal
            this.forEachElement(e => e.onRemoved(element));

            element.remove();
            element.scene = null;
        }
    }

    // get the scene bound
    get bound() {
        if (this.boundDirty) {
            let valid = false;
            this.forEachElement((e) => {
                const bound = e.worldBound;
                if (bound) {
                    if (!valid) {
                        valid = true;
                        this.boundStorage.copy(bound);
                    } else {
                        this.boundStorage.add(bound);
                    }
                }
            });

            this.boundDirty = false;
            this.events.fire('scene.boundChanged', this.boundStorage);
        }

        return this.boundStorage;
    }

    getElementsByType(elementType: ElementType) {
        return this.elements.filter(e => e.type === elementType);
    }

    get graphicsDevice() {
        return this.app.graphicsDevice;
    }

    private forEachElement(action: (e: Element) => void) {
        this.elements.forEach(action);
    }

    private onUpdate(deltaTime: number) {
        // allow elements to update
        this.forEachElement(e => e.onUpdate(deltaTime));

        // fire global update
        this.events.fire('update', deltaTime);

        // fire a 'serialize' event which listers will use to store their state. we'll use
        // this to decide if the view has changed and so requires rendering.
        const i = this.app.frame % 2;
        const state = this.sceneState[i];
        state.reset();
        this.forEachElement(e => state.pack(e));

        // diff with previous state
        const result = state.compare(this.sceneState[1 - i]);

        // generate the set of all element types that changed
        const all = new Set([...result.added, ...result.removed, ...result.moved, ...result.changed]);

        // compare with previously serialized
        if (this.lockedRenderMode) {
            this.app.renderNextFrame = this.lockedRender;
            this.lockedRender = false;
        } else if (!this.app.renderNextFrame) {
            this.app.renderNextFrame = this.forceRender || all.size > 0;
        }
        this.forceRender = false;

        // raise per-type update events
        ElementTypeList.forEach((type) => {
            if (all.has(type)) {
                this.events.fire(`updated:${type}`);
            }
        });

        // allow elements to postupdate
        this.forEachElement(e => e.onPostUpdate());
    }

    private onPreRender() {
        if (this.canvasResize) {
            this.canvas.width = this.canvasResize.width;
            this.canvas.height = this.canvasResize.height;
            this.canvasResize = null;
        }

        // update render target size
        this.targetSize.width = Math.ceil(this.app.graphicsDevice.width / this.config.camera.pixelScale);
        this.targetSize.height = Math.ceil(this.app.graphicsDevice.height / this.config.camera.pixelScale);

        this.forEachElement(e => e.onPreRender());

        this.events.fire('prerender', this.camera.worldTransform);

        // debug - display scene bound
        if (this.config.debug.showBound) {
            // draw element bounds
            this.forEachElement((e: Element) => {
                if (e.type === ElementType.splat) {
                    const splat = e as Splat;

                    const local = splat.localBound;
                    this.app.drawWireAlignedBox(
                        local.getMin(),
                        local.getMax(),
                        Color.RED,
                        true,
                        undefined,
                        splat.entity.getWorldTransform());

                    const world = splat.worldBound;
                    this.app.drawWireAlignedBox(
                        world.getMin(),
                        world.getMax(),
                        Color.GREEN);
                }
            });

            // draw scene bound
            this.app.drawWireAlignedBox(this.bound.getMin(), this.bound.getMax(), Color.BLUE);
        }
    }

    private onPostRender() {
        this.forEachElement(e => e.onPostRender());

        this.events.fire('postrender');
    }
}

export { SceneConfig, Scene };
