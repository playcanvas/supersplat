import { Container, Label, Panel } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { Events } from '../events';

class CameraInfoPanel extends Panel {
    private events: Events;
    private cameraPositionLabel: Label;
    private cameraTargetLabel: Label;
    private visible: boolean = false;
    private updateInterval: number | null = null;

    constructor(events: Events) {
        super({
            id: 'camera-info-panel',
            class: 'camera-info-panel',
            headerText: 'CAMERA INFO',
            collapsible: false,
            collapsed: false,
            removable: false
        });

        this.events = events;
        this.createUI();
        this.bindEvents();

        // Start visible and immediately responsive
        this.visible = true;
        this.dom.style.display = 'block';

        // Start regular updates immediately (60 FPS for smooth updates)
        this.updateInterval = window.setInterval(() => {
            this.updateFromCurrentCamera();
        }, 1000 / 60);

        // Initial update
        this.updateFromCurrentCamera();

        console.log('Camera info panel started visible and responsive');
    }

    private createUI() {
        // Camera Position container
        const cameraPositionContainer = new Container({
            class: 'camera-info-row'
        });

        const cameraPositionLabelText = new Label({
            text: 'Camera:',
            class: 'camera-info-label'
        });

        this.cameraPositionLabel = new Label({
            text: '0.000, 0.000, 0.000',
            class: 'camera-info-value'
        });

        cameraPositionContainer.append(cameraPositionLabelText);
        cameraPositionContainer.append(this.cameraPositionLabel);

        // Camera Target container
        const cameraTargetContainer = new Container({
            class: 'camera-info-row'
        });

        const cameraTargetLabelText = new Label({
            text: 'Target:',
            class: 'camera-info-label'
        });

        this.cameraTargetLabel = new Label({
            text: '0.000, 0.000, 0.000',
            class: 'camera-info-value'
        });

        cameraTargetContainer.append(cameraTargetLabelText);
        cameraTargetContainer.append(this.cameraTargetLabel);

        // Add containers to panel
        this.append(cameraPositionContainer);
        this.append(cameraTargetContainer);
    }

    private bindEvents() {
        // Update camera info when camera pose changes
        this.events.on('camera.setPose', (pose: { position: Vec3, target: Vec3 }) => {
            this.updateCameraInfo(pose.position, pose.target);
        });

        // Also listen for general camera updates
        this.events.on('camera.updated', () => {
            this.updateFromCurrentCamera();
        });

        // Listen for toggle event
        this.events.on('camera.info.toggle', () => {
            this.toggle();
        });

        // Listen for show/hide events
        this.events.on('camera.info.show', () => {
            this.show();
        });

        this.events.on('camera.info.hide', () => {
            this.hide();
        });
    }

    private updateFromCurrentCamera() {
        try {
            // Get current camera pose
            if (this.events.functions.has('camera.getPose')) {
                const pose = this.events.invoke('camera.getPose');
                if (pose && pose.position && pose.target) {
                    this.updateCameraInfo(pose.position, pose.target);
                }
            }
        } catch (error) {
            console.warn('Could not get current camera pose:', error);
        }
    }

    private updateCameraInfo(position: Vec3, target: Vec3) {
        if (!this.visible) return; // Don't update if not visible to save performance

        // Format position
        const posText = `${position.x.toFixed(3)}, ${position.y.toFixed(3)}, ${position.z.toFixed(3)}`;
        this.cameraPositionLabel.text = posText;

        // Format target
        const targetText = `${target.x.toFixed(3)}, ${target.y.toFixed(3)}, ${target.z.toFixed(3)}`;
        this.cameraTargetLabel.text = targetText;
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

            // Update immediately when shown
            this.updateFromCurrentCamera();

            // Start regular updates if not already running
            if (!this.updateInterval) {
                this.updateInterval = window.setInterval(() => {
                    this.updateFromCurrentCamera();
                }, 1000 / 60);
            }

            // Fire event
            this.events.fire('camera.info.visible', true);
            console.log('Camera info panel shown');
        }
    }

    public hide() {
        if (this.visible) {
            this.visible = false;
            this.dom.style.display = 'none';

            // Stop regular updates
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }

            // Fire event
            this.events.fire('camera.info.visible', false);
            console.log('Camera info panel hidden');
        }
    }

    public get isVisible(): boolean {
        return this.visible;
    }
}

export { CameraInfoPanel };
