import { Events } from "../events";

class BrushSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement, mask: { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D }) {
        let radius = 40;

        // create svg
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = 'brush-select-svg';
        svg.classList.add('select-svg');

        // create circle element
        const circle = document.createElementNS(svg.namespaceURI, 'circle') as SVGCircleElement;
        circle.setAttribute('r', radius.toString());
        circle.setAttribute('fill', 'rgba(255, 102, 0, 0.2)');
        circle.setAttribute('stroke', '#f60');
        circle.setAttribute('stroke-width', '1');
        circle.setAttribute('stroke-dasharray', '5, 5');

        const { canvas, context } = mask;

        const prev = { x: 0, y: 0 };
        let dragId: number | undefined;

        const update = (e: PointerEvent) => {
            const x = e.offsetX;
            const y = e.offsetY;

            circle.setAttribute('cx', x.toString());
            circle.setAttribute('cy', y.toString());

            if (dragId !== undefined) {
                context.beginPath();
                context.strokeStyle = '#f60';
                context.lineCap = 'round';
                context.lineWidth = radius * 2;
                context.moveTo(prev.x, prev.y);
                context.lineTo(x, y);
                context.stroke();

                prev.x = x;
                prev.y = y;
            }
        };

        const pointerdown = (e: PointerEvent) => {
            if (dragId === undefined && (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary)) {
                e.preventDefault();
                e.stopPropagation();

                dragId = e.pointerId;
                parent.setPointerCapture(dragId);

                // initialize canvas
                if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
                    canvas.width = parent.clientWidth;
                    canvas.height = parent.clientHeight;
                }

                // clear canvas
                context.clearRect(0, 0, canvas.width, canvas.height);

                // display it
                canvas.style.display = 'inline';

                prev.x = e.offsetX;
                prev.y = e.offsetY;

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
            canvas.style.display = 'none';
        };

        const pointerup = (e: PointerEvent) => {
            if (e.pointerId === dragId) {
                e.preventDefault();
                e.stopPropagation();

                dragEnd();

                events.fire(
                    'select.byMask',
                    e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                    canvas,
                    context
                );
            }
        };

        const wheel = (e: WheelEvent) => {
            const delta = e.deltaX + e.deltaY;
            if (e.shiftKey && delta !== 0) {
                events.fire(delta > 0 ? 'tool.brushSelection.smaller' : 'tool.brushSelection.bigger');
                e.preventDefault();
                e.stopPropagation();
            }
        };

        this.activate = () => {
            svg.style.display = 'inline';
            parent.style.display = 'block';
            parent.addEventListener('pointerdown', pointerdown);
            parent.addEventListener('pointermove', pointermove);
            parent.addEventListener('pointerup', pointerup);
            parent.addEventListener('wheel', wheel);
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
            parent.removeEventListener('wheel', wheel);
        };

        events.on('tool.brushSelection.smaller', () => {
            radius = Math.max(1, radius / 1.05);
            circle.setAttribute('r', radius.toString());
        });

        events.on('tool.brushSelection.bigger', () => {
            radius = Math.min(500, radius * 1.05);
            circle.setAttribute('r', radius.toString());
        });

        svg.appendChild(circle);
        parent.appendChild(svg);
    }
}

export { BrushSelection };
