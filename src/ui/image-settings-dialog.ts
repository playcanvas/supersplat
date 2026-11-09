import {
    BooleanInput,
    Button,
    Container,
    Element,
    Label,
    SelectInput,
    SliderInput,
    VectorInput
} from '@playcanvas/pcui';

import type { Events } from '../events';
import type { ImageSettings } from '../render';
import { isRenderMode } from '../render-mode';
import type { RenderMode } from '../render-mode';

import { createDepthControls } from './depth-controls';
import { i18n } from './localization';
import sceneExport from './svg/export.svg';

const createSvg = (svgString: string, args = {}) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new Element({
        dom: new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement,
        ...args
    });
};

class ImageSettingsDialog extends Container {
    show: () => Promise<ImageSettings | null>;
    hide: () => void;
    destroy: () => void;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'image-settings-dialog',
            class: ['settings-dialog', 'blocks-shortcuts'],
            hidden: true,
            tabIndex: -1
        };

        super(args);

        const dialog = new Container({
            id: 'dialog'
        });

        // header

        const headerIcon = createSvg(sceneExport, { id: 'icon' });
        const headerText = new Label({ id: 'text' });
        i18n.bindText(headerText, () => i18n.t('popup.render-image.header').toUpperCase());
        const header = new Container({ id: 'header' });
        header.append(headerIcon);
        header.append(headerText);

        // projection

        const projectionLabel = new Label({ class: 'label' });
        i18n.bindText(projectionLabel, 'popup.render-image.projection');
        const projectionSelect = new SelectInput({
            class: 'select',
            defaultValue: 'standard'
        });
        i18n.bindOptions(projectionSelect, () => [
            { v: 'standard', t: i18n.t('popup.render-image.projection.standard') },
            { v: 'equirect', t: i18n.t('popup.render-image.projection.equirectangular') }
        ]);
        const projectionRow = new Container({ class: 'row' });
        projectionRow.append(projectionLabel);
        projectionRow.append(projectionSelect);

        // preset

        // 360 output is 2:1 equirectangular (mirrors video's presets)
        const buildPresetOptions = () => {
            return projectionSelect.value === 'equirect'
                ? [
                      { v: '360-1k', t: '1024x512' },
                      { v: '360-2k', t: '2048x1024' },
                      { v: '360-4k', t: '3840x1920' },
                      { v: '360-4096', t: '4096x2048' },
                      { v: '360-8k', t: '7680x3840' },
                      { v: '360-8192', t: '8192x4096' },
                      { v: 'custom', t: i18n.t('popup.render-image.resolution.custom') }
                  ]
                : [
                      { v: 'viewport', t: i18n.t('popup.render-image.resolution.current') },
                      { v: 'HD', t: 'HD' },
                      { v: 'QHD', t: 'QHD' },
                      { v: '4K', t: '4K' },
                      { v: 'custom', t: i18n.t('popup.render-image.resolution.custom') }
                  ];
        };

        const presetLabel = new Label({ class: 'label' });
        i18n.bindText(presetLabel, 'popup.render-image.preset');
        const presetSelect = new SelectInput({
            class: 'select',
            defaultValue: 'viewport'
        });
        i18n.bindOptions(presetSelect, buildPresetOptions);
        const presetRow = new Container({ class: 'row' });
        presetRow.append(presetLabel);
        presetRow.append(presetSelect);

        // resolution

        const resolutionLabel = new Label({ class: 'label' });
        i18n.bindText(resolutionLabel, 'popup.render-image.resolution');
        const resolutionValue = new VectorInput({
            class: 'vector-input',
            dimensions: 2,
            min: 4,
            max: 16000,
            precision: 0,
            value: [1024, 768]
        });
        const resolutionRow = new Container({ class: 'row', enabled: false });
        resolutionRow.append(resolutionLabel);
        resolutionRow.append(resolutionValue);

        // format

        const formatLabel = new Label({ class: 'label' });
        i18n.bindText(formatLabel, 'popup.render-image.format');
        const formatSelect = new SelectInput({
            class: 'select',
            defaultValue: 'png',
            options: [
                { v: 'png', t: 'PNG' },
                { v: 'jpeg', t: 'JPEG' },
                { v: 'webp', t: 'WebP' }
            ]
        });
        const formatRow = new Container({ class: 'row' });
        formatRow.append(formatLabel);
        formatRow.append(formatSelect);

        // jpeg quality

        const qualityLabel = new Label({ class: 'label' });
        i18n.bindText(qualityLabel, 'popup.render-image.quality');
        const qualitySlider = new SliderInput({
            class: 'slider',
            min: 1,
            max: 100,
            precision: 0,
            value: 90
        });
        const qualityRow = new Container({ class: 'row' });
        qualityRow.append(qualityLabel);
        qualityRow.append(qualitySlider);

        // hidden until jpeg is selected
        qualityRow.hidden = true;

        // level horizon (360 only)

        const levelHorizonLabel = new Label({ class: 'label' });
        i18n.bindText(levelHorizonLabel, 'popup.render-image.level-horizon');
        const levelHorizonBoolean = new BooleanInput({ class: 'boolean', value: true });
        const levelHorizonRow = new Container({ class: 'row' });
        levelHorizonRow.append(levelHorizonLabel);
        levelHorizonRow.append(levelHorizonBoolean);

        // hidden until 360 projection is selected
        levelHorizonRow.hidden = true;

        // transparent background

        const transparentBgLabel = new Label({ class: 'label' });
        i18n.bindText(transparentBgLabel, 'popup.render-image.transparent-background');
        const transparentBgBoolean = new BooleanInput({ class: 'boolean', value: false });
        const transparentBgRow = new Container({ class: 'row' });
        transparentBgRow.append(transparentBgLabel);
        transparentBgRow.append(transparentBgBoolean);

        // show debug overlays

        const showDebugLabel = new Label({ class: 'label' });
        i18n.bindText(showDebugLabel, 'popup.render-image.show-debug-overlays');
        const showDebugBoolean = new BooleanInput({ class: 'boolean', value: false });
        const showDebugRow = new Container({ class: 'row' });
        showDebugRow.append(showDebugLabel);
        showDebugRow.append(showDebugBoolean);

        // render mode

        const renderModeLabel = new Label({ class: 'label' });
        i18n.bindText(renderModeLabel, 'panel.overlays.render-mode');
        const renderModeSelect = new SelectInput({
            class: 'select',
            defaultValue: 'normal',
            options: [
                { v: 'normal', t: i18n.t('panel.overlays.mode.normal') },
                { v: 'depth', t: i18n.t('panel.overlays.depth') },
                { v: 'normals', t: i18n.t('panel.overlays.mode.normals') },
                { v: 'alpha', t: i18n.t('panel.overlays.mode.alpha') },
                { v: 'curvature', t: i18n.t('panel.overlays.mode.curvature') },
                { v: 'edge', t: i18n.t('panel.overlays.mode.edge') },
                { v: 'overdraw', t: i18n.t('panel.overlays.overdraw') }
            ]
        });
        const renderModeRow = new Container({ class: 'row' });
        renderModeRow.append(renderModeLabel);
        renderModeRow.append(renderModeSelect);
        const depthControls = createDepthControls(events, () => renderModeSelect.value, false);

        const depthDataRow = new Container({ class: 'row' });
        const depthDataLabel = new Label({ class: 'label' });
        i18n.bindText(depthDataLabel, 'panel.overlays.depth-data');
        const depthData = new BooleanInput({ value: false });
        depthDataRow.append(depthDataLabel);
        depthDataRow.append(depthData);

        // content

        const content = new Container({ id: 'content' });
        content.append(projectionRow);
        content.append(presetRow);
        content.append(resolutionRow);
        content.append(renderModeRow);
        content.append(depthControls.container);
        content.append(depthDataRow);
        content.append(formatRow);
        content.append(qualityRow);
        content.append(transparentBgRow);
        content.append(showDebugRow);
        content.append(levelHorizonRow);

        // footer

        const footer = new Container({ id: 'footer' });

        const cancelButton = new Button({
            class: 'button'
        });
        i18n.bindText(cancelButton, 'panel.render.cancel');

        const okButton = new Button({
            class: 'button'
        });
        i18n.bindText(okButton, 'panel.render.ok');

        footer.append(cancelButton);
        footer.append(okButton);

        dialog.append(header);
        dialog.append(content);
        dialog.append(footer);

        this.append(dialog);

        let targetSize: { width: number; height: number };

        // Handle custom resolution activation

        const updateResolution = () => {
            const widths: Record<string, number> = {
                viewport: targetSize.width,
                HD: 1920,
                QHD: 2560,
                '4K': 3840,
                '360-1k': 1024,
                '360-2k': 2048,
                '360-4k': 3840,
                '360-4096': 4096,
                '360-8k': 7680,
                '360-8192': 8192
            };

            const heights: Record<string, number> = {
                viewport: targetSize.height,
                HD: 1080,
                QHD: 1440,
                '4K': 2160,
                '360-1k': 512,
                '360-2k': 1024,
                '360-4k': 1920,
                '360-4096': 2048,
                '360-8k': 3840,
                '360-8192': 4096
            };

            resolutionValue.value = [
                widths[presetSelect.value] ?? resolutionValue.value[0],
                heights[presetSelect.value] ?? resolutionValue.value[1]
            ];
        };

        presetSelect.on('change', () => {
            resolutionRow.enabled = presetSelect.value === 'custom';

            if (presetSelect.value !== 'custom') {
                updateResolution();
            }
        });

        // sync the ui to the selected projection: 360 renders are 2:1
        // equirectangular without debug overlays, and gain a level horizon toggle
        const syncProjection = () => {
            const is360 = projectionSelect.value === 'equirect';
            presetSelect.options = buildPresetOptions();
            presetSelect.value = is360 ? '360-4k' : 'viewport';
            resolutionRow.enabled = presetSelect.value === 'custom';
            updateResolution();
            syncFormat();
        };

        // depth maps are always standard-projection 16-bit pngs, and diagnostic
        // modes ignore the colour options: hide what would change that
        const syncFormat = () => {
            depthControls.sync();
            depthDataRow.hidden = renderModeSelect.value !== 'depth';
            const mode = renderModeSelect.value as RenderMode;
            const depth = mode === 'depth';
            const diagnostic = mode !== 'normal';
            const isJpeg = formatSelect.value === 'jpeg';
            const is360 = projectionSelect.value === 'equirect';
            formatRow.enabled = !depth;
            projectionRow.enabled = !diagnostic;
            qualityRow.hidden = depth || !isJpeg;
            transparentBgRow.hidden = diagnostic || isJpeg;
            showDebugRow.hidden = diagnostic || is360;
            levelHorizonRow.hidden = diagnostic || !is360;
        };

        projectionSelect.on('change', syncProjection);

        // jpeg has no alpha channel: hide the transparent background toggle
        // and show the quality slider instead
        formatSelect.on('change', syncFormat);

        // diagnostic render modes force standard projection; depth also pins png
        renderModeSelect.on('change', () => {
            if (renderModeSelect.value !== 'normal') {
                if (renderModeSelect.value === 'depth') {
                    formatSelect.value = 'png';
                }
                if (projectionSelect.value === 'equirect') {
                    projectionSelect.value = 'standard';
                    syncProjection();
                    return;
                }
            }
            syncFormat();
        });

        // handle key bindings for enter and escape

        let onCancel: () => void;
        let onOK: () => void;

        cancelButton.on('click', () => onCancel());
        okButton.on('click', () => onOK());

        const keydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
            }
        };

        // reset UI and configure for current state
        const reset = () => {
            updateResolution();
            syncFormat();
        };

        // function implementations

        this.show = () => {
            targetSize = events.invoke('targetSize');

            // WYSIWYG: default the export mode to what the viewport is showing.
            // Depth parameters live in the shared view events, so what was tuned
            // in the viewport is already what this dialog will render.
            const viewMode = events.invoke('view.renderMode');
            if (isRenderMode(viewMode)) {
                renderModeSelect.value = viewMode;
            }

            reset();

            this.hidden = false;
            document.addEventListener('keydown', keydown);
            this.dom.focus();

            return new Promise<ImageSettings | null>((resolve) => {
                onCancel = () => {
                    resolve(null);
                };

                onOK = () => {
                    const [requestedWidth, requestedHeight] = resolutionValue.value;
                    // Never request an offscreen texture larger than the device
                    // supports; custom presets allow arbitrary numbers.
                    const maxSize = (events.invoke('render.maxTextureSize') as number) ?? 16384;
                    const width = Math.min(requestedWidth, maxSize);
                    const height = Math.min(requestedHeight, maxSize);
                    const renderMode = renderModeSelect.value as RenderMode;
                    const depth = renderMode === 'depth';
                    const diagnostic = renderMode !== 'normal';
                    const is360 = !diagnostic && projectionSelect.value === 'equirect';
                    const format = depth ? 'png' : (formatSelect.value as 'png' | 'jpeg' | 'webp');

                    const imageSettings = {
                        width,
                        height,
                        transparentBg: !diagnostic && format !== 'jpeg' && transparentBgBoolean.value,
                        showDebug: !diagnostic && !is360 && showDebugBoolean.value,
                        format,
                        quality: !depth && format === 'jpeg' ? qualitySlider.value / 100 : undefined,
                        projection: (is360 ? 'equirect' : 'standard') as 'standard' | 'equirect',
                        levelHorizon: !diagnostic && is360 && levelHorizonBoolean.value,
                        renderMode,
                        depthMethod: depthControls.method(),
                        depthData: depth && depthData.value
                    };

                    resolve(imageSettings);
                };
            }).finally(() => {
                document.removeEventListener('keydown', keydown);
                this.hide();
            });
        };

        this.hide = () => {
            this.hidden = true;
        };

        this.destroy = () => {
            this.hide();
            super.destroy();
        };
    }
}

export { ImageSettingsDialog };
