import { Events } from "../events";

class BrushSelection {
    events: Events;
    root: HTMLElement;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    svg: SVGElement;
    circle: SVGCircleElement;
    radius = 40;
    prev = { x: 0, y: 0 };

    constructor(events: Events, parent: HTMLElement) {
        // create input dom
        const root = document.createElement('div');
        root.id = 'select-root';

        // create svg
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = 'select-svg';
        svg.style.display = 'inline';
        root.style.touchAction = 'none';

        // create circle element
        const circle = document.createElementNS(svg.namespaceURI, 'circle') as SVGCircleElement;
        circle.setAttribute('r', this.radius.toString());
        circle.setAttribute('fill', 'rgba(255, 102, 0, 0.2)');
        circle.setAttribute('stroke', '#f60');
        circle.setAttribute('stroke-width', '1');
        circle.setAttribute('stroke-dasharray', '5, 5');

        // create canvas
        const canvas = document.createElement('canvas');
        canvas.id = 'select-canvas';

        const context = canvas.getContext('2d');
        context.globalCompositeOperation = 'copy';

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
                context.lineWidth = this.radius * 2;
                context.moveTo(this.prev.x, this.prev.y);
                context.lineTo(x, y);
                context.stroke();

                this.prev.x = x;
                this.prev.y = y;
            }
        };

        root.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        root.addEventListener('pointerdown', (e) => {
            if (dragId === undefined && (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary)) {
                e.preventDefault();
                e.stopPropagation();

                dragId = e.pointerId;
                root.setPointerCapture(dragId);

                // initialize canvas
                if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
                    canvas.width = parent.clientWidth;
                    canvas.height = parent.clientHeight;
                }

                // clear canvas
                context.clearRect(0, 0, canvas.width, canvas.height);

                // display it
                canvas.style.display = 'inline';

                this.prev.x = e.offsetX;
                this.prev.y = e.offsetY;

                update(e);
            }
        });

        root.addEventListener('pointermove', (e) => {
            if (dragId !== undefined) {
                e.preventDefault();
                e.stopPropagation();
            }

            update(e);
        });

        root.addEventListener('pointerup', (e) => {
            if (e.pointerId === dragId) {
                e.preventDefault();
                e.stopPropagation();

                root.releasePointerCapture(dragId);
                dragId = undefined;

                canvas.style.display = 'none';

                this.events.fire(
                    'select.byMask',
                    e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                    context.getImageData(0, 0, canvas.width, canvas.height)
                );
            }
        });

        parent.appendChild(root);
        root.appendChild(svg);
        svg.appendChild(circle);
        root.appendChild(canvas);

        events.on('tool.brushSelection.smaller', () => {
            this.smaller();
        });

        events.on('tool.brushSelection.bigger', () => {
            this.bigger();
        });

        this.events = events;
        this.root = root;
        this.svg = svg;
        this.circle = circle;
        this.canvas = canvas;
        this.context = context;

        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
    }

    activate() {
        this.root.style.display = 'block';
    }

    deactivate() {
        this.root.style.display = 'none';
    }

    smaller() {
        this.radius = Math.max(1, this.radius / 1.05);
        this.circle.setAttribute('r', this.radius.toString());
    }

    bigger() {
        this.radius = Math.min(500, this.radius * 1.05);
        this.circle.setAttribute('r', this.radius.toString());
    }
}

export { BrushSelection };
