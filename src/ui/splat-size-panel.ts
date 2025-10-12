import { Button, Container, Label, NumericInput, SliderInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import { Tooltips } from './tooltips';

class SplatSizePanel extends Container {
    private events: Events;
    private splatSizeSlider: SliderInput;
    private splatSizeInput: NumericInput;
    private addKeyframeButton: Button;
    private clearKeyframesButton: Button;
    private keyframesContainer: Container;

    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'splat-size-panel',
            class: 'panel',
            hidden: true
        };

        super(args);

        this.events = events;

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        // header
        const header = new Container({
            class: 'panel-header'
        });

        const icon = new Label({
            text: '⚪', // Circle icon for splat size
            class: 'panel-header-icon'
        });

        const label = new Label({
            text: 'Splat Size',
            class: 'panel-header-label'
        });

        header.append(icon);
        header.append(label);

        // splat size control row
        const sizeRow = new Container({
            class: 'splat-size-row'
        });

        const sizeLabel = new Label({
            text: 'Size:',
            class: 'splat-size-label'
        });

        this.splatSizeSlider = new SliderInput({
            class: 'splat-size-slider',
            min: 0.1,
            max: 2.0,
            precision: 2,
            value: 1.0
        });

        this.splatSizeInput = new NumericInput({
            class: 'splat-size-input',
            min: 0.01,
            max: 2.0,
            precision: 2,
            step: 0.1,
            value: 1.0
        });

        sizeRow.append(sizeLabel);
        sizeRow.append(this.splatSizeSlider);
        sizeRow.append(this.splatSizeInput);

        // keyframe controls row
        const keyframeRow = new Container({
            class: 'splat-size-keyframe-row'
        });

        this.addKeyframeButton = new Button({
            text: '+ Add Keyframe',
            class: 'splat-size-button'
        });

        this.clearKeyframesButton = new Button({
            text: 'Clear All',
            class: 'splat-size-button',
            enabled: false
        });

        keyframeRow.append(this.addKeyframeButton);
        keyframeRow.append(this.clearKeyframesButton);

        // keyframes list
        this.keyframesContainer = new Container({
            class: 'splat-size-keyframes'
        });

        const keyframesLabel = new Label({
            text: 'Keyframes:',
            class: 'splat-size-keyframes-label'
        });

        // assemble the panel
        this.append(header);
        this.append(sizeRow);
        this.append(keyframeRow);
        this.append(keyframesLabel);
        this.append(this.keyframesContainer);

        // setup event handlers
        this.setupEventHandlers();

        // Initially hidden
        this.hidden = true;

        // tooltips
        tooltips.register(this.splatSizeSlider, 'Adjust the visual size of all splats (0.1x to 2.0x)', 'top');
        tooltips.register(this.splatSizeInput, 'Precise splat size value (0.01 to 2.0)', 'top');
        tooltips.register(this.addKeyframeButton, 'Add a keyframe at current timeline position', 'top');
        tooltips.register(this.clearKeyframesButton, 'Remove all splat size keyframes', 'top');
    }

    private setupEventHandlers() {
        // Size control handlers
        this.splatSizeSlider.on('change', (value: number) => {
            this.splatSizeInput.value = value;
            this.events.fire('splatSize.setGlobal', value);
        });

        this.splatSizeInput.on('change', (value: number) => {
            this.splatSizeSlider.value = value;
            this.events.fire('splatSize.setGlobal', value);
        });

        // Keyframe control handlers
        this.addKeyframeButton.on('click', () => {
            this.events.fire('splatSize.addCurrentKeyframe');
        });

        this.clearKeyframesButton.on('click', () => {
            console.log('Clear All button clicked');
            this.events.fire('splatSize.clear');
            // Also refresh the UI immediately
            setTimeout(() => {
                this.refresh();
            }, 100);
        });

        // Event listeners for system updates
        this.events.on('splatSize.changed', (size: number) => {
            if (this.splatSizeSlider.value !== size) {
                this.splatSizeSlider.value = size;
            }
            if (this.splatSizeInput.value !== size) {
                this.splatSizeInput.value = size;
            }
        });

        this.events.on('splatSize.keyframes', () => {
            this.refreshKeyframesList();
        });

        this.events.on('timeline.keyAdded', () => {
            this.refreshKeyframesList();
        });

        this.events.on('timeline.keyRemoved', () => {
            this.refreshKeyframesList();
        });

        // Panel toggle event
        this.events.on('splatSizePanel.toggle', () => {
            this.hidden = !this.hidden;
            if (!this.hidden) {
                this.refresh();
            }
        });
    }

    private refreshKeyframesList() {
        // Clear existing keyframe displays
        this.keyframesContainer.clear();

        try {
            const keyframes = this.events.invoke('splatSize.keyframes');

            if (keyframes && Array.isArray(keyframes)) {
                this.clearKeyframesButton.enabled = keyframes.length > 0;

                keyframes.forEach((keyframe: any, index: number) => {
                    if (keyframe && typeof keyframe.frame !== 'undefined' && typeof keyframe.size !== 'undefined') {
                        const keyframeItem = this.createKeyframeUI(keyframe, index);
                        this.keyframesContainer.append(keyframeItem);
                    }
                });
            } else {
                // No keyframes or keyframes not available yet
                this.clearKeyframesButton.enabled = false;
            }
        } catch (error) {
            console.warn('Could not refresh splat size keyframes list:', error);
            this.clearKeyframesButton.enabled = false;
        }
    }

    private createKeyframeUI(keyframe: any, index: number) {
        const container = new Container({
            class: 'splat-size-keyframe-item'
        });

        const frameLabel = new Label({
            text: `Frame ${keyframe.frame}:`,
            class: 'splat-size-keyframe-label'
        });

        const sizeInput = new NumericInput({
            value: parseFloat(keyframe.size.toFixed(2)),
            precision: 2,
            step: 0.1,
            min: 0.01,
            max: 2.0,
            class: 'splat-size-keyframe-input'
        });

        sizeInput.on('change', (value: number) => {
            // Update the keyframe
            this.events.fire('splatSize.addKeyframe', {
                frame: keyframe.frame,
                size: value
            });
        });

        const deleteButton = new Button({
            text: '×',
            class: 'splat-size-keyframe-delete'
        });

        deleteButton.on('click', () => {
            console.log('Delete keyframe button clicked for frame:', keyframe.frame);

            // Remove the specific keyframe
            this.events.fire('splatSize.removeKeyframe', keyframe.frame);

            // Refresh the UI
            setTimeout(() => {
                this.refresh();
            }, 100);
        });

        container.append(frameLabel);
        container.append(sizeInput);
        container.append(deleteButton);

        return container;
    }

    public refresh() {
        this.refreshKeyframesList();

        // Update current size display
        try {
            const currentSize = this.events.invoke('splatSize.getValue');
            if (typeof currentSize === 'number' && !isNaN(currentSize)) {
                if (this.splatSizeSlider.value !== currentSize) {
                    this.splatSizeSlider.value = currentSize;
                }
                if (this.splatSizeInput.value !== currentSize) {
                    this.splatSizeInput.value = currentSize;
                }
            } else {
                // Set default values if size is not available
                this.splatSizeSlider.value = 1.0;
                this.splatSizeInput.value = 1.0;
            }
        } catch (error) {
            console.warn('Could not refresh splat size display:', error);
            // Set default values on error
            this.splatSizeSlider.value = 1.0;
            this.splatSizeInput.value = 1.0;
        }
    }
}

export { SplatSizePanel };
