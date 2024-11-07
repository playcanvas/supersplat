import { Events } from '../events';
import { Point, ScreenspaceSelection } from './screenspace-selection';

class RectSelection extends ScreenspaceSelection{
    private start: Point = { x: 0, y: 0 };
    private end: Point = { x: 0, y: 0 };
    private dragMoved = false;
    private rect: SVGRectElement;

    constructor(events: Events, parent: HTMLElement) {
        super(events, parent);

        this.initSVG();

        this.eventHandlers = {
            pointerdown: this.pointerdown.bind(this),
            pointermove: this.pointermove.bind(this),
            pointerup: this.pointerup.bind(this)
        }
    }

    protected initSVG(){    
        // create svg
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
        this.svg.id = 'rect-select-svg';
        this.svg.classList.add('select-svg');

        // create rect element
        this.rect = document.createElementNS(this.svg.namespaceURI, 'rect') as SVGRectElement;
        this.rect.setAttribute('fill', 'none');
        this.rect.setAttribute('stroke', '#f60');
        this.rect.setAttribute('stroke-width', '1');
        this.rect.setAttribute('stroke-dasharray', '5, 5');
    
        this.svg.appendChild(this.rect);
        this.parent.appendChild(this.svg);
    }

    protected updateSVG() {
        const x = Math.min(this.start.x, this.end.x);
        const y = Math.min(this.start.y, this.end.y);
        const width = Math.abs(this.start.x - this.end.x);
        const height = Math.abs(this.start.y - this.end.y);

        this.rect.setAttribute('x', x.toString());
        this.rect.setAttribute('y', y.toString());
        this.rect.setAttribute('width', width.toString());
        this.rect.setAttribute('height', height.toString());
    };

    private pointerdown(e: PointerEvent){
        if (this.dragId === undefined && (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary)) {
            e.preventDefault();
            e.stopPropagation();

            this.dragId = e.pointerId;
            this.dragMoved = false;
            this.parent.setPointerCapture(this.dragId);

            this.start.x = this.end.x = e.offsetX;
            this.start.y = this.end.y = e.offsetY;

            this.updateSVG();

            this.svg.style.display = 'inline';
        }
    };

    private pointermove(e: PointerEvent) {
        if (e.pointerId === this.dragId) {
            e.preventDefault();
            e.stopPropagation();

            this.dragMoved = true;
            this.end.x = e.offsetX;
            this.end.y = e.offsetY;

            this.updateSVG();
        }
    };

    private pointerup(e: PointerEvent){
        if (e.pointerId === this.dragId) {
            e.preventDefault();
            e.stopPropagation();

            const w = this.parent.clientWidth;
            const h = this.parent.clientHeight;

            this.dragEnd();

            if (this.dragMoved) {
                // rect select
                this.events.fire(
                    'select.rect',
                    e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'), {
                    start: { x: Math.min(this.start.x, this.end.x) / w, y: Math.min(this.start.y, this.end.y) / h },
                    end: { x: Math.max(this.start.x, this.end.x) / w, y: Math.max(this.start.y, this. end.y) / h },
                });
            } else {
                // pick
                this.events.fire(
                    'select.point',
                    e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                    { x: e.offsetX / this.parent.clientWidth, y: e.offsetY / this.parent.clientHeight }
                );
            }
        }
    };

    protected dragEnd()  {
        this.parent.releasePointerCapture(this.dragId);
        this.dragId = undefined;
        this.svg.style.display = 'none';
    };
}

export { RectSelection };
