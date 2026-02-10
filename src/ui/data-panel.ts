import { BooleanInput, Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { Splat } from '../splat';
import { rgb2hsv } from './color';
import { Histogram } from './histogram';
import { State } from '../splat-state';
import { localize } from './localization';

const SH_C0 = 0.28209479177387814;

const scaleFunc = (v: number) => Math.exp(v);
const colorFunc = (v: number) => 0.5 + v * SH_C0;
const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));

const dataFuncs = {
    scale_0: scaleFunc,
    scale_1: scaleFunc,
    scale_2: scaleFunc,
    f_dc_0: colorFunc,
    f_dc_1: colorFunc,
    f_dc_2: colorFunc,
    opacity: sigmoid
};

class DataPanel extends Container {
    constructor(events: Events, args = { }) {
        args = {
            ...args,
            id: 'data-panel',
            hidden: true,
            flex: true,
            flexDirection: 'row'
        };

        super(args);

        // resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.id = 'data-panel-resize-handle';
        this.dom.appendChild(resizeHandle);

        let resizing = false;
        let startY = 0;
        let startHeight = 0;

        resizeHandle.addEventListener('pointerdown', (event: PointerEvent) => {
            if (event.isPrimary) {
                resizing = true;
                startY = event.clientY;
                startHeight = this.dom.offsetHeight;
                resizeHandle.setPointerCapture(event.pointerId);
                event.preventDefault();
            }
        });

        resizeHandle.addEventListener('pointermove', (event: PointerEvent) => {
            if (resizing) {
                const delta = startY - event.clientY;
                const newHeight = Math.max(120, Math.min(1000, startHeight + delta));
                this.dom.style.height = `${newHeight}px`;
            }
        });

        resizeHandle.addEventListener('pointerup', (event: PointerEvent) => {
            if (resizing && event.isPrimary) {
                resizeHandle.releasePointerCapture(event.pointerId);
                resizing = false;
            }
        });

        // build the data controls
        const controlsContainer = new Container({
            id: 'data-controls-container'
        });

        const controls = new Container({
            id: 'data-controls'
        });

        // track the selected data property
        let selectedDataProp = 'x';

        // data list box
        const dataListBox = new Container({
            id: 'data-list-box'
        });

        const populateDataSelector = (splat: Splat) => {
            const localizations: any = {
                x: 'X',
                y: 'Y',
                z: 'Z',
                distance: localize('panel.splat-data.distance'),
                volume: localize('panel.splat-data.volume'),
                'surface-area': localize('panel.splat-data.surface-area'),
                scale_0: localize('panel.splat-data.scale-x'),
                scale_1: localize('panel.splat-data.scale-y'),
                scale_2: localize('panel.splat-data.scale-z'),
                f_dc_0: localize('panel.splat-data.red'),
                f_dc_1: localize('panel.splat-data.green'),
                f_dc_2: localize('panel.splat-data.blue'),
                opacity: localize('panel.splat-data.opacity'),
                hue: localize('panel.splat-data.hue'),
                saturation: localize('panel.splat-data.saturation'),
                value: localize('panel.splat-data.value')
            };

            const dataProps = splat.splatData.getElement('vertex').properties.map(p => p.name);
            const derivedProps = ['distance', 'volume', 'surface-area', 'hue', 'saturation', 'value'];
            const suppressedProps = ['state', 'transform'].concat(new Array(45).fill('').map((_, i) => `f_rest_${i}`));
            const allProps = dataProps.concat(derivedProps).filter(p => !suppressedProps.includes(p));

            // clear existing items
            dataListBox.dom.innerHTML = '';

            allProps.forEach((prop) => {
                const item = document.createElement('div');
                item.classList.add('data-list-item');
                if (prop === selectedDataProp) {
                    item.classList.add('active');
                }
                item.textContent = localizations[prop] ?? prop;

                item.addEventListener('click', () => {
                    selectedDataProp = prop;
                    dataListBox.dom.querySelectorAll('.data-list-item').forEach((el) => {
                        el.classList.remove('active');
                    });
                    item.classList.add('active');
                    updateHistogram(); // eslint-disable-line no-use-before-define
                });

                dataListBox.dom.appendChild(item);
            });
        };

        const logScale = new Container({
            class: 'control-parent'
        });

        const logScaleLabel = new Label({
            class: 'control-label',
            text: localize('panel.splat-data.log-scale')
        });

        const logScaleValue = new BooleanInput({
            class: 'control-element',
            value: false
        });

        logScale.append(logScaleLabel);
        logScale.append(logScaleValue);

        controls.append(logScale);
        controls.append(dataListBox);

        controlsContainer.append(controls);

        // build histogram
        const histogram = new Histogram(256, 128);

        const histogramContainer = new Container({
            id: 'histogram-container'
        });

        histogramContainer.dom.appendChild(histogram.canvas);

        this.append(controlsContainer);
        this.append(histogramContainer);

        // current splat
        let splat: Splat;

        // returns a function which will interpret the splat data for purposes of
        // viewing it in the histogram.
        // the returned values will depend on the currently selected data type:
        //   * some value functions return the raw splat data, like 'x'.
        //   * other value functions must transform the data for histogram visualization
        //     (for example 'scale_0', which must be exponentiated).
        //   * still other values are calculated/derived from multiple values of splat
        //     data like 'volume' and 'surface area'.
        const getValueFunc = () => {
            // @ts-ignore
            const dataFunc = dataFuncs[selectedDataProp];
            const data = splat.splatData.getProp(selectedDataProp);

            let func: (i: number) => number;
            if (dataFunc && data) {
                func = i => dataFunc(data[i]);
            } else {
                switch (selectedDataProp) {
                    case 'volume': {
                        const sx = splat.splatData.getProp('scale_0');
                        const sy = splat.splatData.getProp('scale_1');
                        const sz = splat.splatData.getProp('scale_2');
                        func = i => scaleFunc(sx[i]) * scaleFunc(sy[i]) * scaleFunc(sz[i]);
                        break;
                    }
                    case 'distance': {
                        const x = splat.splatData.getProp('x');
                        const y = splat.splatData.getProp('y');
                        const z = splat.splatData.getProp('z');
                        func = i => Math.sqrt(x[i] ** 2 + y[i] ** 2 + z[i] ** 2);
                        break;
                    }
                    case 'surface-area': {
                        const sx = splat.splatData.getProp('scale_0');
                        const sy = splat.splatData.getProp('scale_1');
                        const sz = splat.splatData.getProp('scale_2');
                        func = i => scaleFunc(sx[i]) ** 2 + scaleFunc(sy[i]) ** 2 + scaleFunc(sz[i]) ** 2;
                        break;
                    }
                    case 'hue': {
                        const r = splat.splatData.getProp('f_dc_0');
                        const g = splat.splatData.getProp('f_dc_1');
                        const b = splat.splatData.getProp('f_dc_2');
                        func = i => rgb2hsv({ r: colorFunc(r[i]), g: colorFunc(g[i]), b: colorFunc(b[i]) }).h * 360;
                        break;
                    }
                    case 'saturation': {
                        const r = splat.splatData.getProp('f_dc_0');
                        const g = splat.splatData.getProp('f_dc_1');
                        const b = splat.splatData.getProp('f_dc_2');
                        func = i => rgb2hsv({ r: colorFunc(r[i]), g: colorFunc(g[i]), b: colorFunc(b[i]) }).s;
                        break;
                    }
                    case 'value': {
                        const r = splat.splatData.getProp('f_dc_0');
                        const g = splat.splatData.getProp('f_dc_1');
                        const b = splat.splatData.getProp('f_dc_2');
                        func = i => rgb2hsv({ r: colorFunc(r[i]), g: colorFunc(g[i]), b: colorFunc(b[i]) }).v;
                        break;
                    }
                    default:
                        func = i => data[i];
                        break;
                }
            }

            return func;
        };

        const updateHistogram = () => {
            if (!splat || this.hidden) return;

            const state = splat.splatData.getProp('state') as Uint8Array;
            if (state) {
                // update histogram
                const func = getValueFunc();

                histogram.update({
                    count: state.length,
                    valueFunc: i => ((state[i] === 0 || state[i] === State.selected) ? func(i) : undefined),
                    selectedFunc: i => state[i] === State.selected,
                    logScale: logScaleValue.value
                });
            }
        };

        events.on('splat.stateChanged', (splat_: Splat) => {
            splat = splat_;
            updateHistogram();
        });

        events.on('selection.changed', (selection: Element) => {
            if (selection instanceof Splat) {
                splat = selection;
                populateDataSelector(splat);
                updateHistogram();
            }
        });

        events.on('statusBar.panelChanged', (panel: string | null) => {
            if (panel === 'splatData') {
                // defer update to next frame so the panel is visible first
                requestAnimationFrame(() => {
                    updateHistogram();

                    // scroll the selected list item into view
                    const activeItem = dataListBox.dom.querySelector('.data-list-item.active');
                    if (activeItem) {
                        activeItem.scrollIntoView({ block: 'nearest' });
                    }
                });
            }
        });

        logScaleValue.on('change', updateHistogram);

        const popupContainer = new Container({
            id: 'data-panel-popup-container',
            hidden: true
        });

        const popupLabel = new Label({
            id: 'data-panel-popup-label',
            text: '',
            unsafe: true
        });

        popupContainer.append(popupLabel);
        this.append(popupContainer);

        histogram.events.on('showOverlay', () => {
            popupContainer.hidden = false;
        });

        histogram.events.on('hideOverlay', () => {
            popupContainer.hidden = true;
        });

        histogram.events.on('updateOverlay', (info: any) => {
            popupContainer.style.left = `${info.x + 14}px`;
            popupContainer.style.top = `${info.y}px`;

            const binValue = info.value.toFixed(2);
            const count = info.selected + info.unselected;
            const percentage = (info.total ? count / info.total * 100 : 0).toFixed(2);

            popupLabel.text = `value: ${binValue} cnt: ${count} (${percentage}%) sel: ${info.selected}`;
        });

        // highlight
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('id', 'histogram-svg');

        // create rect element
        const rect = document.createElementNS(svg.namespaceURI, 'rect') as SVGRectElement;
        rect.setAttribute('id', 'highlight-rect');
        rect.setAttribute('fill', 'rgba(255, 102, 0, 0.2)');
        rect.setAttribute('stroke', '#f60');
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('stroke-dasharray', '5, 5');

        svg.appendChild(rect);
        histogramContainer.dom.appendChild(svg);

        histogram.events.on('highlight', (info: any) => {
            rect.setAttribute('x', info.x.toString());
            rect.setAttribute('y', info.y.toString());
            rect.setAttribute('width', info.width.toString());
            rect.setAttribute('height', info.height.toString());

            svg.style.display = 'inline';
        });

        histogram.events.on('select', (op: string, start: number, end: number) => {
            svg.style.display = 'none';

            const state = splat.splatData.getProp('state') as Uint8Array;
            const selection = state.some(s => s === State.selected);
            const func = getValueFunc();

            // perform selection
            events.fire('select.pred', op, (i: number) => {
                if (state[i] !== 0 && state[i] !== State.selected) {
                    return false;
                }

                // select all splats that fall in the given bucket range (inclusive)
                const value = func(i);
                const bucket = histogram.histogram.valueToBucket(value);
                return bucket >= start && bucket <= end;
            });
        });
    }
}

export { DataPanel };
