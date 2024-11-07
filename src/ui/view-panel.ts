import { Color, Vec3 } from 'playcanvas';
import { BooleanInput, ColorPicker, Container, Label, SliderInput } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';
import { localize } from './localization';

class ViewPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'view-panel',
            class: 'panel',
            hidden: true
        };

        super(args);

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        // header

        const header = new Container({
            class: `panel-header`
        });

        const icon = new Label({
            text: '\uE403',
            class: `panel-header-icon`
        });

        const label = new Label({
            text: localize('options'),
            class: `panel-header-label`
        });

        header.append(icon);
        header.append(label);

        // colors

        const clrRow = new Container({
            class: 'view-panel-row'
        });

        const clrLabel = new Label({
            text: localize('options.colors'),
            class: 'view-panel-row-label'
        });

        const clrPickers = new Container({
            class: 'view-panel-row-pickers'
        });

        const bgClrPicker = new ColorPicker({
            class: 'view-panel-row-picker',
            value: [0.4, 0.4, 0.4]
        });

        const selectedClrPicker = new ColorPicker({
            class: 'view-panel-row-picker',
            value: [1, 1, 0, 1],
            channels: 4
        });

        const unselectedClrPicker = new ColorPicker({
            class: 'view-panel-row-picker',
            value: [0, 0, 1, 1],
            channels: 4
        });

        const lockedClrPicker = new ColorPicker({
            class: 'view-panel-row-picker',
            value: [0, 0, 0, 0.05],
            channels: 4
        });

        clrPickers.append(bgClrPicker);
        clrPickers.append(selectedClrPicker);
        clrPickers.append(unselectedClrPicker);
        clrPickers.append(lockedClrPicker);

        clrRow.append(clrLabel);
        clrRow.append(clrPickers);

        // camera fov

        const fovRow = new Container({
            class: 'view-panel-row'
        });
        
        const fovLabel = new Label({
            text: localize('options.fov'),
            class: 'view-panel-row-label'
        });
        
        const fovSlider = new SliderInput({
            class: 'view-panel-row-slider',
            min: 10,
            max: 120,
            precision: 1,
            value: 60
        });

        fovRow.append(fovLabel);
        fovRow.append(fovSlider);

        // sh bands
        const shBandsRow = new Container({
            class: 'view-panel-row'
        });

        const shBandsLabel = new Label({
            text: localize('options.sh-bands'),
            class: 'view-panel-row-label'
        });

        const shBandsSlider = new SliderInput({
            class: 'view-panel-row-slider',
            min: 0,
            max: 3,
            precision: 0,
            value: 3
        });

        shBandsRow.append(shBandsLabel);
        shBandsRow.append(shBandsSlider);

        // centers size

        const centersSizeRow = new Container({
            class: 'view-panel-row'
        });

        const centersSizeLabel = new Label({
            text: localize('options.centers-size'),
            class: 'view-panel-row-label'
        });

        const centersSizeSlider = new SliderInput({
            class: 'view-panel-row-slider',
            min: 0,
            max: 10,
            precision: 1,
            value: 2
        });

        centersSizeRow.append(centersSizeLabel);
        centersSizeRow.append(centersSizeSlider);

        // outline selection

        const outlineSelectionRow = new Container({
            class: 'view-panel-row'
        });

        const outlineSelectionLabel = new Label({
            text: localize('options.outline-selection'),
            class: 'view-panel-row-label'
        });

        const outlineSelectionToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: false
        });

        outlineSelectionRow.append(outlineSelectionLabel);
        outlineSelectionRow.append(outlineSelectionToggle);

        // show grid

        const showGridRow = new Container({
            class: 'view-panel-row'
        });

        const showGridLabel = new Label({
            text: localize('options.show-grid'),
            class: 'view-panel-row-label'
        });

        const showGridToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: true
        });

        showGridRow.append(showGridLabel);
        showGridRow.append(showGridToggle);

        // show bound

        const showBoundRow = new Container({
            class: 'view-panel-row'
        });

        const showBoundLabel = new Label({
            text: localize('options.show-bound'),
            class: 'view-panel-row-label'
        });

        const showBoundToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: true
        });

        showBoundRow.append(showBoundLabel);
        showBoundRow.append(showBoundToggle);

        this.append(header);
        this.append(clrRow);
        this.append(fovRow);
        this.append(shBandsRow);
        this.append(centersSizeRow);
        this.append(outlineSelectionRow);
        this.append(showGridRow);
        this.append(showBoundRow);

        // handle panel visibility

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                this.hidden = !visible;
                events.fire('viewPanel.visible', visible);
            }
        };

        events.function('viewPanel.visible', () => {
            return !this.hidden;
        });

        events.on('viewPanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('viewPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('cameraPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        events.on('colorPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        // sh bands

        events.on('view.bands', (bands: number) => {
            shBandsSlider.value = bands;
        });

        shBandsSlider.on('change', (value: number) => {
            events.fire('view.setBands', value);
        });

        // splat size

        events.on('camera.splatSize', (value: number) => {
            centersSizeSlider.value = value;
        });

        centersSizeSlider.on('change', (value: number) => {
            events.fire('camera.setSplatSize', value);
            events.fire('camera.setOverlay', true);
            events.fire('camera.setMode', 'centers');
        });

        // outline selection

        events.on('view.outlineSelection', (value: boolean) => {
            outlineSelectionToggle.value = value;
        });

        outlineSelectionToggle.on('change', (value: boolean) => {
            events.fire('view.setOutlineSelection', value);
        });

        // show grid

        events.on('grid.visible', (visible: boolean) => {
            showGridToggle.value = visible;
        });

        showGridToggle.on('change', () => {
            events.fire('grid.setVisible', showGridToggle.value);
        });

        // show bound

        events.on('camera.bound', (visible: boolean) => {
            showBoundToggle.value = visible;
        });

        showBoundToggle.on('change', () => {
            events.fire('camera.setBound', showBoundToggle.value);
        });

        // background color

        bgClrPicker.on('change', (value: number[]) => {
            events.fire('setBgClr', new Color(value[0], value[1], value[2]));
        });

        selectedClrPicker.on('change', (value: number[]) => {
            events.fire('setSelectedClr', new Color(value[0], value[1], value[2], value[3]));
        });

        unselectedClrPicker.on('change', (value: number[]) => {
            events.fire('setUnselectedClr', new Color(value[0], value[1], value[2], value[3]));
        });

        lockedClrPicker.on('change', (value: number[]) => {
            events.fire('setLockedClr', new Color(value[0], value[1], value[2], value[3]));
        });

        // camera fov

        events.on('camera.fov', (fov: number) => {
            fovSlider.value = fov;
        });

        fovSlider.on('change', (value: number) => {
            events.fire('camera.setFov', value);
        });

        // tooltips
        tooltips.register(bgClrPicker, localize('options.bg-color'), 'left');
        tooltips.register(selectedClrPicker, localize('options.selected-color'), 'top');
        tooltips.register(unselectedClrPicker, localize('options.unselected-color'), 'top');
        tooltips.register(lockedClrPicker, localize('options.locked-color'), 'top');
    }
}

export { ViewPanel };
