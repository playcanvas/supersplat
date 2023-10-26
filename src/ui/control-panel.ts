import { EventHandler } from 'playcanvas';
import { Button, Container, Label, Panel, SliderInput, VectorInput } from 'pcui';

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

        // selection group
        const selectionGroup = new Label({
            class: 'control-heading',
            text: 'Selection'
        });

        // selection button parent
        const selectionButtonParent = new Container({
            class: 'control-parent'
        });

        // clear selection
        const clearSelectionButton = new Button({
            class: 'control-element-expand',
            text: 'Clear' 
        });

        // invert selection
        const invertSelectionButton = new Button({
            class: 'control-element-expand',
            text: 'Invert' 
        });

        selectionButtonParent.append(clearSelectionButton);
        selectionButtonParent.append(invertSelectionButton);

        // select by size
        const selectBySizeParent = new Container({
            class: 'control-parent'
        });

        const selectBySizeSlider = new SliderInput({
            class: 'control-element-expand',
            precision: 4
        });

        const selectBySizeButton = new Button({
            class: 'control-element',
            text: 'Size'
        });

        selectBySizeParent.append(selectBySizeSlider);
        selectBySizeParent.append(selectBySizeButton);

        // select by opacity
        const selectByOpacityParent = new Container({
            class: 'control-parent'
        });

        const selectByOpacitySlider = new SliderInput({
            class: 'control-element-expand',
            precision: 4
        });

        const selectByOpacityButton = new Button({
            class: 'control-element',
            text: 'Opacity'
        });

        selectByOpacityParent.append(selectByOpacitySlider);
        selectByOpacityParent.append(selectByOpacityButton);

        // select by sphere
        const selectBySphereParent = new Container({
            class: 'control-parent'
        });

        const selectBySphereCenter = new VectorInput({
            class: 'control-element-expand',
            precision: 4,
            dimensions: 4,
            value: [0, 0, 0, 0.5]
        });

        const selectBySphereButton = new Button({
            class: 'control-element',
            text: 'Sphere'
        });

        selectBySphereParent.append(selectBySphereCenter);
        selectBySphereParent.append(selectBySphereButton);

        // modify
        const modifyGroup = new Label({
            class: 'control-heading',
            text: 'Modify'
        });

        const deleteSelectionButton = new Button({
            class: 'control-element',
            text: 'Delete Selection'
        });

        const resetButton = new Button({
            class: 'control-element',
            text: 'Reset'
        });

        // export
        const exportGroup = new Label({
            class: 'control-heading',
            text: 'Export to'
        });

        const exportButton = new Button({
            class: 'control-element',
            text: 'ply file'
        });

        // append
        controls.append(cameraGroup);
        controls.append(focusButton);
        controls.append(selectionGroup);
        controls.append(selectionButtonParent);
        controls.append(selectBySizeParent);
        controls.append(selectByOpacityParent);
        controls.append(selectBySphereParent);
        controls.append(modifyGroup);
        controls.append(deleteSelectionButton);
        controls.append(resetButton);
        controls.append(exportGroup);
        controls.append(exportButton);
        this.append(controls);

        focusButton.on('click', () => {
            this.events.fire('focusCamera');
        });

        clearSelectionButton.on('click', () => {
            this.events.fire('clearSelection');
        });

        invertSelectionButton.on('click', () => {
            this.events.fire('invertSelection');
        });

        selectBySizeButton.on('click', () => {
            this.events.fire('selectBySize', selectBySizeSlider.value);
        });

        selectByOpacityButton.on('click', () => {
            this.events.fire('selectByOpacity', selectByOpacitySlider.value);
        });

        selectBySphereCenter.on('change', () => {
            this.events.fire('selectBySphereMove', selectBySphereCenter.value);
        });

        selectBySphereButton.on('click', () => {
            this.events.fire('selectBySphere', selectBySphereCenter.value);
        });

        deleteSelectionButton.on('click', () => {
            this.events.fire('deleteSelection');
        });

        resetButton.on('click', () => {
            this.events.fire('reset');
        });

        exportButton.on('click', () => {
            this.events.fire('export');
        });

        this.controls = controls;
        this.cameraGroup = cameraGroup;
        this.focusButton = focusButton;
    }
}

export { ControlPanel };
