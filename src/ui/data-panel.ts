import { BooleanInput, Container, Label, Panel, SelectInput } from 'pcui';
import { Events } from '../events';
import { Splat } from '../splat';
import { Histogram } from './histogram';
import { State } from '../edit-ops';

const SH_C0 = 0.28209479177387814;

const identity = (v: number) => v;
const scaleFunc = (v: number) => Math.exp(v);
const colorFunc = (v: number) => 0.5 + v * SH_C0;
const sigmoid = (v: number) => {
    if (v > 0) {
        return 1 / (1 + Math.exp(-v));
    }

    const t = Math.exp(v);
    return t / (1 + t);
};

const dataFuncs = {
    x: identity,
    y: identity,
    z: identity,
    scale_0: scaleFunc,
    scale_1: scaleFunc,
    scale_2: scaleFunc,
    f_dc_0: colorFunc,
    f_dc_1: colorFunc,
    f_dc_2: colorFunc,
    opacity: sigmoid
};

class DataPanel extends Panel {
    constructor(events: Events, args = { }) {
        args = Object.assign(args, {
            headerText: 'Data',
            id: 'data-panel',
            resizable: 'top',
            resizeMax: 1000,
            collapsed: true,
            collapsible: true,
            collapseHorizontally: false,
            flex: true,
            flexDirection: 'row'
        });

        super(args);

        // create a seperator label
        const sep = (parent: Container, labelText: string) => {
            const container = new Container({
                class: 'control-parent',
                id: 'sep-container'
            });

            container.class.add('sep-container');

            const label = new Label({
                class: 'contol-element-expand',
                text: labelText
            });

            container.append(label);

            parent.append(container);
        }

        // create a new data label
        const dataLabel = (parent: Container, labelText: string) => {
            const container = new Container({
                class: 'control-parent'
            });

            const label = new Label({
                class: 'control-label',
                text: labelText
            });

            const value = new Label({
                class: 'control-element-expand'
            });

            container.append(label);
            container.append(value);

            parent.append(container);

            return value;
        };


        // create data controls
        const controlsContainer = new Container({
            id: 'data-controls-container'
        });

        const controls = new Container({
            id: 'data-controls'
        });

        sep(controls, 'Histogram');

        const dataSelector = new SelectInput({
            class: 'control-element-expand',
            defaultValue: 'scale_0',
            options: [
                { v: 'x', t: 'X' },
                { v: 'y', t: 'Y' },
                { v: 'z', t: 'Z' },
                { v: 'volume', t: 'Volume' },
                { v: 'scale_0', t: 'Scale X' },
                { v: 'scale_1', t: 'Scale Y' },
                { v: 'scale_2', t: 'Scale Z' },
                { v: 'f_dc_0', t: 'Red' },
                { v: 'f_dc_1', t: 'Green' },
                { v: 'f_dc_2', t: 'Blue' },
                { v: 'opacity', t: 'Opacity' },
            ]
        });

        const logScale = new Container({
            class: 'control-parent'
        });

        const logScaleLabel = new Label({
            class: 'control-label',
            text: 'Log Scale'
        });

        const logScaleValue = new BooleanInput({
            class: 'control-element',
            value: false
        });

        logScale.append(logScaleLabel);
        logScale.append(logScaleValue);

        controls.append(dataSelector);
        controls.append(logScale);

        sep(controls, 'Totals')

        const splatsValue = dataLabel(controls, 'Splats');
        const selectedValue = dataLabel(controls, 'Selected');
        const hiddenValue = dataLabel(controls, 'Hidden');
        const deletedValue = dataLabel(controls, 'Deleted');

        controlsContainer.append(controls);

        // build histogram
        const histogram = new Histogram(256, 256);

        const histogramContainer = new Container({
            id: 'histogram-container'
        });

        histogramContainer.dom.appendChild(histogram.canvas);

        this.content.append(histogramContainer);
        this.content.append(controlsContainer);

        // current splat
        let splat: Splat;

        // returns a function that calculates the value for the current data selector
        const getValueFunc = () => {
            // @ts-ignore
            const dataFunc = dataFuncs[dataSelector.value];
            const data = splat.splatData.getProp(dataSelector.value);

            let func: (i: number) => number;
            if (dataFunc && data) {
                func = (i) => dataFunc(data[i]);
            } else if (dataSelector.value === 'volume') {
                const sx = splat.splatData.getProp('scale_0');
                const sy = splat.splatData.getProp('scale_1');
                const sz = splat.splatData.getProp('scale_2');
                func = (i) => scaleFunc(sx[i]) * scaleFunc(sy[i]) * scaleFunc(sz[i]);
            } else {
                func = (i) => undefined;
            }

            return func;
        };

        const updateHistogram = () => {
            if (!splat || this.collapsed) return;

            const state = splat.splatData.getProp('state') as Uint8Array;
            if (state) {
                // calculate totals
                let selected = 0;
                let hidden = 0;
                let deleted = 0;
                for (let i = 0; i < state.length; ++i) {
                    if (state[i] & State.deleted) {
                        deleted++;
                    } else if (state[i] & State.hidden) {
                        hidden++;
                    } else if (state[i] & State.selected) {
                        selected++;
                    }
                }

                splatsValue.text = state.length.toString();
                selectedValue.text = selected.toString();
                hiddenValue.text = hidden.toString();
                deletedValue.text = deleted.toString();

                // update histogram
                const func = getValueFunc();

                // update histogram
                histogram.update(
                    state.length,
                    (i) => (selected === 0 ? state[i] === 0 : state[i] === State.selected) ? func(i) : undefined,
                    {
                        logScale: logScaleValue.value
                    }
                );
            }
        };

        this.on('expand', () => {
            updateHistogram();
        });

        events.on('splat.stateChanged', (splat_: Splat) => {
            splat = splat_;
            updateHistogram();
        });

        events.on('selection.changed', (selection: Element) => {
            if (selection instanceof Splat) {
                splat = selection;
                updateHistogram();
            }
        });

        dataSelector.on('change', updateHistogram);
        logScaleValue.on('change', updateHistogram);

        const popupContainer = new Container({
            id: 'data-panel-popup-container',
            hidden: true
        });

        const popupLabel = new Label({
            id: 'data-panel-popup-label',
            text: ''
        });

        popupContainer.append(popupLabel);
        this.content.append(popupContainer);

        histogram.events.on('showOverlay', () => {
            popupContainer.hidden = false;
        });

        histogram.events.on('hideOverlay', () => {
            popupContainer.hidden = true;
        });

        histogram.events.on('updateOverlay', (info: any) => {
            popupContainer.style.left = `${info.x + 14}px`;
            popupContainer.style.top = `${info.y}px`;
            popupLabel.text = `value: ${info.value.toFixed(2)} - cnt: ${info.count} (${(info.total ? info.count / info.total * 100 : 0).toFixed(2)}%)`;
        });

        // highlight
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute('id', 'histogram-svg');

        // create rect element
        const rect = document.createElementNS(svg.namespaceURI, 'rect') as SVGRectElement;
        rect.setAttribute('id', 'highlight-rect');
        rect.setAttribute('fill', 'rgba(255, 0, 0, 0.2)');
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

        histogram.events.on('select', (start: number, end: number) => {
            svg.style.display = 'none';

            const state = splat.splatData.getProp('state') as Uint8Array;
            const selection = state.some((s) => s === State.selected);
            const func = getValueFunc();

            // perform selection
            events.fire('select.pred', 'set', (i: number) => {
                if (state[i] !== (selection ? State.selected : 0)) {
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
