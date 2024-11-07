import { Events } from "../events";
import { Mask, Point, ScreenspaceSelection } from "./screenspace-selection";

class LassoSelection extends ScreenspaceSelection{
    private points: Point[] = [];
    private currentPoint: Point = null;
    private lastPointTime = 0;
    private polyline: SVGPolylineElement;

    constructor(events: Events, parent: HTMLElement, mask: Mask) {
        super(events, parent, mask);

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
        this.svg.id = 'lasso-select-svg';
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

    private update(e: PointerEvent){
        this.currentPoint = {x: e.offsetX, y: e.offsetY};

        const distance = this.points.length === 0 ? 0 : this.dist(this.currentPoint, this.points[this.points.length - 1]);
        const millis = Date.now() - this.lastPointTime;
        const preventCorners = distance > 20;
        const slowNarrowSpacing = millis > 500 && distance > 2;
        const fasterMediumSpacing = millis > 200 && distance > 10;
        const firstPoints = this.points.length === 0;


        if (this.dragId !== undefined && (preventCorners || slowNarrowSpacing || fasterMediumSpacing || firstPoints)) {
            this.points.push(this.currentPoint);
            this.lastPointTime = Date.now();
            this.updateSVG();
        }
    };

    private pointerdown(e: PointerEvent){
        if (this.dragId === undefined && (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary)) {
            e.preventDefault();
            e.stopPropagation();

            this.dragId = e.pointerId;
            this.parent.setPointerCapture(this.dragId);

            // initialize canvas
            if (this.mask.canvas.width !== this.parent.clientWidth || this.mask.canvas.height !== this.parent.clientHeight) {
                this.mask.canvas.width = this.parent.clientWidth;
                this.mask.canvas.height = this.parent.clientHeight;
            }

            // clear canvas
            this.mask.context.clearRect(0, 0, this.mask.canvas.width, this.mask.canvas.height);

            // display it
            this.mask.canvas.style.display = 'inline';

            this.update(e);
        }
    };

    private pointermove(e: PointerEvent){
        if (this.dragId !== undefined) {
            e.preventDefault();
            e.stopPropagation();
        }

        this.update(e);
    };

    protected dragEnd(){
        this.parent.releasePointerCapture(this.dragId);
        this.dragId = undefined;
        this.mask.canvas.style.display = 'none';
    };

    private pointerup(e: PointerEvent) {
        if (e.pointerId === this.dragId) {
            e.preventDefault();
            e.stopPropagation();

            this.dragEnd();

            this.commitSelection(e);

            this.events.fire(
                'select.byMask',
                e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                this.mask.canvas,
                this.mask.context
            );
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
}

export { LassoSelection };
