import { Events } from "../events";

class BrushSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement) {
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

        // create canvas
        const selectCanvas = document.createElement('canvas');
        selectCanvas.id = 'brush-select-canvas';

        const context = selectCanvas.getContext('2d');
        context.globalCompositeOperation = 'copy';

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
                if (selectCanvas.width !== parent.clientWidth || selectCanvas.height !== parent.clientHeight) {
                    selectCanvas.width = parent.clientWidth;
                    selectCanvas.height = parent.clientHeight;
                }

                // clear canvas
                context.clearRect(0, 0, selectCanvas.width, selectCanvas.height);

                // display it
                selectCanvas.style.display = 'inline';

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
            selectCanvas.style.display = 'none';
        };

        const pointerup = (e: PointerEvent) => {
            if (e.pointerId === dragId) {
                e.preventDefault();
                e.stopPropagation();

                dragEnd();

                events.fire(
                    'select.byMask',
                    e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                    context.getImageData(0, 0, selectCanvas.width, selectCanvas.height)
                );
            }
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
        parent.appendChild(selectCanvas);
    }
}

export { BrushSelection };
