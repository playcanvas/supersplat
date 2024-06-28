import { Events } from '../events';

class RectSelection {
    events: Events;
    root: HTMLElement;
    svg: SVGElement;
    rect: SVGRectElement;
    start = { x: 0, y: 0 };
    end = { x: 0, y: 0 };

    constructor(events: Events, parent: HTMLElement) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = 'select-svg';

        // create rect element
        const rect = document.createElementNS(svg.namespaceURI, 'rect') as SVGRectElement;
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#f60');
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('stroke-dasharray', '5, 5');

        // create input dom
        const root = document.createElement('div');
        root.id = 'select-root';
        root.style.touchAction = 'none';

        let dragId: number | undefined;

        const updateRect = () => {
            const x = Math.min(this.start.x, this.end.x);
            const y = Math.min(this.start.y, this.end.y);
            const width = Math.abs(this.start.x - this.end.x);
            const height = Math.abs(this.start.y - this.end.y);

            rect.setAttribute('x', x.toString());
            rect.setAttribute('y', y.toString());
            rect.setAttribute('width', width.toString());
            rect.setAttribute('height', height.toString());
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

                this.start.x = this.end.x = e.offsetX;
                this.start.y = this.end.y = e.offsetY;

                updateRect();

                this.svg.style.display = 'inline';
            }
        });

        root.addEventListener('pointermove', (e) => {
            if (e.pointerId === dragId) {
                e.preventDefault();
                e.stopPropagation();

                this.end.x = e.offsetX;
                this.end.y = e.offsetY;

                updateRect();
            }
        });

        root.addEventListener('pointerup', (e) => {
            if (e.pointerId === dragId) {
                e.preventDefault();
                e.stopPropagation();

                const w = root.clientWidth;
                const h = root.clientHeight;

                root.releasePointerCapture(dragId);
                dragId = undefined;

                this.svg.style.display = 'none';

                this.events.fire('select.rect', e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'), {
                    start: { x: Math.min(this.start.x, this.end.x) / w, y: Math.min(this.start.y, this.end.y) / h },
                    end: { x: Math.max(this.start.x, this.end.x) / w, y: Math.max(this.start.y, this.end.y) / h },
                });
            }
        });

        parent.appendChild(root);
        root.appendChild(svg);
        svg.appendChild(rect);

        this.events = events;
        this.root = root;
        this.svg = svg;
        this.rect = rect;
    }

    activate() {
        this.root.style.display = 'block';
    }

    deactivate() {
        this.root.style.display = 'none';
    }
}

export { RectSelection };
