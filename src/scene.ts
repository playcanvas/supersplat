import {
    LAYERID_DEPTH,
    SORTMODE_NONE,
    BoundingBox,
    Color,
    Entity,
    Layer,
    GraphicsDevice
} from 'playcanvas';
import { PCApp } from './pc-app';
import { Events } from './events';
import { Element, ElementType, ElementTypeList } from './element';
import { SceneState } from './scene-state';
import { SceneConfig } from './scene-config';
import { AssetLoader } from './asset-loader';
import { Model } from './model';
import { Splat } from './splat';
import { Camera } from './camera';
import { CustomShadow as Shadow } from './custom-shadow';
import { Grid } from './grid';

class Scene {
    events: Events;
    config: SceneConfig;
    canvas: HTMLCanvasElement;
    app: PCApp;
    backgroundLayer: Layer;
    shadowLayer: Layer;
    debugLayer: Layer;
    gizmoLayer: Layer;
    sceneState = [new SceneState(), new SceneState()];
    elements: Element[] = [];
    boundStorage = new BoundingBox();
    boundDirty = true;
    forceRender = false;

    canvasResize: {width: number; height: number} | null = null;
    targetSize = {
        width: 0,
        height: 0
    };

    assetLoader: AssetLoader;
    camera: Camera;
    shadow: Shadow;
    grid: Grid;

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

        // background layer
        this.backgroundLayer = new Layer({
            enabled: true,
            name: 'Background Layer',
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        // shadow layer
        // this layer contains shadow caster scene mesh instances, shadow-casting
        // virtual light, shadow catching plane geometry and the main camera.
        this.shadowLayer = new Layer({
            name: 'Shadow Layer'
        });

        this.debugLayer = new Layer({
            enabled: true,
            name: 'Debug Layer',
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        // gizmo layer
        this.gizmoLayer = new Layer({
            name: 'Gizmo',
            clearDepthBuffer: true,
            opaqueSortMode: SORTMODE_NONE,
            transparentSortMode: SORTMODE_NONE
        });

        const layers = this.app.scene.layers;
        const worldLayer = layers.getLayerByName('World');
        const idx = layers.getOpaqueIndex(worldLayer);
        layers.insert(this.backgroundLayer, idx);
        layers.insert(this.shadowLayer, idx + 1);
        layers.insert(this.debugLayer, idx + 1);
        layers.push(this.gizmoLayer);

        this.assetLoader = new AssetLoader(this.app.assets, this.app.graphicsDevice.maxAnisotropy);

        // create root entities
        this.contentRoot = new Entity('contentRoot');
        this.app.root.addChild(this.contentRoot);

        this.cameraRoot = new Entity('cameraRoot');
        this.app.root.addChild(this.cameraRoot);

        // create elements
        this.camera = new Camera();
        this.add(this.camera);

        // this.shadow = new Shadow();
        // this.add(this.shadow);

        this.grid = new Grid();
        this.add(this.grid);
    }

    async load() {
        const config = this.config;

        // load scene assets
        const promises: Promise<any>[] = [];

        // load model
        if (config.model.url) {
            promises.push(this.assetLoader.loadModel({
                url: config.model.url,
                filename: config.model.filename
            }));
        }

        // load env
        if (config.env.url) {
            promises.push(this.assetLoader.loadEnv({url: config.env.url}));
        }

        const elements = await Promise.all(promises);

        // add them to the scene
        elements.forEach(e => this.add(e));

        this.camera.focus();

        // start the app
        this.app.start();
    }

    async loadModel(url: string, filename: string) {
        try {
            const model = await this.assetLoader.loadModel({ url, filename });
            this.add(model);
            this.camera.focus();
            this.events.fire('loaded', filename);
        } catch (err) {
            this.events.fire('error', err);
        }
    }

    clear() {
        const models = this.getElementsByType(ElementType.model);
        models.forEach((model) => {
            this.remove(model);
            (model as Model).destroy();
        });

        const splats = this.getElementsByType(ElementType.splat);
        splats.forEach((splat) => {
            this.remove(splat);
            (splat as Splat).destroy();
        });
    }

    // add a scene element
    add(element: Element) {
        if (!element.scene) {
            // add the new element
            element.scene = this;
            element.add();
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
            this.forEachElement(e => {
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
            this.events.fire('scene.boundChanged');
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
        if (!this.app.renderNextFrame) {
            this.app.renderNextFrame = this.forceRender || all.size > 0;
        }
        this.forceRender = false;

        // raise per-type update events
        ElementTypeList.forEach(type => {
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

        this.events.fire('prerender');

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
                        splat.root.getWorldTransform());

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
    }
}

export {SceneConfig, Scene};
