import { Events } from '../events';

type Point = { x: number, y: number };

class PolygonSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement, mask: { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D }) {
        let points: Point[] = [];
        let currentPoint: Point = null;

        // create svg
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'polygon-select-svg';
        svg.classList.add('select-svg');

        // create polyline element
        const polyline = document.createElementNS(svg.namespaceURI, 'polyline') as SVGPolylineElement;
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke-width', '1');
        polyline.setAttribute('stroke-dasharray', '5, 5');
        polyline.setAttribute('stroke-dashoffset', '0');

        // create canvas
        const { canvas, context } = mask;

        const dist = (a: Point, b: Point) => {
            return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        };

        const isClosed = () => {
            return points.length > 1 && dist(currentPoint, points[0]) < 8;
        };

        const paint = () => {
            polyline.setAttribute('points', [...points, currentPoint].filter(v => v).reduce((prev, current) => `${prev}${current.x}, ${current.y} `, ''));
            polyline.setAttribute('stroke', isClosed() ? '#fa6' : '#f60');
        };

        const commitSelection = (e: PointerEvent) => {
            // initialize canvas
            if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
                canvas.width = parent.clientWidth;
                canvas.height = parent.clientHeight;
            }

            // clear canvas
            context.clearRect(0, 0, canvas.width, canvas.height);

            context.beginPath();
            context.fillStyle = '#f60';
            context.beginPath();
            points.forEach((p, idx) => {
                if (idx === 0) {
                    context.moveTo(p.x, p.y);
                } else {
                    context.lineTo(p.x, p.y);
                }
            });
            context.closePath();
            context.fill();

            events.fire(
                'select.byMask',
                e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                canvas,
                context
            );

            points = [];
            paint();
        };

        const pointermove = (e: PointerEvent) => {
            currentPoint = { x: e.offsetX, y: e.offsetY };

            if (points.length > 0) {
                paint();
            }
        };

        const pointerdown = (e: PointerEvent) => {
            if (points.length > 0 || (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary)) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        const pointerup = (e: PointerEvent) => {
            if (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary) {
                e.preventDefault();
                e.stopPropagation();

                if (isClosed()) {
                    commitSelection(e);
                } else if (points.length === 0 || dist(points[points.length - 1], currentPoint) > 0) {
                    points.push(currentPoint);
                }
            }
        };

        const dblclick = (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (points.length > 2) {
                commitSelection(e);
            }
        };

        this.activate = () => {
            svg.style.display = 'inline';
            parent.style.display = 'block';
            parent.addEventListener('pointerdown', pointerdown);
            parent.addEventListener('pointermove', pointermove);
            parent.addEventListener('pointerup', pointerup);
            parent.addEventListener('dblclick', dblclick);
        };

        this.deactivate = () => {
            // cancel active operation
            svg.style.display = 'none';
            parent.style.display = 'none';
            parent.removeEventListener('pointerdown', pointerdown);
            parent.removeEventListener('pointermove', pointermove);
            parent.removeEventListener('pointerup', pointerup);
            parent.removeEventListener('dblclick', dblclick);
            points = [];
            paint();
        };

        svg.appendChild(polyline);
        parent.appendChild(svg);
    }
}

export { PolygonSelection };
