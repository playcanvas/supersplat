import { Events } from "../events";

type Point = { x: number, y: number };
type EventHandlerRegistry = { [key: string] : (e: PointerEvent) => void};
type Mask = { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D };

abstract class ScreenspaceSelection {
    protected mask?: Mask;
    protected parent: HTMLElement;
    protected events: Events;
    protected svg: SVGSVGElement;
    protected eventHandlers: EventHandlerRegistry;
    protected dragId?: number;

    constructor(events: Events, parent: HTMLElement, mask?: Mask) {        
        this.events = events;
        this.parent = parent;
        this.mask = mask;
    }

    protected abstract initSVG(): void;
    protected abstract updateSVG(): void;
    protected abstract dragEnd(): void;

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

export { ScreenspaceSelection, Point, Mask, EventHandlerRegistry };
