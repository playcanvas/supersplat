import { Mat4, Quat, Ray, TranslateGizmo, Vec3 } from 'playcanvas';
import { Button, Container, NumericInput } from '@playcanvas/pcui';
import { EntityTransformOp } from '../edit-ops';
import { Events } from '../events';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { SphereShape } from '../sphere-shape';
import { Transform } from '../transform';

const L = new Vec3();

const intersectRaySphere = (result: { t0: number, t1: number }, pos: Vec3, dir: Vec3, spherePos: Vec3, sphereRadius: number) => {
    L.sub2(spherePos, pos);
    const tca = L.dot(dir);

    const d2 = sphereRadius * sphereRadius - (L.dot(L) - tca * tca);
    if (d2 <= 0.0) {
        return false;
    }

    const thc = Math.sqrt(d2);
    result.t0 = tca - thc;
    result.t1 = tca + thc;

    return result.t1 > 0;
};

const ray = new Ray();
const mat = new Mat4();
const mat1 = new Mat4();
const mat2 = new Mat4();
const mat3 = new Mat4();
const p = new Vec3();
const p0 = new Vec3();
const p1 = new Vec3();
const r = new Quat();
const s = new Vec3();

class MeasureTool {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, scene: Scene, parent: HTMLElement, canvasContainer: Container) {
        // create svg
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('tool-svg');
        svg.id = 'measure-tool-svg';
        parent.appendChild(svg);

        // create line element
        const line = document.createElementNS(svg.namespaceURI, 'line') as SVGLineElement;
        svg.appendChild(line);

        // ui
        const lengthInput = new NumericInput({
            width: 120,
            placeholder: 'Length',
            precision: 2,
            min: 0.0001,
            value: 0
        });
        let supressUI = false;

        const apply = new Button({
            text: 'Apply',
            class: 'select-toolbar-button'
        });

        const selectToolbar = new Container({
            id: 'select-toolbar',
            hidden: true
        });

        selectToolbar.dom.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });

        selectToolbar.append(lengthInput);
        selectToolbar.append(apply);
        canvasContainer.append(selectToolbar);

        const gizmo = new TranslateGizmo(scene.camera.entity.camera, scene.gizmoLayer);
        let active = false;
        let splat: Splat;

        const spheres = [
            new SphereShape(),
            new SphereShape(),
            new SphereShape()
        ];

        const worldPoint = (result: Vec3, index: number) => {
            splat.worldTransform.transformPoint(splat.measurePoints[index], result);
        };

        const updateSpheres = () => {
            for (let i = 0; i < spheres.length; i++) {
                const s = spheres[i];
                if (!splat || !active || i >= splat.measurePoints.length) {
                    scene.remove(s);
                } else {
                    scene.add(s);
                    spheres[i].radius = 0.1;
                    spheres[i].stripSize = 1.0;
                    splat.worldTransform.transformPoint(splat.measurePoints[i], p);
                    spheres[i].pivot.setPosition(p);
                }
            }

            gizmo.detach();
            if (splat && active && splat.measureSelection >= 0 && splat.measureSelection < splat.measurePoints.length) {
                gizmo.attach(spheres[splat.measureSelection].pivot);
            }

            if (splat && splat.measurePoints.length === 2) {
                worldPoint(p0, 0);
                worldPoint(p1, 1);
                const len = p0.distance(p1);

                supressUI = true;
                lengthInput.value = len;
                lengthInput.enabled = true;
                supressUI = false;
            } else {
                lengthInput.enabled = false;
            }
        };

        gizmo.on('render:update', () => {
            scene.forceRender = true;
        });

        gizmo.on('transform:end', () => {
            if (active && splat && splat.measureSelection >= 0 && splat.measureSelection < splat.measurePoints.length) {
                const p = spheres[splat.measureSelection].pivot.getPosition();
                mat.invert(splat.worldTransform);
                mat.transformPoint(p, splat.measurePoints[splat.measureSelection]);
                updateSpheres();
            }
        });

        events.on('selection.changed', (selection: Splat) => {
            splat = selection;
            if (active) {
                updateSpheres();
            }
        });

        const handleClick = (offsetX: number, offsetY: number) => {
            if (!splat) {
                return;
            }

            const { camera } = scene;

            // intersect sphere
            camera.getRay(offsetX, offsetY, ray);

            let closest = Number.MAX_VALUE;
            let closestIndex = -1;
            const intersect = { t0: 0, t1: 0 };

            // test for intersection with existing spheres
            for (let i = 0; i < splat.measurePoints.length; i++) {
                // transform to world space
                splat.worldTransform.transformPoint(splat.measurePoints[i], p);
                // intersect with sphere
                if (intersectRaySphere(intersect, ray.origin, ray.direction, p, 0.1)) {
                    if (closestIndex === -1 || intersect.t1 < closest) {
                        closestIndex = i;
                        closest = intersect.t1;
                    }
                }
            }

            if (closestIndex !== -1) {
                splat.measureSelection = closestIndex;
                updateSpheres();
                return;
            }

            const result = scene.camera.intersect(offsetX, offsetY);
            if (result) {
                mat.invert(splat.worldTransform);
                mat.transformPoint(result.position, p);

                if (splat.measurePoints.length < 3) {
                    splat.measureSelection = splat.measurePoints.length;
                    splat.measurePoints.push(p.clone());
                }

                updateSpheres();
            }
        };

        // position and scale the splat according to the new length
        const applyScale = (newScale: number) => {
            if (!splat || splat.measurePoints.length !== 2 || newScale <= 0) {
                return;
            }

            // calculate world center
            worldPoint(p0, 0);
            worldPoint(p1, 1);
            p.sub2(p1, p0).mulScalar(0.5);

            const len = p.length();
            const scale = newScale * 0.5 / len;

            // calculate mid point
            p.add(p0);

            // construct a transform matrix that scales from p by len * 0.5
            mat1.setTranslate(-p.x, -p.y, -p.z);
            mat2.setScale(scale, scale, scale);
            mat3.setTranslate(p.x, p.y, p.z);

            mat.mul2(mat1, splat.worldTransform);
            mat.mul2(mat2, mat);
            mat.mul2(mat3, mat);

            mat.getTranslation(p);
            r.setFromMat4(mat);
            mat.getScale(s);

            const top = new EntityTransformOp({
                splat: splat,
                oldt: new Transform(splat.entity.getLocalPosition(), splat.entity.getLocalRotation(), splat.entity.getLocalScale()),
                newt: new Transform(p, r, s)
            })

            events.fire('edit.add', top);
            updateSpheres();
        };

        // handle length input updates
        lengthInput.on('slider:mousedown', () => {
            supressUI = true;
        });
        lengthInput.on('slider:mouseup', () => {
            supressUI = false;
            applyScale(lengthInput.value);
        });
        lengthInput.on('change', () => {
            if (!supressUI) {
                applyScale(lengthInput.value);
            }
        });

        events.on('select.delete', () => {
            if (active && splat && splat.measureSelection >= 0 && splat.measureSelection < splat.measurePoints.length) {
                splat.measurePoints.splice(splat.measureSelection, 1);
                splat.measureSelection--;
                updateSpheres();
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

        const pointerup = (e: PointerEvent) => {
            if (clicked && isPrimary(e)) {
                clicked = false;
                handleClick(e.offsetX, e.offsetY);
                e.preventDefault();
                e.stopPropagation();
            }
        };

        events.on('postrender', () => {
            if (splat && splat.measurePoints.length === 2) {
                const camera = scene.camera;

                splat.worldTransform.transformPoint(splat.measurePoints[0], p0);
                splat.worldTransform.transformPoint(splat.measurePoints[1], p1);

                camera.worldToScreen(p0, p0);
                camera.worldToScreen(p1, p1);

                line.setAttribute('x1', (p0.x * svg.clientWidth).toString());
                line.setAttribute('y1', (p0.y * svg.clientHeight).toString());
                line.setAttribute('x2', (p1.x * svg.clientWidth).toString());
                line.setAttribute('y2', (p1.y * svg.clientHeight).toString());

                line.style.display = 'block';
            }
        });

        this.activate = () => {
            active = true;
            updateSpheres();
            canvasContainer.dom.addEventListener('pointerdown', pointerdown);
            canvasContainer.dom.addEventListener('pointermove', pointermove);
            canvasContainer.dom.addEventListener('pointerup', pointerup, true);
            selectToolbar.hidden = false;
            parent.style.display = 'block';
            svg.classList.remove('hidden');
        };

        this.deactivate = () => {
            active = false;
            updateSpheres();
            canvasContainer.dom.removeEventListener('pointerdown', pointerdown);
            canvasContainer.dom.removeEventListener('pointermove', pointermove);
            canvasContainer.dom.removeEventListener('pointerup', pointerup);
            selectToolbar.hidden = true;
            parent.style.display = 'none';
            svg.classList.add('hidden');
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
    }
}

export { MeasureTool };
