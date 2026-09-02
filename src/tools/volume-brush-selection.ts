import { Events } from '../events';
import { opFromModifiers } from '../select-op';

class VolumeBrushSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement, mask: { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, busy: boolean }) {
        // create svg
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('tool-svg', 'hidden');
        svg.id = 'volume-brush-select-svg';
        parent.appendChild(svg);

        // shaded-sphere fill for the cursor circle, referenced from tool.scss
        const defs = document.createElementNS(svg.namespaceURI, 'defs');
        const gradient = document.createElementNS(svg.namespaceURI, 'radialGradient');
        gradient.id = 'volume-brush-gradient';
        gradient.setAttribute('cx', '37%');
        gradient.setAttribute('cy', '33%');
        gradient.setAttribute('r', '72%');
        [['0%', '0.5'], ['55%', '0.25'], ['100%', '0.08']].forEach(([offset, opacity]) => {
            const stop = document.createElementNS(svg.namespaceURI, 'stop');
            stop.setAttribute('offset', offset);
            stop.setAttribute('stop-color', '#f60');
            stop.setAttribute('stop-opacity', opacity);
            gradient.appendChild(stop);
        });
        defs.appendChild(gradient);
        svg.appendChild(defs);

        // create circle element
        const circle = document.createElementNS(svg.namespaceURI, 'circle') as SVGCircleElement;
        svg.appendChild(circle);

        const { canvas, context } = mask;

        let radius = 40;

        circle.setAttribute('r', radius.toString());

        const prev = { x: 0, y: 0 };
        let dragId: number | undefined;
        const points: { x: number, y: number, radius: number }[] = [];

        // track the pointer while the tool is inactive too (the tools overlay is
        // hidden then), so activation places the cursor at the mouse rather than
        // wherever the previous stroke ended
        const pointer = { x: 0, y: 0 };
        window.addEventListener('pointermove', (e: PointerEvent) => {
            pointer.x = e.clientX;
            pointer.y = e.clientY;
        }, { capture: true, passive: true });

        // append a stroke sample, interpolating extra samples so consecutive
        // points sit at most a fraction of the brush radius apart
        const appendPoint = (x: number, y: number, force = false) => {
            const last = points[points.length - 1];
            if (!last) {
                points.push({ x, y, radius });
                return;
            }

            const dx = x - last.x;
            const dy = y - last.y;
            const distance = Math.hypot(dx, dy);
            const spacing = Math.max(2, Math.min(last.radius, radius) * 0.25);
            const steps = Math.floor(distance / spacing);
            for (let i = 1; i <= steps; ++i) {
                const t = i * spacing / distance;
                points.push({
                    x: last.x + dx * t,
                    y: last.y + dy * t,
                    radius: last.radius + (radius - last.radius) * t
                });
            }

            if (force) {
                const tail = points[points.length - 1];
                if (tail.x !== x || tail.y !== y || tail.radius !== radius) {
                    points.push({ x, y, radius });
                }
            }
        };

        const update = (e: PointerEvent) => {
            const x = e.offsetX;
            const y = e.offsetY;

            circle.setAttribute('cx', x.toString());
            circle.setAttribute('cy', y.toString());

            if (dragId !== undefined) {
                appendPoint(x, y);

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
            if (!mask.busy && dragId === undefined && (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary)) {
                e.preventDefault();
                e.stopPropagation();

                dragId = e.pointerId;
                parent.setPointerCapture(dragId);

                // initialize canvas
                if (canvas.width !== parent.clientWidth || canvas.height !== parent.clientHeight) {
                    canvas.width = parent.clientWidth;
                    canvas.height = parent.clientHeight;
                }

                // clear canvas
                context.clearRect(0, 0, canvas.width, canvas.height);

                // display it
                canvas.style.display = 'inline';

                prev.x = e.offsetX;
                prev.y = e.offsetY;
                points.length = 0;
                appendPoint(prev.x, prev.y);

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
            canvas.style.display = 'none';
        };

        const pointerup = async (e: PointerEvent) => {
            if (e.pointerId === dragId) {
                e.preventDefault();
                e.stopPropagation();

                appendPoint(e.offsetX, e.offsetY, true);

                dragEnd();

                // block new strokes until the async selection has consumed the
                // shared mask canvas and finished its depth picking
                mask.busy = true;
                try {
                    await events.invoke(
                        'select.byVolumeBrush',
                        opFromModifiers(e),
                        points.map(point => ({
                            x: point.x / canvas.width,
                            y: point.y / canvas.height,
                            radius: point.radius
                        })),
                        canvas
                    );
                } finally {
                    mask.busy = false;
                }
            }
        };

        const wheel = (e: WheelEvent) => {
            if (e.altKey || e.metaKey) {
                const { deltaX, deltaY } = e;
                events.fire((Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY) > 0 ? 'tool.brushSelection.smaller' : 'tool.brushSelection.bigger');
                e.preventDefault();
                e.stopPropagation();
            }
        };

        this.activate = () => {
            svg.classList.remove('hidden');
            parent.style.display = 'block';
            const rect = parent.getBoundingClientRect();
            circle.setAttribute('cx', (pointer.x - rect.left).toString());
            circle.setAttribute('cy', (pointer.y - rect.top).toString());
            parent.addEventListener('pointerdown', pointerdown);
            parent.addEventListener('pointermove', pointermove);
            parent.addEventListener('pointerup', pointerup);
            parent.addEventListener('wheel', wheel);
        };

        this.deactivate = () => {
            // cancel active operation
            if (dragId !== undefined) {
                dragEnd();
            }
            svg.classList.add('hidden');
            parent.style.display = 'none';
            parent.removeEventListener('pointerdown', pointerdown);
            parent.removeEventListener('pointermove', pointermove);
            parent.removeEventListener('pointerup', pointerup);
            parent.removeEventListener('wheel', wheel);
        };

        // share the 2d brush's size events so the [ and ] shortcuts (and
        // alt+wheel) adjust whichever brush is active
        events.on('tool.brushSelection.smaller', () => {
            radius = Math.max(1, radius / 1.05);
            circle.setAttribute('r', radius.toString());
        });

        events.on('tool.brushSelection.bigger', () => {
            radius = Math.min(500, radius * 1.05);
            circle.setAttribute('r', radius.toString());
        });
    }
}

export { VolumeBrushSelection };
