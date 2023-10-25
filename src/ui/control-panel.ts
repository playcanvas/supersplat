import { EventHandler } from 'playcanvas';
import { Button, Container, Label, Panel, SliderInput } from 'pcui';

class ControlPanel extends Panel {
    controls: Container;
    cameraGroup: Label;
    focusButton: Button;
    events = new EventHandler;

    constructor(args = { }) {
        Object.assign(args, {
            id: 'control-panel',
            headerText: 'Controls',
            collapsible: false,
            collapsed: false,
            flex: true,
            flexDirection: 'row'
        });

        super(args);

        const controls = new Container({
            class: 'control-container'
        });

        const cameraGroup = new Label({
            class: 'control-heading',
            text: 'Camera'
        });

        const focusButton = new Button({
            class: 'control-element',
            text: 'Reset Focus'
        });

        const modifyGroup = new Label({
            class: 'control-heading',
            text: 'Modify'
        });

        const resetButton = new Button({
            class: 'control-element',
            text: 'Reset' 
        });

        const cullBySizeParent = new Container({
            class: 'control-parent'
        });

        const cullBySizeSlider = new SliderInput({
            class: 'control-element-expand',
            precision: 4
        });

        const cullBySizeButton = new Button({
            class: 'control-element',
            text: 'Size'
        });

        cullBySizeParent.append(cullBySizeSlider);
        cullBySizeParent.append(cullBySizeButton);

        const cullByOpacityParent = new Container({
            class: 'control-parent'
        });

        const cullByOpacitySlider = new SliderInput({
            class: 'control-element-expand',
            precision: 4
        });

        const cullByOpacityButton = new Button({
            class: 'control-element',
            text: 'Opacity'
        });

        cullByOpacityParent.append(cullByOpacitySlider);
        cullByOpacityParent.append(cullByOpacityButton);

        controls.append(cameraGroup);
        controls.append(focusButton);
        controls.append(modifyGroup);
        controls.append(resetButton);
        controls.append(cullBySizeParent);
        controls.append(cullByOpacityParent);
        this.append(controls);

        focusButton.on('click', () => {
            this.events.fire('focus');
        });

        resetButton.on('click', () => {
            this.events.fire('reset');
        });

        cullBySizeButton.on('click', () => {
            this.events.fire('cullBySize', cullBySizeSlider.value);
        });

        cullByOpacityButton.on('click', () => {
            this.events.fire('cullByOpacity', cullByOpacitySlider.value);
        });

        this.controls = controls;
        this.cameraGroup = cameraGroup;
        this.focusButton = focusButton;
    }
}

export { ControlPanel };
