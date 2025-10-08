import { Button, Container, Label, Panel } from '@playcanvas/pcui';
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

        // Add test click handler to the panel itself
        console.log('🧪 Adding test click handler to panel');
        this.dom.addEventListener('click', (e) => {
            console.log('🧪 PANEL CLICK TEST - Panel was clicked!', e.target);
        });

        // Start hidden and keep hidden at startup
        this.dom.style.display = 'none';
        this.visible = false;
        console.log('🙈 Measurement panel hidden at startup');

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

        buttonsContainer.append(this.clearButton);
        buttonsContainer.append(this.redo1Button);
        buttonsContainer.append(this.redo2Button);
        buttonsContainer.append(this.exitButton);

        // Add all containers to panel
        this.append(instructionsLabel);
        this.append(point1Container);
        this.append(point2Container);
        this.append(distanceContainer);
        this.append(buttonsContainer);
    }

    private bindEvents() {
        // Listen for measurement updates
        this.events.on('measurement.updated', (data: MeasurementData) => {
            this.updateMeasurement(data);
        });

        // Listen for measurement tool state changes
        this.events.on('measurement.show', () => {
            this.show();
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

    public toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    public show() {
        if (!this.visible) {
            this.visible = true;
            this.dom.style.display = 'block';

            // Fire event
            this.events.fire('measurement.panel.visible', true);
            console.log('Measurement panel shown');
        }
    }

    public hide() {
        if (this.visible) {
            this.visible = false;
            this.dom.style.display = 'none';

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
}

export { MeasurementPanel, MeasurementData };
