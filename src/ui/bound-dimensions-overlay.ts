import { Container } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';
import { Splat } from '../splat';

const corners = Array.from({ length: 8 }, () => new Vec3());
const screenCorners = Array.from({ length: 8 }, () => new Vec3());
const cornerInFront = new Array<boolean>(8);
const screenBoundCenter = new Vec3();
const worldBoundCenter = new Vec3();
const tmpVec = new Vec3();

// indices into the 8-corner array, ordered as (sx, sy, sz) where each s is 0 or 1
// corner index = sx*4 + sy*2 + sz
const cornerIndex = (sx: number, sy: number, sz: number) => sx * 4 + sy * 2 + sz;

// for each axis, the 4 pairs of corner indices that form the parallel edges along that axis
const axisEdges: number[][][] = [
    // X edges: vary sx from 0->1, hold sy, sz constant
    [
        [cornerIndex(0, 0, 0), cornerIndex(1, 0, 0)],
        [cornerIndex(0, 0, 1), cornerIndex(1, 0, 1)],
        [cornerIndex(0, 1, 0), cornerIndex(1, 1, 0)],
        [cornerIndex(0, 1, 1), cornerIndex(1, 1, 1)]
    ],
    // Y edges
    [
        [cornerIndex(0, 0, 0), cornerIndex(0, 1, 0)],
        [cornerIndex(0, 0, 1), cornerIndex(0, 1, 1)],
        [cornerIndex(1, 0, 0), cornerIndex(1, 1, 0)],
        [cornerIndex(1, 0, 1), cornerIndex(1, 1, 1)]
    ],
    // Z edges
    [
        [cornerIndex(0, 0, 0), cornerIndex(0, 0, 1)],
        [cornerIndex(0, 1, 0), cornerIndex(0, 1, 1)],
        [cornerIndex(1, 0, 0), cornerIndex(1, 0, 1)],
        [cornerIndex(1, 1, 0), cornerIndex(1, 1, 1)]
    ]
];

class BoundDimensionsOverlay {
    constructor(events: Events, scene: Scene, canvasContainer: Container) {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.classList.add('tool-svg', 'bound-dimensions-svg', 'hidden');
        svg.id = 'bound-dimensions-svg';
        canvasContainer.dom.appendChild(svg);

        const labels: SVGTextElement[] = [];
        for (let i = 0; i < 3; i++) {
            const text = document.createElementNS(ns, 'text') as SVGTextElement;
            text.classList.add(['bound-dim-x', 'bound-dim-y', 'bound-dim-z'][i]);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            svg.appendChild(text);
            labels.push(text);
        }

        events.on('prerender', () => {
            const selection = events.invoke('selection') as Splat;

            if (!selection ||
                !selection.visible ||
                !events.invoke('camera.boundDimensions')) {
                svg.classList.add('hidden');
                return;
            }

            svg.classList.remove('hidden');

            const width = canvasContainer.dom.clientWidth;
            const height = canvasContainer.dom.clientHeight;
            const camera = scene.camera;
            const transform = selection.entity.getWorldTransform();
            const bound = selection.localBound;
            const { center, halfExtents } = bound;

            // compute 8 world-space corners
            for (let i = 0; i < 8; i++) {
                const sx = (i >> 2) & 1;
                const sy = (i >> 1) & 1;
                const sz = i & 1;
                const local = corners[i];
                local.set(
                    center.x + (sx ? 1 : -1) * halfExtents.x,
                    center.y + (sy ? 1 : -1) * halfExtents.y,
                    center.z + (sz ? 1 : -1) * halfExtents.z
                );
                transform.transformPoint(local, local);
            }

            // determine which corners are in front of the camera (for behind-camera culling)
            const cameraPos = camera.mainCamera.getPosition();
            const cameraFwd = camera.mainCamera.forward;
            for (let i = 0; i < 8; i++) {
                tmpVec.sub2(corners[i], cameraPos);
                cornerInFront[i] = tmpVec.dot(cameraFwd) > 0;
            }

            // project all corners to screen
            for (let i = 0; i < 8; i++) {
                camera.worldToScreen(corners[i], screenCorners[i]);
            }

            // project bound center to screen (used to choose the outer-most edge)
            transform.transformPoint(center, worldBoundCenter);
            camera.worldToScreen(worldBoundCenter, screenBoundCenter);
            const scx = screenBoundCenter.x * width;
            const scy = screenBoundCenter.y * height;

            for (let axis = 0; axis < 3; axis++) {
                const edges = axisEdges[axis];
                let bestEdge = -1;
                let bestScore = -Infinity;

                // pick the parallel edge on the outer silhouette: farthest screen-space distance
                // from the projected box centroid. Ties are common in orthographic projection
                // (opposite edges are exactly equidistant), so require a meaningful difference
                // before swapping the chosen edge to avoid frame-to-frame flicker.
                for (let e = 0; e < edges.length; e++) {
                    const [a, b] = edges[e];
                    if (!cornerInFront[a] || !cornerInFront[b]) continue;
                    const mxe = (screenCorners[a].x + screenCorners[b].x) * 0.5 * width;
                    const mye = (screenCorners[a].y + screenCorners[b].y) * 0.5 * height;
                    const dxe = mxe - scx;
                    const dye = mye - scy;
                    const score = dxe * dxe + dye * dye;
                    if (score > bestScore + 1) {
                        bestScore = score;
                        bestEdge = e;
                    }
                }

                const text = labels[axis];

                if (bestEdge < 0) {
                    // no parallel edge has both endpoints in front of the camera
                    text.setAttribute('visibility', 'hidden');
                    continue;
                }
                text.setAttribute('visibility', 'visible');

                const [a, b] = edges[bestEdge];
                const sa = screenCorners[a];
                const sb = screenCorners[b];

                // world-space edge length
                const length = corners[a].distance(corners[b]);

                // screen-space endpoints in pixels
                const x0 = sa.x * width;
                const y0 = sa.y * height;
                const x1 = sb.x * width;
                const y1 = sb.y * height;

                const mx = (x0 + x1) * 0.5;
                const my = (y0 + y1) * 0.5;

                let theta = Math.atan2(y1 - y0, x1 - x0);
                // flip 180° to keep text upright
                if (Math.cos(theta) < 0) {
                    theta += Math.PI;
                }

                // perpendicular offset so the label sits outside the box
                const perpX = -Math.sin(theta);
                const perpY = Math.cos(theta);
                const toCenterX = scx - mx;
                const toCenterY = scy - my;
                const dot = perpX * toCenterX + perpY * toCenterY;
                const sign = dot > 0 ? -1 : 1;
                const offsetPx = 10;
                const ox = perpX * offsetPx * sign;
                const oy = perpY * offsetPx * sign;

                const thetaDeg = theta * 180 / Math.PI;
                text.setAttribute('transform', `translate(${(mx + ox).toFixed(1)}, ${(my + oy).toFixed(1)}) rotate(${thetaDeg.toFixed(1)})`);
                text.textContent = length.toFixed(2);
            }
        });
    }
}

export { BoundDimensionsOverlay };
