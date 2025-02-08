import { BoundingBox, Color, Mat4, Script, Vec3 } from 'playcanvas';

import { CubicSpline } from 'spline';

// eslint-disable-next-line
import viewerSettings from "viewerSettings" with { type: "json" };

const nearlyEquals = (a, b, epsilon = 1e-4) => {
    return !a.some((v, i) => Math.abs(v - b[i]) >= epsilon);
};

const url = new URL(location.href);

const settings = {
    noui: url.searchParams.has('noui'),
    noanim: url.searchParams.has('noanim'),
    posterUrl: url.searchParams.get('poster')
};

// display a blurry poster image which resolves to sharp during loading
class Poster {
    constructor(url) {
        const blur = (progress) => `blur(${Math.floor((100 - progress) * 0.4)}px)`;

        const element = document.getElementById('poster');
        element.style.backgroundImage = `url(${url})`;
        element.style.display = 'block';
        element.style.filter = blur(0);

        this.progress = (progress) => {
            element.style.filter = blur(progress);
        };

        this.hide = () => {
            element.style.display = 'none';
        };
    }
}

const poster = settings.posterUrl && new Poster(settings.posterUrl);

class FrameScene extends Script {
    constructor(args) {
        super(args);

        const { camera, animTracks } = viewerSettings;
        const { position, target } = camera;

        this.position = position && new Vec3(position);
        this.target = target && new Vec3(target);

        // construct camera animation track
        if (animTracks?.length > 0 && viewerSettings.camera.startAnim === 'animTrack') {
            const track = animTracks.find(track => track.name === camera.animTrack);
            if (track) {
                const { keyframes } = track;
                const { times, values } = keyframes;
                const { position, target } = values;

                // construct the points array containing position and target
                const points = [];
                for (let i = 0; i < times.length; i++) {
                    points.push(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
                    points.push(target[i * 3], target[i * 3 + 1], target[i * 3 + 2]);
                }

                this.cameraAnim = {
                    time: 0,
                    spline: CubicSpline.fromPoints(times, points),
                    track,
                    result: []
                };
            }
        }
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
        let animating = false;
        let animationTimer = 0;

        // get the gsplat component
        const gsplatComponent = app.root.findComponent('gsplat');

        // calculate the bounding box
        const bbox = gsplatComponent?.instance?.meshInstance?.aabb ?? new BoundingBox();
        if (bbox.halfExtents.length() > 100 || this.position || this.target) {
            this.resetCamera(bbox, false);
        } else {
            this.frameScene(bbox, false);
        }

        const cancelAnimation = () => {
            if (animating) {
                animating = false;

                // copy current camera position and target
                const r = this.cameraAnim.result;
                this.entity.script.cameraControls.focus(
                    new Vec3(r[3], r[4], r[5]),
                    new Vec3(r[0], r[1], r[2]),
                    false
                );
            }
        };

        // listen for interaction events
        const events = [ 'wheel', 'pointerdown', 'contextmenu' ];
        const handler = (e) => {
            cancelAnimation();
            events.forEach(event => app.graphicsDevice.canvas.removeEventListener(event, handler));
        };
        events.forEach(event => app.graphicsDevice.canvas.addEventListener(event, handler));

        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.altKey || e.metaKey) return;

            switch (e.key) {
                case 'f':
                    cancelAnimation();
                    this.frameScene(bbox);
                    break;
                case 'r':
                    cancelAnimation();
                    this.resetCamera(bbox);
                    break;
            }
        });

        app.on('update', (deltaTime) => {
            // handle camera animation
            if (this.cameraAnim && animating && !settings.noanim) {
                const { cameraAnim } = this;
                const { spline, track, result } = cameraAnim;

                // update animation timer
                animationTimer += deltaTime;

                // update the track cursor
                if (animationTimer < 5) {
                    // ease in
                    cameraAnim.time += deltaTime * Math.pow(animationTimer / 5, 0.5);
                } else {
                    cameraAnim.time += deltaTime;
                }

                if (cameraAnim.time >= track.duration) {
                    switch (track.loopMode) {
                        case 'none': cameraAnim.time = track.duration; break;
                        case 'repeat': cameraAnim.time = cameraAnim.time % track.duration; break;
                        case 'pingpong': cameraAnim.time = cameraAnim.time % (track.duration * 2); break;
                    }
                }

                // evaluate the spline
                spline.evaluate(cameraAnim.time > track.duration ? track.duration - cameraAnim.time : cameraAnim.time, result);

                // set camera
                this.entity.setPosition(result[0], result[1], result[2]);
                this.entity.lookAt(result[3], result[4], result[5]);
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
                document.getElementById('loadingWrap').classList.add('hidden');

                // fade out poster
                poster?.hide();

                // start animating once the first frame is rendered
                if (this.cameraAnim) {
                    animating = true;
                }

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
        const loadingText = document.getElementById('loadingText');
        const loadingBar = document.getElementById('loadingBar');
        asset.on('progress', (received, length) => {
            const v = (Math.min(1, received / length) * 100).toFixed(0);
            loadingText.textContent = `${v}%`;
            loadingBar.style.backgroundImage = 'linear-gradient(90deg, #F60 0%, #F60 ' + v + '%, white ' + v + '%, white 100%)';
            poster?.progress(v);
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

    // Hide UI
    if (settings.noui) {
        dom.buttonContainer.classList.add('hidden');
    }
});