import { Vec3 } from 'playcanvas';

import { Scene } from '../scene';

const va = new Vec3();
const vb = new Vec3();
const vc = new Vec3();

// shared world-space edge length labels (bound dimensions overlay, measure
// and orient tools): a text label per edge, placed at the screen midpoint,
// rotated along the edge (flipped to stay upright), offset perpendicular to
// one side and hidden when either endpoint projects from behind the camera
// (worldToScreen mirrors those positions).
class DimensionLabels {
    svg: SVGSVGElement;
    labels: SVGTextElement[];

    private scene: Scene;
    private viewport: HTMLElement;

    // the svg is appended to parent and sized by it; screen projections use
    // the viewport element's client size (the canvas container)
    constructor(scene: Scene, viewport: HTMLElement, parent: HTMLElement, id: string, count: number) {
        this.scene = scene;
        this.viewport = viewport;

        const ns = 'http://www.w3.org/2000/svg';
        this.svg = document.createElementNS(ns, 'svg') as SVGSVGElement;
        this.svg.classList.add('tool-svg', 'dimension-labels-svg', 'hidden');
        this.svg.id = id;
        parent.appendChild(this.svg);

        this.labels = Array.from({ length: count }, () => {
            const text = document.createElementNS(ns, 'text') as SVGTextElement;
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            this.svg.appendChild(text);
            return text;
        });
    }

    show() {
        this.svg.classList.remove('hidden');
    }

    hide() {
        this.svg.classList.add('hidden');
    }

    hideLabel(index: number) {
        this.labels[index].setAttribute('visibility', 'hidden');
    }

    // place a label along the world-space edge a-b, showing its length. the
    // label sits on the side facing away from the world-space awayFrom
    // reference (e.g. the shape center), or above the edge when no reference
    // is given.
    setLabel(index: number, a: Vec3, b: Vec3, awayFrom?: Vec3) {
        const label = this.labels[index];
        const { camera } = this.scene;

        // hide the label when either endpoint is behind the camera
        const cameraPos = camera.mainCamera.getPosition();
        const cameraFwd = camera.mainCamera.forward;
        if (va.sub2(a, cameraPos).dot(cameraFwd) <= 0 ||
            va.sub2(b, cameraPos).dot(cameraFwd) <= 0) {
            label.setAttribute('visibility', 'hidden');
            return;
        }
        label.setAttribute('visibility', 'visible');

        const length = a.distance(b);

        const width = this.viewport.clientWidth;
        const height = this.viewport.clientHeight;

        camera.worldToScreen(a, va);
        camera.worldToScreen(b, vb);

        const x0 = va.x * width;
        const y0 = va.y * height;
        const x1 = vb.x * width;
        const y1 = vb.y * height;

        const mx = (x0 + x1) * 0.5;
        const my = (y0 + y1) * 0.5;

        let theta = Math.atan2(y1 - y0, x1 - x0);
        // flip 180° to keep text upright
        if (Math.cos(theta) < 0) {
            theta += Math.PI;
        }

        // perpendicular offset to the side facing away from the reference
        // (the upright flip leaves the perpendicular pointing down-screen,
        // so without a reference the label sits above the edge)
        const perpX = -Math.sin(theta);
        const perpY = Math.cos(theta);
        let sign = -1;
        if (awayFrom) {
            camera.worldToScreen(awayFrom, vc);
            sign = perpX * (vc.x * width - mx) + perpY * (vc.y * height - my) > 0 ? -1 : 1;
        }
        const offsetPx = 10;

        const thetaDeg = theta * 180 / Math.PI;
        label.setAttribute('transform', `translate(${(mx + perpX * offsetPx * sign).toFixed(1)}, ${(my + perpY * offsetPx * sign).toFixed(1)}) rotate(${thetaDeg.toFixed(1)})`);
        label.textContent = length.toFixed(2);
    }
}

export { DimensionLabels };
