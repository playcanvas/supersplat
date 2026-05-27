import {
    type AppBase,
    type Entity,
    type EventHandler,
    PROJECTION_ORTHOGRAPHIC,
    Vec3
} from 'playcanvas';

import type { Collision } from './collision';
import type { State } from './types';

const SVGNS = 'http://www.w3.org/2000/svg';
const NUM_SAMPLES = 12;
const BASE_OUTER_RADIUS = 0.2;
const INNER_OUTER_RATIO = 0.17 / 0.2;
// Screen-space diameter (in CSS pixels) used for both hover and target
// rings when the scene isn't walk-sized. Walk-sized scenes render
// world-space (BASE_OUTER_RADIUS) so the ring orients to the surface and
// reads as a physical footprint; smaller scenes (or no collision) fall
// back to a fixed pixel size, which keeps the ring legible when 0.2 world
// units would eat too much of the scene. Selection happens in
// screenPixelsForRing(), keyed on state.walkAllowed.
const SCREEN_OUTER_PIXELS = 48;
const BEZIER_K = 1 / 6;
const NORMAL_SMOOTH_FACTOR = 0.25;
const NORMAL_SNAP_ANGLE = Math.PI / 4;
const NORMAL_EPSILON = 1e-6;

const createNormalSnapDirections = () => {
    const result: Vec3[] = [];

    for (let pitchStep = -2; pitchStep <= 2; pitchStep++) {
        const pitch = pitchStep * NORMAL_SNAP_ANGLE;
        const cp = Math.cos(pitch);
        const sy = Math.sin(pitch);

        if (Math.abs(cp) <= NORMAL_EPSILON) {
            result.push(new Vec3(0, sy > 0 ? 1 : -1, 0));
            continue;
        }

        for (let yawStep = 0; yawStep < 8; yawStep++) {
            const yaw = yawStep * NORMAL_SNAP_ANGLE;
            result.push(new Vec3(
                Math.cos(yaw) * cp,
                sy,
                Math.sin(yaw) * cp
            ));
        }
    }

    return result;
};

const NORMAL_SNAP_DIRECTIONS = createNormalSnapDirections();

const snapNormal = (nx: number, ny: number, nz: number, out: Vec3) => {
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len <= NORMAL_EPSILON) {
        return out.set(0, 1, 0);
    }

    const invLen = 1 / len;
    const x = nx * invLen;
    const y = ny * invLen;
    const z = nz * invLen;
    let best = NORMAL_SNAP_DIRECTIONS[0];
    let bestDot = -Infinity;

    for (let i = 0; i < NORMAL_SNAP_DIRECTIONS.length; i++) {
        const candidate = NORMAL_SNAP_DIRECTIONS[i];
        const dot = candidate.x * x + candidate.y * y + candidate.z * z;
        if (dot > bestDot) {
            bestDot = dot;
            best = candidate;
        }
    }

    return out.copy(best);
};

const tmpV = new Vec3();
const tmpScreen = new Vec3();
const tangent = new Vec3();
const bitangent = new Vec3();
const worldPt = new Vec3();
const up = new Vec3(0, 1, 0);
const right = new Vec3(1, 0, 0);

// Compute the world-space radius such that a circle at `pos` projects to a
// ring of `pixelDiameter` on screen. Used by the no-collision sizing path
// (see screenPixelsForRing) to keep a constant on-screen diameter
// regardless of camera distance.
const worldRadiusForPixels = (camera: Entity, canvasHeight: number, pos: Vec3, pixelDiameter: number): number => {
    const cam = camera.camera;
    if (cam.projection === PROJECTION_ORTHOGRAPHIC) {
        return pixelDiameter * cam.orthoHeight / canvasHeight;
    }
    const camPos = camera.getPosition();
    const dx = pos.x - camPos.x;
    const dy = pos.y - camPos.y;
    const dz = pos.z - camPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const halfFovTan = Math.tan(cam.fov * Math.PI / 360);
    return pixelDiameter * distance * halfFovTan / canvasHeight;
};

type CursorTarget = {
    position: Vec3;
    normal: Vec3;
};

type TargetMode = 'walk' | 'fly' | 'orbit';

const buildBezierRing = (sx: ArrayLike<number>, sy: ArrayLike<number>) => {
    const n = sx.length;
    let p = `M${sx[0].toFixed(1)},${sy[0].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
        const i0 = (i - 1 + n) % n;
        const i1 = i;
        const i2 = (i + 1) % n;
        const i3 = (i + 2) % n;
        const cp1x = sx[i1] + (sx[i2] - sx[i0]) * BEZIER_K;
        const cp1y = sy[i1] + (sy[i2] - sy[i0]) * BEZIER_K;
        const cp2x = sx[i2] - (sx[i3] - sx[i1]) * BEZIER_K;
        const cp2y = sy[i2] - (sy[i3] - sy[i1]) * BEZIER_K;
        p += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${sx[i2].toFixed(1)},${sy[i2].toFixed(1)}`;
    }
    return `${p} Z`;
};

class CursorRing {
    private path: SVGPathElement;

    private svg: SVGSVGElement;

    private canvas: HTMLCanvasElement;

    private camera: Entity;

    private smoothing: boolean;

    private smoothNx = 0;

    private smoothNy = 1;

    private smoothNz = 0;

    private hasSmoothedNormal = false;

    private readonly outerX = new Float64Array(NUM_SAMPLES);

    private readonly outerY = new Float64Array(NUM_SAMPLES);

    private readonly innerX = new Float64Array(NUM_SAMPLES);

    private readonly innerY = new Float64Array(NUM_SAMPLES);

    constructor(svg: SVGSVGElement, canvas: HTMLCanvasElement, camera: Entity, smoothing: boolean) {
        this.svg = svg;
        this.canvas = canvas;
        this.camera = camera;
        this.smoothing = smoothing;

        this.path = document.createElementNS(SVGNS, 'path');
        this.path.setAttribute('fill', 'white');
        this.path.setAttribute('fill-opacity', '0.6');
        this.path.setAttribute('fill-rule', 'evenodd');
        this.path.setAttribute('stroke', 'none');
        this.path.style.display = 'none';
        svg.appendChild(this.path);
    }

    private projectCircle(
        px: number, py: number, pz: number,
        nx: number, ny: number, nz: number,
        radius: number,
        outX: Float64Array, outY: Float64Array
    ) {
        const normal = tmpV.set(nx, ny, nz);
        if (Math.abs(normal.y) < 0.99) {
            tangent.cross(normal, up).normalize();
        } else {
            tangent.cross(normal, right).normalize();
        }
        bitangent.cross(normal, tangent);

        const cam = this.camera.camera;
        const angleStep = (2 * Math.PI) / NUM_SAMPLES;

        for (let i = 0; i < NUM_SAMPLES; i++) {
            const theta = i * angleStep;
            const ct = Math.cos(theta);
            const st = Math.sin(theta);

            const tx = ct * tangent.x + st * bitangent.x;
            const ty = ct * tangent.y + st * bitangent.y;
            const tz = ct * tangent.z + st * bitangent.z;

            worldPt.set(px + tx * radius, py + ty * radius, pz + tz * radius);
            cam.worldToScreen(worldPt, tmpScreen);
            outX[i] = tmpScreen.x;
            outY[i] = tmpScreen.y;
        }
    }

    // screenPixels: null → world-space ring (fixed world radius, shrinks
    // with distance); number → constant on-screen diameter in CSS pixels.
    render(pos: Vec3, normal: Vec3, screenPixels: number | null) {
        snapNormal(normal.x, normal.y, normal.z, tmpV);
        let nx = tmpV.x;
        let ny = tmpV.y;
        let nz = tmpV.z;

        if (this.smoothing) {
            if (this.hasSmoothedNormal) {
                const t = NORMAL_SMOOTH_FACTOR;
                nx = this.smoothNx + (nx - this.smoothNx) * t;
                ny = this.smoothNy + (ny - this.smoothNy) * t;
                nz = this.smoothNz + (nz - this.smoothNz) * t;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                if (len > 1e-6) {
                    const invLen = 1.0 / len;
                    nx *= invLen;
                    ny *= invLen;
                    nz *= invLen;
                }
            }
            this.smoothNx = nx;
            this.smoothNy = ny;
            this.smoothNz = nz;
            this.hasSmoothedNormal = true;
        }

        const outerRadius = screenPixels !== null ?
            worldRadiusForPixels(this.camera, this.canvas.clientHeight || 1, pos, screenPixels) :
            BASE_OUTER_RADIUS;
        const innerRadius = outerRadius * INNER_OUTER_RATIO;

        this.projectCircle(pos.x, pos.y, pos.z, nx, ny, nz, outerRadius, this.outerX, this.outerY);
        this.projectCircle(pos.x, pos.y, pos.z, nx, ny, nz, innerRadius, this.innerX, this.innerY);

        this.path.setAttribute('d', `${buildBezierRing(this.outerX, this.outerY)} ${buildBezierRing(this.innerX, this.innerY)}`);
        this.path.style.display = '';
        this.svg.style.display = '';
    }

    hide() {
        this.path.style.display = 'none';
        this.hasSmoothedNormal = false;
    }
}

class NavCursor {
    private svg: SVGSVGElement;

    private hoverRing: CursorRing;

    private targetRing: CursorRing;

    private camera: Entity;

    private collision: Collision | null;

    private canvas: HTMLCanvasElement;

    private state: State;

    private app: AppBase;

    private onPrerender: () => void;

    // True when the hover ring should track the pointer. Only walk mode
    // (with mouse navigation, not gaming controls) shows the hover ring;
    // fly/orbit only show the target ring on click.
    private hoverActive = false;

    private navigating = false;

    private targetPos: Vec3 | null = null;

    private targetNormal: Vec3 | null = null;

    private targetMode: TargetMode | null = null;

    private onPointerMove: (e: PointerEvent) => void;

    private onPointerLeave: () => void;

    private readonly collisionTarget: CursorTarget = {
        position: new Vec3(),
        normal: new Vec3()
    };

    constructor(
        app: AppBase,
        camera: Entity,
        collision: Collision | null,
        events: EventHandler,
        state: State
    ) {
        this.camera = camera;
        this.collision = collision;
        this.canvas = app.graphicsDevice.canvas as HTMLCanvasElement;
        this.state = state;
        this.app = app;

        this.svg = document.createElementNS(SVGNS, 'svg');
        this.svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1';
        this.canvas.parentElement!.appendChild(this.svg);

        this.hoverRing = new CursorRing(this.svg, this.canvas, camera, true);
        this.targetRing = new CursorRing(this.svg, this.canvas, camera, false);

        this.svg.style.display = 'none';

        this.onPointerMove = (e: PointerEvent) => {
            if (e.pointerType === 'touch' || e.buttons) {
                this.hoverRing.hide();
                return;
            }
            this.updateCursor(e.offsetX, e.offsetY);
        };

        this.onPointerLeave = () => {
            this.hoverRing.hide();
        };

        this.canvas.addEventListener('pointermove', this.onPointerMove);
        this.canvas.addEventListener('pointerleave', this.onPointerLeave);

        const updateActive = () => {
            // Hover ring only in walk mode with mouse navigation. Gaming
            // controls use pointer-lock and don't need a hover preview.
            this.hoverActive = state.cameraMode === 'walk' && !state.gamingControls;
            this.hoverRing.hide();
            if (this.targetMode && this.targetMode !== state.cameraMode) {
                this.navigating = false;
                this.clearTarget();
            }
        };

        events.on('cameraMode:changed', updateActive);
        events.on('inputMode:changed', updateActive);
        events.on('gamingControls:changed', updateActive);

        events.on('navigateTo', () => {
            this.navigating = true;
            this.hoverRing.hide();
        });

        events.on('navigateCancel', () => {
            this.navigating = false;
            this.clearTarget();
        });

        events.on('navigateComplete', () => {
            this.navigating = false;
            this.clearTarget();
        });

        events.on('navTarget:set', (pos: Vec3, normal: Vec3) => {
            const mode = state.cameraMode === 'walk' || state.cameraMode === 'fly' ?
                state.cameraMode : 'walk';
            this.setTarget(pos, normal, mode);
        });

        events.on('navTarget:clear', () => {
            this.clearTarget();
        });

        events.on('orbitTarget:set', (pos: Vec3, normal: Vec3) => {
            this.navigating = false;
            this.setTarget(pos, normal, 'orbit');
        });

        events.on('orbitTarget:clear', () => {
            if (this.targetMode === 'orbit') {
                this.clearTarget();
            }
        });

        this.onPrerender = () => {
            this.updateTarget();
        };
        app.on('prerender', this.onPrerender);

        updateActive();
    }

    // Ring sizing is per-scene: walk-sized scenes (collision present and
    // bbox large enough — same predicate as walk mode) get world-space
    // rings, which read as physical footprints on the surface with visible
    // orientation. Smaller scenes or scenes without collision use a fixed
    // screen-pixel ring — 0.2 world units would dominate a small scene,
    // and the pick already falls back to splat depth without collision.
    private screenPixelsForRing(): number | null {
        return this.state.walkAllowed ? null : SCREEN_OUTER_PIXELS;
    }

    private setTarget(pos: Vec3, normal: Vec3, mode: TargetMode) {
        this.targetPos = pos.clone();
        this.targetNormal = normal.clone();
        this.targetMode = mode;
        this.hoverRing.hide();
        this.targetRing.hide();
    }

    private clearTarget() {
        this.targetPos = null;
        this.targetNormal = null;
        this.targetMode = null;
        this.targetRing.hide();
    }

    private pickCollision(offsetX: number, offsetY: number): CursorTarget | null {
        if (!this.collision) {
            return null;
        }

        const { camera, collision } = this;
        const cameraPos = camera.getPosition();

        camera.camera.screenToWorld(offsetX, offsetY, 1.0, tmpV);
        tmpV.sub(cameraPos).normalize();

        const hit = collision.queryRay(
            cameraPos.x, cameraPos.y, cameraPos.z,
            tmpV.x, tmpV.y, tmpV.z,
            camera.camera.farClip
        );

        if (!hit) {
            return null;
        }

        const sn = collision.querySurfaceNormal(hit.x, hit.y, hit.z, tmpV.x, tmpV.y, tmpV.z);
        this.collisionTarget.position.set(hit.x, hit.y, hit.z);
        this.collisionTarget.normal.set(sn.nx, sn.ny, sn.nz);
        return this.collisionTarget;
    }

    private updateCursor(offsetX: number, offsetY: number) {
        if (!this.hoverActive || this.navigating) {
            this.hoverRing.hide();
            return;
        }

        const target = this.pickCollision(offsetX, offsetY);
        if (!target) {
            this.hoverRing.hide();
            return;
        }

        this.hoverRing.render(target.position, target.normal, this.screenPixelsForRing());
    }

    private updateTarget() {
        if (!this.targetPos || !this.targetNormal || !this.targetMode) {
            return;
        }

        const camPos = this.camera.getPosition();
        const dist = camPos.distance(this.targetPos);
        if (this.targetMode !== 'orbit' && dist < 2.0) {
            this.targetRing.hide();
            return;
        }

        this.targetRing.render(this.targetPos, this.targetNormal, this.screenPixelsForRing());
    }

    destroy() {
        this.app.off('prerender', this.onPrerender);
        this.canvas.removeEventListener('pointermove', this.onPointerMove);
        this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
        this.svg.remove();
    }
}

export { NavCursor };
