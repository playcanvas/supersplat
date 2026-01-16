import { Events } from '../events';

class BrushSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement, mask: { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D }) {
        // create svg
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('tool-svg', 'hidden');
        svg.id = 'brush-select-svg';
        parent.appendChild(svg);

        // create circle element
        const circle = document.createElementNS(svg.namespaceURI, 'circle') as SVGCircleElement;
        svg.appendChild(circle);

        const { canvas, context } = mask;

        let radius = 40;

        circle.setAttribute('r', radius.toString());

        const prev = { x: 0, y: 0 };
        let dragId: number | undefined;

        // for continuous key press handling
        let smallerPressed = false;
        let biggerPressed = false;
        let animationFrameId: number | undefined;
        let animationDelayTimeoutId: number | undefined;

        const updateRadius = () => {
            if (smallerPressed) {
                radius = Math.max(1, radius / 1.02);
            }
            if (biggerPressed) {
                radius = Math.min(500, radius * 1.02);
            }
            if (smallerPressed || biggerPressed) {
                circle.setAttribute('r', radius.toString());
                animationFrameId = requestAnimationFrame(updateRadius);
            } else {
                animationFrameId = undefined;
            }
        };

        const startAnimation = () => {
            if (animationFrameId === undefined) {
                animationFrameId = requestAnimationFrame(updateRadius);
            }
        };

        const applyStep = (direction: 'smaller' | 'bigger') => {
            if (direction === 'smaller') {
                radius = Math.max(1, radius / 1.05);
            } else {
                radius = Math.min(500, radius * 1.05);
            }
            circle.setAttribute('r', radius.toString());
        };

        const update = (e: PointerEvent) => {
            const x = e.offsetX;
            const y = e.offsetY;

            circle.setAttribute('cx', x.toString());
            circle.setAttribute('cy', y.toString());

            if (dragId !== undefined) {
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
            if (dragId === undefined && (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary)) {
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

        const pointerup = (e: PointerEvent) => {
            if (e.pointerId === dragId) {
                e.preventDefault();
                e.stopPropagation();

                dragEnd();

                events.fire(
                    'select.byMask',
                    e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                    canvas,
                    context
                );
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
            // cancel animation and timeout
            if (animationFrameId !== undefined) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = undefined;
            }
            if (animationDelayTimeoutId !== undefined) {
                clearTimeout(animationDelayTimeoutId);
                animationDelayTimeoutId = undefined;
            }
            smallerPressed = false;
            biggerPressed = false;
            svg.classList.add('hidden');
            parent.style.display = 'none';
            parent.removeEventListener('pointerdown', pointerdown);
            parent.removeEventListener('pointermove', pointermove);
            parent.removeEventListener('pointerup', pointerup);
            parent.removeEventListener('wheel', wheel);
        };

        events.on('tool.brushSelection.smaller', (down: boolean | undefined) => {
            if (down === undefined) {
                // fired from scroll wheel (no down parameter)
                radius = Math.max(1, radius / 1.05);
                circle.setAttribute('r', radius.toString());
            } else if (down) {
                // key press: apply one step immediately, then delay before starting animation
                if (!smallerPressed) {
                    applyStep('smaller');
                }
                smallerPressed = true;
                animationDelayTimeoutId = window.setTimeout(() => {
                    if (smallerPressed) {
                        startAnimation();
                    }
                }, 400);
            } else {
                // key release
                smallerPressed = false;
                if (animationDelayTimeoutId !== undefined) {
                    clearTimeout(animationDelayTimeoutId);
                    animationDelayTimeoutId = undefined;
                }
            }
        });

        events.on('tool.brushSelection.bigger', (down: boolean) => {
            if (down === undefined) {
                // fired from scroll wheel (no down parameter)
                radius = Math.min(500, radius * 1.05);
                circle.setAttribute('r', radius.toString());
            } else if (down) {
                // key press: apply one step immediately, then delay before starting animation
                if (!biggerPressed) {
                    applyStep('bigger');
                }
                biggerPressed = true;
                animationDelayTimeoutId = window.setTimeout(() => {
                    if (biggerPressed) {
                        startAnimation();
                    }
                }, 400);
            } else {
                // key release
                biggerPressed = false;
                if (animationDelayTimeoutId !== undefined) {
                    clearTimeout(animationDelayTimeoutId);
                    animationDelayTimeoutId = undefined;
                }
            }
        });
    }
}

export { BrushSelection };
