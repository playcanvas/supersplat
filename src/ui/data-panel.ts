import { BooleanInput, Container, Label } from '@playcanvas/pcui';
import { Mat4 } from 'playcanvas';

import { Element } from '../element';
import { Events } from '../events';
import { Splat } from '../splat';
import { Histogram } from './histogram';
import { i18n } from './localization';
import { Tooltips } from './tooltips';

// gpu propMode constants. these must match the propMode dispatch in
// src/shaders/splat-value-shader.ts.
//
// modes 5..7 and 18..20 read the final on-screen color (DC + evaluated SH for
// the current view direction), so they are camera-dependent.
// modes 66..68 read the raw f_dc_N coefficients reconstructed from the
// already-decoded splatColor texture.
const PROP_MODE: { [key: string]: number } = {
    x: 0,
    y: 1,
    z: 2,
    distance: 3,
    'camera-depth': 4,
    red: 5,
    green: 6,
    blue: 7,
    opacity: 8,
    scale_0: 9,
    scale_1: 10,
    scale_2: 11,
    volume: 12,
    'surface-area': 13,
    rot_0: 14,
    rot_1: 15,
    rot_2: 16,
    rot_3: 17,
    hue: 18,
    saturation: 19,
    value: 20,
    f_dc_0: 66,
    f_dc_1: 67,
    f_dc_2: 68
};

// f_rest_N maps to mode (21 + N). max 45 SH coefficients (shBands 3).
const F_REST_BASE_MODE = 21;

const SH_NUM_COEFFS: { [k: number]: number } = { 0: 0, 1: 3, 2: 8, 3: 15 };

const propModeFor = (prop: string): number | undefined => {
    if (prop in PROP_MODE) return PROP_MODE[prop];
    const m = /^f_rest_(\d+)$/.exec(prop);
    if (m) return F_REST_BASE_MODE + parseInt(m[1], 10);
    return undefined;
};

// final-color (DC + evaluated SH for current view direction) — depends on
// world-space splat position, camera position and ColorGrade.
const isFinalColorMode = (mode: number) => {
    return (mode >= 5 && mode <= 7) || (mode >= 18 && mode <= 20);
};

// what kinds of state changes affect a given prop's histogram. mirrors the
// previous per-event filtering, but consulted only inside hash().
const isCameraDependentMode = (mode: number) => mode === 4 /* camera-depth */ || isFinalColorMode(mode);
const isPositionDependentMode = (mode: number) => {
    return mode === 0 || mode === 1 || mode === 2 || // x / y / z
        mode === 3 || mode === 4 ||                  // distance / camera-depth
        isFinalColorMode(mode);
};
// ColorGrade-dependent. f_dc_* (raw DC, modes 66..68) bypasses ColorGrade.
const isColorGradeDependentMode = (mode: number) => mode === 8 /* opacity */ || isFinalColorMode(mode);

// every input that can require a histogram refresh. subscribers update one
// field and call tick(); the hash collapses no-op changes into a fast path
// and lets the existing per-prop filtering live in pure hash().
type HistogramInputs = {
    splatId: number;
    mode: number;
    onScreenOnly: boolean;
    logScale: boolean;
    cameraVersion: number;
    stateVersion: number;
    colorGradeVersion: number;
    positionsVersion: number;
};

const hashInputs = (i: HistogramInputs): string => {
    const m = i.mode;
    const camMatters = i.onScreenOnly || isCameraDependentMode(m);
    const posMatters = isPositionDependentMode(m);
    const cgMatters = isColorGradeDependentMode(m);
    return `${i.splatId}|${m}|${i.onScreenOnly ? 1 : 0}|${i.logScale ? 1 : 0}|` +
        `${camMatters ? i.cameraVersion : 0}|${i.stateVersion}|` +
        `${cgMatters ? i.colorGradeVersion : 0}|${posMatters ? i.positionsVersion : 0}`;
};

class DataPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = { }) {
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
            }
        });

        resizeHandle.addEventListener('lostpointercapture', () => {
            resizing = false;
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

        const logScale = new Container({
            class: 'data-panel-toggle-row',
            flex: true,
            flexDirection: 'row'
        });

        const logScaleLabel = new Label({
            class: 'data-panel-toggle-label'
        });
        i18n.bindText(logScaleLabel, 'panel.splat-data.log-scale');

        const logScaleValue = new BooleanInput({
            type: 'toggle',
            class: 'data-panel-toggle',
            value: false
        });

        logScale.append(logScaleLabel);
        logScale.append(logScaleValue);

        const showAll = new Container({
            class: 'data-panel-toggle-row',
            flex: true,
            flexDirection: 'row'
        });

        const showAllLabel = new Label({
            class: 'data-panel-toggle-label'
        });
        i18n.bindText(showAllLabel, 'panel.splat-data.show-all');

        const showAllValue = new BooleanInput({
            type: 'toggle',
            class: 'data-panel-toggle',
            value: false
        });

        showAll.append(showAllLabel);
        showAll.append(showAllValue);

        const onScreenOnly = new Container({
            class: 'data-panel-toggle-row',
            flex: true,
            flexDirection: 'row'
        });

        const onScreenOnlyLabel = new Label({
            class: 'data-panel-toggle-label'
        });
        i18n.bindText(onScreenOnlyLabel, 'panel.splat-data.on-screen-only');

        const onScreenOnlyValue = new BooleanInput({
            type: 'toggle',
            class: 'data-panel-toggle',
            value: false
        });

        onScreenOnly.append(onScreenOnlyLabel);
        onScreenOnly.append(onScreenOnlyValue);

        const populateDataSelector = (splat: Splat) => {
            // default prop localizations - order defines display order. "red",
            // "green", "blue" and HSV here are the final on-screen color (DC
            // + evaluated SH for the current view direction).
            const localizations: any = {
                x: `${i18n.t('panel.splat-data.position')} X`,
                y: `${i18n.t('panel.splat-data.position')} Y`,
                z: `${i18n.t('panel.splat-data.position')} Z`,
                opacity: i18n.t('panel.splat-data.opacity'),
                red: i18n.t('panel.splat-data.red'),
                green: i18n.t('panel.splat-data.green'),
                blue: i18n.t('panel.splat-data.blue'),
                scale_0: i18n.t('panel.splat-data.scale-x'),
                scale_1: i18n.t('panel.splat-data.scale-y'),
                scale_2: i18n.t('panel.splat-data.scale-z'),
                rot_0: `${i18n.t('panel.splat-data.quat')} W`,
                rot_1: `${i18n.t('panel.splat-data.quat')} X`,
                rot_2: `${i18n.t('panel.splat-data.quat')} Y`,
                rot_3: `${i18n.t('panel.splat-data.quat')} Z`,
                distance: i18n.t('panel.splat-data.distance'),
                'camera-depth': i18n.t('panel.splat-data.camera-depth'),
                volume: i18n.t('panel.splat-data.volume'),
                'surface-area': i18n.t('panel.splat-data.surface-area'),
                hue: i18n.t('panel.splat-data.hue'),
                saturation: i18n.t('panel.splat-data.saturation'),
                value: i18n.t('panel.splat-data.value')
            };

            // "Show All" extras: raw DC coefficients first, then spherical
            // harmonics coefficients labelled with their channel (R/G/B) and
            // within-channel index. all filtered by the splat's actual SH band
            // count so we never offer a mode the GPU shader can't decode.
            const extras: any = {
                f_dc_0: i18n.t('panel.splat-data.dc-red'),
                f_dc_1: i18n.t('panel.splat-data.dc-green'),
                f_dc_2: i18n.t('panel.splat-data.dc-blue')
            };
            const shBands = (splat.entity.gsplat.instance.resource as any).shBands ?? 0;
            const numCoeffs = SH_NUM_COEFFS[shBands] ?? 0;
            const channels = ['R', 'G', 'B'];
            const maxFRest = numCoeffs * 3;
            for (let i = 0; i < maxFRest; i++) {
                const channel = channels[Math.floor(i / numCoeffs)];
                const idx = i % numCoeffs;
                extras[`f_rest_${i}`] = `${channel} ${i18n.t('panel.splat-data.sh')} ${idx}`;
            }

            const dataProps = splat.splatData.getElement('vertex').properties.map(p => p.name);
            const derivedProps = ['distance', 'camera-depth', 'volume', 'surface-area', 'red', 'green', 'blue', 'hue', 'saturation', 'value'];
            const availableProps = new Set(dataProps.concat(derivedProps));

            // build ordered default props from localizations keys, filtered to available
            const defaultProps = Object.keys(localizations).filter(p => availableProps.has(p));

            // build ordered extra props from extras keys, filtered to available
            const extraProps = showAllValue.value ?
                Object.keys(extras).filter(p => availableProps.has(p)) :
                [];

            const allProps = [...defaultProps, ...extraProps];

            // if the current selection is no longer in the list (e.g. "All
            // Properties" turned off after picking f_rest_5, or selection moved
            // to a splat with fewer SH bands), fall back to the first available
            // prop so inputs.mode doesn't stay pinned to an unsupported propMode
            // with no active row to indicate it.
            if (allProps.length > 0 && !allProps.includes(selectedDataProp)) {
                selectedDataProp = allProps[0];
                // eslint-disable-next-line no-use-before-define
                inputs.mode = propModeFor(selectedDataProp) ?? 0;
            }

            // clear existing items
            dataListBox.dom.innerHTML = '';

            allProps.forEach((prop) => {
                const item = document.createElement('div');
                item.classList.add('data-list-item');
                if (prop === selectedDataProp) {
                    item.classList.add('active');
                }
                item.textContent = localizations[prop] ?? extras[prop] ?? prop;

                item.addEventListener('click', () => {
                    selectedDataProp = prop;
                    // eslint-disable-next-line no-use-before-define
                    inputs.mode = propModeFor(prop) ?? 0;
                    dataListBox.dom.querySelectorAll('.data-list-item').forEach((el) => {
                        el.classList.remove('active');
                    });
                    item.classList.add('active');
                    tick(); // eslint-disable-line no-use-before-define
                });

                dataListBox.dom.appendChild(item);
            });
        };

        // ordered: visible-only (histogram filter), log scale (histogram
        // display), then all-properties (list filter, sitting right above the
        // property list it affects).
        controls.append(onScreenOnly);
        controls.append(logScale);
        controls.append(showAll);
        controls.append(dataListBox);

        // tooltips explain what each toggle actually does. registered on the
        // row containers so the entire row (label + toggle) shares one
        // hover target.
        tooltips.register(onScreenOnly, () => i18n.t('tooltip.splat-data.on-screen-only'), 'right');
        tooltips.register(logScale, () => i18n.t('tooltip.splat-data.log-scale'), 'right');
        tooltips.register(showAll, () => i18n.t('tooltip.splat-data.show-all'), 'right');

        controlsContainer.append(controls);

        // build histogram
        const histogram = new Histogram(256, 128);

        const histogramContainer = new Container({
            id: 'histogram-container'
        });

        // wrap the canvas, SVG highlight overlay and stats overlay so the
        // parent can be a flex column with a fixed info row underneath. without
        // this wrapper, the canvas's inline width/height:100% consumes the
        // whole container and pushes the info row out of view.
        const histogramCanvasArea = document.createElement('div');
        histogramCanvasArea.id = 'histogram-canvas-area';
        histogramCanvasArea.appendChild(histogram.canvas);

        // top-right stats overlay: shows the aggregate counts for the hovered
        // bucket or the drag range. pointer-events: none so it never blocks
        // the canvas pointer interactions.
        const statsOverlay = document.createElement('div');
        statsOverlay.id = 'histogram-stats-overlay';
        statsOverlay.style.display = 'none';

        const statsCountRow = document.createElement('div');
        statsCountRow.className = 'histogram-stats-row';
        const statsCountLabel = document.createElement('span');
        statsCountLabel.className = 'histogram-stats-label';
        i18n.onChange(() => {
            statsCountLabel.textContent = `${i18n.t('panel.splat-data.totals.splats')}:`;
        });
        const statsCountValue = document.createElement('span');
        statsCountValue.className = 'histogram-stats-value';
        statsCountRow.appendChild(statsCountLabel);
        statsCountRow.appendChild(statsCountValue);

        const statsSelectedRow = document.createElement('div');
        statsSelectedRow.className = 'histogram-stats-row';
        const statsSelectedLabel = document.createElement('span');
        statsSelectedLabel.className = 'histogram-stats-label';
        i18n.onChange(() => {
            statsSelectedLabel.textContent = `${i18n.t('panel.splat-data.totals.selected')}:`;
        });
        const statsSelectedValue = document.createElement('span');
        statsSelectedValue.className = 'histogram-stats-value';
        statsSelectedRow.appendChild(statsSelectedLabel);
        statsSelectedRow.appendChild(statsSelectedValue);

        statsOverlay.appendChild(statsCountRow);
        statsOverlay.appendChild(statsSelectedRow);
        histogramCanvasArea.appendChild(statsOverlay);

        histogramContainer.dom.appendChild(histogramCanvasArea);

        // info row pinned underneath the histogram canvas. min sits left, max
        // sits right. while hovering, the cursor label slides along to show
        // the bucket value under the pointer. while dragging, the anchor label
        // sits at the click position (where the drag started) and the cursor
        // label tracks the live pointer, so the user can read start -> end.
        const histogramInfoRow = document.createElement('div');
        histogramInfoRow.id = 'histogram-info-row';

        const histogramInfoMin = document.createElement('div');
        histogramInfoMin.className = 'histogram-info-min';

        const histogramInfoAnchor = document.createElement('div');
        histogramInfoAnchor.className = 'histogram-info-anchor';

        const histogramInfoCursor = document.createElement('div');
        histogramInfoCursor.className = 'histogram-info-cursor';

        const histogramInfoMax = document.createElement('div');
        histogramInfoMax.className = 'histogram-info-max';

        histogramInfoRow.appendChild(histogramInfoMin);
        histogramInfoRow.appendChild(histogramInfoAnchor);
        histogramInfoRow.appendChild(histogramInfoMax);
        // cursor last so it stacks above min/max (same row, absolute positioning).
        histogramInfoRow.appendChild(histogramInfoCursor);
        histogramContainer.dom.appendChild(histogramInfoRow);

        this.append(controlsContainer);
        this.append(histogramContainer);

        // current splat
        let splat: Splat;

        // rebuild the localized property list when the language changes
        i18n.onChange(() => {
            if (splat) {
                populateDataSelector(splat);
            }
        });

        let pendingToken = 0;
        let lastGpuMode = 0;
        let lastHash = '';
        const viewProjection = new Mat4();

        // single source of truth for everything that could trigger a refresh.
        // subscribers update one field and call tick(); tick hashes the inputs
        // (with per-mode dependency filtering) and only schedules a GPU pass
        // when the hash actually changed.
        const inputs: HistogramInputs = {
            splatId: -1,
            mode: 0,
            onScreenOnly: false,
            logScale: false,
            cameraVersion: 0,
            stateVersion: 0,
            colorGradeVersion: 0,
            positionsVersion: 0
        };

        const buildGpuOpts = () => {
            const cam = splat.scene.camera.camera;
            const opts: any = {
                entityMatrix: splat.entity.getWorldTransform(),
                viewMatrix: cam.viewMatrix,
                cameraPos: splat.scene.camera.position
            };
            if (inputs.onScreenOnly) {
                viewProjection.mul2(cam.projectionMatrix, cam.viewMatrix);
                opts.viewProjection = viewProjection;
                opts.onScreenOnly = true;
            }
            return opts;
        };

        const scheduleUpdate = () => {
            if (!splat || this.hidden) return;
            const mode = inputs.mode;
            const opts = buildGpuOpts();
            // pendingToken collapses bursts of triggers within a single queue
            // tick (e.g. rapid camera-settle + color-grade) so only the latest
            // intent issues a GPU pass. ordering vs select / history mutations
            // is provided by the shared command queue.
            const myToken = ++pendingToken;
            splat.scene.commandQueue.enqueue(async () => {
                if (myToken !== pendingToken) return;
                try {
                    const result = await splat.scene.dataProcessor.calcHistogram(splat, mode, opts);
                    if (myToken !== pendingToken) return;

                    lastGpuMode = mode;

                    histogram.setData({
                        selected: result.selected,
                        unselected: result.unselected,
                        min: result.min,
                        max: result.max,
                        numValues: result.numValues,
                        logScale: inputs.logScale
                    });

                    // eslint-disable-next-line no-use-before-define
                    refreshRange();
                } catch (err) {
                    // clear lastHash so the next tick with the same inputs retries
                    // instead of being deduped against the failed pass.
                    lastHash = '';
                    throw err;
                }
            });
        };

        // format a numeric bucket value compactly for the overlay readout.
        // mode-aware: index-only modes (like 'state') would round, but all
        // current props are floats so a fixed-precision render is fine.
        const formatValue = (v: number) => {
            if (!Number.isFinite(v)) return '-';
            const abs = Math.abs(v);
            if (abs !== 0 && (abs < 0.01 || abs >= 10000)) {
                return v.toExponential(2);
            }
            return v.toFixed(3);
        };

        const refreshRange = () => {
            const h = histogram.histogram;
            if (!h.numValues) {
                histogramInfoMin.textContent = '';
                histogramInfoMax.textContent = '';
            } else {
                histogramInfoMin.textContent = formatValue(h.minValue);
                histogramInfoMax.textContent = formatValue(h.maxValue);
            }
        };
        refreshRange();

        const tick = () => {
            if (!splat || this.hidden) return;
            const h = hashInputs(inputs);
            if (h === lastHash) return;
            lastHash = h;
            scheduleUpdate();
        };

        events.on('splat.stateChanged', (splat_: Splat) => {
            // only react when the change is for the splat we're currently
            // displaying. another splat's stateChanged is irrelevant to this
            // histogram.
            if (splat_ === splat) {
                inputs.stateVersion++;
                tick();
            }
        });

        events.on('splat.positionsChanged', (splat_: Splat) => {
            if (splat_ === splat) {
                inputs.positionsVersion++;
                tick();
            }
        });

        events.on('splat.moved', (splat_: Splat) => {
            if (splat_ === splat) {
                inputs.positionsVersion++;
                tick();
            }
        });

        // bump cameraVersion only after the camera has stopped moving for
        // CAMERA_SETTLE_MS, so a single drag doesn't spam GPU passes. whether
        // the bump triggers a refresh is decided per-prop inside hashInputs.
        const CAMERA_SETTLE_MS = 150;
        let cameraTimer: number | null = null;
        const lastCameraMatrix = new Mat4();
        const clearCameraTimer = () => {
            if (cameraTimer !== null) {
                clearTimeout(cameraTimer);
                cameraTimer = null;
            }
        };
        events.on('prerender', (cameraMatrix: Mat4) => {
            // skip when panel is hidden — no need to schedule a refresh that
            // would short-circuit in tick(); also drop any in-flight timer so
            // it doesn't fire against a hidden panel.
            if (this.hidden) {
                clearCameraTimer();
                return;
            }
            if (!cameraMatrix.equals(lastCameraMatrix)) {
                lastCameraMatrix.copy(cameraMatrix);
                clearCameraTimer();
                cameraTimer = window.setTimeout(() => {
                    cameraTimer = null;
                    inputs.cameraVersion++;
                    tick();
                }, CAMERA_SETTLE_MS);
            }
        });

        onScreenOnlyValue.on('change', () => {
            inputs.onScreenOnly = onScreenOnlyValue.value;
            tick();
        });

        const colorEvents = [
            'splat.tintClr', 'splat.temperature', 'splat.saturation',
            'splat.brightness', 'splat.blackPoint', 'splat.whitePoint',
            'splat.transparency'
        ];
        colorEvents.forEach((name) => {
            events.on(name, (splat_: Splat) => {
                if (splat_ === splat) {
                    inputs.colorGradeVersion++;
                    tick();
                }
            });
        });

        events.on('selection.changed', (selection: Element) => {
            if (selection instanceof Splat) {
                splat = selection;
                inputs.splatId = splat.uid;
                inputs.mode = propModeFor(selectedDataProp) ?? 0;
                populateDataSelector(splat);
                tick();
            }
        });

        events.on('statusBar.panelChanged', (panel: string | null) => {
            if (panel === 'splatData') {
                // defer until panel is visible (this.hidden flips)
                requestAnimationFrame(() => {
                    // panel just became visible; clear the dedupe hash so the
                    // next tick definitely fires.
                    lastHash = '';
                    tick();

                    // scroll the selected list item into view
                    const activeItem = dataListBox.dom.querySelector('.data-list-item.active');
                    if (activeItem) {
                        activeItem.scrollIntoView({ block: 'nearest' });
                    }
                });
            }
        });

        logScaleValue.on('change', () => {
            inputs.logScale = logScaleValue.value;
            tick();
        });

        showAllValue.on('change', () => {
            if (splat) {
                populateDataSelector(splat);
                // populateDataSelector may have remapped selectedDataProp when
                // the previous one was hidden by toggling extras off; refresh
                // the histogram in case inputs.mode changed.
                tick();
            }
        });

        // is the user mid-drag? while true, hover updates are suppressed and
        // the anchor label remains pinned at the click position. cleared on
        // pointerup / cancel.
        let dragging = false;

        type Align = 'left' | 'center' | 'right';

        const applyAlign = (el: HTMLElement, align: Align) => {
            el.classList.toggle('align-left', align === 'left');
            el.classList.toggle('align-right', align === 'right');
        };

        const setLabel = (el: HTMLElement, x: number, value: number, align: Align) => {
            el.style.left = `${x}px`;
            el.textContent = formatValue(value);
            applyAlign(el, align);
        };

        /** Keep cursor readout inside #histogram-info-row horizontal padding. */
        const clampCursorX = (align: Align) => {
            const el = histogramInfoCursor;
            if (!el.textContent) return;
            const w = el.offsetWidth;
            const R = histogramInfoRow.clientWidth;
            if (w <= 0 || R <= 0) return;
            const lo = 4;
            const hi = R - 4;
            const x = parseFloat(el.style.left);
            if (!Number.isFinite(x)) return;
            let nx = x;
            if (align === 'center') {
                const hw = w * 0.5;
                nx = hi - lo < w ? (lo + hi) * 0.5 : Math.min(hi - hw, Math.max(lo + hw, x));
            } else if (align === 'left') {
                nx = hi - lo < w ? lo : Math.min(hi - w, Math.max(lo, x));
            } else {
                // `left` style is the chip's right edge
                nx = hi - lo < w ? hi : Math.min(hi, Math.max(lo + w, x));
            }
            if (nx !== x) el.style.left = `${nx}px`;
        };

        const setCursorLabel = (x: number, value: number, align: Align) => {
            setLabel(histogramInfoCursor, x, value, align);
            requestAnimationFrame(() => clampCursorX(align));
        };

        const setAnchorLabel = (x: number, value: number, align: Align) => {
            setLabel(histogramInfoAnchor, x, value, align);
        };

        const clearLabel = (el: HTMLElement) => {
            el.textContent = '';
            // reset alignment so the next hover starts from the centered default.
            applyAlign(el, 'center');
        };

        const clearCursorLabel = () => clearLabel(histogramInfoCursor);
        const clearAnchorLabel = () => clearLabel(histogramInfoAnchor);

        const showStats = (count: number, selected: number, total: number) => {
            const pct = total ? (count / total * 100).toFixed(1) : '0.0';
            const fmt = (n: number) => n.toLocaleString();
            statsCountValue.textContent = `${fmt(count)} (${pct}%)`;
            statsSelectedValue.textContent = fmt(selected);
            statsOverlay.style.display = '';
        };

        const hideStats = () => {
            statsOverlay.style.display = 'none';
        };

        histogram.events.on('showOverlay', () => {
            // pointermove will populate the readout; nothing else to do here.
        });

        histogram.events.on('hideOverlay', () => {
            // pointer left the canvas. only clear the hover UI; if a drag is
            // in progress (capture is still active), the highlight handler
            // keeps driving the labels.
            if (!dragging) {
                clearCursorLabel();
                hideStats();
            }
        });

        histogram.events.on('updateOverlay', (info: any) => {
            if (dragging) return; // drag handler owns the labels mid-gesture
            if (!histogram.histogram.numValues) return;
            // continuous (non-bucketed) value at the cursor pixel, centered.
            setCursorLabel(info.x, info.cursorValue, 'center');
            showStats(info.selected + info.unselected, info.selected, info.total);
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
        histogramCanvasArea.appendChild(svg);

        histogram.events.on('highlight', (info: any) => {
            rect.setAttribute('x', info.x.toString());
            rect.setAttribute('y', info.y.toString());
            rect.setAttribute('width', info.width.toString());
            rect.setAttribute('height', info.height.toString());

            svg.style.display = 'inline';
            dragging = true;

            // anchor and cursor sit at the outer edges of the highlight rect.
            // align them so their text grows OUT of the rect: the left-most
            // label is right-aligned (text grows left), the right-most label
            // is left-aligned (text grows right). dragging-right is the
            // default direction (also covers the zero-width click case).
            const draggingRight = info.cursorBucket >= info.anchorBucket;
            const anchorAlign: Align = draggingRight ? 'right' : 'left';
            const cursorAlign: Align = draggingRight ? 'left' : 'right';
            setAnchorLabel(info.anchorX, info.anchorValue, anchorAlign);
            setCursorLabel(info.cursorX, info.cursorValue, cursorAlign);

            // sum stats over the selected bucket range.
            const h = histogram.histogram;
            let count = 0;
            let selected = 0;
            for (let i = info.startBucket; i <= info.endBucket; ++i) {
                const bin = h.bins[i];
                count += bin.selected + bin.unselected;
                selected += bin.selected;
            }
            showStats(count, selected, h.numValues);
        });

        // aborted drag (pointer released off-canvas / cancelled / capture lost).
        // hide the highlight rect and clear the drag labels / stats so the
        // readout doesn't stay stuck on a range the user never committed.
        histogram.events.on('cancelHighlight', () => {
            svg.style.display = 'none';
            dragging = false;
            clearAnchorLabel();
            clearCursorLabel();
            hideStats();
        });

        histogram.events.on('select', (op: string, start: number, end: number) => {
            svg.style.display = 'none';
            dragging = false;
            clearAnchorLabel();
            // cursor label + stats will repopulate on the next pointermove if
            // the pointer is still inside the canvas; clear them now for the
            // case where the gesture ended off-canvas.
            clearCursorLabel();
            hideStats();
            if (!splat) return;

            // capture state synchronously at drag-end and enqueue the whole
            // gpu pass + select fire on the shared command queue. queue ordering
            // guarantees this select runs after any in-flight histogram update
            // and that any subsequent operation runs after this select's
            // edit.add lands in history. no defensive token / target-splat
            // checks are needed.
            const targetSplat = splat;
            const mode = lastGpuMode;
            const minValue = histogram.histogram.minValue;
            const maxValue = histogram.histogram.maxValue;
            const numBins = histogram.histogram.bins.length;
            const opts = buildGpuOpts();

            targetSplat.scene.commandQueue.enqueue(async () => {
                const data = await targetSplat.scene.dataProcessor.selectByRange(targetSplat, mode, {
                    ...opts,
                    min: minValue,
                    max: maxValue,
                    numBins,
                    rangeStart: start,
                    rangeEnd: end
                });
                // SelectOp (via 'select.mask') consumes the bytes synchronously
                // in its constructor, so the buffer is safe to release once
                // events.fire returns.
                events.fire('select.mask', op, data);
                targetSplat.scene.dataProcessor.releaseMask(data);
            });
        });
    }
}

export { DataPanel };
