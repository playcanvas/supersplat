import { BooleanInput, Container, Label, SliderInput } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';

class ViewPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'view-panel',
            class: 'panel',
            hidden: true
        };

        super(args);

        const handleDown = (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
        };

        this.dom.addEventListener('pointerdown', (event) => {
            handleDown(event);
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
            text: 'VIEW OPTIONS',
            class: `panel-header-label`
        });

        header.append(icon);
        header.append(label);

        // rings mode

        const ringsModeRow = new Container({
            class: 'view-panel-row'
        });

        const ringsModeLabel = new Label({
            text: 'Rings Mode',
            class: 'view-panel-row-label'
        });

        const ringsModeToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle'
        });

        ringsModeRow.append(ringsModeLabel);
        ringsModeRow.append(ringsModeToggle);

        // show splats

        const showSplatsRow = new Container({
            class: 'view-panel-row'
        });

        const showSplatsLabel = new Label({
            text: 'Show Splats',
            class: 'view-panel-row-label'
        });

        const showSplatsToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: true
        });

        showSplatsRow.append(showSplatsLabel);
        showSplatsRow.append(showSplatsToggle);

        // splat size

        const splatSizeRow = new Container({
            class: 'view-panel-row'
        });

        const splatSizeLabel = new Label({
            text: 'Splat Size',
            class: 'view-panel-row-label'
        });

        const splatSizeSlider = new SliderInput({
            class: 'view-panel-row-slider',
            min: 0,
            max: 10,
            precision: 1,
            value: 2
        });

        splatSizeRow.append(splatSizeLabel);
        splatSizeRow.append(splatSizeSlider);

        // show grid

        const showGridRow = new Container({
            class: 'view-panel-row'
        });

        const showGridLabel = new Label({
            text: 'Show Grid',
            class: 'view-panel-row-label'
        });

        const showGridToggle = new BooleanInput({
            type: 'toggle',
            class: 'view-panel-row-toggle',
            value: true
        });

        showGridRow.append(showGridLabel);
        showGridRow.append(showGridToggle);

        this.append(header);
        this.append(ringsModeRow);
        this.append(showSplatsRow);
        this.append(splatSizeRow);
        this.append(showGridRow);

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

        // rings mode

        events.on('camera.mode', (mode: string) => {
            ringsModeToggle.value = mode === 'rings';
        });

        ringsModeToggle.on('change', () => {
            events.fire('camera.setMode', ringsModeToggle.value ? 'rings' : 'centers');
        });

        // show splats

        events.on('camera.debug', (debug: boolean) => {
            showSplatsToggle.value = debug;
        });

        showSplatsToggle.on('change', () => {
            events.fire('camera.setDebug', showSplatsToggle.value);
        });

        // splat size

        events.on('splatSize', (value: number) => {
            splatSizeSlider.value = value;
        });

        splatSizeSlider.on('change', (value: number) => {
            events.fire('splatSize', value);
        });

        // show grid

        events.on('grid.visible', (visible: boolean) => {
            showGridToggle.value = visible;
        });

        showGridToggle.on('change', () => {
            events.fire('grid.setVisible', showGridToggle.value);
        });
    }
}

export { ViewPanel };
