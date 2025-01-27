import { BoundingBox, Color, Mat4, Script, Vec3 } from 'playcanvas';

// eslint-disable-next-line
import viewerSettings from "viewerSettings" with { type: "json" };

const nearlyEquals = (a, b, epsilon = 1e-4) => {
    return !a.some((v, i) => Math.abs(v - b[i]) >= epsilon);
};

class FrameScene extends Script {
    constructor(args) {
        super(args);

        this.position = viewerSettings.camera.position && new Vec3(viewerSettings.camera.position);
        this.target = viewerSettings.camera.target && new Vec3(viewerSettings.camera.target);    
    }

    frameScene(bbox, smooth = true) {
        const sceneSize = bbox.halfExtents.length();
        const distance = sceneSize / Math.sin(this.entity.camera.fov / 180 * Math.PI * 0.5);
        this.entity.script.cameraControls.sceneSize = sceneSize;
        this.entity.script.cameraControls.focus(bbox.center, new Vec3(2, 1, 2).normalize().mulScalar(distance).add(bbox.center), smooth);
    }

    resetCamera(bbox, smooth = true) {
        const sceneSize = bbox.halfExtents.length();
        this.entity.script.cameraControls.sceneSize = sceneSize * 0.2;
        this.entity.script.cameraControls.focus(this.target ?? Vec3.ZERO, this.position ?? new Vec3(2, 1, 2), smooth);
    }

    initCamera() {
        const { app } = this;
        const { graphicsDevice } = app;

        // get the gsplat component
        const gsplatComponent = app.root.findComponent('gsplat');

        // calculate the bounding box
        const bbox = gsplatComponent?.instance?.meshInstance?.aabb ?? new BoundingBox();
        if (bbox.halfExtents.length() > 100 || this.position || this.target) {
            this.resetCamera(bbox, false);
        } else {
            this.frameScene(bbox, false);
        }

        window.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'f':
                    this.frameScene(bbox);
                    break;
                case 'r':
                    this.resetCamera(bbox);
                    break;
            }
        });

        const prevProj = new Mat4();
        const prevWorld = new Mat4();

        app.on('framerender', () => {
            if (!app.autoRender && !app.renderNextFrame) {
                const world = this.entity.getWorldTransform();
                if (!nearlyEquals(world.data, prevWorld.data)) {
                    app.renderNextFrame = true;
                }

                const proj = this.entity.camera.projectionMatrix;
                if (!nearlyEquals(proj.data, prevProj.data)) {
                    app.renderNextFrame = true;
                }

                if (app.renderNextFrame) {
                    prevWorld.copy(world);
                    prevProj.copy(proj);
                }
            }
        });

        // wait for first gsplat sort
        const handle = gsplatComponent?.instance?.sorter?.on('updated', () => {
            handle.off();

            // request frame render
            app.renderNextFrame = true;

            // wait for first render to complete
            const frameHandle = app.on('frameend', () => {
                frameHandle.off();

                // hide loading indicator
                document.getElementById('loadingIndicator').classList.add('hidden');

                // emit first frame event on window
                window.firstFrame?.();
            });
        });

        const updateHorizontalFov = (width, height) => {
            this.entity.camera.horizontalFov = width > height;
        };

        // handle fov on canvas resize
        graphicsDevice.on('resizecanvas', (width, height) => {
            updateHorizontalFov(width, height);
            app.renderNextFrame = true;
        });

        // configure on-demand rendering
        app.autoRender = false;
        updateHorizontalFov(graphicsDevice.width, graphicsDevice.height);
    }

    postInitialize() {
        const assets = this.app.assets.filter(asset => asset.type === 'gsplat');
        if (assets.length > 0) {
            const asset = assets[0];
            if (asset.loaded) {
                this.initCamera();
            } else {
                asset.on('load', () => {
                    this.initCamera();
                });
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const appElement = await document.querySelector('pc-app').ready();
    const cameraElement = await document.querySelector('pc-entity[name="camera"]').ready();

    const app = await appElement.app;
    const camera = cameraElement.entity;

    camera.camera.clearColor = new Color(viewerSettings.background.color);
    camera.camera.fov = viewerSettings.camera.fov;
    camera.script.create(FrameScene);

    // Update loading indicator
    const assets = app.assets.filter(asset => asset.type === 'gsplat');
    if (assets.length > 0) {
        const asset = assets[0];
        const loadingIndicator = document.getElementById('loadingIndicator');
        asset.on('progress', (received, length) => {
            const v = (Math.min(1, received / length) * 100).toFixed(0);
            loadingIndicator.style.backgroundImage = 'linear-gradient(90deg, white 0%, white ' + v + '%, black ' + v + '%, black 100%)';
        });
    }

    // On entering/exiting AR, we need to set the camera clear color to transparent black
    let cameraEntity, skyType = null;
    const clearColor = new Color();

    app.xr.on('start', () => {
        if (app.xr.type === 'immersive-ar') {
            cameraEntity = app.xr.camera;
            clearColor.copy(cameraEntity.camera.clearColor);
            cameraEntity.camera.clearColor = new Color(0, 0, 0, 0);

            const sky = document.querySelector('pc-sky');
            if (sky && sky.type !== 'none') {
                skyType = sky.type;
                sky.type = 'none';
            }

            app.autoRender = true;
        }
    });

    app.xr.on('end', () => {
        if (app.xr.type === 'immersive-ar') {
            cameraEntity.camera.clearColor = clearColor;

            const sky = document.querySelector('pc-sky');
            if (sky) {
                if (skyType) {
                    sky.type = skyType;
                    skyType = null;
                } else {
                    sky.removeAttribute('type');
                }
            }

            app.autoRender = false;
        }
    });

    // Get button and info panel elements
    const dom = ['arMode', 'vrMode', 'enterFullscreen', 'exitFullscreen', 'info', 'infoPanel', 'buttonContainer'].reduce((acc, id) => {
        acc[id] = document.getElementById(id);
        return acc;
    }, {});

    // AR
    if (app.xr.isAvailable('immersive-ar')) {
        dom.arMode.classList.remove('hidden');
        dom.arMode.addEventListener('click', () => app.xr.start(app.root.findComponent('camera'), 'immersive-ar', 'local-floor'));
    }

    // VR
    if (app.xr.isAvailable('immersive-vr')) {
        dom.vrMode.classList.remove('hidden');
        dom.vrMode.addEventListener('click', () => app.xr.start(app.root.findComponent('camera'), 'immersive-vr', 'local-floor'));
    }

    // Fullscreen
    if (document.documentElement.requestFullscreen && document.exitFullscreen) {
        dom.enterFullscreen.classList.remove('hidden');
        dom.enterFullscreen.addEventListener('click', () => document.documentElement.requestFullscreen());
        dom.exitFullscreen.addEventListener('click', () => document.exitFullscreen());
        document.addEventListener('fullscreenchange', () => {
            dom.enterFullscreen.classList[document.fullscreenElement ? 'add' : 'remove']('hidden');
            dom.exitFullscreen.classList[document.fullscreenElement ? 'remove' : 'add']('hidden');
        });
    }

    // Info
    dom.info.addEventListener('click', () => {
        dom.infoPanel.classList.toggle('hidden');
    });

    // Keyboard handler
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (app.xr.active) {
                app.xr.end();
            }
            dom.infoPanel.classList.add('hidden');
        }
    });

    // Hide UI using ?noui query parameter
    const url = new URL(location.href);
    if (url.searchParams.has('noui')) {
        dom.buttonContainer.classList.add('hidden');
    }
});