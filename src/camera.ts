import {
    math,
    ADDRESS_CLAMP_TO_EDGE,
    ASPECT_MANUAL,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_RGBA16F,
    PIXELFORMAT_DEPTH,
    PROJECTION_ORTHOGRAPHIC,
    PROJECTION_PERSPECTIVE,
    TONEMAP_ACES,
    TONEMAP_ACES2,
    TONEMAP_FILMIC,
    TONEMAP_HEJL,
    TONEMAP_LINEAR,
    TONEMAP_NEUTRAL,
    BoundingBox,
    Color,
    Entity,
    Mat4,
    Ray,
    RenderPass,
    RenderPassForward,
    RenderTarget,
    Texture,
    Vec3,
    Vec4
} from 'playcanvas';

import { PointerController } from './controllers';
import { Element, ElementType } from './element';
import { Picker } from './picker';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader } from './shaders/blit-shader';
import { Splat } from './splat';
import { TweenValue } from './tween-value';
import { ShaderQuad, SimpleRenderPass } from './utils/simple-render-pass';

// work globals
const forwardVec = new Vec3();
const cameraPosition = new Vec3();
const ray = new Ray();
const vec = new Vec3();
const vecb = new Vec3();
const va = new Vec3();
const m = new Mat4();
const v4 = new Vec4();

// modulo dealing with negative numbers
const mod = (n: number, m: number) => ((n % m) + m) % m;

class Camera extends Element {
    /**
     * Calculate the forward vector given azimuth and elevation angles.
     *
     * @param {Vec3} result - The Vec3 to store the result in.
     * @param {number} azim - Azimuth angle in degrees.
     * @param {number} elev - Elevation angle in degrees.
     */
    static calcForwardVec(result: Vec3, azim: number, elev: number) {
        const ex = elev * math.DEG_TO_RAD;
        const ey = azim * math.DEG_TO_RAD;
        const s1 = Math.sin(-ex);
        const c1 = Math.cos(-ex);
        const s2 = Math.sin(-ey);
        const c2 = Math.cos(-ey);
        result.set(-c1 * s2, s1, c1 * c2);
    }

    controller: PointerController;
    focalPointTween = new TweenValue({ x: 0, y: 0.5, z: 0 });
    azimElevTween = new TweenValue({ azim: 30, elev: -15 });
    distanceTween = new TweenValue({ distance: 1 });

    minElev = -90;
    maxElev = 90;

    sceneRadius = 1;

    flySpeed = 1;

    controlMode: 'orbit' | 'fly' = 'orbit';

    picker: Picker;

    mainCamera: Entity;

    mainTarget: RenderTarget;
    splatTarget: RenderTarget;
    colorTarget: RenderTarget;
    workTarget: RenderTarget;

    // Render passes
    clearPass: RenderPass;
    mainPass: RenderPassForward;
    splatPass: RenderPassForward;
    gizmoPass: RenderPassForward;
    finalPass: SimpleRenderPass;

    // overridden target size
    targetSizeOverride: { width: number, height: number } = null;

    renderOverlays = true;

    updateCameraUniforms: () => void;

    constructor() {
        super(ElementType.camera);

        // create the camera entity
        this.mainCamera = new Entity('Camera');
        this.mainCamera.addComponent('camera');
    }

    // ortho
    set ortho(value: boolean) {
        if (value !== this.ortho) {
            this.camera.projection = value ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE;
            this.scene.events.fire('camera.ortho', value);
        }
    }

    get ortho() {
        return this.camera.projection === PROJECTION_ORTHOGRAPHIC;
    }

    // fov
    set fov(value: number) {
        this.camera.fov = value;
    }

    get fov() {
        return this.camera.fov;
    }

    // tonemapping
    set tonemapping(value: string) {
        const mapping: Record<string, number> = {
            linear: TONEMAP_LINEAR,
            neutral: TONEMAP_NEUTRAL,
            aces: TONEMAP_ACES,
            aces2: TONEMAP_ACES2,
            filmic: TONEMAP_FILMIC,
            hejl: TONEMAP_HEJL
        };

        const tvalue = mapping[value];

        if (tvalue !== undefined && tvalue !== this.camera.toneMapping) {
            this.camera.toneMapping = tvalue;
            this.scene.events.fire('camera.tonemapping', value);
        }
    }

    get tonemapping() {
        switch (this.camera.toneMapping) {
            case TONEMAP_LINEAR: return 'linear';
            case TONEMAP_NEUTRAL: return 'neutral';
            case TONEMAP_ACES: return 'aces';
            case TONEMAP_ACES2: return 'aces2';
            case TONEMAP_FILMIC: return 'filmic';
            case TONEMAP_HEJL: return 'hejl';
        }
        return 'linear';
    }

    // near clip
    set near(value: number) {
        this.camera.nearClip = value;
    }

    get near() {
        return this.camera.nearClip;
    }

    // far clip
    set far(value: number) {
        this.camera.farClip = value;
    }

    get far() {
        return this.camera.farClip;
    }

    // focal point
    get focalPoint() {
        const t = this.focalPointTween.target;
        return new Vec3(t.x, t.y, t.z);
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

    setFocalPoint(point: Vec3, dampingFactorFactor: number = 1) {
        this.focalPointTween.goto(point, dampingFactorFactor * this.scene.config.controls.dampingFactor);
    }

    setAzimElev(azim: number, elev: number, dampingFactorFactor: number = 1) {
        // clamp
        azim = mod(azim, 360);
        elev = Math.max(this.minElev, Math.min(this.maxElev, elev));

        const t = this.azimElevTween;
        t.goto({ azim, elev }, dampingFactorFactor * this.scene.config.controls.dampingFactor);

        // handle wraparound
        if (t.source.azim - azim < -180) {
            t.source.azim += 360;
        } else if (t.source.azim - azim > 180) {
            t.source.azim -= 360;
        }

        // return to perspective mode on rotation
        this.ortho = false;
    }

    setDistance(distance: number, dampingFactorFactor: number = 1) {
        const controls = this.scene.config.controls;

        // clamp
        distance = Math.max(controls.minZoom, Math.min(controls.maxZoom, distance));

        const t = this.distanceTween;
        t.goto({ distance }, dampingFactorFactor * controls.dampingFactor);
    }

    setPose(position: Vec3, target: Vec3, dampingFactorFactor: number = 1) {
        vec.sub2(target, position);
        const l = vec.length();
        const azim = Math.atan2(-vec.x / l, -vec.z / l) * math.RAD_TO_DEG;
        const elev = Math.asin(vec.y / l) * math.RAD_TO_DEG;
        this.setFocalPoint(target, dampingFactorFactor);
        this.setAzimElev(azim, elev, dampingFactorFactor);
        this.setDistance(l / this.sceneRadius * this.fovFactor, dampingFactorFactor);
    }

    // transform the world space coordinate to normalized screen coordinate
    worldToScreen(world: Vec3, screen: Vec3) {
        const { camera } = this;
        m.mul2(camera.projectionMatrix, camera.viewMatrix);

        v4.set(world.x, world.y, world.z, 1);
        m.transformVec4(v4, v4);

        screen.x = v4.x / v4.w * 0.5 + 0.5;
        screen.y = 1.0 - (v4.y / v4.w * 0.5 + 0.5);
        screen.z = v4.z / v4.w;
    }

    add() {
        const { camera, scene } = this;

        scene.cameraRoot.addChild(this.mainCamera);

        // configure camera to render all layers
        this.mainCamera.camera.layers = [
            scene.worldLayer.id,
            scene.splatLayer.id,
            scene.gizmoLayer.id
        ];

        // use manual aspect ratio mode so we can set it based on targetSize
        camera.aspectRatioMode = ASPECT_MANUAL;

        // create render passes
        const device = scene.graphicsDevice;
        const { app } = scene;
        const renderer = app.renderer;
        const composition = app.scene.layers;

        this.clearPass = new RenderPass(device);
        this.mainPass = new RenderPassForward(device, composition, app.scene, renderer);
        this.splatPass = new RenderPassForward(device, composition, app.scene, renderer);
        this.gizmoPass = new RenderPassForward(device, composition, app.scene, renderer);
        this.finalPass = new SimpleRenderPass(device,
            new ShaderQuad(device, vertexShader, fragmentShader, 'final-blit'), {
                vars: () => {
                    return {
                        srcTexture: this.mainTarget.colorBuffer
                    };
                }
            });

        const target = document.getElementById('canvas-container');
        this.controller = new PointerController(this, target);

        // apply scene config
        const config = scene.config;
        const controls = config.controls;

        this.minElev = (controls.minPolarAngle * 180) / Math.PI - 90;
        this.maxElev = (controls.maxPolarAngle * 180) / Math.PI - 90;

        // tonemapping
        camera.toneMapping = {
            linear: TONEMAP_LINEAR,
            filmic: TONEMAP_FILMIC,
            hejl: TONEMAP_HEJL,
            aces: TONEMAP_ACES,
            aces2: TONEMAP_ACES2,
            neutral: TONEMAP_NEUTRAL
        }[config.camera.toneMapping];

        // exposure
        scene.app.scene.exposure = config.camera.exposure;

        this.fov = config.camera.fov;

        // initial camera position and orientation
        this.setAzimElev(controls.initialAzim, controls.initialElev, 0);
        this.setDistance(controls.initialZoom, 0);

        // picker
        this.picker = new Picker(scene);

        scene.events.on('scene.boundChanged', this.onBoundChanged, this);

        // prepare camera-specific uniforms
        this.updateCameraUniforms = () => {
            const device = scene.graphicsDevice;
            const entity = this.mainCamera;
            const camera = entity.camera;

            const set = (name: string, vec: Vec3) => {
                device.scope.resolve(name).setValue([vec.x, vec.y, vec.z]);
            };

            // get frustum corners in world space
            const points = camera.camera.getFrustumCorners(-100);
            const worldTransform = this.worldTransform;
            for (let i = 0; i < points.length; i++) {
                worldTransform.transformPoint(points[i], points[i]);
            }

            // near
            if (camera.projection === PROJECTION_PERSPECTIVE) {
                // perspective
                set('near_origin', worldTransform.getTranslation());
                set('near_x', Vec3.ZERO);
                set('near_y', Vec3.ZERO);
            } else {
                // orthographic
                set('near_origin', points[3]);
                set('near_x', va.sub2(points[0], points[3]));
                set('near_y', va.sub2(points[2], points[3]));
            }

            // far
            set('far_origin', points[7]);
            set('far_x', va.sub2(points[4], points[7]));
            set('far_y', va.sub2(points[6], points[7]));
        };

        // temp control of camera start
        const url = new URL(location.href);
        const focal = url.searchParams.get('focal');
        if (focal) {
            const parts = focal.toString().split(',');
            if (parts.length === 3) {
                this.setFocalPoint(new Vec3(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])), 0);
            }
        }
        const angles = url.searchParams.get('angles');
        if (angles) {
            const parts = angles.toString().split(',');
            if (parts.length === 2) {
                this.setAzimElev(parseFloat(parts[0]), parseFloat(parts[1]), 0);
            }
        }
        const distance = url.searchParams.get('distance');
        if (distance) {
            this.setDistance(parseFloat(distance), 0);
        }
    }

    remove() {
        const { scene } = this;

        this.controller.destroy();
        this.controller = null;

        // cleanup render passes
        this.clearPass?.destroy();
        this.mainPass?.destroy();
        this.splatPass?.destroy();
        this.gizmoPass?.destroy();
        this.finalPass?.destroy();
        this.camera.renderPasses = null;

        scene.cameraRoot.removeChild(this.mainCamera);

        this.picker.destroy();
        this.picker = null;

        scene.events.off('scene.boundChanged', this.onBoundChanged, this);
    }

    // handle the scene's bound changing. the camera must be configured to render
    // the entire extents as well as possible.
    // also update the existing camera distance to maintain the current view
    onBoundChanged(bound: BoundingBox) {
        const prevDistance = this.distanceTween.value.distance * this.sceneRadius;
        this.sceneRadius = Math.max(1e-03, bound.halfExtents.length());
        this.setDistance(prevDistance / this.sceneRadius, 0);
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.worldTransform.data);
        serializer.pack(
            this.fov,
            this.tonemapping,
            this.targetSize.width,
            this.targetSize.height
        );
    }

    // handle the viewer canvas resizing
    rebuildRenderTargets() {
        const { width, height } = this.targetSize;
        const { mainTarget, scene } = this;

        // early out if size is unchanged
        if (mainTarget && mainTarget.width === width && mainTarget.height === height) {
            return;
        }

        if (!mainTarget) {
            // first time - construct render targets
            const { graphicsDevice } = scene;

            const createTexture = (name: string, width: number, height: number, format: number) => {
                return new Texture(graphicsDevice, {
                    name,
                    width,
                    height,
                    format,
                    mipmaps: false,
                    minFilter: FILTER_NEAREST,
                    magFilter: FILTER_NEAREST,
                    addressU: ADDRESS_CLAMP_TO_EDGE,
                    addressV: ADDRESS_CLAMP_TO_EDGE
                });
            };

            const colorBuffer = createTexture('cameraColor', width, height, PIXELFORMAT_RGBA16F);
            const workBuffer = createTexture('workColor', width, height, PIXELFORMAT_RGBA8);
            const depthBuffer = createTexture('cameraDepth', width, height, PIXELFORMAT_DEPTH);

            // create main render target
            this.mainTarget = new RenderTarget({
                colorBuffer,
                depthBuffer,
                flipY: false,
                autoResolve: false
            });

            // create MRT render target for splat pass
            this.splatTarget = new RenderTarget({
                colorBuffers: [
                    colorBuffer,        // RT0: main color (shared)
                    workBuffer          // RT1: overlay output (shared with workTarget)
                ],
                depthBuffer,
                flipY: false,
                autoResolve: false
            });

            this.colorTarget = new RenderTarget({
                colorBuffer,
                depth: false,
                autoResolve: false
            });

            // create work buffer (used for picking, overlay output, and other operations)
            this.workTarget = new RenderTarget({
                colorBuffer: workBuffer,
                depth: false,
                autoResolve: false
            });

            // set picker render targets
            this.picker.setRenderTargets(this.colorTarget, this.workTarget);

            // clear all targets
            this.clearPass.init(this.splatTarget);
            this.clearPass.setClearColor(new Color(0, 0, 0, 0));
            this.clearPass.setClearDepth(1);
            this.clearPass.setClearStencil(0);

            // configure main pass - world layer with clears
            this.mainPass.init(this.mainTarget);
            this.mainPass.addLayer(this.camera, scene.worldLayer, false, false);
            this.mainPass.addLayer(this.camera, scene.worldLayer, true, false);

            // configure splat pass - MRT target, no clears
            this.splatPass.init(this.splatTarget);
            this.splatPass.addLayer(this.camera, scene.splatLayer, false, false);
            this.splatPass.addLayer(this.camera, scene.splatLayer, true, false);

            // configure gizmo pass
            this.gizmoPass.init(this.mainTarget);
            this.gizmoPass.addLayer(this.camera, scene.gizmoLayer, false, false);
            this.gizmoPass.addLayer(this.camera, scene.gizmoLayer, true, false);
            this.gizmoPass.renderActions[0].clearDepth = true;
            this.gizmoPass.renderActions[0].clearStencil = true;

            this.finalPass.init(null);

            // assign render passes to camera
            this.camera.renderPasses = [this.clearPass, this.mainPass, this.splatPass, this.gizmoPass, this.finalPass];
        } else {
            // resize existing render targets
            const { splatTarget, colorTarget, workTarget } = this;

            mainTarget.resize(width, height);
            workTarget.resize(width, height);
            colorTarget.resize(width, height);
            splatTarget.resize(width, height);
        }

        this.camera.horizontalFov = width > height;
        this.camera.aspectRatio = width / height;
        scene.events.fire('camera.resize', { width, height });
    }

    onUpdate(deltaTime: number) {
        // controller update
        this.controller.update(deltaTime);

        // update underlying values
        this.focalPointTween.update(deltaTime);
        this.azimElevTween.update(deltaTime);
        this.distanceTween.update(deltaTime);

        const azimElev = this.azimElevTween.value;
        const distance = this.distanceTween.value;

        Camera.calcForwardVec(forwardVec, azimElev.azim, azimElev.elev);
        cameraPosition.copy(forwardVec);
        cameraPosition.mulScalar(distance.distance * this.sceneRadius / this.fovFactor);
        cameraPosition.add(this.focalPointTween.value);

        this.mainCamera.setLocalPosition(cameraPosition);
        this.mainCamera.setLocalEulerAngles(azimElev.elev, azimElev.azim, 0);

        this.fitClippingPlanes(this.mainCamera.getLocalPosition(), this.mainCamera.forward);

        const { camera } = this.mainCamera;
        const { targetSize } = this;

        // update ortho height
        camera.orthoHeight = this.distanceTween.value.distance * this.sceneRadius / this.fovFactor * (this.fov / 90) * (camera.horizontalFov ? targetSize.height / targetSize.width : 1);
        camera.camera._updateViewProjMat();
    }

    fitClippingPlanes(cameraPosition: Vec3, forwardVec: Vec3) {
        const bound = this.scene.bound;
        const boundRadius = bound.halfExtents.length();

        vec.sub2(bound.center, cameraPosition);
        const dist = vec.dot(forwardVec);

        if (dist > 0) {
            this.far = dist + boundRadius;
            // if camera is placed inside the sphere bound calculate near based far
            this.near = Math.max(1e-6, dist < boundRadius ? this.far / (1024 * 16) : dist - boundRadius);
        } else {
            // if the scene is behind the camera
            this.far = boundRadius * 2;
            this.near = this.far / (1024 * 16);
        }
    }

    onPreRender() {
        this.rebuildRenderTargets();
        this.updateCameraUniforms();
    }

    onPostRender() {

    }

    focus(options?: { focalPoint: Vec3, radius: number, speed: number }) {
        const getSplatFocalPoint = () => {
            for (const element of this.scene.elements) {
                if (element.type === ElementType.splat) {
                    const focalPoint = (element as Splat).focalPoint?.();
                    if (focalPoint) {
                        return focalPoint;
                    }
                }
            }
        };

        const focalPoint = options ? options.focalPoint : (getSplatFocalPoint() ?? this.scene.bound.center);
        const focalRadius = options ? options.radius : this.scene.bound.halfExtents.length();

        const fdist = focalRadius / this.sceneRadius;

        this.setDistance(isFinite(fdist) ? fdist : 1, options?.speed ?? 0);
        this.setFocalPoint(focalPoint, options?.speed ?? 0);
    }

    get fovFactor() {
        // we set the fov of the longer axis. here we get the fov of the other (smaller) axis so framing
        // doesn't cut off the scene.
        const { width, height } = this.targetSize;
        const aspect = (width && height) ? this.camera.horizontalFov ? height / width : width / height : 1;
        const fov = 2 * Math.atan(Math.tan(this.fov * math.DEG_TO_RAD * 0.5) * aspect);
        return Math.sin(fov * 0.5);
    }

    getRay(screenX: number, screenY: number, ray: Ray) {
        const { camera, ortho } = this;
        const cameraPos = this.mainCamera.getPosition();

        // create the pick ray in world space
        if (ortho) {
            camera.screenToWorld(screenX, screenY, -1.0, vec);
            camera.screenToWorld(screenX, screenY, 1.0, vecb);
            vecb.sub(vec).normalize();
            ray.set(vec, vecb);
        } else {
            camera.screenToWorld(screenX, screenY, 1.0, vec);
            vec.sub(cameraPos).normalize();
            ray.set(cameraPos, vec);
        }
    }

    // intersect the scene at the given normalized screen coordinate (0-1 range) using depth picking
    async intersect(x: number, y: number) {
        const { scene } = this;
        const splats = scene.getElementsByType(ElementType.splat);

        let closestDepth = Infinity;
        let closestSplat: Splat | null = null;

        // Find the splat with the smallest depth at this screen position
        for (let i = 0; i < splats.length; ++i) {
            const splat = splats[i] as Splat;

            this.picker.prepareDepth(splat);
            const normalizedDepth = await this.picker.readDepth(x, y);

            if (normalizedDepth !== null && normalizedDepth < closestDepth) {
                closestDepth = normalizedDepth;
                closestSplat = splat;
            }
        }

        if (!closestSplat) {
            return null;
        }

        // Convert normalized depth to linear depth
        const linearDepth = closestDepth * (this.far - this.near) + this.near;

        // Convert normalized coordinates to screen pixels for getRay
        const screenX = x * scene.canvas.clientWidth;
        const screenY = y * scene.canvas.clientHeight;

        // Calculate world position from ray and depth
        this.getRay(screenX, screenY, ray);
        const t = linearDepth / ray.direction.dot(this.mainCamera.forward);
        const position = new Vec3();
        position.copy(ray.origin).add(vec.copy(ray.direction).mulScalar(t));

        return {
            splat: closestSplat,
            position: position,
            distance: t
        };
    }

    // intersect the scene at the normalized screen location (0-1 range) and focus the camera on this location
    async pickFocalPoint(x: number, y: number) {
        const result = await this.intersect(x, y);
        if (result) {
            const { scene } = this;

            this.setFocalPoint(result.position);
            this.setDistance(result.distance / this.sceneRadius * this.fovFactor);
            scene.events.fire('camera.focalPointPicked', {
                camera: this,
                splat: result.splat,
                position: result.position
            });
        }
    }

    // pick mode

    // render picker contents
    pickPrep(splat: Splat, mode: 'add' | 'remove' | 'set') {
        this.picker.prepareId(splat, mode);
    }

    pick(x: number, y: number) {
        return this.picker.readId(x, y);
    }

    pickRect(x: number, y: number, width: number, height: number) {
        return this.picker.readIds(x, y, width, height);
    }

    docSerialize() {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];

        return {
            focalPoint: pack3(this.focalPointTween.target),
            azim: this.azim,
            elev: this.elevation,
            distance: this.distance,
            fov: this.fov,
            tonemapping: this.tonemapping
        };
    }

    docDeserialize(settings: any) {
        this.setFocalPoint(new Vec3(settings.focalPoint), 0);
        this.setAzimElev(settings.azim, settings.elev, 0);
        this.setDistance(settings.distance, 0);
        this.fov = settings.fov;
        this.tonemapping = settings.tonemapping;
    }

    // offscreen render mode

    startOffscreenMode(width: number, height: number) {
        this.targetSizeOverride = { width, height };
        this.finalPass.enabled = false;
        this.rebuildRenderTargets();
        this.onUpdate(0);
    }

    endOffscreenMode() {
        this.targetSizeOverride = null;
        this.finalPass.enabled = true;
        this.rebuildRenderTargets();
        this.onUpdate(0);
    }

    get targetSize() {
        return this.targetSizeOverride ?? this.scene.targetSize;
    }

    get camera() {
        return this.mainCamera.camera;
    }

    get worldTransform() {
        return this.mainCamera.getWorldTransform();
    }

    get position() {
        return this.mainCamera.getPosition();
    }

    get forward() {
        return this.mainCamera.forward;
    }
}

export { Camera };
