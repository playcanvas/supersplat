import { Container, Label, NumericInput, SelectInput, SliderInput } from '@playcanvas/pcui';

import type { DepthMethod } from '../depth-renderer';
import { DEPTH_METHODS } from '../depth-renderer';
import type { Events } from '../events';

import { i18n } from './localization';

// Viewport and export dialogs use the same depth settings. Normals always use
// weighted mean without changing the depth view's algorithm selection.
const createDepthControls = (events: Events, mode: () => string, overlay = false) => {
    const container = new Container({ class: 'depth-controls' });
    const rows: Record<string, Container> = {};
    const rowClass = overlay ? 'settings-panel-row' : 'row';
    const labelClass = overlay ? 'settings-panel-row-label' : 'label';
    const add = (name: string, widget: SelectInput | SliderInput | NumericInput) => {
        const row = new Container({ class: rowClass });
        const label = new Label({ class: labelClass });
        i18n.bindText(label, `panel.overlays.${name}`);
        row.append(label);
        row.append(widget);
        container.append(row);
        rows[name] = row;
        return widget;
    };
    const selectClass = overlay ? 'settings-panel-row-select' : 'select';
    const sliderClass = overlay ? 'settings-panel-row-slider' : 'slider';
    const method = add(
        'depth-method',
        new SelectInput({
            class: selectClass,
            options: DEPTH_METHODS.map((v) => ({ v, t: i18n.t(`panel.overlays.depth-method.${v}`) }))
        })
    ) as SelectInput;
    const rangeMode = add(
        'depth-range-mode',
        new SelectInput({
            class: selectClass,
            options: ['auto', 'scene', 'fixed'].map((v) => ({ v, t: i18n.t(`panel.overlays.depth-range.${v}`) }))
        })
    ) as SelectInput;
    const numeric = (name: string, event: string, initial: number) => {
        const widget = add(name, new NumericInput({ class: sliderClass, value: initial, precision: 3 }));
        widget.on('change', (value: number) => events.fire(`view.set${event}`, value));
        events.on(`view.${event[0].toLowerCase()}${event.slice(1)}`, (value: number) => {
            widget.value = value;
        });
        return widget;
    };
    const near = numeric('depth-range-near', 'DepthRangeNear', 0);
    const far = numeric('depth-range-far', 'DepthRangeFar', 10);
    const slider = (name: string, event: string, initial: number, min: number, max: number) => {
        const widget = add(name, new SliderInput({ class: sliderClass, min, max, precision: 3, value: initial }));
        widget.on('change', (value: number) => events.fire(`view.set${event}`, value));
        events.on(`view.${event[0].toLowerCase()}${event.slice(1)}`, (value: number) => {
            widget.value = value;
        });
        return widget;
    };
    const contribution = slider('depth-contribution', 'DepthContribution', 0.02, 0, 1);
    const coverage = slider('depth-coverage', 'DepthCoverage', 0.05, 0, 1);
    const quantile = slider('depth-quantile', 'DepthQuantile', 0.5, 0.01, 0.99);
    const curvatureGain = slider('curvature-gain', 'CurvatureGain', 0.5, 0.1, 10);
    const edgeGain = slider('edge-gain', 'EdgeGain', 1, 0.1, 10);
    const sync = () => {
        if (!events.functions.has('view.depthMethod')) return;
        const surface = mode() === 'normals' || mode() === 'curvature';
        const diagnostic = mode() === 'depth' || mode() === 'edge' || surface;
        container.hidden = !diagnostic;
        method.value = surface ? 'mean' : events.invoke('view.depthMethod');
        rangeMode.value = events.invoke('view.depthRangeMode');
        contribution.value = events.invoke('view.depthContribution');
        coverage.value = events.invoke('view.depthCoverage');
        quantile.value = events.invoke('view.depthQuantile');
        curvatureGain.value = events.invoke('view.curvatureGain');
        edgeGain.value = events.invoke('view.edgeGain');
        near.value = events.invoke('view.depthRangeNear');
        far.value = events.invoke('view.depthRangeFar');
        rows['depth-method'].hidden = mode() !== 'depth';
        rows['curvature-gain'].hidden = mode() !== 'curvature';
        rows['edge-gain'].hidden = mode() !== 'edge';
        rows['depth-contribution'].hidden = mode() === 'edge';
        rows['depth-coverage'].hidden = mode() === 'edge';
        rows['depth-quantile'].hidden = mode() !== 'depth' || method.value !== 'median';
        rows['depth-range-mode'].hidden = mode() !== 'depth';
        rows['depth-range-near'].hidden = mode() !== 'depth' || rangeMode.value !== 'fixed';
        rows['depth-range-far'].hidden = mode() !== 'depth' || rangeMode.value !== 'fixed';
    };
    method.on('change', (value: DepthMethod) => {
        if (mode() === 'depth') events.fire('view.setDepthMethod', value);
        sync();
    });
    rangeMode.on('change', (value: string) => {
        events.fire('view.setDepthRangeMode', value);
        sync();
    });
    events.on('view.depthMethod', sync);
    events.on('view.depthRangeMode', sync);
    return {
        container,
        sync,
        method: (): DepthMethod =>
            mode() === 'normals' || mode() === 'curvature' ? 'mean' : (method.value as DepthMethod)
    };
};

export { createDepthControls };
