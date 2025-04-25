import { Container } from 'pcui';
import { Mat4, Vec3 } from 'playcanvas';

import { Events } from '../events';

const vecx = new Vec3();
const vecy = new Vec3();
const vecz = new Vec3();
const mat4 = new Mat4();

class ViewCube extends Container {
    update: (cameraMatrix: Mat4) => void;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'view-cube-container'
        };

        super(args);

        // construct svg elements
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'view-cube-svg';

        const group = document.createElementNS(svg.namespaceURI, 'g');
        svg.appendChild(group);

        const circle = (color: string, fill: boolean, text?: string) => {
            const result = document.createElementNS(svg.namespaceURI, 'g') as SVGElement;

            const circle = document.createElementNS(svg.namespaceURI, 'circle') as SVGCircleElement;
            circle.setAttribute('fill', fill ? color : '#555');
            circle.setAttribute('stroke', color);
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('r', '10');
            circle.setAttribute('cx', '0');
            circle.setAttribute('cy', '0');
            circle.setAttribute('pointer-events', 'all');

            result.appendChild(circle);

            if (text) {
                const t = document.createElementNS(svg.namespaceURI, 'text') as SVGTextElement;
                t.setAttribute('font-size', '10');
                t.setAttribute('font-family', 'Arial');
                t.setAttribute('font-weight', 'bold');
                t.setAttribute('text-anchor', 'middle');
                t.setAttribute('alignment-baseline', 'central');
                t.textContent = text;
                result.appendChild(t);
            }

            result.setAttribute('cursor', 'pointer');

            group.appendChild(result);

            return result;
        };

        const line = (color: string) => {
            const result = document.createElementNS(svg.namespaceURI, 'line') as SVGLineElement;
            result.setAttribute('stroke', color);
            result.setAttribute('stroke-width', '2');
            group.appendChild(result);
            return result;
        };

        const r = '#f44';
        const g = '#4f4';
        const b = '#77f';

        const shapes = {
            nx: circle(r, false),
            ny: circle(g, false),
            nz: circle(b, false),
            xaxis: line(r),
            yaxis: line(g),
            zaxis: line(b),
            px: circle(r, true, 'X'),
            py: circle(g, true, 'Y'),
            pz: circle(b, true, 'Z')
        };

        shapes.px.children[0].addEventListener('pointerdown', (e) => {
            events.fire('camera.align', 'px'); e.stopPropagation();
        });
        shapes.py.children[0].addEventListener('pointerdown', (e) => {
            events.fire('camera.align', 'py'); e.stopPropagation();
        });
        shapes.pz.children[0].addEventListener('pointerdown', (e) => {
            events.fire('camera.align', 'pz'); e.stopPropagation();
        });
        shapes.nx.children[0].addEventListener('pointerdown', (e) => {
            events.fire('camera.align', 'nx'); e.stopPropagation();
        });
        shapes.ny.children[0].addEventListener('pointerdown', (e) => {
            events.fire('camera.align', 'ny'); e.stopPropagation();
        });
        shapes.nz.children[0].addEventListener('pointerdown', (e) => {
            events.fire('camera.align', 'nz'); e.stopPropagation();
        });

        this.dom.appendChild(svg);

        let cw = 0;
        let ch = 0;

        this.update = (cameraMatrix: Mat4) => {
            const w = this.dom.clientWidth;
            const h = this.dom.clientHeight;

            if (w && h) {
                if (w !== cw || h !== ch) {
                    // resize elements
                    svg.setAttribute('width', w.toString());
                    svg.setAttribute('height', h.toString());
                    group.setAttribute('transform', `translate(${w * 0.5}, ${h * 0.5})`);
                    cw = w;
                    ch = h;
                }

                mat4.invert(cameraMatrix);
                mat4.getX(vecx);
                mat4.getY(vecy);
                mat4.getZ(vecz);

                const transform = (group: SVGElement, x: number, y: number) => {
                    group.setAttribute('transform', `translate(${x * 40}, ${y * 40})`);
                };

                const x2y2 = (line: SVGLineElement, x: number, y: number) => {
                    line.setAttribute('x2', (x * 40).toString());
                    line.setAttribute('y2', (y * 40).toString());
                };

                transform(shapes.px, vecx.x, -vecx.y);
                transform(shapes.nx, -vecx.x, vecx.y);
                transform(shapes.py, vecy.x, -vecy.y);
                transform(shapes.ny, -vecy.x, vecy.y);
                transform(shapes.pz, vecz.x, -vecz.y);
                transform(shapes.nz, -vecz.x, vecz.y);

                x2y2(shapes.xaxis, vecx.x, -vecx.y);
                x2y2(shapes.yaxis, vecy.x, -vecy.y);
                x2y2(shapes.zaxis, vecz.x, -vecz.y);

                // reorder dom for the mighty svg painter's algorithm
                const order = [
                    { n: ['xaxis', 'px'], value: vecx.z },
                    { n: ['yaxis', 'py'], value: vecy.z },
                    { n: ['zaxis', 'pz'], value: vecz.z },
                    { n: ['nx'], value: -vecx.z },
                    { n: ['ny'], value: -vecy.z },
                    { n: ['nz'], value: -vecz.z }
                ].sort((a, b) => a.value - b.value);

                const fragment = document.createDocumentFragment();

                order.forEach((o) => {
                    o.n.forEach((n) => {
                        // @ts-ignore
                        fragment.appendChild(shapes[n]);
                    });
                });

                group.appendChild(fragment);
            }
        };
    }
}

export { ViewCube };
