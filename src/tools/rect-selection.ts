import { Events } from '../events';

class RectSelection {
    events: Events;
    root: HTMLElement;
    svg: SVGElement;
    rect: SVGRectElement;
    dragging = false;
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

        const updateRect = () => {
            if (this.dragging) {
                const x = Math.min(this.start.x, this.end.x);
                const y = Math.min(this.start.y, this.end.y);
                const width = Math.abs(this.start.x - this.end.x);
                const height = Math.abs(this.start.y - this.end.y);

                rect.setAttribute('x', x.toString());
                rect.setAttribute('y', y.toString());
                rect.setAttribute('width', width.toString());
                rect.setAttribute('height', height.toString());
            }

            this.svg.style.display = this.dragging ? 'inline' : 'none';
        };

        root.oncontextmenu = (e) => {
            e.preventDefault();
        };

        root.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.button === 0) {
                this.dragging = true;
                this.start.x = this.end.x = e.offsetX;
                this.start.y = this.end.y = e.offsetY;
                updateRect();
            }
        };

        root.onmousemove = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.button === 0 && this.dragging) {
                this.end.x = e.offsetX;
                this.end.y = e.offsetY;
                updateRect();
            }
        };

        root.onmouseup = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (e.button === 0) {
                const w = root.clientWidth;
                const h = root.clientHeight;

                this.dragging = false;
                updateRect();

                this.events.fire('select.rect', e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'), {
                    start: { x: Math.min(this.start.x, this.end.x) / w, y: Math.min(this.start.y, this.end.y) / h },
                    end: { x: Math.max(this.start.x, this.end.x) / w, y: Math.max(this.start.y, this.end.y) / h },
                });
            }
        };

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
