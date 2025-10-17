import { Button, Container, Label, Panel, NumericInput } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { Events } from '../events';

interface MeasurementData {
    point1: Vec3 | null;
    point2: Vec3 | null;
    distance: number | null;
}

class MeasurementPanel extends Panel {
    private events: Events;
    private point1Label: Label;
    private point2Label: Label;
    private distanceLabel: Label;
    private clearButton: Button;
    private redo1Button: Button;
    private redo2Button: Button;
    private exitButton: Button;
    private scaleInput: NumericInput;
    private scaleButton: Button;
    private visible: boolean = false;

    constructor(events: Events) {
        super({
            id: 'measurement-panel',
            class: 'measurement-panel',
            headerText: 'MEASUREMENT TOOL',
            collapsible: false,
            collapsed: false,
            removable: false
        });

        this.events = events;
        this.createUI();
        this.bindEvents();

        // Add selective mouse event prevention to stop camera controls but allow UI interactions
        console.log('🚫 Adding selective mouse event prevention for panel');

        const preventCameraControls = (e: Event) => {
            const target = e.target as HTMLElement;

            // Allow events ONLY on interactive elements (buttons, inputs)
            if (target.closest('.pcui-button') ||
                target.closest('.pcui-numeric-input') ||
                target.closest('button') ||
                target.closest('input') ||
                target.matches('button, input') ||
                target.matches('.pcui-button, .pcui-numeric-input') ||
                target.matches('[role="button"]')) {
                console.log('🟢 Allowing event on interactive element:', e.type, target.className || target.tagName);
                return; // Allow the event to proceed
            }

            // Block ALL other events to prevent camera controls
            console.log('🚫 Blocking camera control event:', e.type, target.className || target.tagName);
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        };

        // Prevent ALL mouse/touch events that could trigger camera controls
        const mouseEvents = [
            'mousedown', 'mouseup', 'mousemove', 'click',
            'wheel', 'contextmenu', 'dblclick',
            'pointerdown', 'pointerup', 'pointermove', 'pointercancel',
            'touchstart', 'touchmove', 'touchend', 'touchcancel',
            'drag', 'dragstart', 'dragend'
        ];

        mouseEvents.forEach((eventType) => {
            // Add to both capture and bubble phases for maximum coverage
            this.dom.addEventListener(eventType, preventCameraControls, true); // Capture phase
            this.dom.addEventListener(eventType, preventCameraControls, false); // Bubble phase
        });

        // Simplified approach - just set a CSS style to indicate panel should block camera
        this.dom.setAttribute('data-blocks-camera', 'true');

        // Mouse enter/leave tracking for debugging
        this.dom.addEventListener('mouseenter', () => {
            console.log('📍 Mouse entered measurement panel');
        });

        this.dom.addEventListener('mouseleave', () => {
            console.log('📍 Mouse left measurement panel');
        });

        // Start hidden and keep hidden at startup
        this.dom.style.display = 'none';
        this.visible = false;

        // Add CSS to help block pointer events (except on interactive elements)
        this.dom.style.position = 'relative';
        this.dom.style.zIndex = '1000';

        console.log('🙈 Measurement panel created and hidden at startup');
        console.log('📺 Panel DOM info at startup:', {
            element: this.dom.tagName,
            id: this.dom.id,
            classes: Array.from(this.dom.classList),
            parent: this.dom.parentElement?.tagName,
            display: this.dom.style.display,
            position: this.dom.style.position,
            zIndex: this.dom.style.zIndex
        });

        // Try delayed event binding after UI is fully created
        setTimeout(() => {
            console.log('⏱️ Attempting delayed button event binding...');
            this.bindButtonEvents();
        }, 100);
    }

    private createUI() {
        // Instructions
        const instructionsLabel = new Label({
            text: 'Click two points to measure distance',
            class: 'measurement-instructions'
        });

        // Point 1 container
        const point1Container = new Container({
            class: 'measurement-row'
        });

        const point1LabelText = new Label({
            text: 'Point 1:',
            class: 'measurement-label'
        });

        this.point1Label = new Label({
            text: '--- , --- , ---',
            class: ['measurement-value', 'measurement-empty']
        });

        point1Container.append(point1LabelText);
        point1Container.append(this.point1Label);

        // Point 2 container
        const point2Container = new Container({
            class: 'measurement-row'
        });

        const point2LabelText = new Label({
            text: 'Point 2:',
            class: 'measurement-label'
        });

        this.point2Label = new Label({
            text: '--- , --- , ---',
            class: ['measurement-value', 'measurement-empty']
        });

        point2Container.append(point2LabelText);
        point2Container.append(this.point2Label);

        // Distance container
        const distanceContainer = new Container({
            class: ['measurement-row', 'measurement-distance-row']
        });

        const distanceLabelText = new Label({
            text: 'Distance:',
            class: ['measurement-label', 'measurement-distance-label']
        });

        this.distanceLabel = new Label({
            text: '---',
            class: ['measurement-value', 'measurement-distance-value', 'measurement-empty']
        });

        distanceContainer.append(distanceLabelText);
        distanceContainer.append(this.distanceLabel);

        // Buttons container
        const buttonsContainer = new Container({
            class: 'measurement-buttons'
        });

        this.clearButton = new Button({
            text: 'Clear',
            size: 'small',
            class: ['measurement-button', 'measurement-clear-button']
        });
        console.log('🔗 Clear button created:', this.clearButton);
        console.log('🔗 Clear button DOM element:', this.clearButton.dom);
        console.log('🔗 Binding Clear button click handler');
        this.clearButton.on('click', () => {
            console.log('📌 Clear button event fired!');
            this.clearMeasurement();
        });
        // Try multiple event types
        this.clearButton.dom.addEventListener('click', (e) => {
            console.log('📌 Clear button DOM click!');
            e.stopPropagation();
            this.clearMeasurement();
        });
        this.clearButton.dom.addEventListener('mousedown', (e) => {
            console.log('📌 Clear button mousedown!');
            e.stopPropagation();
            this.clearMeasurement();
        });
        this.clearButton.dom.addEventListener('pointerdown', (e) => {
            console.log('📌 Clear button pointerdown!');
            e.stopPropagation();
            this.clearMeasurement();
        });

        this.redo1Button = new Button({
            text: 'Redo1',
            size: 'small',
            class: ['measurement-button', 'measurement-redo1-button']
        });
        console.log('🔗 Binding Redo1 button click handler');
        this.redo1Button.on('click', () => {
            console.log('📌 Redo1 button event fired!');
            this.redo1Measurement();
        });
        // Try alternative event types
        this.redo1Button.dom.addEventListener('click', (e) => {
            console.log('📌 Redo1 button DOM click!');
            e.stopPropagation();
            this.redo1Measurement();
        });

        this.redo2Button = new Button({
            text: 'Redo2',
            size: 'small',
            class: ['measurement-button', 'measurement-redo2-button']
        });
        console.log('🔗 Binding Redo2 button click handler');
        this.redo2Button.on('click', () => {
            console.log('📌 Redo2 button event fired!');
            this.redo2Measurement();
        });
        // Try alternative event types
        this.redo2Button.dom.addEventListener('click', (e) => {
            console.log('📌 Redo2 button DOM click!');
            e.stopPropagation();
            this.redo2Measurement();
        });

        this.exitButton = new Button({
            text: 'Close',
            size: 'small',
            class: ['measurement-button', 'measurement-exit-button']
        });
        console.log('🔗 Binding Close button click handler');
        this.exitButton.on('click', () => {
            console.log('📌 Close button event fired!');
            this.exitMeasurement();
        });
        // Try alternative event types
        this.exitButton.dom.addEventListener('click', (e) => {
            console.log('📌 Close button DOM click!');
            e.stopPropagation();
            this.exitMeasurement();
        });

        // Scale container
        const scaleContainer = new Container({
            class: ['measurement-row', 'measurement-scale-row']
        });

        const scaleLabelText = new Label({
            text: 'Target Scale:',
            class: 'measurement-label'
        });

        this.scaleInput = new NumericInput({
            placeholder: 'Enter target distance',
            precision: 3,
            class: 'measurement-scale-input'
        });

        this.scaleButton = new Button({
            text: 'Scale Splat',
            size: 'small',
            class: ['measurement-button', 'measurement-scale-button']
        });

        console.log('🔗 Scale button created:', this.scaleButton);
        console.log('🔗 Scale button DOM element:', this.scaleButton.dom);

        // Simple single event handler
        this.scaleButton.on('click', () => {
            console.log('🎯 Scale button clicked!');
            this.scaleSplat();
        });

        // Add a fallback re-enable mechanism
        this.scaleButton.dom.addEventListener('dblclick', () => {
            console.log('🔄 Double-click detected - force re-enabling scale button');
            this.scaleButton.enabled = true;
            this.scaleButton.text = 'Scale Splat';
        });

        scaleContainer.append(scaleLabelText);
        scaleContainer.append(this.scaleInput);
        scaleContainer.append(this.scaleButton);

        buttonsContainer.append(this.clearButton);
        buttonsContainer.append(this.redo1Button);
        buttonsContainer.append(this.redo2Button);
        buttonsContainer.append(this.exitButton);

        // Add all containers to panel
        this.append(instructionsLabel);
        this.append(point1Container);
        this.append(point2Container);
        this.append(distanceContainer);
        this.append(scaleContainer);
        this.append(buttonsContainer);
    }

    private bindEvents() {
        // Listen for measurement updates
        this.events.on('measurement.updated', (data: MeasurementData) => {
            this.updateMeasurement(data);
        });

        // Listen for measurement tool state changes
        this.events.on('measurement.show', () => {
            console.log('📺 📢 MEASUREMENT.SHOW event received!');
            console.log('📺 Panel state before show:', {
                visible: this.visible,
                display: this.dom.style.display,
                visibility: this.dom.style.visibility,
                opacity: this.dom.style.opacity,
                zIndex: this.dom.style.zIndex
            });
            this.show();
            console.log('📺 Panel state after show:', {
                visible: this.visible,
                display: this.dom.style.display,
                visibility: this.dom.style.visibility,
                opacity: this.dom.style.opacity,
                zIndex: this.dom.style.zIndex
            });
        });

        this.events.on('measurement.hide', () => {
            this.hide();
        });

        this.events.on('measurement.toggle', () => {
            this.toggle();
        });
    }

    private updateMeasurement(data: MeasurementData) {
        // Update Point 1
        if (data.point1) {
            this.point1Label.text = `${data.point1.x.toFixed(3)}, ${data.point1.y.toFixed(3)}, ${data.point1.z.toFixed(3)}`;
            this.point1Label.class.remove('measurement-empty');
            this.point1Label.class.add('measurement-point2'); // GREEN background (swapped)
        } else {
            this.point1Label.text = '--- , --- , ---';
            this.point1Label.class.add('measurement-empty');
            this.point1Label.class.remove('measurement-point2');
        }

        // Update Point 2
        if (data.point2) {
            this.point2Label.text = `${data.point2.x.toFixed(3)}, ${data.point2.y.toFixed(3)}, ${data.point2.z.toFixed(3)}`;
            this.point2Label.class.remove('measurement-empty');
            this.point2Label.class.add('measurement-point1'); // RED background (swapped)
        } else {
            this.point2Label.text = '--- , --- , ---';
            this.point2Label.class.add('measurement-empty');
            this.point2Label.class.remove('measurement-point1');
        }

        // Update Distance
        if (data.distance !== null && data.distance !== undefined) {
            this.distanceLabel.text = `${data.distance.toFixed(3)} units`;
            this.distanceLabel.class.remove('measurement-empty');
            this.distanceLabel.class.add('measurement-complete');
        } else {
            this.distanceLabel.text = '---';
            this.distanceLabel.class.add('measurement-empty');
            this.distanceLabel.class.remove('measurement-complete');
        }
    }

    private clearMeasurement() {
        console.log('🧹 Clear button clicked');
        // Temporarily disable measurement tool clicks
        this.events.fire('measurement.disable.temporary');
        this.events.fire('measurement.clear');
    }

    private redo1Measurement() {
        console.log('🔄 Redo1 button clicked - clearing first point only');
        // Temporarily disable measurement tool clicks
        this.events.fire('measurement.disable.temporary');
        this.events.fire('measurement.redo.first');
    }

    private redo2Measurement() {
        console.log('🔄 Redo2 button clicked - clearing second point only');
        // Temporarily disable measurement tool clicks
        this.events.fire('measurement.disable.temporary');
        this.events.fire('measurement.redo.second');
    }

    private exitMeasurement() {
        console.log('🚪 Close button clicked');
        // Temporarily disable measurement tool clicks
        this.events.fire('measurement.disable.temporary');
        this.events.fire('measurement.exit');
    }

    private scaleSplat() {
        console.log('🎯 📢 Scale splat button clicked!');

        // Get current measurement data with extensive debugging
        console.log('🔍 Attempting to get measurement data...');
        const measurementData = this.events.invoke('measurement.getCurrentData');
        console.log('🔍 Raw measurement data:', measurementData);

        if (!measurementData) {
            console.log('❌ No measurement data returned from events');
            return;
        }

        if (!measurementData.distance) {
            console.log('❌ No distance in measurement data:', measurementData);
            return;
        }

        if (measurementData.distance === 0) {
            console.log('❌ Distance is zero:', measurementData.distance);
            return;
        }

        console.log('✅ Valid measurement data found');

        // Get target distance from input with debugging
        console.log('🔍 Getting target distance from input...');
        const targetDistance = this.scaleInput.value;
        console.log('🔍 Scale input value:', targetDistance, 'Type:', typeof targetDistance);

        if (!targetDistance) {
            console.log('❌ No target distance entered');
            return;
        }

        if (targetDistance <= 0) {
            console.log('❌ Target distance is not positive:', targetDistance);
            return;
        }

        console.log('✅ Valid target distance found');

        // Calculate scale factor
        const currentDistance = measurementData.distance;
        const scaleFactor = targetDistance / currentDistance;

        console.log(`📏 Current distance: ${currentDistance.toFixed(3)} units`);
        console.log(`🎯 Target distance: ${targetDistance} units`);
        console.log(`📐 Scale factor calculation: ${targetDistance} ÷ ${currentDistance.toFixed(3)} = ${scaleFactor.toFixed(6)}`);

        // Add bounds checking for reasonable scale factors
        if (scaleFactor < 0.001) {
            console.log('⚠️ Scale factor too small (< 0.001), scaling canceled');
            return;
        }
        if (scaleFactor > 1000) {
            console.log('⚠️ Scale factor too large (> 1000), scaling canceled');
            return;
        }

        console.log(`🚦 Scale factor validation passed: ${scaleFactor.toFixed(6)}`);

        // Disable the scale button temporarily to prevent multiple clicks
        console.log('🗑 Disabling scale button during operation');
        this.scaleButton.enabled = false;
        this.scaleButton.text = 'Scaling...';

        // Fire event to scale all splats with debugging
        console.log('📢 Firing measurement.scale.splats event with factor:', scaleFactor);
        this.events.fire('measurement.scale.splats', scaleFactor);
        console.log('✅ Scale event fired successfully');

        // Clear the measurement and re-enable button after scaling
        const timeoutId = setTimeout(() => {
            try {
                console.log('🧹 Clearing measurement after scaling');
                this.events.fire('measurement.clear');

                // Re-enable the scale button
                console.log('✅ Re-enabling scale button');
                this.scaleButton.enabled = true;
                this.scaleButton.text = 'Scale Splat';
                console.log('✅ Scale button state:', {
                    enabled: this.scaleButton.enabled,
                    text: this.scaleButton.text
                });
            } catch (error) {
                console.error('❌ Error in scale button cleanup:', error);
                // Force re-enable even if there's an error
                this.scaleButton.enabled = true;
                this.scaleButton.text = 'Scale Splat';
            }
        }, 500); // Increased delay to ensure scaling completes

        console.log('🕒 Set timeout for scale button re-enable:', timeoutId);

        // Temporarily disable measurement tool clicks
        this.events.fire('measurement.disable.temporary');

        console.log('🎉 Scale operation initiated successfully!');
    }

    public toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    public show() {
        console.log('📺 🚀 SHOW method called');

        this.visible = true;

        // Force multiple CSS properties to ensure visibility
        this.dom.style.display = 'block';
        this.dom.style.visibility = 'visible';
        this.dom.style.opacity = '1';
        this.dom.style.zIndex = '1000';
        this.dom.style.position = 'relative';

        // Remove any classes that might hide it
        this.dom.classList.remove('hidden');
        this.dom.removeAttribute('hidden');

        // Add visible class if it exists
        this.dom.classList.add('visible');

        // Fix panel positioning and styling - COMPACT VERSION
        this.dom.style.position = 'fixed';
        this.dom.style.bottom = '20px';
        this.dom.style.right = '20px';
        this.dom.style.top = 'auto';
        this.dom.style.left = 'auto';
        this.dom.style.width = '320px';
        this.dom.style.height = 'auto';
        this.dom.style.maxHeight = '400px';
        this.dom.style.overflow = 'auto';
        this.dom.style.zIndex = '1000';
        this.dom.style.backgroundColor = 'rgba(40, 40, 40, 0.95)';
        this.dom.style.border = '1px solid #666';
        this.dom.style.borderRadius = '8px';
        this.dom.style.padding = '12px';
        this.dom.style.color = 'white';
        this.dom.style.fontSize = '12px';
        this.dom.style.fontFamily = 'Arial, sans-serif';
        this.dom.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';

        // Add targeted mouse event blocking for input field
        this.dom.style.pointerEvents = 'auto';
        this.addInputFieldProtection();

        console.log('📺 Final DOM state after show:', {
            display: this.dom.style.display,
            visibility: this.dom.style.visibility,
            opacity: this.dom.style.opacity,
            zIndex: this.dom.style.zIndex,
            position: this.dom.style.position,
            top: this.dom.style.top,
            left: this.dom.style.left,
            classList: Array.from(this.dom.classList),
            parentElement: this.dom.parentElement?.tagName,
            offsetWidth: this.dom.offsetWidth,
            offsetHeight: this.dom.offsetHeight,
            getBoundingClientRect: this.dom.getBoundingClientRect()
        });

        // Also try to ensure the panel is appended to DOM
        if (!this.dom.parentElement) {
            console.log('😨 Panel has no parent! Trying to find where to append it...');
            const container = document.querySelector('#ui-container') || document.querySelector('.pcui-container') || document.body;
            container.appendChild(this.dom);
            console.log('📺 Appended panel to:', container.tagName);
        }

        // Fire event
        this.events.fire('measurement.panel.visible', true);
        console.log('🎉 Measurement panel show() completed');
    }

    public hide() {
        if (this.visible) {
            this.visible = false;
            this.dom.style.display = 'none';
            this.dom.style.visibility = 'hidden';

            console.log('🙈 Hiding measurement panel');

            // Fire event
            this.events.fire('measurement.panel.visible', false);
            console.log('Measurement panel hidden');
        }
    }

    public get isVisible(): boolean {
        return this.visible;
    }

    private bindButtonEvents() {
        console.log('🔗 DELAYED: Binding button events...');

        // Clear button
        if (this.clearButton && this.clearButton.dom) {
            console.log('🔗 DELAYED: Clear button exists, adding listeners');

            // Remove any existing listeners
            const clearHandler = (e: Event) => {
                console.log('🧹 DELAYED CLEAR: Button clicked!');
                e.stopPropagation();
                e.preventDefault();
                this.clearMeasurement();
            };

            this.clearButton.dom.addEventListener('click', clearHandler, true);
            this.clearButton.dom.addEventListener('mousedown', clearHandler, true);
        }

        // Redo1 button
        if (this.redo1Button && this.redo1Button.dom) {
            console.log('🔗 DELAYED: Redo1 button exists, adding listeners');

            const redo1Handler = (e: Event) => {
                console.log('🔄 DELAYED REDO1: Button clicked!');
                e.stopPropagation();
                e.preventDefault();
                this.redo1Measurement();
            };

            this.redo1Button.dom.addEventListener('click', redo1Handler, true);
            this.redo1Button.dom.addEventListener('mousedown', redo1Handler, true);
        }

        // Redo2 button
        if (this.redo2Button && this.redo2Button.dom) {
            console.log('🔗 DELAYED: Redo2 button exists, adding listeners');

            const redo2Handler = (e: Event) => {
                console.log('🔄 DELAYED REDO2: Button clicked!');
                e.stopPropagation();
                e.preventDefault();
                this.redo2Measurement();
            };

            this.redo2Button.dom.addEventListener('click', redo2Handler, true);
            this.redo2Button.dom.addEventListener('mousedown', redo2Handler, true);
        }

        // Close button
        if (this.exitButton && this.exitButton.dom) {
            console.log('🔗 DELAYED: Close button exists, adding listeners');

            const closeHandler = (e: Event) => {
                console.log('🚪 DELAYED CLOSE: Button clicked!');
                e.stopPropagation();
                e.preventDefault();
                this.exitMeasurement();
            };

            this.exitButton.dom.addEventListener('click', closeHandler, true);
            this.exitButton.dom.addEventListener('mousedown', closeHandler, true);
        }
    }

    private addInputFieldProtection() {
        // Add event listeners to block camera events on interactive elements
        const blockCameraOnElement = (e: Event) => {
            console.log('🚫 Blocking camera event on UI element:', e.type);
            e.stopPropagation();
        };

        // Block camera-triggering events on interactive elements
        const cameraEvents = ['mousedown', 'mousemove', 'wheel', 'pointerdown', 'pointermove'];

        // Protect the scale input field
        cameraEvents.forEach((eventType) => {
            this.scaleInput.dom.addEventListener(eventType, blockCameraOnElement, true);
        });

        // Protect the scale button
        cameraEvents.forEach((eventType) => {
            this.scaleButton.dom.addEventListener(eventType, blockCameraOnElement, true);
        });

        // Also protect all other buttons
        const allButtons = [this.clearButton, this.redo1Button, this.redo2Button, this.exitButton];
        allButtons.forEach((button) => {
            cameraEvents.forEach((eventType) => {
                button.dom.addEventListener(eventType, blockCameraOnElement, true);
            });
        });

        console.log('🚫 Added camera blocking for all interactive elements');
    }
}

export { MeasurementPanel, MeasurementData };
