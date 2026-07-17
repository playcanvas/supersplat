import { Button, Container, Label } from '@playcanvas/pcui';
import { Entity, Mat4, Quat, TranslateGizmo, Vec3, math } from 'playcanvas';

import { EntityTransformOp, MultiOp, PlacePivotOp } from '../edit-ops';
import { Events } from '../events';
import type { GridPlane } from '../infinite-grid';
import { OrientPlane } from '../orient-plane';
import { Pivot } from '../pivot';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { Transform } from '../transform';
import { i18n } from '../ui/localization';

// snap the picked plane normal to a splat-local axis within this angle so
// axis-aligned scans (e.g. z-up captures) produce exact quarter/half turns
const SNAP_ANGLE_DEG = 3;

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
        // create svg
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('tool-svg', 'hidden');
        svg.id = 'orient-tool-svg';
        parent.appendChild(svg);

        const ns = svg.namespaceURI;

        // create defs node
        const defs = document.createElementNS(ns, 'defs');

        // create the plane triangle
        const triangle = document.createElementNS(ns, 'polygon') as SVGPolygonElement;
        triangle.id = 'orient-triangle';
        defs.appendChild(triangle);

        const triangleBottom = document.createElementNS(ns, 'use') as SVGUseElement;
        triangleBottom.id = 'orient-triangle-bottom';
        triangleBottom.setAttribute('href', '#orient-triangle');

        const triangleTop = document.createElementNS(ns, 'use') as SVGUseElement;
        triangleTop.id = 'orient-triangle-top';
        triangleTop.setAttribute('href', '#orient-triangle');

        // create the point markers
        const markers = [0, 1, 2].map((i) => {
            const marker = document.createElementNS(ns, 'circle') as SVGCircleElement;
            marker.id = `orient-point-${i}`;
            return marker;
        });

        // create the edge length labels (shown when 'show dimensions' is enabled)
        const edgeLabels = [0, 1, 2].map((i) => {
            const label = document.createElementNS(ns, 'text') as SVGTextElement;
            label.id = `orient-edge-${i}`;
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'middle');
            return label;
        });

        svg.appendChild(defs);
        svg.appendChild(triangleBottom);
        svg.appendChild(triangleTop);
        markers.forEach(marker => svg.appendChild(marker));
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

        // the plane fill is rendered in the scene (occludable by gaussians) so
        // the user can see how the plane sits relative to the splat surface
        const orientPlane = new OrientPlane();
        orientPlane.supplier = (out: Vec3[]) => {
            if (!active || !splat || splat.orientPoints.length !== 3) {
                return false;
            }
            for (let i = 0; i < 3; i++) {
                getPoint(i, out[i]);
            }
            return true;
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

        const isPrimary = (e: PointerEvent) => {
            return e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary;
        };

        let clicked = false;

        const pointerdown = (e: PointerEvent) => {
            if (!clicked && isPrimary(e)) {
                clicked = true;
            }
        };

        const pointermove = (e: PointerEvent) => {
            clicked = false;
        };

        const pointerup = async (e: PointerEvent) => {
            if (splat && clicked && isPrimary(e)) {
                clicked = false;

                let closestIdx = -1;

                // check for intersection with existing point
                for (let i = 0; i < splat.orientPoints.length; i++) {
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

                if (splat.orientPoints.length < 3) {
                    const result = await scene.camera.intersect(e.offsetX / canvasContainer.dom.clientWidth, e.offsetY / canvasContainer.dom.clientHeight);
                    if (result) {
                        mat.invert(splat.worldTransform);
                        mat.transformPoint(result.position, p);
                        splat.orientSelection = splat.orientPoints.length;
                        splat.orientPoints.push(p.clone());
                        updateVisuals();
                    }
                }

                e.preventDefault();
                e.stopPropagation();
            }
        };

        events.on('postrender', () => {
            const count = (active && splat) ? splat.orientPoints.length : 0;
            const points: string[] = [];

            for (let i = 0; i < 3; i++) {
                if (i < count) {
                    getPoint(i, worldPoints[i]);
                    scene.camera.worldToScreen(worldPoints[i], screenPoints[i]);
                    screenPoints[i].x *= canvasContainer.dom.clientWidth;
                    screenPoints[i].y *= canvasContainer.dom.clientHeight;
                    markers[i].setAttribute('cx', screenPoints[i].x.toString());
                    markers[i].setAttribute('cy', screenPoints[i].y.toString());
                    markers[i].setAttribute('visibility', 'visible');
                    points.push(`${screenPoints[i].x},${screenPoints[i].y}`);
                } else {
                    markers[i].setAttribute('visibility', 'hidden');
                }
            }

            triangle.setAttribute('points', points.join(' '));

            const triangleVisibility = count > 1 ? 'visible' : 'hidden';
            triangleBottom.setAttribute('visibility', triangleVisibility);
            triangleTop.setAttribute('visibility', triangleVisibility);

            // edge length labels, following the bound dimensions overlay conventions
            const showDims = count > 1 && events.invoke('camera.boundDimensions');
            const cameraPos = scene.camera.mainCamera.getPosition();
            const cameraFwd = scene.camera.mainCamera.forward;
            const inFront = (i: number) => v.sub2(worldPoints[i], cameraPos).dot(cameraFwd) > 0;

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

                if (!showDims || !exists || !inFront(i) || !inFront(j)) {
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

            scene.add(orientPlane);

            scene.forceRender = true;
        };

        this.deactivate = () => {
            active = false;

            scene.remove(orientPlane);

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
