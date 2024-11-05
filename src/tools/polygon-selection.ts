import { Events } from "../events";

type Point = {x: number, y: number};

class PolygonSelection {
    activate: () => void;
    deactivate: () => void;

    constructor(events: Events, parent: HTMLElement) {
        let points: Point[] = [];
        let currentPoint: Point = null;

        // create svg
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = 'polygon-select-svg';
        svg.classList.add('select-svg');

        // create polyline element
        const polyline = document.createElementNS(svg.namespaceURI, 'polyline') as SVGPolylineElement;
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke-width', '1');
        polyline.setAttribute('stroke-dasharray', '5, 5');
        polyline.setAttribute('stroke-dashoffset', '0');

        // create canvas
        const selectCanvas = document.createElement('canvas');
        selectCanvas.id = 'polygon-select-canvas';

        const context = selectCanvas.getContext('2d');
        context.globalCompositeOperation = 'copy';

        const prev = { x: 0, y: 0 };
        let dragId: number | undefined;

        const paint = () => {
            polyline.setAttribute('points', [...points, currentPoint].reduce((prev, current) => prev + `${current.x}, ${current.y} `, ""));
            polyline.setAttribute('stroke', isClosed() ? '#fa6' : '#f60');
        };

        const isClosed = () => points.length > 1 && Math.abs(currentPoint.x - points[0].x) < 4 && Math.abs(currentPoint.y - points[0].y) < 4;

        const pointermove = (e: PointerEvent) => {
            currentPoint = {x: e.offsetX, y: e.offsetY};

            if(points.length > 0){    
                paint();
            }
        };

        const pointerdown = (e: PointerEvent) => {
            if (points.length > 0 || (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary)) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        const pointerup = (e: PointerEvent) => {
            if (e.pointerType === 'mouse' ? e.button === 0 : e.isPrimary) {
                e.preventDefault();
                e.stopPropagation();
    
                if(isClosed())
                    commitSelection(e);
                else
                    points.push(currentPoint);
            }
        };

        const dblclick = (e: PointerEvent) => {   
            if(points.length > 0){
                points.push(currentPoint);
                
                e.preventDefault();
                e.stopPropagation();

                commitSelection(e);
            }
        };

        const commitSelection = (e: PointerEvent) => {
            // initialize canvas
            if (selectCanvas.width !== parent.clientWidth || selectCanvas.height !== parent.clientHeight) {
                selectCanvas.width = parent.clientWidth;
                selectCanvas.height = parent.clientHeight;
            }

            // clear canvas
            context.clearRect(0, 0, selectCanvas.width, selectCanvas.height);

            context.beginPath();
            context.fillStyle = '#f60';
            context.beginPath();
            points.forEach((p, idx) => {
                if(idx === 0){
                    context.moveTo(p.x, p.y);
                }
                else {
                    context.lineTo(p.x, p.y);    
                }
            });
            context.closePath();
            context.fill();

            events.fire(
                'select.byMask',
                e.shiftKey ? 'add' : (e.ctrlKey ? 'remove' : 'set'),
                selectCanvas,
                context
            );

            points = [];
            paint();
        };

        this.activate = () => {
            svg.style.display = 'inline';
            parent.style.display = 'block';
            parent.addEventListener('pointerdown', pointerdown);
            parent.addEventListener('pointermove', pointermove);
            parent.addEventListener('pointerup', pointerup);
            parent.addEventListener('dblclick', dblclick);
        };

        this.deactivate = () => {
            // cancel active operation
            svg.style.display = 'none';
            parent.style.display = 'none';
            parent.removeEventListener('pointerdown', pointerdown);
            parent.removeEventListener('pointermove', pointermove);
            parent.removeEventListener('pointerup', pointerup);
            parent.removeEventListener('dblclick', dblclick);
            points = [];
            paint();
        };

        svg.appendChild(polyline);
        parent.appendChild(svg);
    }
}

export { PolygonSelection };
