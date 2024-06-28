import {
    math,
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_DEPTH,
    drawTexture,
    Color,
    Entity,
    EventHandler,
    Picker,
    Plane,
    Ray,
    RenderTarget,
    Texture,
    Vec3,
    WebglGraphicsDevice,
    TONEMAP_LINEAR,
    TONEMAP_FILMIC,
    TONEMAP_HEJL,
    TONEMAP_ACES,
    TONEMAP_ACES2
} from 'playcanvas';
import { Element, ElementType } from './element';
import { TweenValue } from './tween-value';
import { Serializer } from './serializer';
import { PointerController } from './controllers';
import { Splat } from './splat';

// calculate the forward vector given azimuth and elevation
const calcForwardVec = (result: Vec3, azim: number, elev: number) => {
    const ex = elev * math.DEG_TO_RAD;
    const ey = azim * math.DEG_TO_RAD;
    const s1 = Math.sin(-ex);
    const c1 = Math.cos(-ex);
    const s2 = Math.sin(-ey);
    const c2 = Math.cos(-ey);
    result.set(-c1 * s2, s1, c1 * c2);
};

// work globals
const forwardVec = new Vec3();
const cameraPosition = new Vec3();
const plane = new Plane();
const ray = new Ray();
const vec = new Vec3();
const vecb = new Vec3();

// modulo dealing with negative numbers
const mod = (n: number, m: number) => ((n % m) + m) % m;

class Camera extends Element {
    controller: PointerController;
    entity: Entity;
    focalPointTween = new TweenValue({x: 0, y: 0.5, z: 0});
    azimElevTween = new TweenValue({azim: 30, elev: -15});
    distanceTween = new TweenValue({distance: 2});

    minElev = -90;
    maxElev = 90;

    events = new EventHandler();

    autoRotateTimer = 0;
    autoRotateDelayValue = 0;
    focusDistance: number;

    picker: Picker;
    pickModeColorBuffer: Texture;
    pickModeRenderTarget: RenderTarget;

    constructor() {
        super(ElementType.camera);
        // create the camera entity
        this.entity = new Entity('Camera');
        this.entity.addComponent('camera', {
            fov: 60,
            clearColor: new Color(0, 0, 0, 0),
            frustumCulling: true
        });

        // NOTE: this call is needed for refraction effect to work correctly, but
        // it slows rendering and should only be made when required.
        // this.entity.camera.requestSceneColorMap(true);
    }

    // near clip
    set near(value: number) {
        this.entity.camera.nearClip = value;
    }

    get near() {
        return this.entity.camera.nearClip;
    }

    // far clip
    set far(value: number) {
        this.entity.camera.farClip = value;
    }

    get far() {
        return this.entity.camera.farClip;
    }

    // focal point
    get focalPoint() {
        const t = this.focalPointTween.target;
        return new Vec3(t.x, t.y, t.z);
    }

    setFocalPoint(point: Vec3, dampingFactorFactor: number = 1) {
        this.focalPointTween.goto(point, dampingFactorFactor * this.scene.config.controls.dampingFactor);
    }

    // azimuth, elevation
    get azimElev() {
        return this.azimElevTween.target;
    }

    get azim() {
        return this.azimElev.azim;
    }

    get elevation() {
        return this.azimElev.elev;
    }

    get distance() {
        return this.distanceTween.target.distance;
    }

    setAzimElev(azim: number, elev: number, dampingFactorFactor: number = 1) {
        // clamp
        azim = mod(azim, 360);
        elev = Math.max(this.minElev, Math.min(this.maxElev, elev));

        const t = this.azimElevTween;
        t.goto({azim, elev}, dampingFactorFactor * this.scene.config.controls.dampingFactor);

        // handle wraparound
        if (t.source.azim - azim < -180) {
            t.source.azim += 360;
        } else if (t.source.azim - azim > 180) {
            t.source.azim -= 360;
        }
    }

    setDistance(distance: number, dampingFactorFactor: number = 1) {
        // clamp
        distance = Math.max(this.scene.config.controls.minZoom, Math.min(this.scene.config.controls.maxZoom, distance));

        const t = this.distanceTween;
        t.goto({distance}, dampingFactorFactor * this.scene.config.controls.dampingFactor);
    }

    // convert point (relative to camera focus point) to azimuth, elevation, distance
    setOrientation(point: Vec3, dampingFactorFactor: number = 1.0) {
        const distance = point.length();
        const azim = Math.atan2(-point.x / distance, -point.z / distance) * math.RAD_TO_DEG;
        const elev = Math.asin(point.y / distance) * math.RAD_TO_DEG;
        this.setAzimElev(azim, elev, dampingFactorFactor);
        this.setDistance(distance, dampingFactorFactor);
    }

    // convert world to screen coordinate
    worldToScreen(world: Vec3, screen: Vec3) {
        this.entity.camera.worldToScreen(world, screen);
    }

    add() {
        this.scene.cameraRoot.addChild(this.entity);
        this.entity.camera.layers = this.entity.camera.layers.concat([
            this.scene.shadowLayer.id,
            this.scene.debugLayer.id,
            this.scene.gizmoLayer.id
        ]);

        if (this.scene.config.camera.debug_render) {
            this.entity.camera.setShaderPass(`debug_${this.scene.config.camera.debug_render}`);
        }

        this.controller = new PointerController(this, this.scene.canvas);

        // apply scene config
        const config = this.scene.config;
        const controls = config.controls;

        // configure background
        const clr = config.backgroundColor;
        this.entity.camera.clearColor.set(clr.r, clr.g, clr.b, clr.a);

        // initialize autorotate
        this.autoRotateTimer = 0;
        this.autoRotateDelayValue = controls.autoRotateInitialDelay;

        this.minElev = (controls.minPolarAngle * 180) / Math.PI - 90;
        this.maxElev = (controls.maxPolarAngle * 180) / Math.PI - 90;

        // tonemapping
        this.scene.app.scene.toneMapping = {
            linear: TONEMAP_LINEAR,
            filmic: TONEMAP_FILMIC,
            hejl: TONEMAP_HEJL,
            aces: TONEMAP_ACES,
            aces2: TONEMAP_ACES2
        }[config.camera.toneMapping];

        // exposure
        this.scene.app.scene.exposure = config.camera.exposure;

        // initial camera position and orientation
        this.setAzimElev(controls.initialAzim, controls.initialElev, 0);
        this.setDistance(controls.initialZoom, 0);

        // picker
        const { width, height } = this.scene.targetSize;
        this.picker = new Picker(this.scene.app, width, height);
    }

    remove() {
        this.controller.destroy();
        this.controller = null;

        this.entity.camera.layers = this.entity.camera.layers.filter(layer => layer !== this.scene.shadowLayer.id);
        this.scene.cameraRoot.removeChild(this.entity);

        // destroy doesn't exist on picker?
        // this.picker.destroy();
        this.picker = null;
    }

    serialize(serializer: Serializer) {
        const camera = this.entity.camera.camera;
        serializer.pack(camera.fov);
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.entity.camera.renderTarget?.width, this.entity.camera.renderTarget?.height);
    }

    // handle the viewer canvas resizing
    rebuildRenderTargets() {
        const device = this.scene.graphicsDevice as WebglGraphicsDevice;
        const { width, height } = this.scene.targetSize;

        const rt = this.entity.camera.renderTarget;
        if (rt && rt.width === width && rt.height === height) {
            return;
        }

        // out with the old
        if (rt) {
            rt.colorBuffer.destroy();
            rt.depthBuffer.destroy();
            rt.destroy();

            this.pickModeColorBuffer.destroy();
            this.pickModeRenderTarget.destroy();
            this.pickModeColorBuffer = null;
            this.pickModeRenderTarget = null;
        }

        const createTexture = (width: number, height: number, format: number) => {
            return new Texture(device, {
                width: width,
                height: height,
                format: format,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        };

        // in with the new
        const pixelFormat = PIXELFORMAT_RGBA8;
        const samples = this.scene.config.camera.multisample ? device.maxSamples : 1;

        const colorBuffer = createTexture(width, height, pixelFormat);
        const depthBuffer = createTexture(width, height, PIXELFORMAT_DEPTH);
        const renderTarget = new RenderTarget({
            colorBuffer: colorBuffer,
            depthBuffer: depthBuffer,
            flipY: false,
            samples: samples,
            autoResolve: false
        });
        this.entity.camera.renderTarget = renderTarget;
        this.entity.camera.camera.horizontalFov = width < height;

        // create pick mode render target
        this.pickModeColorBuffer = createTexture(width, height, pixelFormat);
        this.pickModeRenderTarget = new RenderTarget({
            colorBuffer: this.pickModeColorBuffer,
            depth: false,
            flipY: false,
            samples: samples,
            autoResolve: false
        });
    }

    onUpdate(deltaTime: number) {
        const config = this.scene.config;

        // auto rotate
        if (config.controls.autoRotate) {
            if (this.autoRotateDelayValue > 0) {
                this.autoRotateDelayValue = Math.max(0, this.autoRotateDelayValue - deltaTime);
                this.autoRotateTimer = 0;
            } else {
                this.autoRotateTimer += deltaTime;
                const rotateSpeed = Math.min(1, Math.pow(this.autoRotateTimer * 0.5 - 1, 5) + 1); // soften the initial rotation speedup
                this.setAzimElev(
                    this.azim + config.controls.autoRotateSpeed * 10 * deltaTime * rotateSpeed,
                    this.elevation,
                    0
                );
            }
        }

        // update underlying values
        this.focalPointTween.update(deltaTime);
        this.azimElevTween.update(deltaTime);
        this.distanceTween.update(deltaTime);

        const azimElev = this.azimElevTween.value;
        const distance = this.distanceTween.value;

        calcForwardVec(forwardVec, azimElev.azim, azimElev.elev);
        cameraPosition.copy(forwardVec);
        cameraPosition.mulScalar(this.focusDistance * (config.camera.dollyZoom ? distance.distance : 1.0));
        cameraPosition.add(this.focalPointTween.value);

        this.entity.setLocalPosition(cameraPosition);
        this.entity.setLocalEulerAngles(azimElev.elev, azimElev.azim, 0);

        this.fitClippingPlanes(this.entity.getLocalPosition(), this.entity.forward);

        this.entity.camera.fov = config.camera.fov * (config.camera.dollyZoom ? 1.0 : distance.distance);
        this.entity.camera.camera._updateViewProjMat();
    }

    fitClippingPlanes(cameraPosition: Vec3, forwardVec: Vec3) {
        const bound = this.scene.bound;
        const boundRadius = bound.halfExtents.length();

        vec.sub2(bound.center, cameraPosition);
        const dist = vec.dot(forwardVec);

        this.far = dist + boundRadius;
        // if camera is placed inside the sphere bound calculate near based far
        this.near = Math.max(0.001, dist < boundRadius ? this.far / 1024 : dist - boundRadius);
    }

    onPreRender() {
        this.rebuildRenderTargets();
    }

    onPostRender() {
        const renderTarget = this.entity.camera.renderTarget;

        // resolve msaa buffer
        if (renderTarget.samples > 1) {
            renderTarget.resolve(true, false);
        }

        // copy render target
        drawTexture(this.scene.graphicsDevice, renderTarget.colorBuffer, null);
    }

    focus(options?: { sceneRadius?: number, distance?: number, focalPoint?: Vec3}) {
        const config = this.scene.config;

        let focalPoint: Vec3 = options?.focalPoint;
        if (!focalPoint) {
            this.scene.elements.forEach((element: any) => {
                if (!focalPoint && element.type === ElementType.splat) {
                    focalPoint = element.focalPoint && element.focalPoint();
                }
            });
        }

        const sceneRadius = options?.sceneRadius ?? this.scene.bound.halfExtents.length();
        const distance = sceneRadius / Math.sin(config.camera.fov * math.DEG_TO_RAD * 0.5);

        this.setDistance(options?.distance ?? 1.0, 0);
        this.setFocalPoint(focalPoint ?? this.scene.bound.center, 0);
        this.focusDistance = 1.1 * distance;
    }

    notify(event: string, data?: any) {
        const config = this.scene.config;

        this.events.fire(event, data);
        this.autoRotateDelayValue = config.controls.autoRotateDelay;
    }

    // interesect the scene at the given screen coordinate and focus the camera on this location
    pickFocalPoint(screenX: number, screenY: number) {
        const scene = this.scene;
        const cameraPos = this.entity.getPosition();

        // @ts-ignore
        const target = scene.canvas;
        const sx = screenX / target.clientWidth * scene.targetSize.width;
        const sy = screenY / target.clientHeight * scene.targetSize.height;

        const splats = scene.getElementsByType(ElementType.splat);

        const dist = (a: Vec3, b: Vec3) => {
            return vecb.sub2(a, b).length();
        };

        let closestD = 0;
        const closestP = new Vec3();
        let closestSplat = null;

        for (let i = 0; i < splats.length; ++i) {
            const splat = splats[i] as Splat;

            this.pickPrep(splat);
            const pickId = this.pick(sx, sy);

            if (pickId !== -1) {
                splat.getSplatWorldPosition(pickId, vec);

                // create a plane at the world position facing perpendicular to the camera
                plane.setFromPointNormal(vec, this.entity.forward);

                // create the pick ray in world space
                const res = this.entity.camera.screenToWorld(screenX, screenY, 1.0, vec);
                vec.sub2(res, cameraPos);
                vec.normalize();
                ray.set(cameraPos, vec);

                // find intersection
                if (plane.intersectsRay(ray, vec)) {
                    const distance = dist(vec, cameraPos);
                    if (!closestSplat || distance < closestD) {
                        closestD = distance;
                        closestP.copy(vec);
                        closestSplat = splat;
                    }
                }
            }
        }

        if (closestSplat) {
            this.setFocalPoint(closestP);
            scene.events.fire('selection', closestSplat);
        }
    }

    // pick mode

    // render picker contents
    pickPrep(splat: Splat) {
        const { width, height } = this.scene.targetSize;
        const worldLayer = this.scene.app.scene.layers.getLayerByName('World');

        const device = this.scene.graphicsDevice as WebglGraphicsDevice;
        const events = this.scene.events;
        const alpha = events.invoke('camera.mode') === 'rings' ? 0.0 : 0.2;

        // hide non-selected elements
        const splats = this.scene.getElementsByType(ElementType.splat);
        splats.forEach((s: Splat) => {
            s.entity.enabled = s === splat;
        });

        device.scope.resolve('pickerAlpha').setValue(alpha);
        this.picker.resize(width, height);
        this.picker.prepare(this.entity.camera, this.scene.app.scene, [worldLayer]);

        // re-enable all splats
        splats.forEach((splat: Splat) => {
            splat.entity.enabled = true;
        });
    }

    pick(x: number, y: number) {
        return this.pickRect(x, y, 1, 1)[0];
    }

    pickRect(x: number, y: number, width: number, height: number) {
        const device = this.scene.graphicsDevice as WebglGraphicsDevice;
        const pixels = new Uint8Array(width * height * 4);

        // read pixels
        device.setRenderTarget(this.picker.renderTarget);
        device.updateBegin();
        device.readPixels(x, this.picker.renderTarget.height - y - height, width, height, pixels);
        device.updateEnd();

        const result: number[] = [];
        for (let i = 0; i < width * height; i++) {
            result.push(
                pixels[i * 4] |
                (pixels[i * 4 + 1] << 8) |
                (pixels[i * 4 + 2] << 16) |
                (pixels[i * 4 + 3] << 24)
            );
        }

        return result;
    }
}

export { Camera };
