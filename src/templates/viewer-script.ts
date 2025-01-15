const template = /* javascript */ `
import { BoundingBox, Color, Script, Vec3 } from 'playcanvas';

import viewerSettings from "viewerSettings" with { type: "json" };

document.addEventListener('DOMContentLoaded', async () => {
    const position = viewerSettings.camera.position && new Vec3(viewerSettings.camera.position);
    const target = viewerSettings.camera.target && new Vec3(viewerSettings.camera.target);

    class FrameScene extends Script {
        frameScene(bbox) {
            const sceneSize = bbox.halfExtents.length();
            const distance = sceneSize / Math.sin(this.entity.camera.fov / 180 * Math.PI * 0.5);
            this.entity.script.cameraControls.sceneSize = sceneSize;
            this.entity.script.cameraControls.focus(bbox.center, new Vec3(2, 1, 2).normalize().mulScalar(distance).add(bbox.center));
        }

        resetCamera(bbox) {
            const sceneSize = bbox.halfExtents.length();
            this.entity.script.cameraControls.sceneSize = sceneSize * 0.2;
            this.entity.script.cameraControls.focus(target ?? Vec3.ZERO, position ?? new Vec3(2, 1, 2));
        }

        calcBound() {
            const gsplatComponents = this.app.root.findComponents('gsplat');
            return gsplatComponents?.[0]?.instance?.meshInstance?.aabb ?? new BoundingBox();
        }

        initCamera() {
            document.getElementById('loadingIndicator').classList.add('hidden');

            const bbox = this.calcBound();
            if (bbox.halfExtents.length() > 100 || position || target) {
                this.resetCamera(bbox);
            } else {
                this.frameScene(bbox);
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

    const appElement = await document.querySelector('pc-app').ready();
    const cameraElement = await document.querySelector('pc-entity[name="camera"]').ready();

    const app = await appElement.app;
    const camera = cameraElement.entity;

    camera.camera.clearColor = new Color(viewerSettings.background.color);
    camera.camera.fov = viewerSettings.camera.fov;
    camera.script.create(FrameScene);

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
        }
    });

    // Get button and info panel elements
    const dom = ['arMode', 'vrMode', 'enterFullscreen', 'exitFullscreen', 'info', 'infoPanel'].reduce((acc, id) => {
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
});`;

export { template };
