import { BooleanInput, Button, Container, Label, SelectInput, SliderInput } from '@playcanvas/pcui';

import { ElementType } from '../element';
import { Events } from '../events';
import { localize } from './localization';
import { Tooltips } from './tooltips';

class DepthVisualizationPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'depth-visualization-panel',
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
            class: 'panel-header'
        });

        const icon = new Label({
            text: '\uE40B',
            class: 'panel-header-icon'
        });

        const label = new Label({
            text: 'Depth Visualization',
            class: 'panel-header-label'
        });

        header.append(icon);
        header.append(label);

        // depth visualization
        const depthVisualizationRow = new Container({
            class: 'depth-panel-row'
        });

        const depthVisualizationLabel = new Label({
            text: localize('options.depth-visualization'),
            class: 'depth-panel-row-label'
        });

        const depthVisualizationToggle = new BooleanInput({
            type: 'toggle',
            class: 'depth-panel-row-toggle',
            value: false
        });

        depthVisualizationRow.append(depthVisualizationLabel);
        depthVisualizationRow.append(depthVisualizationToggle);

        // depth min
        const depthMinRow = new Container({
            class: 'depth-panel-row'
        });

        const depthMinLabel = new Label({
            text: localize('options.depth-min'),
            class: 'depth-panel-row-label'
        });

        const depthMinSlider = new SliderInput({
            class: 'depth-panel-row-slider',
            min: -100,
            max: 100,
            precision: 1,
            value: 1
        });

        depthMinRow.append(depthMinLabel);
        depthMinRow.append(depthMinSlider);

        // depth max
        const depthMaxRow = new Container({
            class: 'depth-panel-row'
        });

        const depthMaxLabel = new Label({
            text: localize('options.depth-max'),
            class: 'depth-panel-row-label'
        });

        const depthMaxSlider = new SliderInput({
            class: 'depth-panel-row-slider',
            min: -100,
            max: 100,
            precision: 1,
            value: 50
        });

        depthMaxRow.append(depthMaxLabel);
        depthMaxRow.append(depthMaxSlider);

        // auto range toggle
        const autoRangeRow = new Container({
            class: 'depth-panel-row'
        });

        const autoRangeLabel = new Label({
            text: localize('options.depth-auto-range'),
            class: 'depth-panel-row-label'
        });

        const autoRangeToggle = new BooleanInput({
            type: 'toggle',
            class: 'depth-panel-row-toggle',
            value: false
        });

        autoRangeRow.append(autoRangeLabel);
        autoRangeRow.append(autoRangeToggle);

        // depth reverse
        const depthReverseRow = new Container({
            class: 'depth-panel-row'
        });

        const depthReverseLabel = new Label({
            text: localize('options.depth-reverse'),
            class: 'depth-panel-row-label'
        });

        const depthReverseToggle = new BooleanInput({
            type: 'toggle',
            class: 'depth-panel-row-toggle',
            value: false
        });

        depthReverseRow.append(depthReverseLabel);
        depthReverseRow.append(depthReverseToggle);

        // color ramp selection
        const colorRampRow = new Container({
            class: 'depth-panel-row'
        });

        const colorRampLabel = new Label({
            text: localize('options.depth-color-ramp'),
            class: 'depth-panel-row-label'
        });

        const colorRampSelect = new SelectInput({
            class: 'depth-panel-row-select',
            options: [
                { v: 'grayscale', t: localize('options.depth-color-ramp.grayscale') },
                { v: 'viridis', t: localize('options.depth-color-ramp.viridis') },
                { v: 'plasma', t: localize('options.depth-color-ramp.plasma') },
                { v: 'inferno', t: localize('options.depth-color-ramp.inferno') },
                { v: 'turbo', t: localize('options.depth-color-ramp.turbo') },
                { v: 'jet', t: localize('options.depth-color-ramp.jet') },
                { v: 'custom', t: localize('options.depth-color-ramp.custom') }
            ],
            value: 'grayscale'
        });

        colorRampRow.append(colorRampLabel);
        colorRampRow.append(colorRampSelect);

        // depth axis modes
        const depthAxisRow = new Container({
            class: 'depth-panel-row'
        });

        const depthAxisLabel = new Label({
            text: localize('options.depth-axis'),
            class: 'depth-panel-row-label'
        });

        const depthAxisContainer = new Container({
            class: 'depth-panel-axis-container'
        });

        const depthXModeToggle = new BooleanInput({
            type: 'toggle',
            class: 'depth-panel-axis-toggle',
            value: false
        });

        const depthXLabel = new Label({
            text: 'X',
            class: 'depth-panel-axis-label'
        });

        const depthYModeToggle = new BooleanInput({
            type: 'toggle',
            class: 'depth-panel-axis-toggle',
            value: false
        });

        const depthYLabel = new Label({
            text: 'Y',
            class: 'depth-panel-axis-label'
        });

        const depthZModeToggle = new BooleanInput({
            type: 'toggle',
            class: 'depth-panel-axis-toggle',
            value: false
        });

        const depthZLabel = new Label({
            text: 'Z',
            class: 'depth-panel-axis-label'
        });

        const depthNoneModeToggle = new BooleanInput({
            type: 'toggle',
            class: 'depth-panel-axis-toggle',
            value: true  // Default to no axis mode
        });

        const depthNoneLabel = new Label({
            text: 'None',
            class: 'depth-panel-axis-label'
        });

        const depthXContainer = new Container({ class: 'depth-panel-axis-item' });
        depthXContainer.append(depthXLabel);
        depthXContainer.append(depthXModeToggle);

        const depthYContainer = new Container({ class: 'depth-panel-axis-item' });
        depthYContainer.append(depthYLabel);
        depthYContainer.append(depthYModeToggle);

        const depthZContainer = new Container({ class: 'depth-panel-axis-item' });
        depthZContainer.append(depthZLabel);
        depthZContainer.append(depthZModeToggle);

        const depthNoneContainer = new Container({ class: 'depth-panel-axis-item' });
        depthNoneContainer.append(depthNoneLabel);
        depthNoneContainer.append(depthNoneModeToggle);

        depthAxisContainer.append(depthNoneContainer);
        depthAxisContainer.append(depthXContainer);
        depthAxisContainer.append(depthYContainer);
        depthAxisContainer.append(depthZContainer);

        depthAxisRow.append(depthAxisLabel);
        depthAxisRow.append(depthAxisContainer);

        // depth blend (mix between color and depth)
        const depthBlendRow = new Container({
            class: 'depth-panel-row'
        });

        const depthBlendLabel = new Label({
            text: localize('options.depth-blend'),
            class: 'depth-panel-row-label'
        });

        const depthBlendSlider = new SliderInput({
            class: 'depth-panel-row-slider',
            min: 0,
            max: 1,
            precision: 2,
            value: 1
        });

        depthBlendRow.append(depthBlendLabel);
        depthBlendRow.append(depthBlendSlider);

        // depth visualization keyframe controls
        const depthKeyframeRow = new Container({
            class: 'depth-panel-row'
        });

        const depthAddKeyframeButton = new Button({
            text: '+ Add Depth Keyframe',
            class: 'depth-panel-button',
            enabled: false
        });

        const depthClearKeyframesButton = new Button({
            text: 'Clear All',
            class: 'depth-panel-button',
            enabled: false
        });

        // Add danger class after creation
        depthClearKeyframesButton.dom.classList.add('depth-panel-button-danger');

        depthKeyframeRow.append(depthAddKeyframeButton);
        depthKeyframeRow.append(depthClearKeyframesButton);

        this.append(header);
        this.append(depthVisualizationRow);
        this.append(depthMinRow);
        this.append(depthMaxRow);
        this.append(autoRangeRow);
        this.append(depthReverseRow);
        this.append(colorRampRow);
        this.append(depthAxisRow);
        this.append(depthBlendRow);
        this.append(depthKeyframeRow);

        // handle panel visibility
        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                this.hidden = !visible;
                events.fire('depthVisualizationPanel.visible', visible);
            }
        };

        events.function('depthVisualizationPanel.visible', () => {
            return !this.hidden;
        });

        events.on('depthVisualizationPanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('depthVisualizationPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        // hide this panel when other panels open
        events.on('viewPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        events.on('colorPanel.visible', (visible: boolean) => {
            if (visible) {
                setVisible(false);
            }
        });

        // depth visualization
        events.on('view.depthVisualization', (enabled: boolean) => {
            depthVisualizationToggle.value = enabled;
        });

        depthVisualizationToggle.on('change', (value: boolean) => {
            events.fire('view.setDepthVisualization', value);
        });

        // depth min
        events.on('view.depthMin', (value: number) => {
            depthMinSlider.value = value;
        });

        depthMinSlider.on('change', (value: number) => {
            events.fire('view.setDepthMin', value);
        });

        // depth max
        events.on('view.depthMax', (value: number) => {
            depthMaxSlider.value = value;
        });

        depthMaxSlider.on('change', (value: number) => {
            events.fire('view.setDepthMax', value);
        });

        // depth reverse
        events.on('view.depthReverse', (enabled: boolean) => {
            depthReverseToggle.value = enabled;
        });

        depthReverseToggle.on('change', (value: boolean) => {
            events.fire('view.setDepthReverse', value);
        });

        // Function to update slider sensitivity based on mode
        const updateSliderSensitivity = () => {
            const xMode = events.invoke('view.depthXMode') || false;
            const yMode = events.invoke('view.depthYMode') || false;
            const zMode = events.invoke('view.depthZMode') || false;
            const hasAxisMode = xMode || yMode || zMode;

            if (hasAxisMode) {
                // Coordinate mode: use finer precision and coordinate-appropriate range
                depthMinSlider.precision = 2;
                depthMaxSlider.precision = 2;
                depthMinSlider.min = -100;
                depthMinSlider.max = 100;
                depthMaxSlider.min = -100;
                depthMaxSlider.max = 100;

                // Force refresh the sliders to apply new ranges
                // Store current values and re-set them to force a refresh
                const currentMinValue = depthMinSlider.value;
                const currentMaxValue = depthMaxSlider.value;
                depthMinSlider.value = currentMinValue;
                depthMaxSlider.value = currentMaxValue;

                // Reset to reasonable coordinate values if currently at view depth defaults
                if (depthMinSlider.value === 1 || depthMinSlider.value > 10) depthMinSlider.value = -10;
                if (depthMaxSlider.value === 50 || depthMaxSlider.value > 50) depthMaxSlider.value = 10;
            } else {
                // View depth mode: original settings
                depthMinSlider.precision = 1;
                depthMaxSlider.precision = 1;
                depthMinSlider.min = 0.1;
                depthMinSlider.max = 100;
                depthMaxSlider.min = 1;
                depthMaxSlider.max = 1000;

                // Force refresh the sliders to apply new ranges
                // Store current values and re-set them to force a refresh
                const currentMinValue = depthMinSlider.value;
                const currentMaxValue = depthMaxSlider.value;
                depthMinSlider.value = currentMinValue;
                depthMaxSlider.value = currentMaxValue;

                // Reset to view depth defaults if currently at coordinate values
                if (depthMinSlider.value < 0) depthMinSlider.value = 1;
                if (depthMaxSlider.value < 10) depthMaxSlider.value = 50;
            }
        };

        // depth axis modes
        events.on('view.depthXMode', (enabled: boolean) => {
            depthXModeToggle.value = enabled;
            updateSliderSensitivity();
        });

        events.on('view.depthYMode', (enabled: boolean) => {
            depthYModeToggle.value = enabled;
            updateSliderSensitivity();
        });

        events.on('view.depthZMode', (enabled: boolean) => {
            depthZModeToggle.value = enabled;
            updateSliderSensitivity();
        });


        // Radio button behavior for axis modes - only one can be active at a time
        depthNoneModeToggle.on('change', (value: boolean) => {
            if (value) {
                // Turn off all axes when None is selected
                depthXModeToggle.value = false;
                depthYModeToggle.value = false;
                depthZModeToggle.value = false;
                events.fire('view.setDepthXMode', false);
                events.fire('view.setDepthYMode', false);
                events.fire('view.setDepthZMode', false);
            }
            updateSliderSensitivity();
        });

        depthXModeToggle.on('change', (value: boolean) => {
            if (value) {
                // Turn off other options when X is selected
                depthNoneModeToggle.value = false;
                depthYModeToggle.value = false;
                depthZModeToggle.value = false;
                events.fire('view.setDepthYMode', false);
                events.fire('view.setDepthZMode', false);
            }
            events.fire('view.setDepthXMode', value);
            updateSliderSensitivity();
        });

        depthYModeToggle.on('change', (value: boolean) => {
            if (value) {
                // Turn off other options when Y is selected
                depthNoneModeToggle.value = false;
                depthXModeToggle.value = false;
                depthZModeToggle.value = false;
                events.fire('view.setDepthXMode', false);
                events.fire('view.setDepthZMode', false);
            }
            events.fire('view.setDepthYMode', value);
            updateSliderSensitivity();
        });

        depthZModeToggle.on('change', (value: boolean) => {
            if (value) {
                // Turn off other options when Z is selected
                depthNoneModeToggle.value = false;
                depthXModeToggle.value = false;
                depthYModeToggle.value = false;
                events.fire('view.setDepthXMode', false);
                events.fire('view.setDepthYMode', false);
            }
            events.fire('view.setDepthZMode', value);
            updateSliderSensitivity();
        });

        // auto range toggle
        const calculateDataBounds = () => {
            const xMode = events.invoke('view.depthXMode') || false;
            const yMode = events.invoke('view.depthYMode') || false;
            const zMode = events.invoke('view.depthZMode') || false;

            if (xMode || yMode || zMode) {
                // Get all splats in the scene
                const scene = (window as any).scene;
                if (scene) {
                    const splats = scene.getElementsByType(ElementType.splat);
                    if (splats.length > 0) {
                        let minVal = Infinity;
                        let maxVal = -Infinity;

                        // Calculate bounds across all visible splats
                        splats.forEach((splat: any) => {
                            if (splat.visible) {
                                const bound = splat.localBound;
                                if (bound) {
                                    if (xMode) {
                                        minVal = Math.min(minVal, bound.getMin().x);
                                        maxVal = Math.max(maxVal, bound.getMax().x);
                                    } else if (yMode) {
                                        minVal = Math.min(minVal, bound.getMin().y);
                                        maxVal = Math.max(maxVal, bound.getMax().y);
                                    } else if (zMode) {
                                        minVal = Math.min(minVal, bound.getMin().z);
                                        maxVal = Math.max(maxVal, bound.getMax().z);
                                    }
                                }
                            }
                        });

                        if (isFinite(minVal) && isFinite(maxVal)) {
                            // Add some padding (5% on each side)
                            const range = maxVal - minVal;
                            const padding = range * 0.05;
                            return {
                                min: minVal - padding,
                                max: maxVal + padding
                            };
                        }
                    }
                }
            }

            return null;
        };

        autoRangeToggle.on('change', (value: boolean) => {
            if (value) {
                const bounds = calculateDataBounds();
                if (bounds) {
                    // Set the sliders to the calculated bounds
                    depthMinSlider.value = Math.max(depthMinSlider.min, Math.min(depthMinSlider.max, bounds.min));
                    depthMaxSlider.value = Math.max(depthMaxSlider.min, Math.min(depthMaxSlider.max, bounds.max));

                    // Fire events to update the visualization
                    events.fire('view.setDepthMin', depthMinSlider.value);
                    events.fire('view.setDepthMax', depthMaxSlider.value);
                }
            }
        });

        // color ramp selection
        events.on('view.depthColorRamp', (value: string) => {
            colorRampSelect.value = value;
        });

        // Validate color scheme format
        const validateColorScheme = (scheme: any): boolean => {
            if (!scheme || typeof scheme !== 'object') return false;
            if (!Array.isArray(scheme.colors)) return false;
            if (scheme.colors.length < 2) return false;

            for (const stop of scheme.colors) {
                if (typeof stop.position !== 'number' || stop.position < 0 || stop.position > 1) return false;
                if (!Array.isArray(stop.color) || stop.color.length !== 3) return false;
                if (stop.color.some((c: number) => typeof c !== 'number' || c < 0 || c > 1)) return false;
            }

            // Ensure positions are sorted
            for (let i = 1; i < scheme.colors.length; i++) {
                if (scheme.colors[i].position <= scheme.colors[i - 1].position) {
                    return false;
                }
            }

            return true;
        };

        // Process custom color file
        const processCustomColorFile = async (file: File, events: Events, selectInput: any) => {
            try {
                const text = await file.text();
                const colorScheme = JSON.parse(text);

                // Validate color scheme format
                if (!validateColorScheme(colorScheme)) {
                    throw new Error('Invalid color scheme format. Please check the file structure.');
                }

                // Store the custom color scheme
                events.fire('view.setCustomColorScheme', colorScheme);
                events.fire('view.setDepthColorRamp', 'custom');

                console.log(`Loaded custom color scheme: ${colorScheme.name || 'Unnamed'}`);

            } catch (error: any) {
                console.error('Failed to process color scheme file:', error);
                events.invoke('showPopup', {
                    type: 'error',
                    header: 'Invalid File',
                    message: `Failed to process color scheme file: ${error.message}`
                });
                // Reset to previous selection on error
                selectInput.value = events.invoke('view.depthColorRamp') || 'grayscale';
            }
        };

        // Custom color scheme loading function
        const loadCustomColorScheme = async (events: Events, selectInput: any) => {
            try {
                // Check for file picker API support
                if (!window.showOpenFilePicker) {
                    // Fallback to file input for older browsers
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.onchange = async (e: any) => {
                        const file = e.target.files[0];
                        if (file) {
                            await processCustomColorFile(file, events, selectInput);
                        }
                    };
                    input.click();
                    return;
                }

                // Use modern file picker API
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'Color Scheme Files',
                        accept: {
                            'application/json': ['.json']
                        }
                    }],
                    multiple: false
                });

                const file = await fileHandle.getFile();
                await processCustomColorFile(file, events, selectInput);

            } catch (error: any) {
                if (error.name !== 'AbortError') {
                    console.error('Failed to load custom color scheme:', error);
                    events.invoke('showPopup', {
                        type: 'error',
                        header: 'Load Failed',
                        message: `Failed to load custom color scheme: ${error.message}`
                    });
                }
                // Reset to previous selection on error/cancel
                selectInput.value = events.invoke('view.depthColorRamp') || 'grayscale';
            }
        };

        colorRampSelect.on('change', async (value: string) => {
            if (value === 'custom') {
                await loadCustomColorScheme(events, colorRampSelect);
            } else {
                events.fire('view.setDepthColorRamp', value);
            }
        });

        // depth blend
        events.on('view.depthBlend', (value: number) => {
            depthBlendSlider.value = value;
        });

        depthBlendSlider.on('change', (value: number) => {
            events.fire('view.setDepthBlend', value);
        });

        // depth keyframe buttons
        const updateKeyframeButtonState = () => {
            const depthEnabled = events.invoke('view.depthVisualization') || false;
            console.log('Updating keyframe button state, depth enabled:', depthEnabled);
            depthAddKeyframeButton.enabled = depthEnabled;

            // Check if there are existing keyframes to enable clear button
            const existingKeyframes = events.invoke('depthVisualization.keyframes');
            const hasKeyframes = existingKeyframes && existingKeyframes.length > 0;
            depthClearKeyframesButton.enabled = hasKeyframes;
            console.log('Depth keyframes count:', hasKeyframes ? existingKeyframes.length : 0);
        };

        depthAddKeyframeButton.on('click', () => {
            console.log('Depth keyframe button clicked');
            const currentFrame = events.invoke('timeline.frame');
            const depthEnabled = events.invoke('view.depthVisualization');
            console.log('Button click - current frame:', currentFrame, 'depth enabled:', depthEnabled);

            if (depthEnabled) {
                // Temporarily change button text to show success
                const originalText = depthAddKeyframeButton.text;
                depthAddKeyframeButton.text = '✓ Keyframe Added';
                depthAddKeyframeButton.enabled = false;

                events.fire('depthVisualization.addCurrentKeyframe');

                // Reset button after delay
                setTimeout(() => {
                    depthAddKeyframeButton.text = originalText;
                    depthAddKeyframeButton.enabled = true;
                    updateKeyframeButtonState();
                }, 1000);
            } else {
                console.warn('Cannot add depth keyframe: depth visualization is disabled');
            }
        });

        depthClearKeyframesButton.on('click', () => {
            console.log('Clear depth keyframes button clicked');
            const existingKeyframes = events.invoke('depthVisualization.keyframes');

            if (existingKeyframes && existingKeyframes.length > 0) {
                // Temporarily change button text to show action
                const originalText = depthClearKeyframesButton.text;
                depthClearKeyframesButton.text = 'Clearing...';
                depthClearKeyframesButton.enabled = false;

                events.fire('depthVisualization.clear');

                // Reset button after delay
                setTimeout(() => {
                    depthClearKeyframesButton.text = originalText;
                    updateKeyframeButtonState();
                }, 500);
            } else {
                console.warn('No depth keyframes to clear');
            }
        });

        // Update keyframe button state when depth visualization changes
        events.on('view.depthVisualization', (enabled: boolean) => {
            console.log('Depth visualization changed to:', enabled);
            updateKeyframeButtonState();
        });

        // Also update when any depth parameter changes to ensure consistency
        events.on('view.depthMin', () => updateKeyframeButtonState());
        events.on('view.depthMax', () => updateKeyframeButtonState());
        events.on('view.depthReverse', () => updateKeyframeButtonState());
        events.on('view.depthXMode', () => updateKeyframeButtonState());
        events.on('view.depthYMode', () => updateKeyframeButtonState());
        events.on('view.depthZMode', () => updateKeyframeButtonState());
        events.on('view.depthBlend', () => updateKeyframeButtonState());

        // Update when timeline keyframes change
        events.on('timeline.keyAdded', () => updateKeyframeButtonState());
        events.on('timeline.keyRemoved', () => updateKeyframeButtonState());

        // Initial setup
        setTimeout(() => {
            updateSliderSensitivity();
            updateKeyframeButtonState();
        }, 100);

        // tooltips
        tooltips.register(depthVisualizationToggle, 'Enable/disable depth visualization mode', 'top');
        tooltips.register(depthMinSlider, 'Minimum depth value (displayed as white)', 'top');
        tooltips.register(depthMaxSlider, 'Maximum depth value (displayed as black)', 'top');
        tooltips.register(depthReverseToggle, 'Reverse the depth color mapping', 'top');
        tooltips.register(colorRampSelect, 'Select color scheme for depth visualization', 'top');
        tooltips.register(depthNoneModeToggle, 'Use regular view depth for visualization (default)', 'top');
        tooltips.register(depthXModeToggle, 'Use X-coordinate for depth visualization', 'top');
        tooltips.register(depthYModeToggle, 'Use Y-coordinate for depth visualization', 'top');
        tooltips.register(depthZModeToggle, 'Use Z-coordinate for depth visualization', 'top');
        tooltips.register(depthBlendSlider, 'Blend between original colors and depth visualization (0=color, 1=depth)', 'top');
        tooltips.register(autoRangeToggle, 'Automatically set depth range to match the actual data bounds when using coordinate-based depth modes', 'top');
        tooltips.register(depthAddKeyframeButton, 'Add depth visualization keyframe at current timeline position. Check timeline panel to see keyframes.', 'top');
        tooltips.register(depthClearKeyframesButton, 'Remove all depth visualization keyframes from the timeline.', 'top');
    }
}

export { DepthVisualizationPanel };
