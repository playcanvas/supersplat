import { Button, Container, Label } from '@playcanvas/pcui';
import { Mat4, Quat, Vec3 } from 'playcanvas';

import { alignVertical } from './vertical-alignment';
import { EntityTransformOp, MultiOp, PlacePivotOp } from '../edit-ops';
import { Events } from '../events';
import { Pivot } from '../pivot';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { ToolOverlay } from '../tool-overlay';
import { Transform } from '../transform';
import { i18n } from '../ui/localization';

const CLICK_TOLERANCE = 4;

class VerticalTool {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, scene: Scene, canvasContainer: Container, annotationParent: HTMLElement) {
        const viewport = canvasContainer.dom;
        let active = false;
        let splat: Splat;
        let revision = 0;
        let queued = 0;
        let submitting = false;
        let pending: MultiOp | null = null;
        let points: Vec3[] = [];
        let baseline: Transform | null = null;
        let pivot: Vec3;
        let flipped = false;
        let hint = 'vertical.hint';

        const hintLabel = new Label({ class: 'select-toolbar-label' });
        i18n.bindText(hintLabel, () => i18n.t(hint));
        const flipButton = new Button({ class: 'select-toolbar-button', enabled: false });
        i18n.bindText(flipButton, 'vertical.flip');
        const clearButton = new Button({ class: 'select-toolbar-button', enabled: false });
        i18n.bindText(clearButton, 'vertical.clear');
        const doneButton = new Button({ class: 'select-toolbar-button' });
        i18n.bindText(doneButton, 'vertical.done');
        const toolbar = new Container({ class: ['select-toolbar', 'select-toolbar-tool'], hidden: true });
        toolbar.dom.addEventListener('pointerdown', e => e.stopPropagation());
        toolbar.append(hintLabel);
        toolbar.append(flipButton);
        toolbar.append(clearButton);
        toolbar.append(doneButton);
        canvasContainer.append(toolbar);

        // A screen-space rubber band while picking; completed points use the
        // same depth-aware scene overlay as the measure and orient tools.
        const ns = 'http://www.w3.org/2000/svg';
        const preview = document.createElementNS(ns, 'svg');
        preview.id = 'vertical-tool-svg';
        preview.classList.add('tool-svg', 'hidden');
        const outline = document.createElementNS(ns, 'line');
        const line = document.createElementNS(ns, 'line');
        preview.append(outline, line);
        annotationParent.appendChild(preview);
        let cursor: { x: number, y: number } | null = null;
        const overlay = new ToolOverlay();
        overlay.provider = (writer) => {
            const world = points.map(point => splat.worldTransform.transformPoint(point));
            world.forEach(point => writer.dot(point));
            if (world.length === 2) {
                writer.segment(world[0], world[1]);
            }
        };

        const update = () => {
            hintLabel.text = i18n.t(hint);
            flipButton.enabled = !!baseline && queued === 0 && !pending;
            clearButton.enabled = points.length > 0 || queued > 0;
            scene.forceRender = true;
        };

        const clear = () => {
            revision++;
            queued = 0;
            points = [];
            baseline = null;
            cursor = null;
            hint = 'vertical.hint';
            preview.classList.add('hidden');
            update();
        };

        const transform = () => new Transform(
            splat.entity.getLocalPosition(), splat.entity.getLocalRotation(), splat.entity.getLocalScale()
        );

        const apply = (newt: Transform) => {
            const oldt = transform();
            if (oldt.equalsApprox(newt)) {
                update();
                return;
            }
            const editorPivot = events.invoke('pivot') as Pivot;
            const matrix = new Mat4().setTRS(newt.position, newt.rotation, newt.scale);
            const pivotTransform = new Transform(
                matrix.transformPoint(splat.localFrameOrigin),
                new Quat().mul2(newt.rotation, splat.localFrame), newt.scale
            );
            pending = new MultiOp([
                new EntityTransformOp({ splat, oldt, newt }),
                new PlacePivotOp({ pivot: editorPivot, oldt: editorPivot.transform.clone(), newt: pivotTransform })
            ]);
            submitting = true;
            events.fire('edit.add', pending);
            submitting = false;
            update();
        };

        const placePoint = (x: number, y: number) => {
            if (!splat || pending || queued >= 2 - Math.min(points.length, 1)) {
                return;
            }
            if (points.length === 2) {
                clear();
            }
            const target = splat;
            const version = revision;
            const worldTransform = target.worldTransform.clone();
            const camera = scene.camera;
            const pose = {
                position: camera.mainCamera.getPosition().clone(),
                rotation: camera.mainCamera.getRotation().clone(),
                orthoHeight: camera.camera.orthoHeight,
                near: camera.near,
                far: camera.far
            };
            const viewProjection = new Mat4().mul2(camera.camera.projectionMatrix, camera.camera.viewMatrix);
            const center = camera.focalPoint.clone();
            const width = viewport.clientWidth;
            const height = viewport.clientHeight;
            const current = () => active && splat === target && revision === version;
            queued++;
            update();

            // Serialize GPU reads with the editor's other GPU work. Snapshot the
            // camera at the click so navigation during readback cannot move a hit.
            scene.commandQueue.enqueue(async () => {
                if (!current()) return;
                if (!target.worldTransform.equals(worldTransform)) {
                    clear();
                    return;
                }
                const [hit] = await camera.intersectMany([{ x: x / width, y: y / height }], [target], pose);
                if (!current()) return;
                if (!target.worldTransform.equals(worldTransform)) {
                    clear();
                    return;
                }
                if (!hit || ![hit.position.x, hit.position.y, hit.position.z].every(Number.isFinite)) {
                    hint = 'vertical.miss';
                    return;
                }
                const point = new Mat4().invert(worldTransform).transformPoint(hit.position);
                if (points.length === 0) {
                    points.push(point);
                    hint = 'vertical.second';
                } else if (points.length === 1) {
                    // Project both endpoints in the second click's camera frame,
                    // including when the user navigated after the first click.
                    const firstWorld = worldTransform.transformPoint(points[0]);
                    const a = viewProjection.transformPoint(firstWorld);
                    const b = viewProjection.transformPoint(hit.position);
                    const w = (p: Vec3) => {
                        const m = viewProjection.data;
                        return m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
                    };
                    const aw = w(firstWorld);
                    const bw = w(hit.position);
                    if (aw <= 0 || bw <= 0) {
                        clear();
                        return;
                    }
                    const firstOnTop = a.y / aw > b.y / bw || (a.y / aw === b.y / bw && a.x / aw <= b.x / bw);
                    const ordered = firstOnTop ? [points[0], point] : [point, points[0]];
                    const before = transform();
                    const result = alignVertical(before, center, ordered[0], ordered[1]);
                    if (!result) {
                        hint = 'vertical.distinct';
                        return;
                    }
                    points = ordered;
                    baseline = before;
                    pivot = center;
                    flipped = false;
                    hint = 'vertical.aligned';
                    apply(result);
                }
            }).catch(() => {
                if (current()) hint = 'vertical.miss';
            }).finally(() => {
                if (current()) {
                    queued--;
                    update();
                }
            });
        };

        flipButton.on('click', () => {
            if (baseline && !pending && queued === 0) {
                flipped = !flipped;
                const result = alignVertical(baseline, pivot, points[0], points[1], flipped);
                if (result) apply(result);
            }
        });
        clearButton.on('click', clear);
        doneButton.on('click', () => events.fire('tool.deactivate'));
        events.on('select.delete', () => {
            if (active) clear();
        });
        events.on('selection.changed', (selection: Splat) => {
            if (active) events.fire('tool.deactivate');
            splat = selection;
        });
        // A cancelled pick must never return into a reopened tool or overwrite
        // an intervening edit, undo, redo, or removed layer.
        const onEdit = () => {
            if (active && !submitting) clear();
        };
        events.on('edit.add', onEdit);
        events.on('edit.undo', onEdit);
        events.on('edit.redo', onEdit);
        events.on('edit.apply', (op) => {
            if (op === pending) pending = null;
            if (active) update();
        });

        let press: { id: number, x: number, y: number } | null = null;
        const pointerdown = (e: PointerEvent) => {
            if (e.button === 0 && e.isPrimary && e.target === scene.canvas) {
                press = { id: e.pointerId, x: e.clientX, y: e.clientY };
            }
        };
        const pointermove = (e: PointerEvent) => {
            if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_TOLERANCE) press = null;
            const rect = viewport.getBoundingClientRect();
            cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            scene.forceRender = true;
        };
        const pointerup = (e: PointerEvent) => {
            if (press?.id === e.pointerId && e.button === 0) {
                const rect = viewport.getBoundingClientRect();
                const { x, y } = press;
                press = null;
                if (Math.hypot(e.clientX - x, e.clientY - y) <= CLICK_TOLERANCE) {
                    placePoint(x - rect.left, y - rect.top);
                }
            }
            // Let the camera receive the release for every press it received.
        };
        const pointercancel = () => {
            press = null;
        };
        events.on('postrender', () => {
            let visible = active && points.length === 1 && !!cursor;
            if (visible) {
                const world = splat.worldTransform.transformPoint(points[0]);
                visible = world.clone().sub(scene.camera.position).dot(scene.camera.mainCamera.forward) > 0;
                const screen = new Vec3();
                scene.camera.worldToScreen(world, screen);
                for (const segment of [outline, line]) {
                    segment.setAttribute('x1', String(screen.x * viewport.clientWidth));
                    segment.setAttribute('y1', String(screen.y * viewport.clientHeight));
                    segment.setAttribute('x2', String(cursor.x));
                    segment.setAttribute('y2', String(cursor.y));
                }
            }
            preview.classList.toggle('hidden', !visible);
        });

        this.activate = () => {
            active = true;
            clear();
            viewport.addEventListener('pointerdown', pointerdown);
            window.addEventListener('pointermove', pointermove);
            window.addEventListener('pointerup', pointerup);
            window.addEventListener('pointercancel', pointercancel);
            toolbar.hidden = false;
            scene.add(overlay);
        };
        this.deactivate = () => {
            active = false;
            press = null;
            clear();
            viewport.removeEventListener('pointerdown', pointerdown);
            window.removeEventListener('pointermove', pointermove);
            window.removeEventListener('pointerup', pointerup);
            window.removeEventListener('pointercancel', pointercancel);
            toolbar.hidden = true;
            scene.remove(overlay);
        };
    }
}

export { VerticalTool };
