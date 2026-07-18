import { Button, Container, Label } from '@playcanvas/pcui';
import { Entity, Mat4, Quat, Ray, TranslateGizmo, Vec3, Vec4, math } from 'playcanvas';

import { EntityTransformOp, MultiOp, PlacePivotOp } from '../edit-ops';
import { Events } from '../events';
import type { GridPlane } from '../infinite-grid';
import { Pivot } from '../pivot';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { State } from '../splat-state';
import { ToolOverlay, OverlayWriter } from '../tool-overlay';
import { Transform } from '../transform';
import { i18n } from '../ui/localization';

// snap the picked plane normal to a splat-local axis within this angle so
// axis-aligned scans (e.g. z-up captures) produce exact quarter/half turns
const SNAP_ANGLE_DEG = 3;

// clicked points gather the gaussians whose centers project within this many
// pixels of the cursor (falling back to the larger radius on sparse surfaces)
const PICK_RADIUS = 8;
const PICK_RADIUS_FAR = 24;

const mat = new Mat4();
const p = new Vec3();
const p0 = new Vec3();
const p1 = new Vec3();
const p2 = new Vec3();
const e0 = new Vec3();
const e1 = new Vec3();
const n = new Vec3();
const c = new Vec3();
const v = new Vec3();
const axis = new Vec3();
const snapped = new Vec3();
const newPos = new Vec3();
const q = new Quat();
const newRot = new Quat();
const ray = new Ray();
const vec4 = new Vec4();

const t = new Transform();

const worldPoints = [new Vec3(), new Vec3(), new Vec3()];
const screenPoints = [new Vec3(), new Vec3(), new Vec3()];

class OrientTransformHandler {
    activate() {}
    deactivate() {}
}

class OrientTool {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, scene: Scene, parent: HTMLElement, canvasContainer: Container) {
        // svg overlay holding the edge length labels; the points, edges and
        // plane fill render in the scene via the shared tool overlay
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('tool-svg', 'hidden');
        svg.id = 'orient-tool-svg';
        parent.appendChild(svg);

        const ns = svg.namespaceURI;

        // create the edge length labels (shown when 'show dimensions' is enabled)
        const edgeLabels = [0, 1, 2].map((i) => {
            const label = document.createElementNS(ns, 'text') as SVGTextElement;
            label.id = `orient-edge-${i}`;
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'middle');
            return label;
        });

        edgeLabels.forEach(label => svg.appendChild(label));

        // ui
        const hintLabel = new Label({ class: 'select-toolbar-label' });
        i18n.bindText(hintLabel, 'orient.hint');

        const alignButton = new Button({ class: 'select-toolbar-button', enabled: false });
        i18n.bindText(alignButton, 'orient.align');

        const clearButton = new Button({ class: 'select-toolbar-button', enabled: false });
        i18n.bindText(clearButton, 'orient.clear');

        const selectToolbar = new Container({
            class: 'select-toolbar',
            hidden: true
        });

        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });

        selectToolbar.append(hintLabel);
        selectToolbar.append(alignButton);
        selectToolbar.append(clearButton);
        canvasContainer.append(selectToolbar);

        const gizmo = new TranslateGizmo(scene.camera.camera, scene.gizmoLayer);
        const entity = new Entity('orientGizmoPivot');
        const transformHandler = new OrientTransformHandler();

        let active = false;
        let splat: Splat;
        let gridForced = false;

        // get world space point
        const getPoint = (index: number, result: Vec3) => {
            splat.worldTransform.transformPoint(splat.orientPoints[index], result);
        };

        const getPoint2d = (index: number, result: Vec3) => {
            getPoint(index, result);
            scene.camera.worldToScreen(result, result);
            result.x *= canvasContainer.dom.clientWidth;
            result.y *= canvasContainer.dom.clientHeight;
        };

        // the points, edges and plane fill render in the scene (occluded by
        // gaussians, with a faint ghost showing through) so the user can see
        // how the plane sits relative to the splat surface
        const overlay = new ToolOverlay();
        overlay.provider = (writer: OverlayWriter) => {
            if (!active || !splat) {
                return;
            }
            const count = splat.orientPoints.length;
            const pts = [p0, p1, p2];
            for (let i = 0; i < count; i++) {
                getPoint(i, pts[i]);
                writer.dot(pts[i]);
            }
            if (count > 1) {
                writer.segment(p0, p1);
            }
            if (count === 3) {
                writer.segment(p1, p2);
                writer.segment(p2, p0);
                writer.fill(p0, p1, p2);
            }
        };

        // calculate the world space plane normal and centroid from the three
        // points. returns false if the points are degenerate (collinear).
        const calcPlane = () => {
            getPoint(0, p0);
            getPoint(1, p1);
            getPoint(2, p2);

            e0.sub2(p1, p0);
            e1.sub2(p2, p0);
            n.cross(e0, e1);

            if (n.length() < 1e-6 * e0.length() * e1.length()) {
                return false;
            }

            n.normalize();
            c.add2(p0, p1).add(p2).mulScalar(1 / 3);

            return true;
        };

        const updateButtons = () => {
            alignButton.enabled = !!splat && splat.orientPoints.length === 3 && calcPlane();
            clearButton.enabled = !!splat && splat.orientPoints.length > 0;
        };

        const updateVisuals = () => {
            gizmo.detach();

            if (splat && active && splat.orientSelection >= 0 && splat.orientSelection < splat.orientPoints.length) {
                getPoint(splat.orientSelection, p);
                t.set(p, Quat.IDENTITY, Vec3.ONE);
                events.invoke('pivot').place(t);
                entity.setLocalPosition(p);
                gizmo.attach(entity);
            }

            updateButtons();
        };

        gizmo.on('render:update', () => {
            scene.forceRender = true;
        });

        gizmo.on('transform:start', () => {
            events.invoke('pivot').start();
        });

        gizmo.on('transform:move', () => {
            events.invoke('pivot').moveTRS(entity.getLocalPosition(), entity.getLocalRotation(), entity.getLocalScale());
        });

        gizmo.on('transform:end', () => {
            events.invoke('pivot').end();
        });

        events.on('selection.changed', (selection: Splat) => {
            splat = selection;
            if (active) {
                // for now we always deactivate the tool so the current transform handler remains in place
                events.fire('tool.deactivate');
            }
        });

        events.on('pivot.moved', () => {
            if (active && splat && splat.orientSelection >= 0 && splat.orientSelection < splat.orientPoints.length) {
                const p = events.invoke('pivot').transform.position;
                mat.invert(splat.worldTransform);
                mat.transformPoint(p, splat.orientPoints[splat.orientSelection]);
            }
            scene.forceRender = true;
        });

        events.on('pivot.ended', () => {
            if (active && splat && splat.orientSelection >= 0 && splat.orientSelection < splat.orientPoints.length) {
                updateVisuals();
            }
        });

        events.on('select.delete', () => {
            if (active && splat && splat.orientSelection >= 0 && splat.orientSelection < splat.orientPoints.length) {
                splat.orientPoints.splice(splat.orientSelection, 1);
                splat.orientSelection--;
                updateVisuals();
            }
        });

        // rotate and translate the splat so the picked plane lands on the grid plane
        const alignToGrid = () => {
            if (!splat || splat.orientPoints.length !== 3 || !calcPlane()) {
                return;
            }

            // the side of the plane facing the camera becomes the grid's positive side
            if (n.dot(v.sub2(scene.camera.position, c)) < 0) {
                n.mulScalar(-1);
            }

            // snap the normal to the nearest splat-local axis if within SNAP_ANGLE_DEG
            const { worldTransform } = splat;
            let bestDot = Math.cos(SNAP_ANGLE_DEG * math.DEG_TO_RAD);
            let snap = false;
            for (let i = 0; i < 3; i++) {
                switch (i) {
                    case 0: worldTransform.getX(axis); break;
                    case 1: worldTransform.getY(axis); break;
                    case 2: worldTransform.getZ(axis); break;
                }
                axis.normalize();
                const d = n.dot(axis);
                if (Math.abs(d) > bestDot) {
                    bestDot = Math.abs(d);
                    snapped.copy(axis).mulScalar(Math.sign(d));
                    snap = true;
                }
            }
            if (snap) {
                n.copy(snapped);
            }

            // the grid plane's positive axis
            const gridPlane: GridPlane = events.invoke('grid.plane');
            const a = gridPlane === 'xy' ? Vec3.BACK : (gridPlane === 'yz' ? Vec3.RIGHT : Vec3.UP);

            // shortest arc rotation from the plane normal to the grid axis
            const d = n.dot(a);
            if (d >= 1 - 1e-9) {
                q.set(0, 0, 0, 1);
            } else if (d <= -1 + 1e-9) {
                // 180 degrees: rotate about any axis perpendicular to a
                axis.cross(a, Math.abs(a.y) < 0.9 ? Vec3.UP : Vec3.RIGHT).normalize();
                q.setFromAxisAngle(axis, 180);
            } else {
                axis.cross(n, a).normalize();
                q.setFromAxisAngle(axis, Math.acos(math.clamp(d, -1, 1)) * math.RAD_TO_DEG);
            }

            const oldt = new Transform(
                splat.entity.getLocalPosition(),
                splat.entity.getLocalRotation(),
                splat.entity.getLocalScale()
            );

            // rotate the entity about the plane centroid so the picked points
            // don't move laterally, then settle the plane onto the grid
            newPos.sub2(oldt.position, c);
            q.transformVector(newPos, newPos);
            newPos.add(c);
            newPos.sub(v.copy(a).mulScalar(c.dot(a)));

            newRot.mul2(q, oldt.rotation);

            const newt = new Transform(newPos, newRot, oldt.scale);

            if (oldt.equalsApprox(newt)) {
                return;
            }

            const top = new EntityTransformOp({ splat, oldt, newt });

            // place the pivot to match the new transform
            const pivot = events.invoke('pivot') as Pivot;
            if (events.invoke('pivot.origin') === 'boundCenter') {
                mat.setTRS(newt.position, newt.rotation, newt.scale);
                mat.transformPoint(splat.localBound.center, v);
                t.set(v, newt.rotation, newt.scale);
            } else {
                t.copy(newt);
            }
            const pop = new PlacePivotOp({ pivot, oldt: pivot.transform.clone(), newt: t.clone() });

            events.fire('edit.add', new MultiOp([top, pop]));

            // deselect the active point so the gizmo doesn't linger at the old position
            splat.orientSelection = -1;
            updateVisuals();

            scene.forceRender = true;
        };

        alignButton.on('click', alignToGrid);

        clearButton.on('click', () => {
            if (splat) {
                splat.orientPoints.length = 0;
                splat.orientSelection = -1;
                updateVisuals();
                scene.forceRender = true;
            }
        });

        // place a point on the click ray at the opacity-weighted median depth of
        // the gaussians whose centers project near the click. a single pick is
        // unreliable on real captures: the frontmost gaussian is often a large,
        // nearly transparent floater (placing the point in mid-air), while the
        // depth pick's transmittance-weighted mean lands behind the surface.
        // the weighted median keeps the point on the dominant opaque surface.
        const placePoint = (offsetX: number, offsetY: number) => {
            const { splatData } = splat;
            const state = splatData.getProp('state') as Uint8Array;
            const opacity = splatData.getProp('opacity') as Float32Array;
            const { centers } = splat.entity.gsplat.instance.sorter;
            const { numSplats } = splatData;

            const cw = canvasContainer.dom.clientWidth;
            const ch = canvasContainer.dom.clientHeight;

            mat.mul2(scene.camera.camera.projectionMatrix, scene.camera.camera.viewMatrix);
            mat.mul(splat.worldTransform);
            scene.camera.getRay(offsetX, offsetY, ray);

            const near: { t: number, w: number }[] = [];
            const far: { t: number, w: number }[] = [];

            for (let i = 0; i < numSplats; i++) {
                if (state[i] & State.deleted) {
                    continue;
                }

                const x = centers[i * 3 + 0];
                const y = centers[i * 3 + 1];
                const z = centers[i * 3 + 2];

                vec4.set(x, y, z, 1);
                mat.transformVec4(vec4, vec4);
                if (vec4.w <= 0) {
                    continue;
                }

                const dx = Math.abs((vec4.x / vec4.w * 0.5 + 0.5) * cw - offsetX);
                const dy = Math.abs((-vec4.y / vec4.w * 0.5 + 0.5) * ch - offsetY);
                if (dx >= PICK_RADIUS_FAR || dy >= PICK_RADIUS_FAR) {
                    continue;
                }

                // depth along the click ray. the inverted test also rejects NaN
                // (e.g. a degenerate zero-sized viewport makes getRay produce NaN),
                // which would otherwise flow through every comparison unchecked
                v.set(x, y, z);
                splat.worldTransform.transformPoint(v, v);
                const dist = v.sub(ray.origin).dot(ray.direction);
                if (!(dist > 0)) {
                    continue;
                }

                const entry = { t: dist, w: opacity ? 1 / (1 + Math.exp(-opacity[i])) : 1 };
                far.push(entry);
                if (dx < PICK_RADIUS && dy < PICK_RADIUS) {
                    near.push(entry);
                }
            }

            const candidates = near.length > 0 ? near : far;
            if (candidates.length === 0) {
                return false;
            }

            // composite the candidates front to back like the renderer would:
            // each contributes its opacity scaled by the remaining transmittance,
            // so an opaque surface in front wins even when denser geometry sits
            // behind it (a raw census would vote for the occluded geometry)
            candidates.sort((a, b) => a.t - b.t);
            let transmittance = 1;
            let total = 0;
            for (const cand of candidates) {
                const alpha = cand.w;
                cand.w = alpha * transmittance;
                total += cand.w;
                transmittance *= 1 - Math.min(0.99, alpha);
                if (transmittance < 0.05) {
                    break;
                }
            }

            // the point lands at the median visible depth
            let accum = 0;
            let median = candidates[candidates.length - 1].t;
            for (const cand of candidates) {
                accum += cand.w;
                if (accum >= total * 0.5) {
                    median = cand.t;
                    break;
                }
            }

            p.copy(ray.direction).mulScalar(median).add(ray.origin);
            mat.invert(splat.worldTransform);
            mat.transformPoint(p, v);
            splat.orientSelection = splat.orientPoints.length;
            splat.orientPoints.push(v.clone());

            return true;
        };

        const isPrimary = (e: PointerEvent) => {
            return e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary;
        };

        let clicked = false;

        // whether each placed point is in front of the camera (updated each
        // render): worldToScreen mirrors positions behind the camera, so the
        // svg overlay must cull them
        const pointInFront = [false, false, false];

        const pointerdown = (e: PointerEvent) => {
            if (!clicked && isPrimary(e)) {
                clicked = true;
            }
        };

        const pointermove = (e: PointerEvent) => {
            clicked = false;
        };

        const pointerup = (e: PointerEvent) => {
            if (splat && clicked && isPrimary(e)) {
                clicked = false;

                let closestIdx = -1;

                // check for intersection with existing point
                for (let i = 0; i < splat.orientPoints.length; i++) {
                    if (!pointInFront[i]) {
                        continue;
                    }

                    getPoint2d(i, p);

                    if (Math.abs(p.x - e.offsetX) < 8 && Math.abs(p.y - e.offsetY) < 8) {
                        closestIdx = i;
                        break;
                    }
                }

                if (closestIdx >= 0) {
                    splat.orientSelection = closestIdx;
                    updateVisuals();
                    return;
                }

                if (splat.orientPoints.length < 3 && placePoint(e.offsetX, e.offsetY)) {
                    updateVisuals();
                    scene.forceRender = true;
                }

                e.preventDefault();
                e.stopPropagation();
            }
        };

        events.on('postrender', () => {
            const count = (active && splat) ? splat.orientPoints.length : 0;
            const cameraPos = scene.camera.mainCamera.getPosition();
            const cameraFwd = scene.camera.mainCamera.forward;

            for (let i = 0; i < 3; i++) {
                if (i < count) {
                    getPoint(i, worldPoints[i]);
                    pointInFront[i] = v.sub2(worldPoints[i], cameraPos).dot(cameraFwd) > 0;
                    scene.camera.worldToScreen(worldPoints[i], screenPoints[i]);
                    screenPoints[i].x *= canvasContainer.dom.clientWidth;
                    screenPoints[i].y *= canvasContainer.dom.clientHeight;
                } else {
                    pointInFront[i] = false;
                }
            }

            // edge length labels, following the bound dimensions overlay conventions
            const showDims = count > 1 && events.invoke('camera.boundDimensions');

            // screen centroid of the placed points, used to offset labels outwards
            let scx = 0, scy = 0;
            for (let i = 0; i < count; i++) {
                scx += screenPoints[i].x / count;
                scy += screenPoints[i].y / count;
            }

            for (let i = 0; i < 3; i++) {
                const j = (i + 1) % 3;
                const label = edgeLabels[i];
                const exists = count === 3 || (count === 2 && i === 0);

                if (!showDims || !exists || !pointInFront[i] || !pointInFront[j]) {
                    label.setAttribute('visibility', 'hidden');
                    continue;
                }
                label.setAttribute('visibility', 'visible');

                const length = worldPoints[i].distance(worldPoints[j]);

                const x0 = screenPoints[i].x;
                const y0 = screenPoints[i].y;
                const x1 = screenPoints[j].x;
                const y1 = screenPoints[j].y;

                const mx = (x0 + x1) * 0.5;
                const my = (y0 + y1) * 0.5;

                let theta = Math.atan2(y1 - y0, x1 - x0);
                // flip 180° to keep text upright
                if (Math.cos(theta) < 0) {
                    theta += Math.PI;
                }

                // perpendicular offset so the label sits outside the triangle
                const perpX = -Math.sin(theta);
                const perpY = Math.cos(theta);
                const dot = perpX * (scx - mx) + perpY * (scy - my);
                const sign = dot > 0 ? -1 : 1;
                const offsetPx = 10;

                const thetaDeg = theta * 180 / Math.PI;
                label.setAttribute('transform', `translate(${(mx + perpX * offsetPx * sign).toFixed(1)}, ${(my + perpY * offsetPx * sign).toFixed(1)}) rotate(${thetaDeg.toFixed(1)})`);
                label.textContent = length.toFixed(2);
            }
        });

        // re-render so labels react to the setting while the tool is active
        events.on('camera.boundDimensions', () => {
            if (active) {
                scene.forceRender = true;
            }
        });

        const updateGizmoSize = () => {
            const { camera, canvas } = scene;
            if (camera.ortho) {
                gizmo.size = 1125 / canvas.clientHeight;
            } else {
                gizmo.size = 1200 / Math.max(canvas.clientWidth, canvas.clientHeight);
            }
        };
        updateGizmoSize();
        events.on('camera.resize', updateGizmoSize);
        events.on('camera.ortho', updateGizmoSize);

        this.activate = () => {
            active = true;
            updateVisuals();
            canvasContainer.dom.addEventListener('pointerdown', pointerdown);
            canvasContainer.dom.addEventListener('pointermove', pointermove);
            canvasContainer.dom.addEventListener('pointerup', pointerup, true);
            selectToolbar.hidden = false;
            parent.style.display = 'block';
            parent.classList.add('noevents');
            svg.classList.remove('hidden');

            // ensure the grid is visible while the tool is active
            gridForced = !events.invoke('grid.visible');
            if (gridForced) {
                events.fire('grid.setVisible', true);
            }

            events.fire('transformHandler.push', transformHandler);

            scene.add(overlay);

            scene.forceRender = true;
        };

        this.deactivate = () => {
            active = false;

            scene.remove(overlay);

            // the points are consumed by the alignment, so start the next session fresh
            if (splat) {
                splat.orientPoints.length = 0;
                splat.orientSelection = -1;
            }

            updateVisuals();
            canvasContainer.dom.removeEventListener('pointerdown', pointerdown);
            canvasContainer.dom.removeEventListener('pointermove', pointermove);
            canvasContainer.dom.removeEventListener('pointerup', pointerup, true);
            selectToolbar.hidden = true;
            parent.style.display = 'none';
            parent.classList.remove('noevents');
            svg.classList.add('hidden');

            if (gridForced) {
                events.fire('grid.setVisible', false);
                gridForced = false;
            }

            events.fire('transformHandler.pop');

            scene.forceRender = true;
        };
    }
}

export { OrientTool };
