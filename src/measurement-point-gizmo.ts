import { TranslateGizmo, Vec3, Entity } from 'playcanvas';

import { Events } from './events';
import { Scene } from './scene';

interface MeasurementPointGizmoOptions {
    position: Vec3;
    pointIndex: 1 | 2; // Which measurement point this gizmo represents
    onPositionChanged: (newPosition: Vec3, pointIndex: 1 | 2) => void;
}

class MeasurementPointGizmo {
    private gizmo: TranslateGizmo;
    private events: Events;
    private scene: Scene;
    private pointIndex: 1 | 2;
    private onPositionChanged: (newPosition: Vec3, pointIndex: 1 | 2) => void;
    private targetEntity: Entity;

    constructor(events: Events, scene: Scene, options: MeasurementPointGizmoOptions) {
        this.events = events;
        this.scene = scene;
        this.pointIndex = options.pointIndex;
        this.onPositionChanged = options.onPositionChanged;

        // Create a target entity to represent the measurement point
        this.targetEntity = new Entity(`measurementPoint${options.pointIndex}`);
        this.targetEntity.setLocalPosition(options.position);
        this.scene.contentRoot.addChild(this.targetEntity);

        // Create the translate gizmo
        this.gizmo = new TranslateGizmo(scene.camera.entity.camera, scene.gizmoLayer);

        // Configure gizmo appearance
        this.gizmo.size = 0.5; // Smaller than normal gizmos
        this.gizmo.snapIncrement = 0.01; // Fine-grained movement

        // Set the gizmo to control our target entity
        this.gizmo.attach([this.targetEntity]);

        // Listen for gizmo movement events
        this.gizmo.on('transform:start', this.onTransformStart.bind(this));
        this.gizmo.on('transform:move', this.onTransformMove.bind(this));
        this.gizmo.on('transform:end', this.onTransformEnd.bind(this));

        console.log(`📐 Created measurement point ${this.pointIndex} gizmo at:`, options.position);
    }

    private onTransformStart() {
        console.log(`📐 Started moving measurement point ${this.pointIndex}`);
        // Disable measurement tool clicks while dragging gizmo
        this.events.fire('measurement.disable.temporary');
    }

    private onTransformMove() {
        const newPosition = this.targetEntity.getLocalPosition();
        console.log(`📐 Moving measurement point ${this.pointIndex} to:`, newPosition);

        // Update the measurement with the new position
        this.onPositionChanged(newPosition.clone(), this.pointIndex);
    }

    private onTransformEnd() {
        const finalPosition = this.targetEntity.getLocalPosition();
        console.log(`📐 Finished moving measurement point ${this.pointIndex} to:`, finalPosition);

        // Re-enable measurement tool clicks
        setTimeout(() => {
            this.events.fire('measurement.enable');
        }, 100);
    }

    updatePosition(newPosition: Vec3) {
        this.targetEntity.setLocalPosition(newPosition);
    }

    show() {
        this.gizmo.root.enabled = true;
    }

    hide() {
        this.gizmo.root.enabled = false;
    }

    destroy() {
        this.gizmo.detach();
        this.gizmo.destroy();
        this.targetEntity.destroy();
        console.log(`📐 Destroyed measurement point ${this.pointIndex} gizmo`);
    }
}

export { MeasurementPointGizmo, MeasurementPointGizmoOptions };
