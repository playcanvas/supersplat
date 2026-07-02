import { Events } from '../events';

type Point = { x: number, y: number };

class PolygonSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement, mask: { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D }) {
        // create svg
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('tool-svg', 'hidden');
        svg.id = 'polygon-select-svg';
        parent.appendChild(svg);

        // create polyline element
        const polyline = document.createElementNS(svg.namespaceURI, 'polyline') as SVGPolylineElement;
        svg.appendChild(polyline);

        // create canvas
        const { canvas, context } = mask;

        let points: Point[] = [];
        let currentPoint: Point = null;
        let active = false;

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

        const commitSelection = async (e: MouseEvent | KeyboardEvent) => {
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

            // wait for selection to complete
            await events.invoke(
                'select.byMask',
                e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                canvas,
                context
            );

            // clear polygon after selection completes
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

        const pointerup = async (e: PointerEvent) => {
            if (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary) {
                e.preventDefault();
                e.stopPropagation();

                if (isClosed()) {
                    await commitSelection(e);
                } else if (points.length === 0 || dist(points[points.length - 1], currentPoint) > 0) {
                    points.push(currentPoint);
                }
            }
        };

        const dblclick = async (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (points.length > 2) {
                await commitSelection(e);
            }
        };

        const keydown = (e: KeyboardEvent) => {
            // ignore when focus is elsewhere (input fields, modals, etc.)
            if (e.target !== document.body) return;

            if (e.key === 'Enter' && points.length > 2) {
                e.preventDefault();
                e.stopPropagation();
                // ignore held-key repeats so a single commit runs at a time
                if (!e.repeat) {
                    commitSelection(e);
                }
            }
        };

        // remove the last placed point, returning whether a point was removed
        events.function('polygonSelection.removeLastPoint', () => {
            if (active && points.length > 0) {
                points.pop();
                paint();
                return true;
            }
            return false;
        });

        this.activate = () => {
            active = true;
            svg.classList.remove('hidden');
            parent.style.display = 'block';
            parent.addEventListener('pointerdown', pointerdown);
            parent.addEventListener('pointermove', pointermove);
            parent.addEventListener('pointerup', pointerup);
            parent.addEventListener('dblclick', dblclick);
            // capture phase so enter commits the polygon before the shortcut handlers run
            document.addEventListener('keydown', keydown, true);
        };

        this.deactivate = () => {
            // cancel active operation
            active = false;
            svg.classList.add('hidden');
            parent.style.display = 'none';
            parent.removeEventListener('pointerdown', pointerdown);
            parent.removeEventListener('pointermove', pointermove);
            parent.removeEventListener('pointerup', pointerup);
            parent.removeEventListener('dblclick', dblclick);
            document.removeEventListener('keydown', keydown, true);
            points = [];
            paint();
        };
    }
}

export { PolygonSelection };
