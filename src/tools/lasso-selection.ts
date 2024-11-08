import { Events } from "../events";

type Point = { x: number, y: number };

class LassoSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement, mask: { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D }) {
        let points: Point[] = [];
        let currentPoint: Point = null;
        let lastPointTime = 0;

        // create svg
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = 'lasso-select-svg';
        svg.classList.add('select-svg');

        // create polygon element
        const polygon = document.createElementNS(svg.namespaceURI, 'polygon') as SVGPolygonElement;
        polygon.setAttribute('fill', 'none');
        polygon.setAttribute('stroke-width', '1');
        polygon.setAttribute('stroke-dasharray', '5, 5');
        polygon.setAttribute('stroke-dashoffset', '0');

        // create canvas
        const { canvas, context } = mask;

        const paint = () => {
            polygon.setAttribute('points', [...points, currentPoint].reduce((prev, current) => prev + `${current.x}, ${current.y} `, ""));
            polygon.setAttribute('stroke', isClosed() ? '#fa6' : '#f60');
        };

        const dist = (a: Point, b: Point) => {
            return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        };

        const isClosed = () => {
            return points.length > 1 && dist(currentPoint, points[0]) < 8;
        };

        let dragId: number | undefined;

        const update = (e: PointerEvent) => {
            currentPoint = {x: e.offsetX, y: e.offsetY};

            const distance = points.length === 0 ? 0 : dist(currentPoint, points[points.length - 1]);
            const millis = Date.now() - lastPointTime;
            const preventCorners = distance > 20;
            const slowNarrowSpacing = millis > 500 && distance > 2;
            const fasterMediumSpacing = millis > 200 && distance > 10;
            const firstPoints = points.length === 0;

            if (dragId !== undefined && (preventCorners || slowNarrowSpacing || fasterMediumSpacing || firstPoints)) {
                points.push(currentPoint);
                lastPointTime = Date.now();
                paint();
            }
        };

        const pointerdown = (e: PointerEvent) => {
            if (dragId === undefined && (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary)) {
                e.preventDefault();
                e.stopPropagation();

                dragId = e.pointerId;
                parent.setPointerCapture(dragId);

                update(e);
            }
        };

        const pointermove = (e: PointerEvent) => {
            if (dragId !== undefined) {
                e.preventDefault();
                e.stopPropagation();
            }

            update(e);
        };

        const dragEnd = () => {
            parent.releasePointerCapture(dragId);
            dragId = undefined;
        };

        const pointerup = (e: PointerEvent) => {
            if (e.pointerId === dragId) {
                e.preventDefault();
                e.stopPropagation();

                dragEnd();

                commitSelection(e);

                points = [];
                paint();
            }
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
                }
                else {
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
        };

        this.activate = () => {
            svg.style.display = 'inline';
            parent.style.display = 'block';
            parent.addEventListener('pointerdown', pointerdown);
            parent.addEventListener('pointermove', pointermove);
            parent.addEventListener('pointerup', pointerup);
        };

        this.deactivate = () => {
            // cancel active operation
            if (dragId !== undefined) {
                dragEnd();
            }
            svg.style.display = 'none';
            parent.style.display = 'none';
            parent.removeEventListener('pointerdown', pointerdown);
            parent.removeEventListener('pointermove', pointermove);
            parent.removeEventListener('pointerup', pointerup);
        };

        svg.appendChild(polygon);
        parent.appendChild(svg);
    }
}

export { LassoSelection };
