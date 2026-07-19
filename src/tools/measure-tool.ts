import { Button, Container, Label, NumericInput } from '@playcanvas/pcui';
import { Entity, Mat4, Quat, TranslateGizmo, Vec3 } from 'playcanvas';

import { EntityTransformOp } from '../edit-ops';
import { Events } from '../events';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { ToolOverlay, OverlayWriter } from '../tool-overlay';
import { Transform } from '../transform';
import { i18n } from '../ui/localization';

// pointer movement below this many pixels still counts as a click
const CLICK_TOLERANCE = 4;

const mat = new Mat4();
const mat1 = new Mat4();
const mat2 = new Mat4();
const mat3 = new Mat4();
const p = new Vec3();
const p0 = new Vec3();
const p1 = new Vec3();
const r = new Quat();
const s = new Vec3();

const t = new Transform();

class MeasureTransformHandler {
    activate() {}
    deactivate() {}
}

class MeasureTool {
    activate: () => void;
    deactivate: () => void;
    getFocus: () => { position: Vec3, radius: number } | null;

    constructor(events: Events, scene: Scene, canvasContainer: Container) {
        // ui
        const hintLabel = new Label({ class: 'select-toolbar-label' });
        i18n.bindText(hintLabel, 'measure.hint');

        const lengthLabel = new Label({ class: 'select-toolbar-label' });
        i18n.bindText(lengthLabel, 'measure.length');

        const lengthInput = new NumericInput({
            width: 90,
            placeholder: 'm',
            precision: 2,
            min: 0.0001,
            value: 0
        });
        let suppressUI = 0;

        const clearButton = new Button({ class: 'select-toolbar-button', enabled: false });
        i18n.bindText(clearButton, 'measure.clear');

        const selectToolbar = new Container({
            class: 'select-toolbar',
            hidden: true
        });

        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });

        selectToolbar.append(hintLabel);
        selectToolbar.append(lengthLabel);
        selectToolbar.append(lengthInput);
        selectToolbar.append(clearButton);
        canvasContainer.append(selectToolbar);

        const gizmo = new TranslateGizmo(scene.camera.camera, scene.gizmoLayer);
        const entity = new Entity('measureGizmoPivot');
        const transformHandler = new MeasureTransformHandler();

        let active = false;
        let splat: Splat;

        // get world space point
        const getPoint = (index: number, result: Vec3) => {
            splat.worldTransform.transformPoint(splat.measurePoints[index], result);
        };

        const getPoint2d = (index: number, result: Vec3) => {
            getPoint(index, result);
            scene.camera.worldToScreen(result, result);
            result.x *= canvasContainer.dom.clientWidth;
            result.y *= canvasContainer.dom.clientHeight;
        };

        // the measurement points and line render in the scene via the shared
        // tool overlay (occluded by gaussians, with a faint ghost showing through)
        const overlay = new ToolOverlay();
        overlay.provider = (writer: OverlayWriter) => {
            if (!active || !splat) {
                return;
            }
            const count = splat.measurePoints.length;
            const pts = [p0, p1];
            for (let i = 0; i < count; i++) {
                getPoint(i, pts[i]);
                writer.dot(pts[i]);
            }
            if (count === 2) {
                writer.segment(p0, p1);
            }
        };

        const updateVisuals = () => {
            gizmo.detach();

            if (splat && active && splat.measureSelection >= 0 && splat.measureSelection < splat.measurePoints.length) {
                getPoint(splat.measureSelection, p);
                t.set(p, Quat.IDENTITY, Vec3.ONE);
                events.invoke('pivot').place(t);
                entity.setLocalPosition(p);
                gizmo.attach(entity);
            }

            if (splat && splat.measurePoints.length === 2) {
                getPoint(0, p0);
                getPoint(1, p1);
                const len = p0.distance(p1);

                suppressUI++;
                lengthInput.value = len;
                lengthInput.enabled = true;
                suppressUI--;
            } else {
                lengthInput.enabled = false;
            }

            clearButton.enabled = !!splat && splat.measurePoints.length > 0;
        };

        clearButton.on('click', () => {
            if (splat) {
                splat.measurePoints.length = 0;
                splat.measureSelection = -1;
                updateVisuals();
                scene.forceRender = true;
            }
        });

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

        events.on('pivot.started', () => {

        });

        events.on('pivot.moved', () => {
            if (active && splat && splat.measureSelection >= 0 && splat.measureSelection < splat.measurePoints.length) {
                const p = events.invoke('pivot').transform.position;
                mat.invert(splat.worldTransform);
                mat.transformPoint(p, splat.measurePoints[splat.measureSelection]);
            }
            scene.forceRender = true;
        });

        events.on('pivot.ended', () => {
            if (active && splat && splat.measureSelection >= 0 && splat.measureSelection < splat.measurePoints.length) {
                updateVisuals();
            }
        });

        const origTransform = new Mat4();
        const origP = new Vec3();
        const origR = new Quat();
        const origS = new Vec3();
        const mid = new Vec3();
        let startLen = 0;

        const startScale = () => {
            if (!splat || splat.measurePoints.length !== 2) {
                return;
            }

            origTransform.copy(splat.worldTransform);
            origP.copy(splat.entity.getLocalPosition());
            origR.copy(splat.entity.getLocalRotation());
            origS.copy(splat.entity.getLocalScale());

            getPoint(0, p0);
            getPoint(1, p1);
            mid.sub2(p1, p0);
            startLen = mid.length();
            mid.mulScalar(0.5).add(p0);
        };

        // position and scale the splat according to the new length
        const applyLength = (newLength: number) => {
            if (!splat || splat.measurePoints.length !== 2 || newLength <= 0) {
                return;
            }

            const scale = newLength / startLen;

            // calculate mid point
            p.copy(mid);

            // construct a transform matrix that scales from p by len * 0.5
            mat1.setTranslate(-p.x, -p.y, -p.z);
            mat2.setScale(scale, scale, scale);
            mat3.setTranslate(p.x, p.y, p.z);

            mat.mul2(mat1, origTransform);
            mat.mul2(mat2, mat);
            mat.mul2(mat3, mat);

            mat.getTranslation(p);
            r.setFromMat4(mat);
            mat.getScale(s);

            splat.entity.setLocalPosition(p);
            splat.entity.setLocalRotation(r);
            splat.entity.setLocalScale(s);

            scene.forceRender = true;
        };

        const endScale = () => {
            const top = new EntityTransformOp({
                splat: splat,
                oldt: new Transform(origP, origR, origS),
                newt: new Transform(splat.entity.getLocalPosition(), splat.entity.getLocalRotation(), splat.entity.getLocalScale())
            });

            events.fire('edit.add', top);
            updateVisuals();
        };

        let dragging = false;

        // handle length input updates
        lengthInput.on('slider:mousedown', () => {
            startScale();
            dragging = true;
        });
        lengthInput.on('change', (value) => {
            if (dragging) {
                applyLength(value);
            } else if (!suppressUI) {
                startScale();
                applyLength(value);
                endScale();
            }
        });
        lengthInput.on('slider:mouseup', () => {
            endScale();
            dragging = false;
        });

        events.on('select.delete', () => {
            if (active && splat && splat.measureSelection >= 0 && splat.measureSelection < splat.measurePoints.length) {
                splat.measurePoints.splice(splat.measureSelection, 1);
                splat.measureSelection--;
                updateVisuals();
            }
        });

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

        const pointerup = async (e: PointerEvent) => {
            if (splat && clicked && isPrimary(e)) {
                clicked = false;

                let closestIdx = -1;

                // check for intersection with existing point
                const cameraPos = scene.camera.mainCamera.getPosition();
                const cameraFwd = scene.camera.mainCamera.forward;
                for (let i = 0; i < splat.measurePoints.length; i++) {
                    // ignore points behind the camera (their projection is mirrored)
                    getPoint(i, p);
                    if (p.sub(cameraPos).dot(cameraFwd) <= 0) {
                        continue;
                    }

                    getPoint2d(i, p);

                    if (Math.abs(p.x - clickX) < 8 && Math.abs(p.y - clickY) < 8) {
                        closestIdx = i;
                        break;
                    }
                }

                if (closestIdx >= 0) {
                    splat.measureSelection = closestIdx;
                    updateVisuals();
                    return;
                }

                // place at the pointer-down position: that is where the user aimed
                if (splat.measurePoints.length < 2) {
                    const result = await scene.camera.intersect(clickX / canvasContainer.dom.clientWidth, clickY / canvasContainer.dom.clientHeight);
                    if (result) {
                        mat.invert(splat.worldTransform);
                        mat.transformPoint(result.position, p);
                        splat.measureSelection = splat.measurePoints.length;
                        splat.measurePoints.push(p.clone());
                        updateVisuals();
                    }
                }

                e.preventDefault();
                e.stopPropagation();
            }
        };

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
            const count = splat ? splat.measurePoints.length : 0;
            if (count === 0) {
                return null;
            }

            const position = new Vec3();
            for (let i = 0; i < count; i++) {
                getPoint(i, p);
                position.add(p);
            }
            position.mulScalar(1 / count);

            let radius = 0;
            for (let i = 0; i < count; i++) {
                getPoint(i, p);
                radius = Math.max(radius, p.distance(position));
            }

            // frame with some margin; a lone point falls back to a radius
            // relative to the splat's world size
            splat.worldTransform.getScale(p);
            radius = Math.max(radius * 1.5, splat.localBound.halfExtents.length() * p.x * 0.05);

            return { position, radius };
        };

        this.activate = () => {
            active = true;
            updateVisuals();
            canvasContainer.dom.addEventListener('pointerdown', pointerdown);
            canvasContainer.dom.addEventListener('pointermove', pointermove);
            canvasContainer.dom.addEventListener('pointerup', pointerup, true);
            selectToolbar.hidden = false;

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

            events.fire('transformHandler.pop');

            scene.forceRender = true;
        };
    }
}

export { MeasureTool };
