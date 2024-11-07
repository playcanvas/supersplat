import { Events } from "../events";
import { Mask, Point, ScreenspaceSelection } from "./screenspace-selection";

class PolygonSelection extends ScreenspaceSelection{
    private points: Point[] = [];
    private currentPoint: Point = null;
    private polyline: SVGPolylineElement;

    constructor(events: Events, parent: HTMLElement, mask: Mask) {
        super(events, parent, mask);

        this.initSVG();

        this.eventHandlers = {
            pointerdown: this.pointerdown.bind(this),
            pointermove: this.pointermove.bind(this),
            pointerup: this.pointerup.bind(this),
            dblclick: this.dblclick.bind(this)
        }
    }

    protected initSVG(){
        // create svg
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
        this.svg.id = 'polygon-select-svg';
        this.svg.classList.add('select-svg');
    
        // create polyline element
        this.polyline = document.createElementNS(this.svg.namespaceURI, 'polyline') as SVGPolylineElement;
        this.polyline.setAttribute('fill', 'none');
        this.polyline.setAttribute('stroke-width', '1');
        this.polyline.setAttribute('stroke-dasharray', '5, 5');
        this.polyline.setAttribute('stroke-dashoffset', '0');
    
        this.svg.appendChild(this.polyline);
        this.parent.appendChild(this.svg);
    }

    protected updateSVG() {
        this.polyline.setAttribute('points', [...this.points, this.currentPoint].reduce((prev, current) => prev + `${current.x}, ${current.y} `, ""));
        this.polyline.setAttribute('stroke', this.isClosed() ? '#fa6' : '#f60');
    };

    private isClosed() {
        return this.points.length > 1 && this.dist(this.currentPoint, this.points[0]) < 8;
    };

    private pointermove(e: PointerEvent){
        this.currentPoint = { x: e.offsetX, y: e.offsetY };

        if (this.points.length > 0) {
            this.updateSVG();
        }
    };

    private pointerdown(e: PointerEvent){
        if (this.points.length > 0 || (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary)) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    private pointerup(e: PointerEvent){
        if (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary) {
            e.preventDefault();
            e.stopPropagation();

            if (this.isClosed()) {
                this.commitSelection(e);
            } else if (this.points.length === 0 || this.dist(this.points[this.points.length - 1], this.currentPoint) > 0) {
                this.points.push(this.currentPoint);
            }
        }
    };

    private dblclick(e: PointerEvent) {
        e.preventDefault();
        e.stopPropagation();

        if (this.points.length > 2) {
            this.commitSelection(e);
        }
    };

    private commitSelection(e: PointerEvent) {
        // initialize canvas
        if (this.mask.canvas.width !== this.parent.clientWidth || this.mask.canvas.height !== this.parent.clientHeight) {
            this.mask.canvas.width = this.parent.clientWidth;
            this.mask.canvas.height = this.parent.clientHeight;
        }

        // clear canvas
        this.mask.context.clearRect(0, 0, this.mask.canvas.width, this.mask.canvas.height);

        this.mask.context.beginPath();
        this.mask.context.fillStyle = '#f60';
        this.mask.context.beginPath();
        this.points.forEach((p, idx) => {
            if (idx === 0) {
                this.mask.context.moveTo(p.x, p.y);
            }
            else {
                this.mask.context.lineTo(p.x, p.y);
            }
        });
        this.mask.context.closePath();
        this.mask.context.fill();

        this.events.fire(
            'select.byMask',
            e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
            this.mask.canvas,
            this.mask.context
        );

        this.points = [];
        this.updateSVG();
    };

    protected dragEnd(){
    };
}

export { PolygonSelection };
