import { Events } from '../events';
import { opFromModifiers } from '../select-op';

class RectSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement) {
        // create svg
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('tool-svg', 'hidden');
        svg.id = 'rect-select-svg';
        parent.appendChild(svg);

        // create rect element
        const rect = document.createElementNS(svg.namespaceURI, 'rect') as SVGRectElement;
        svg.appendChild(rect);

        const start = { x: 0, y: 0 };
        const end = { x: 0, y: 0 };
        let dragId: number | undefined;
        let dragMoved = false;

        const updateRect = () => {
            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            const width = Math.abs(start.x - end.x);
            const height = Math.abs(start.y - end.y);

            rect.setAttribute('x', x.toString());
            rect.setAttribute('y', y.toString());
            rect.setAttribute('width', width.toString());
            rect.setAttribute('height', height.toString());
        };

        const pointerdown = (e: PointerEvent) => {
            if (dragId === undefined && (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary)) {
                e.preventDefault();
                e.stopPropagation();

                dragId = e.pointerId;
                dragMoved = false;
                parent.setPointerCapture(dragId);

                start.x = end.x = e.offsetX;
                start.y = end.y = e.offsetY;

                updateRect();

                svg.classList.remove('hidden');
            }
        };

        const pointermove = (e: PointerEvent) => {
            if (e.pointerId === dragId) {
                e.preventDefault();
                e.stopPropagation();

                dragMoved = true;
                end.x = e.offsetX;
                end.y = e.offsetY;

                updateRect();
            }
        };

        const dragEnd = () => {
            // a touch that has lifted, or was cancelled, no longer holds the
            // capture and releasing it throws
            if (parent.hasPointerCapture(dragId)) {
                parent.releasePointerCapture(dragId);
            }
            dragId = undefined;
            svg.classList.add('hidden');
        };

        // the pointer is captured, so a drag can leave the canvas
        const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

        const pointerup = async (e: PointerEvent) => {
            if (e.pointerId === dragId) {
                e.preventDefault();
                e.stopPropagation();

                const w = parent.clientWidth;
                const h = parent.clientHeight;

                if (dragMoved) {
                    // rect select - wait for selection to complete before hiding rect
                    await events.invoke(
                        'select.rect',
                        opFromModifiers(e), {
                            start: { x: clamp01(Math.min(start.x, end.x) / w), y: clamp01(Math.min(start.y, end.y) / h) },
                            end: { x: clamp01(Math.max(start.x, end.x) / w), y: clamp01(Math.max(start.y, end.y) / h) }
                        });
                } else {
                    // pick - wait for selection to complete before hiding rect
                    await events.invoke(
                        'select.point',
                        opFromModifiers(e),
                        { x: e.offsetX / parent.clientWidth, y: e.offsetY / parent.clientHeight }
                    );
                }

                dragEnd();
            }
        };

        // a cancelled touch gets no pointerup, and a drag left open blocks
        // every later one
        const pointercancel = (e: PointerEvent) => {
            if (e.pointerId === dragId) {
                dragEnd();
            }
        };

        this.activate = () => {
            parent.style.display = 'block';
            parent.addEventListener('pointerdown', pointerdown);
            parent.addEventListener('pointermove', pointermove);
            parent.addEventListener('pointerup', pointerup);
            parent.addEventListener('pointercancel', pointercancel);
        };

        this.deactivate = () => {
            if (dragId !== undefined) {
                dragEnd();
            }
            parent.style.display = 'none';
            parent.removeEventListener('pointerdown', pointerdown);
            parent.removeEventListener('pointermove', pointermove);
            parent.removeEventListener('pointerup', pointerup);
            parent.removeEventListener('pointercancel', pointercancel);
        };
    }

    destroy() {

    }
}

export { RectSelection };
