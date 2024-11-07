import { Events } from "../events";

type Point = { x: number, y: number };
type EventHandlerRegistry = { [key: string] : (e: PointerEvent) => void};

abstract class ScreenspaceSelection {
    protected canvas: HTMLCanvasElement;
    protected context: CanvasRenderingContext2D;
    protected parent: HTMLElement;
    protected events: Events;
    protected svg: SVGSVGElement;
    protected eventHandlers: EventHandlerRegistry;
    protected dragId?: number;

    constructor(events: Events, parent: HTMLElement, mask: { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D }) {        
        this.events = events;
        this.parent = parent;
        this.canvas = mask.canvas;
        this.context = mask.context;

        this.initSVG();
    }

    protected initSVG(): void { /* override if required */ };
    protected dragEnd(): void { /* override if required */ };

    protected dist(a: Point, b: Point){
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    };

    public activate() {
        this.svg.style.display = 'inline';
        this.parent.style.display = 'block';
        Object.entries(this.eventHandlers).forEach(([name, handler]) => this.parent.addEventListener(name, handler));
    };

    public deactivate() {
        // cancel active operation
        if (this.dragId !== undefined) {
            this.dragEnd();
        }
        this.svg.style.display = 'none';
        this.parent.style.display = 'none';        
        Object.entries(this.eventHandlers).forEach(([name, handler]) => this.parent.removeEventListener(name, handler));
    };
}

export { ScreenspaceSelection, Point, EventHandlerRegistry };
