import type { Vec3 } from 'playcanvas';

import { Events } from './events';
import { Scene } from './scene';

export type AreaEdge = { a: Vec3; b: Vec3; length: number };
export type AreaMeasurementData = {
    points: Vec3[];
    edges: AreaEdge[];
    closed: boolean;
    area: number | null;
    redoIndex: number | null;
    nonPlanarity: { rms: number; max: number } | null;
    splitSelection: number[] | null;
    splitAreas: { a: number; b: number; total: number } | null;
    breaklines: { i: number; j: number }[];
    surfaces: { indices: number[]; area: number; nonPlanarity: { rms: number; max: number } | null }[] | null;
    surfacesTotal: number | null;
};

enum AreaState {
    INACTIVE = 0,
    ACTIVE = 1,
    WAITING_REDO = 2,
    SPLIT_SELECT = 3
}

const EPS = 1e-6;

class AreaMeasurementTool {
    private events: Events;
    private scene: Scene;

    private state: AreaState = AreaState.INACTIVE;
    private points: Vec3[] = [];
    private closed = false;

    private pointerDownHandler: (event: PointerEvent) => void;
    private pointerMoveHandler: (event: PointerEvent) => void;
    private pointerUpHandler: (event: PointerEvent) => void;
    private redoIndex: number | null = null;
    private splitSelection: number[] = [];
    private splitAreas: { a: number; b: number; total: number } | null = null;
    private breaklines: { i: number; j: number }[] = [];
    private autoAddBreaklines = false;

    private clicksDisabled = false;
    private lastButtonClickTime = 0;
    private panelsWereHiddenBefore: boolean = false;

    // click-vs-drag detection
    private activePointerId: number | null = null;
    private downX = 0;
    private downY = 0;
    private moved = false;
    private downTime = 0;
    private staticClickMaxMs = 300; // hold longer than this = drag, not a click

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;
        this.pointerDownHandler = this.onPointerDown.bind(this);
        this.pointerMoveHandler = this.onPointerMove.bind(this);
        this.pointerUpHandler = this.onPointerUp.bind(this);
        this.bindEvents();
    }

    private bindEvents() {
        this.events.on('area.measure.toggle', () => this.toggle());
        this.events.on('area.measure.clear', () => this.clear());
        this.events.on('area.measure.exit', () => this.deactivate());
        this.events.on('area.measure.closePolygon', () => this.closePolygon());
        this.events.on('area.measure.redo', (index: number) => this.prepareRedo(index));
        this.events.on('area.measure.disable.temporary', () => this.temporarilyDisableClicks());
        this.events.on('area.measure.split.start', () => this.startSplit());
        this.events.on('area.measure.split.cancel', () => this.cancelSplit());
        this.events.on('area.measure.split.select', (index: number) => this.pickSplitIndex(index));
        this.events.on('area.measure.split.add', () => this.addBreaklineFromSelection());
        this.events.on('area.measure.split.undo', () => this.undoLastBreakline());
        this.events.on('area.measure.split.clearAll', () => this.clearAllBreaklines());
        // Auto-add breakline mode controls
        this.events.on('area.measure.breakline.start', () => {
            if (this.state !== AreaState.INACTIVE) {
                this.autoAddBreaklines = true; this.state = AreaState.SPLIT_SELECT; this.publish();
            }
        });
        this.events.on('area.measure.breakline.stop', () => {
            this.autoAddBreaklines = false; this.splitSelection = []; this.splitAreas = null; this.state = AreaState.ACTIVE; this.publish();
        });
    }

    toggle() {
        if (this.state === AreaState.INACTIVE) this.activate();
        else this.deactivate();
    }

    activate() {
        if (this.state !== AreaState.INACTIVE) return;

        // Deactivate other tools (selection etc.)
        this.events.fire('tool.deactivate');

        this.state = AreaState.ACTIVE;
        this.points = [];
        this.closed = false;
        this.redoIndex = null;
        this.splitSelection = [];
        this.splitAreas = null;
        this.breaklines = [];
        // ensure any previous split mode in UI is cancelled
        this.events.fire('area.measure.split.cancel');

        // Show the area measurement panel and overlay
        setTimeout(() => {
            this.events.fire('area.measure.show');
            const panel = document.querySelector('.area-measurement-panel') as HTMLElement;
            if (panel) panel.style.display = 'block';
            const overlay = document.getElementById('area-measurement-overlay') as HTMLElement;
            if (overlay) overlay.style.display = 'block';
        }, 1);

        const canvas = this.scene.canvas;
        // Ensure any previous listener is removed (both capture and bubble just in case)
        canvas.removeEventListener('pointerdown', this.pointerDownHandler, true);
        canvas.removeEventListener('pointerdown', this.pointerDownHandler, false);
        // Listen on the canvas (bubble phase) and do NOT stop propagation so camera can still rotate
        canvas.addEventListener('pointerdown', this.pointerDownHandler, false);
        canvas.style.cursor = 'crosshair';

        this.publish();
    }

    deactivate() {
        if (this.state === AreaState.INACTIVE) return;

        this.state = AreaState.INACTIVE;
        const canvas = this.scene.canvas;
        // Remove listeners in both phases to be safe
        canvas.removeEventListener('pointerdown', this.pointerDownHandler, true);
        canvas.removeEventListener('pointerdown', this.pointerDownHandler, false);
        window.removeEventListener('pointermove', this.pointerMoveHandler, true);
        window.removeEventListener('pointermove', this.pointerMoveHandler, false);
        window.removeEventListener('pointerup', this.pointerUpHandler, true);
        window.removeEventListener('pointerup', this.pointerUpHandler, false);
        this.activePointerId = null;
        canvas.style.cursor = 'default';

        // hide panel/overlay explicitly
        setTimeout(() => {
            this.events.fire('area.measure.hide');
            const panel = document.querySelector('.area-measurement-panel') as HTMLElement;
            if (panel) panel.style.display = 'none';
            const overlay = document.getElementById('area-measurement-overlay') as HTMLElement;
            if (overlay) overlay.style.display = 'none';
        }, 2);

        this.events.fire('area.measure.visual.clear');
        this.splitSelection = [];
        this.splitAreas = null;
        this.breaklines = [];
    }

    clear() {
        this.points = [];
        this.closed = false;
        this.redoIndex = null;
        this.splitSelection = [];
        this.splitAreas = null;
        // notify UI to exit split mode and clear any seam selection
        this.events.fire('area.measure.split.cancel');
        // clear overlay immediately
        this.events.fire('area.measure.visual.clear');
        this.publish();
    }

    private prepareRedo(index: number) {
        if (index >= 0 && index < this.points.length) {
            this.redoIndex = index;
            this.state = AreaState.WAITING_REDO;
            // immediately update visuals so the redo point flashes until replaced
            this.publish();
        }
    }

    private temporarilyDisableClicks() {
        this.clicksDisabled = true;
        this.lastButtonClickTime = Date.now();
        setTimeout(() => (this.clicksDisabled = false), 300);
    }

    // --- Split UI management ---
    private startSplit() {
        if (this.state === AreaState.INACTIVE) return;
        this.splitSelection = [];
        this.splitAreas = null;
        this.state = AreaState.ACTIVE;
        this.autoAddBreaklines = false;
        this.publish();
    }

    private cancelSplit() {
        if (this.state === AreaState.SPLIT_SELECT) {
            this.state = AreaState.ACTIVE;
        }
        this.splitSelection = [];
        this.splitAreas = null;
        this.autoAddBreaklines = false;
        this.publish();
    }

    private addBreaklineFromSelection() {
        if (this.splitSelection.length === 2) {
            const [i, j] = this.splitSelection.slice().sort((a, b) => a - b);
            if (!this.breaklines.some(r => (r.i === i && r.j === j) || (r.i === j && r.j === i))) {
                this.breaklines.push({ i, j });
            }
            this.splitSelection = [];
            this.splitAreas = null;
            this.state = AreaState.SPLIT_SELECT;
            this.publish();
            return;
        }
        // If no pair yet, pressing Add Breakline puts us into continuous add mode
        this.autoAddBreaklines = true;
        if (this.state !== AreaState.INACTIVE) this.state = AreaState.SPLIT_SELECT;
        this.publish();
    }

    private undoLastBreakline() {
        if (this.breaklines.length > 0) {
            this.breaklines.pop();
            this.publish();
        }
    }

    private clearAllBreaklines() {
        if (this.breaklines.length > 0) {
            this.breaklines = [];
            this.publish();
        }
    }

    private computeSurfacesFromBreaklines(): { indices: number[]; area: number; nonPlanarity: { rms: number; max: number } | null }[] | null {
        if (!this.closed || this.points.length < 3) return null;
        if (this.breaklines.length === 0) return null;
        // start with the full polygon indices
        const polys: number[][] = [Array.from({ length: this.points.length }, (_, i) => i)];
        const splitSeq = (seq: number[], i: number, j: number): [number[], number[]] | null => {
            const pi = seq.indexOf(i);
            const pj = seq.indexOf(j);
            if (pi === -1 || pj === -1) return null;
            if (pi <= pj) {
                const a = seq.slice(pi, pj + 1);
                const b = seq.slice(pj).concat(seq.slice(0, pi + 1));
                return [a, b];
            }
            const a = seq.slice(pj, pi + 1);
            const b = seq.slice(pi).concat(seq.slice(0, pj + 1));
            return [a, b];

        };
        for (const r of this.breaklines) {
            let replaced = false;
            for (let p = 0; p < polys.length; p++) {
                const split = splitSeq(polys[p], r.i, r.j);
                if (split) {
                    polys.splice(p, 1, split[0], split[1]);
                    replaced = true;
                    break;
                }
            }
            // if not found, breakline might be redundant (already split); continue
        }
        // compute areas and non-planarity for each poly
        const result: { indices: number[]; area: number; nonPlanarity: { rms: number; max: number } | null }[] = [];
        for (const seq of polys) {
            if (seq.length < 3) continue;
            const pts = seq.map(i => this.points[i]);
            const a = this.areaOfPolygon(pts);
            const nonPlanarity = this.computePlanarityForPoints(pts);
            result.push({ indices: seq.slice(), area: a, nonPlanarity });
        }
        return result;
    }

    private pickSplitIndex(index: number) {
        if (this.state !== AreaState.SPLIT_SELECT) return;
        if (index < 0 || index >= this.points.length) return;
        // If two picks already exist, auto-add that breakline before starting a new pair
        if (this.splitSelection.length === 2) {
            const [a, b] = this.splitSelection.slice().sort((x, y) => x - y);
            // avoid duplicates
            if (!this.breaklines.some(r => (r.i === a && r.j === b) || (r.i === b && r.j === a))) {
                this.breaklines.push({ i: a, j: b });
            }
            this.splitSelection = [];
            this.splitAreas = null;
        }
        if (!this.splitSelection.includes(index)) this.splitSelection.push(index);
        if (this.splitSelection.length === 2) {
            const [i, j] = this.splitSelection.slice().sort((a, b) => a - b);
            const res = this.computeSplitAreas(i, j);
            if (res) this.splitAreas = res;
            if (this.autoAddBreaklines) {
                if (!this.breaklines.some(r => (r.i === i && r.j === j))) {
                    this.breaklines.push({ i, j });
                }
                this.splitSelection = [];
                this.splitAreas = null;
                // remain in SPLIT_SELECT for continuous adding
            }
        }
        this.publish();
    }

    private onPointerDown(e: PointerEvent) {
        if (this.state === AreaState.INACTIVE) return;
        if (this.clicksDisabled || Date.now() - this.lastButtonClickTime < 250) return;

        const canvas = this.scene.canvas;

        // Since we listen only on the canvas (capture), any pointer down here is for a potential click
        if (e.button !== 0) return; // left button only
        if (this.clicksDisabled || Date.now() - this.lastButtonClickTime < 250) return;

        this.activePointerId = e.pointerId;
        this.moved = false;
        const rect = canvas.getBoundingClientRect();
        this.downX = e.clientX - rect.left;
        this.downY = e.clientY - rect.top;
        this.downTime = performance.now();

        // Allow camera to handle drag; we do not stop propagation here
        // Listen in bubble phase so camera/controller (on container) still receives events first
        window.addEventListener('pointermove', this.pointerMoveHandler, false);
        window.addEventListener('pointerup', this.pointerUpHandler, false);
    }

    private onPointerMove(e: PointerEvent) {
        if (this.activePointerId === null || e.pointerId !== this.activePointerId) return;
        const canvas = this.scene.canvas;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const dx = x - this.downX;
        const dy = y - this.downY;
        if (!this.moved && (dx * dx + dy * dy) > 36) { // 6px threshold
            this.moved = true;
        }
    }

    private onPointerUp(e: PointerEvent) {
        if (this.activePointerId === null || e.pointerId !== this.activePointerId) return;
        window.removeEventListener('pointermove', this.pointerMoveHandler, true);
        window.removeEventListener('pointermove', this.pointerMoveHandler, false);
        window.removeEventListener('pointerup', this.pointerUpHandler, true);
        window.removeEventListener('pointerup', this.pointerUpHandler, false);
        const canvas = this.scene.canvas;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const wasClick = !this.moved && e.button === 0 && (performance.now() - this.downTime) <= this.staticClickMaxMs;
        this.activePointerId = null;

        if (!wasClick) return; // drag - let camera control
        if (this.clicksDisabled || Date.now() - this.lastButtonClickTime < 250) return;

        const p = this.pick3DPoint(x, y);
        if (!p) return;

        if (this.state === AreaState.WAITING_REDO && this.redoIndex !== null) {
            this.points[this.redoIndex] = p;
            this.redoIndex = null;
            this.state = AreaState.ACTIVE;
        } else if (!this.closed) {
            this.points.push(p);
        }
        this.publish();
    }

    private pick3DPoint(screenX: number, screenY: number): Vec3 | null {
        // Use the measurement tool’s strategy: hijack camera.pickFocalPoint
        const camera = this.scene.camera;
        const originalSetFocalPoint = camera.setFocalPoint.bind(camera);
        const originalSetDistance = camera.setDistance.bind(camera);
        let picked: Vec3 | null = null;
        camera.setFocalPoint = (pt: Vec3) => {
            picked = pt.clone();
        };
        camera.setDistance = () => {};
        try {
            camera.pickFocalPoint(screenX, screenY);
        } catch {}
        camera.setFocalPoint = originalSetFocalPoint;
        camera.setDistance = originalSetDistance;
        return picked;
    }

    private buildEdges(): AreaEdge[] {
        const edges: AreaEdge[] = [];
        for (let i = 0; i < this.points.length - 1; i++) {
            const a = this.points[i];
            const b = this.points[i + 1];
            const len = a.clone().sub(b).length();
            if (len > EPS) edges.push({ a, b, length: len });
        }
        if (this.closed && this.points.length >= 3) {
            const a = this.points[this.points.length - 1];
            const b = this.points[0];
            const len = a.clone().sub(b).length();
            if (len > EPS) edges.push({ a, b, length: len });
        }
        return edges;
    }

    private computeArea(): number | null {
        // remove sequential duplicates to avoid 0-length edges
        const pts: Vec3[] = [];
        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            const prev = i > 0 ? this.points[i - 1] : null;
            if (!prev || ((p.x - prev.x) ** 2 + (p.y - prev.y) ** 2 + (p.z - prev.z) ** 2) > EPS * EPS) {
                pts.push(p);
            }
        }
        const n = pts.length;
        if (!this.closed || n < 3) return null;

        // Helper to triangle area in 3D without allocating vectors
        const triArea3D = (a: Vec3, b: Vec3, c: Vec3) => {
            const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
            const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
            const cx = uy * vz - uz * vy;
            const cy = uz * vx - ux * vz;
            const cz = ux * vy - uy * vx;
            return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
        };

        if (n === 3) {
            return triArea3D(pts[0], pts[1], pts[2]);
        }

        // Newell normal (used for robust 2D projection and planarity check)
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < n; i++) {
            const p = pts[i];
            const q = pts[(i + 1) % n];
            nx += (p.y - q.y) * (p.z + q.z);
            ny += (p.z - q.z) * (p.x + q.x);
            nz += (p.x - q.x) * (p.y + q.y);
        }
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

        // Project to the dominant axis plane for robust triangulation
        // Choose which axis to drop based on the largest normal component
        let dropAxis: 0 | 1 | 2 = 2; // default drop Z -> use XY
        const anx = Math.abs(nx), any = Math.abs(ny), anz = Math.abs(nz);
        if (anx >= any && anx >= anz) dropAxis = 0; // drop X -> use YZ
        else if (any >= anx && any >= anz) dropAxis = 1; // drop Y -> use XZ
        else dropAxis = 2; // drop Z -> use XY

        type V2 = { x: number; y: number };
        const to2 = (p: Vec3): V2 => {
            if (dropAxis === 0) return { x: p.y, y: p.z };
            if (dropAxis === 1) return { x: p.x, y: p.z };
            return { x: p.x, y: p.y };
        };
        const poly2: V2[] = pts.map(to2);

        // Ear clipping in 2D to triangulate the simple polygon (no holes)
        const orient = () => {
            let a = 0;
            for (let i = 0; i < poly2.length; i++) {
                const p = poly2[i];
                const q = poly2[(i + 1) % poly2.length];
                a += p.x * q.y - q.x * p.y;
            }
            return Math.sign(a); // +1 CCW, -1 CW, 0 degenerate
        };
        const orientation = orient() || 1;

        const insideTri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number) => {
            const abx = bx - ax, aby = by - ay;
            const bcx = cx - bx, bcy = cy - by;
            const cax = ax - cx, cay = ay - cy;
            const apx = px - ax, apy = py - ay;
            const bpx = px - bx, bpy = py - by;
            const cpx = px - cx, cpy = py - cy;
            const c1 = abx * apy - aby * apx;
            const c2 = bcx * bpy - bcy * bpx;
            const c3 = cax * cpy - cay * cpx;
            if (orientation > 0) return c1 >= 0 && c2 >= 0 && c3 >= 0;
            return c1 <= 0 && c2 <= 0 && c3 <= 0;
        };

        const isConvex = (a: V2, b: V2, c: V2) => {
            const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
            return orientation > 0 ? cross > 0 : cross < 0;
        };

        const indices = Array.from({ length: poly2.length }, (_, i) => i);
        const triangles: [number, number, number][] = [];
        let guard = 0;
        while (indices.length > 3 && guard++ < 10000) {
            let earFound = false;
            for (let i = 0; i < indices.length; i++) {
                const i0 = indices[(i + indices.length - 1) % indices.length];
                const i1 = indices[i];
                const i2 = indices[(i + 1) % indices.length];
                const a = poly2[i0], b = poly2[i1], c = poly2[i2];
                if (!isConvex(a, b, c)) continue;
                // Check no other point inside triangle
                let contains = false;
                for (let j = 0; j < indices.length; j++) {
                    const k = indices[j];
                    if (k === i0 || k === i1 || k === i2) continue;
                    const p = poly2[k];
                    if (insideTri(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y)) {
                        contains = true; break;
                    }
                }
                if (contains) continue;
                // Clip ear
                triangles.push([i0, i1, i2]);
                indices.splice(i, 1);
                earFound = true;
                break;
            }
            if (!earFound) break; // degenerate / self-intersection
        }
        if (indices.length === 3) triangles.push([indices[0], indices[1], indices[2]]);

        // Sum triangle areas using original 3D coordinates
        let area = 0;
        for (const [a, b, c] of triangles) {
            area += triArea3D(pts[a], pts[b], pts[c]);
        }
        return area > EPS ? area : null;
    }

    // Compute area for an arbitrary 3D polygon point list (assumes closed and simple)
    private areaOfPolygon(pts: Vec3[]): number {
        // Duplicate the triangulation logic but without reading this.points
        const n = pts.length;
        if (n < 3) return 0;
        const triArea3D = (a: Vec3, b: Vec3, c: Vec3) => {
            const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
            const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
            const cx = uy * vz - uz * vy;
            const cy = uz * vx - ux * vz;
            const cz = ux * vy - uy * vx;
            return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
        };
        if (n === 3) return triArea3D(pts[0], pts[1], pts[2]);

        // Newell normal
        let nx = 0, ny = 0, nz = 0;
        for (let i = 0; i < n; i++) {
            const p = pts[i];
            const q = pts[(i + 1) % n];
            nx += (p.y - q.y) * (p.z + q.z);
            ny += (p.z - q.z) * (p.x + q.x);
            nz += (p.x - q.x) * (p.y + q.y);
        }
        let dropAxis: 0 | 1 | 2 = 2;
        const anx = Math.abs(nx), any = Math.abs(ny), anz = Math.abs(nz);
        if (anx >= any && anx >= anz) dropAxis = 0; else if (any >= anx && any >= anz) dropAxis = 1; else dropAxis = 2;
        type V2 = { x: number; y: number };
        const to2 = (p: Vec3): V2 => (dropAxis === 0 ? { x: p.y, y: p.z } : dropAxis === 1 ? { x: p.x, y: p.z } : { x: p.x, y: p.y });
        const poly2: V2[] = pts.map(to2);
        const orient = () => {
            let a = 0; for (let i = 0; i < poly2.length; i++) {
                const p = poly2[i]; const q = poly2[(i + 1) % poly2.length]; a += p.x * q.y - q.x * p.y;
            }
            return Math.sign(a) || 1;
        };
        const orientation = orient();
        const isConvex = (a: V2, b: V2, c: V2) => {
            const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); return orientation > 0 ? cross > 0 : cross < 0;
        };
        const insideTri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number) => {
            const abx = bx - ax, aby = by - ay; const bcx = cx - bx, bcy = cy - by; const cax = ax - cx, cay = ay - cy;
            const apx = px - ax, apy = py - ay; const bpx = px - bx, bpy = py - by; const cpx = px - cx, cpy = py - cy;
            const c1 = abx * apy - aby * apx; const c2 = bcx * bpy - bcy * bpx; const c3 = cax * cpy - cay * cpx; return orientation > 0 ? (c1 >= 0 && c2 >= 0 && c3 >= 0) : (c1 <= 0 && c2 <= 0 && c3 <= 0);
        };
        const indices = Array.from({ length: poly2.length }, (_, i) => i);
        const triangles: [number, number, number][] = [];
        let guard = 0;
        while (indices.length > 3 && guard++ < 10000) {
            let earFound = false;
            for (let i = 0; i < indices.length; i++) {
                const i0 = indices[(i + indices.length - 1) % indices.length]; const i1 = indices[i]; const i2 = indices[(i + 1) % indices.length];
                const a = poly2[i0], b = poly2[i1], c = poly2[i2]; if (!isConvex(a, b, c)) continue;
                let contains = false; for (let j = 0; j < indices.length; j++) {
                    const k = indices[j]; if (k === i0 || k === i1 || k === i2) continue; const p = poly2[k]; if (insideTri(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y)) {
                        contains = true; break;
                    }
                }
                if (contains) continue; triangles.push([i0, i1, i2]); indices.splice(i, 1); earFound = true; break;
            }
            if (!earFound) break;
        }
        if (indices.length === 3) triangles.push([indices[0], indices[1], indices[2]]);
        let area = 0; for (const [a, b, c] of triangles) {
            area += triArea3D(pts[a], pts[b], pts[c]);
        }
        return area;
    }

    private computePlanarity(): { rms: number; max: number } | null {
        return this.computePlanarityForPoints(this.points);
    }

    private computePlanarityForPoints(points: Vec3[]): { rms: number; max: number } | null {
        if (points.length < 3) return null;
        // Newell normal
        let nx = 0, ny = 0, nz = 0; const n = points.length;
        for (let i = 0; i < n; i++) {
            const p = points[i]; const q = points[(i + 1) % n]; nx += (p.y - q.y) * (p.z + q.z); ny += (p.z - q.z) * (p.x + q.x); nz += (p.x - q.x) * (p.y + q.y);
        }
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz); if (len < EPS) return { rms: 0, max: 0 };
        nx /= len; ny /= len; nz /= len;
        const p0 = points[0];
        let sum2 = 0, max = 0;
        for (const p of points) {
            const dx = p.x - p0.x, dy = p.y - p0.y, dz = p.z - p0.z;
            const d = Math.abs(nx * dx + ny * dy + nz * dz);
            sum2 += d * d; if (d > max) max = d;
        }
        return { rms: Math.sqrt(sum2 / n), max };
    }

    private computeSplitAreas(i: number, j: number): { a: number; b: number; total: number } | null {
        if (i === j) return null; if (this.points.length < 3) return null;
        const aIdx = Math.min(i, j), bIdx = Math.max(i, j);
        const poly1 = this.points.slice(aIdx, bIdx + 1);
        const poly2 = this.points.slice(bIdx).concat(this.points.slice(0, aIdx + 1));
        if (poly1.length < 3 || poly2.length < 3) return null;
        const area1 = this.areaOfPolygon(poly1);
        const area2 = this.areaOfPolygon(poly2);
        return { a: area1, b: area2, total: area1 + area2 };
    }

    private closePolygon() {
        if (this.points.length >= 3) {
            this.closed = true;
            this.publish();
        }
    }

    private publish() {
        const surfaces = this.computeSurfacesFromBreaklines();
        const totalSurfaces = surfaces ? surfaces.reduce((s, f) => s + f.area, 0) : null;
        const areaValue = totalSurfaces !== null ? totalSurfaces : this.computeArea();
        const data: AreaMeasurementData = {
            points: this.points.slice(),
            edges: this.buildEdges(),
            closed: this.closed,
            area: areaValue,
            redoIndex: this.state === AreaState.WAITING_REDO ? this.redoIndex : null,
            nonPlanarity: this.closed ? this.computePlanarity() : null,
            splitSelection: this.splitSelection.length ? this.splitSelection.slice() : null,
            splitAreas: this.splitAreas,
            breaklines: this.breaklines.slice(),
            surfaces: surfaces,
            surfacesTotal: totalSurfaces
        };
        this.events.fire('area.measure.updated', data);
        this.events.fire('area.measure.visual.update', data);
    }
}

export { AreaMeasurementTool };
