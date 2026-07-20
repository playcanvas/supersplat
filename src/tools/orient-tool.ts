import { Button, Container, Label } from '@playcanvas/pcui';
import { Entity, Mat4, Quat, TranslateGizmo, Vec3, math } from 'playcanvas';

import { EntityTransformOp, MultiOp, PlacePivotOp } from '../edit-ops';
import { Events } from '../events';
import type { GridPlane } from '../infinite-grid';
import { Pivot } from '../pivot';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { pickSplatSurfacePoint } from '../splat-pick';
import { ToolOverlay, OverlayWriter } from '../tool-overlay';
import { Transform } from '../transform';
import { DimensionLabels } from '../ui/dimension-labels';
import { i18n } from '../ui/localization';

// snap the picked plane normal to a splat-local axis within this angle so
// axis-aligned scans (e.g. z-up captures) produce exact quarter/half turns
const SNAP_ANGLE_DEG = 3;

// pointer movement below this many pixels still counts as a click
const CLICK_TOLERANCE = 4;

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

const t = new Transform();

const cent = new Vec3();

class OrientTransformHandler {
    activate() {}
    deactivate() {}
}

class OrientTool {
    activate: () => void;
    deactivate: () => void;
    getFocus: () => { position: Vec3, radius: number } | null;

    constructor(events: Events, scene: Scene, parent: HTMLElement, canvasContainer: Container) {
        // the edge length labels (shown when 'show dimensions' is enabled);
        // the points, edges and plane fill render in the scene via the shared
        // tool overlay
        const dimLabels = new DimensionLabels(scene, canvasContainer.dom, parent, 'orient-tool-svg', 3);

        // ui
        const hintLabel = new Label({ class: 'select-toolbar-label' });
        i18n.bindText(hintLabel, 'orient.hint');

        const alignButton = new Button({ class: 'select-toolbar-button', enabled: false });
        i18n.bindText(alignButton, 'orient.align');

        const clearButton = new Button({ class: 'select-toolbar-button', enabled: false });
        i18n.bindText(clearButton, 'orient.clear');

        const selectToolbar = new Container({
            class: ['select-toolbar', 'select-toolbar-tool'],
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
        const transformHandler = new OrientTransformHandler();

        // the gizmo pivot must live in the scene graph: in local coord space
        // the gizmo divides its translate delta by the parent's world scale,
        // and a parentless entity leaves that divisor stale (1/0 = Infinity)
        const entity = new Entity('orientGizmoPivot');
        scene.app.root.addChild(entity);

        gizmo.coordSpace = events.invoke('tool.coordSpace');
        events.on('tool.coordSpace', (coordSpace: 'local' | 'world') => {
            gizmo.coordSpace = coordSpace;
            scene.forceRender = true;
        });

        let active = false;
        let splat: Splat;
        let gridForced = false;
        let gridSelfToggle = false;

        // if grid visibility changes for any reason other than the tool's own
        // forcing (e.g. the user pressing 'g'), the grid is the user's again:
        // leave it alone on deactivate
        events.on('grid.visible', () => {
            if (!gridSelfToggle) {
                gridForced = false;
            }
        });

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

        // calculate the rotation aligning +y with the plane normal (on the
        // camera-facing side, matching the align convention) and +x with the
        // first edge. requires a valid calcPlane result in p0/p1, n and c.
        const calcPlaneRotation = (result: Quat) => {
            if (n.dot(v.sub2(scene.camera.position, c)) < 0) {
                n.mulScalar(-1);
            }
            e0.normalize();
            e1.cross(e0, n);
            mat.set([e0.x, e0.y, e0.z, 0, n.x, n.y, n.z, 0, e1.x, e1.y, e1.z, 0, 0, 0, 0, 1]);
            result.setFromMat4(mat);
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

                // in local space the gizmo aligns to the picked plane (y perpendicular)
                if (splat.orientPoints.length === 3 && calcPlane()) {
                    calcPlaneRotation(q);
                    entity.setLocalRotation(q);
                } else {
                    entity.setLocalRotation(Quat.IDENTITY);
                }

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
            if (active) {
                // deactivate before switching so the session cleanup applies to
                // the splat the points belong to (we always deactivate so the
                // current transform handler remains in place)
                events.fire('tool.deactivate');
            }
            splat = selection;
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
            q.setFromDirections(n, a);

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

        // place a point at the visible surface under the click (see splat-pick.ts)
        const placePoint = (offsetX: number, offsetY: number) => {
            if (!pickSplatSurfacePoint(scene, splat, offsetX, offsetY, v)) {
                return false;
            }
            splat.orientSelection = splat.orientPoints.length;
            splat.orientPoints.push(v.clone());
            return true;
        };

        const isPrimary = (e: PointerEvent) => {
            return e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary;
        };

        let clicked = false;
        let clickX = 0;
        let clickY = 0;

        const pointerdown = (e: PointerEvent) => {
            if (!clicked && isPrimary(e)) {
                clicked = true;
                clickX = e.offsetX;
                clickY = e.offsetY;
            }
        };

        const pointermove = (e: PointerEvent) => {
            // forgive small jitter between down and up; only a real drag cancels the click
            if (clicked && Math.hypot(e.offsetX - clickX, e.offsetY - clickY) > CLICK_TOLERANCE) {
                clicked = false;
            }
        };

        const pointerup = (e: PointerEvent) => {
            if (splat && clicked && isPrimary(e)) {
                clicked = false;

                let closestIdx = -1;

                // check for intersection with existing point
                const cameraPos = scene.camera.mainCamera.getPosition();
                const cameraFwd = scene.camera.mainCamera.forward;
                for (let i = 0; i < splat.orientPoints.length; i++) {
                    // ignore points behind the camera (their projection is mirrored)
                    getPoint(i, v);
                    if (v.sub(cameraPos).dot(cameraFwd) <= 0) {
                        continue;
                    }

                    getPoint2d(i, p);

                    if (Math.abs(p.x - clickX) < 8 && Math.abs(p.y - clickY) < 8) {
                        closestIdx = i;
                        break;
                    }
                }

                if (closestIdx >= 0) {
                    splat.orientSelection = closestIdx;
                    updateVisuals();
                    return;
                }

                // place at the pointer-down position: that is where the user aimed
                if (splat.orientPoints.length < 3 && placePoint(clickX, clickY)) {
                    updateVisuals();
                    scene.forceRender = true;
                }

                e.preventDefault();
                e.stopPropagation();
            }
        };

        events.on('postrender', () => {
            // the svg is hidden while the tool is inactive, so skip the work
            if (!active || !splat) {
                return;
            }

            const count = splat.orientPoints.length;
            const showDims = count > 1 && events.invoke('camera.boundDimensions');

            // the labels sit outside the triangle: offset away from the
            // centroid of the placed points
            if (showDims) {
                cent.set(0, 0, 0);
                for (let i = 0; i < count; i++) {
                    getPoint(i, p);
                    cent.add(p);
                }
                cent.mulScalar(1 / count);
            }

            for (let i = 0; i < 3; i++) {
                const exists = count === 3 || (count === 2 && i === 0);
                if (!showDims || !exists) {
                    dimLabels.hideLabel(i);
                    continue;
                }
                getPoint(i, p0);
                getPoint((i + 1) % 3, p1);
                dimLabels.setLabel(i, p0, p1, cent);
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

        // frame the placed points instead of the selection ('f' shortcut)
        this.getFocus = () => {
            const count = splat ? splat.orientPoints.length : 0;
            if (count === 0) {
                return null;
            }

            const position = new Vec3();
            for (let i = 0; i < count; i++) {
                getPoint(i, v);
                position.add(v);
            }
            position.mulScalar(1 / count);

            let radius = 0;
            for (let i = 0; i < count; i++) {
                getPoint(i, v);
                radius = Math.max(radius, v.distance(position));
            }

            // frame with some margin; a lone point falls back to a radius
            // relative to the splat's world size
            splat.worldTransform.getScale(v);
            radius = Math.max(radius * 1.5, splat.localBound.halfExtents.length() * v.x * 0.05);

            return { position, radius };
        };

        this.activate = () => {
            active = true;
            updateVisuals();
            canvasContainer.dom.addEventListener('pointerdown', pointerdown);
            canvasContainer.dom.addEventListener('pointermove', pointermove);
            canvasContainer.dom.addEventListener('pointerup', pointerup, true);
            selectToolbar.hidden = false;
            parent.style.display = 'block';
            parent.classList.add('noevents');
            dimLabels.show();

            // ensure the grid is visible while the tool is active. suspend
            // preference capture: the forced grid is tool state, not a user
            // setting change
            gridForced = !events.invoke('grid.visible');
            if (gridForced) {
                gridSelfToggle = true;
                events.fire('preferences.suspend');
                events.fire('grid.setVisible', true);
                events.fire('preferences.resume');
                gridSelfToggle = false;
            }

            events.fire('transformHandler.push', transformHandler);

            scene.add(overlay);

            scene.forceRender = true;
        };

        this.deactivate = () => {
            active = false;

            scene.remove(overlay);

            updateVisuals();
            canvasContainer.dom.removeEventListener('pointerdown', pointerdown);
            canvasContainer.dom.removeEventListener('pointermove', pointermove);
            canvasContainer.dom.removeEventListener('pointerup', pointerup, true);
            selectToolbar.hidden = true;
            parent.style.display = 'none';
            parent.classList.remove('noevents');
            dimLabels.hide();

            if (gridForced) {
                gridSelfToggle = true;
                events.fire('preferences.suspend');
                events.fire('grid.setVisible', false);
                events.fire('preferences.resume');
                gridSelfToggle = false;
                gridForced = false;
            }

            events.fire('transformHandler.pop');

            scene.forceRender = true;
        };
    }
}

export { OrientTool };
