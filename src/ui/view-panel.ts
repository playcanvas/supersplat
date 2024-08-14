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

        this.dom.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
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

        // centers size

        const splatSizeRow = new Container({
            class: 'view-panel-row'
        });

        const splatSizeLabel = new Label({
            text: 'Centers Size',
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

        // show bound

        const showBoundRow = new Container({
            class: 'view-panel-row'
        });

        const showBoundLabel = new Label({
            text: 'Show Bound',
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
        this.append(splatSizeRow);
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

        // splat size

        events.on('camera.splatSize', (value: number) => {
            splatSizeSlider.value = value;
        });

        splatSizeSlider.on('change', (value: number) => {
            events.fire('camera.setSplatSize', value);
            events.fire('camera.setDebug', true);
            events.fire('camera.setMode', 'centers');
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
    }
}

export { ViewPanel };
