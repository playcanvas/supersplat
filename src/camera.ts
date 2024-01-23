import {
    math,
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_RGBA16F,
    PIXELFORMAT_DEPTH,
    drawTexture,
    Color,
    Entity,
    EventHandler,
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
import {Element, ElementType} from './element';
import {TweenValue} from './tween-value';
import {Serializer} from './serializer';
import {MouseController, TouchController} from './controllers';

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
const vec = new Vec3();

// modulo dealing with negative numbers
const mod = (n: number, m: number) => ((n % m) + m) % m;

class Camera extends Element {
    mouseController: MouseController;
    touchController: TouchController;
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
        this.entity.camera.layers = this.entity.camera.layers.concat([this.scene.shadowLayer.id]);

        if (this.scene.config.camera.debug_render) {
            this.entity.camera.setShaderPass(`debug_${this.scene.config.camera.debug_render}`);
        }

        this.mouseController = new MouseController(this);
        this.touchController = new TouchController(this);

        // apply scene config
        const config = this.scene.config;
        const controls = config.controls;

        this.mouseController.enableOrbit = this.touchController.enableOrbit = controls.enableRotate;
        this.mouseController.enablePan = this.touchController.enablePan = controls.enablePan;
        this.mouseController.enableZoom = this.touchController.enableZoom = controls.enableZoom;

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
    }

    remove() {
        this.mouseController.destroy();
        this.mouseController = null;

        this.touchController.destroy();
        this.touchController = null;

        this.entity.camera.layers = this.entity.camera.layers.filter(layer => layer !== this.scene.shadowLayer.id);
        this.scene.cameraRoot.removeChild(this.entity);
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
        const {width, height} = this.scene.targetSize;

        const rt = this.entity.camera.renderTarget;
        if (rt && rt.width === width && rt.height === height) {
            return;
        }

        // out with the old
        if (rt) {
            rt.colorBuffer.destroy();
            rt.depthBuffer.destroy();
            rt.destroy();
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
        const colorBuffer = createTexture(width, height, pixelFormat);
        const depthBuffer = createTexture(width, height, PIXELFORMAT_DEPTH);
        const renderTarget = new RenderTarget({
            colorBuffer: colorBuffer,
            depthBuffer: depthBuffer,
            flipY: false,
            samples: this.scene.config.camera.multisample ? device.maxSamples : 1,
            autoResolve: false
        });
        this.entity.camera.renderTarget = renderTarget;
        this.entity.camera.camera.horizontalFov = width < height;
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
        // const device = this.scene.graphicsDevice as WebglGraphicsDevice;
        const renderTarget = this.entity.camera.renderTarget;

        // resolve msaa buffer
        if (renderTarget._samples > 1) {
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
}

export {Camera};
