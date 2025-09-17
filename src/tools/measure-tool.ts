import { Entity, Vec3 } from 'playcanvas';
import * as pc from 'playcanvas';

import { Events } from '../events';
import { Scene } from '../scene';
import { Splat } from '../splat';

export class MeasureTool {
    events: Events;
    scene: Scene;
    parent: HTMLElement;
    active = false;
    startPoint: Vec3 = null;
    endPoint: Vec3 = null;
    startSplat: Splat = null;
    endSplat: Splat = null;
    lineEntity: Entity = null;
    startPointMarker: Entity = null;
    endPointMarker: Entity = null;
    currentDistance: number = 0;

    constructor(events: Events, scene: Scene, parent: HTMLElement) {
        this.events = events;
        this.scene = scene;
        this.parent = parent;

        const pointerdown = (e: PointerEvent) => {
            if (e.button !== 0 || e.altKey) return;

            e.preventDefault();
            e.stopPropagation();

            this.pickSplatPointForMeasurement(e.offsetX, e.offsetY);
        };

        const keydown = (e: KeyboardEvent) => {
            if (e.key === 'Backspace') {
                this.clearMeasurement();
            } else if (e.key === 'Escape') {
                events.fire('tool.deactivate');
            }
        };

        this.activate = () => {
            this.parent.style.display = 'block';
            this.parent.addEventListener('pointerdown', pointerdown);
            document.addEventListener('keydown', keydown);
            this.events.fire('measure.activate');
        };

        this.deactivate = () => {
            this.parent.style.display = 'none';
            this.parent.removeEventListener('pointerdown', pointerdown);
            document.removeEventListener('keydown', keydown);
            this.clearMeasurement();
            this.scene.forceRender = true;
            this.events.fire('measure.deactivate');
        };

        events.on('measure.scaleChanged', (scale: number) => {
            this.updateMeasureLineForScale(scale);
        });
    }

    activate: () => void;
    deactivate: () => void;

    pickSplatPointForMeasurement(screenX: number, screenY: number) {
        const camera = this.scene.camera;
        if (!camera) return;

        const originalSetFocalPoint = camera.setFocalPoint;
        const originalSetDistance = camera.setDistance;

        let pickedSplat = null;
        let pickedPosition = null;

        camera.setFocalPoint = () => {};
        camera.setDistance = () => {};

        const handlePick = (details: { splat: Splat, position: Vec3 }) => {
            pickedSplat = details.splat;
            pickedPosition = details.position.clone();
        };

        this.scene.events.once('camera.focalPointPicked', handlePick);

        camera.pickFocalPoint(screenX, screenY);

        camera.setFocalPoint = originalSetFocalPoint;
        camera.setDistance = originalSetDistance;

        if (pickedSplat && pickedPosition) {
            this.handleSplatPointPicked(pickedSplat, pickedPosition);
        }
    }

    handleSplatPointPicked(splat: Splat, position: Vec3) {
        if (!this.startPoint) {
            this.startPoint = position.clone();
            this.startSplat = splat;
            this.createPointMarker(position, 'start');
            this.events.fire('measure.startPoint', this.startPoint);
        } else if (!this.endPoint) {
            this.endPoint = position.clone();
            this.endSplat = splat;
            this.createPointMarker(position, 'end');
            this.events.fire('measure.endPoint', this.endPoint);

            this.createMeasureLine();

            const distance = this.calculateDistance(this.startPoint, this.endPoint);
            this.updateDistanceDisplay(distance);
        } else {
            this.events.fire('measure.reset');
            this.clearMeasurement();
            this.startPoint = position.clone();
            this.startSplat = splat;
            this.createPointMarker(position, 'start');
            this.events.fire('measure.startPoint', this.startPoint);
        }
    }

    calculateDistance(point1: Vec3, point2: Vec3): number {
        return Math.sqrt(
            Math.pow(point2.x - point1.x, 2) +
            Math.pow(point2.y - point1.y, 2) +
            Math.pow(point2.z - point1.z, 2)
        );
    }

    getCurrentScale(): number {
        try {
            const pivot = this.events.invoke('pivot');
            return pivot?.transform?.scale?.x || 1;
        } catch (error) {
            return 1;
        }
    }

    updateDistanceDisplay(distance: number) {
        this.currentDistance = distance;
        this.events.fire('measure.distanceSet', distance);
    }

    clearMeasurement() {
        this.startPoint = null;
        this.endPoint = null;
        this.startSplat = null;
        this.endSplat = null;
        this.currentDistance = 0;

        if (this.lineEntity) {
            this.lineEntity.destroy();
            this.lineEntity = null;
        }

        if (this.startPointMarker) {
            this.startPointMarker.destroy();
            this.startPointMarker = null;
        }

        if (this.endPointMarker) {
            this.endPointMarker.destroy();
            this.endPointMarker = null;
        }
    }

    createPointMarker(position: Vec3, type: 'start' | 'end', customScale?: number) {
        if (!this.scene?.app) return;

        const marker = new Entity(`measurePoint_${type}`);

        const material = new pc.StandardMaterial();
        if (type === 'start') {
            material.diffuse.set(0, 1, 0);
            material.emissive.set(0, 0.5, 0);
        } else {
            material.diffuse.set(1, 0, 0);
            material.emissive.set(0.5, 0, 0);
        }
        material.update();

        marker.addComponent('render', {
            type: 'sphere',
            material: material
        });

        marker.setPosition(position);

        const currentScale = customScale || this.getCurrentScale();
        const markerSize = 0.1 * Math.pow(currentScale, 0.3);
        marker.setLocalScale(markerSize, markerSize, markerSize);

        this.scene.app.root.addChild(marker);

        if (type === 'start') {
            this.startPointMarker = marker;
        } else {
            this.endPointMarker = marker;
        }

        this.scene.forceRender = true;
    }

    createMeasureLine() {
        if (this.lineEntity) {
            this.lineEntity.destroy();
        }

        if (!this.scene?.app) return;

        this.lineEntity = new Entity('measureLine');

        const material = new pc.StandardMaterial();
        material.diffuse.set(1, 1, 0);
        material.emissive.set(1, 1, 0);
        material.update();

        this.lineEntity.addComponent('render', {
            type: 'cylinder',
            material: material
        });

        const midPoint = new Vec3().add2(this.startPoint, this.endPoint).mulScalar(0.5);
        const distance = this.calculateDistance(this.startPoint, this.endPoint);
        const direction = new Vec3().sub2(this.endPoint, this.startPoint).normalize();

        this.lineEntity.setPosition(midPoint);

        const up = new Vec3(0, 1, 0);
        const dot = direction.dot(up);

        if (Math.abs(dot) > 0.99) {
            const right = new Vec3(1, 0, 0);
            this.lineEntity.lookAt(direction.x > 0 ? right : new Vec3(-1, 0, 0));
        } else {
            this.lineEntity.lookAt(this.endPoint);
        }

        this.lineEntity.rotateLocal(90, 0, 0);

        const currentScale = this.getCurrentScale();
        const lineThickness = 0.02 * Math.pow(currentScale, 0.3);
        this.lineEntity.setLocalScale(lineThickness, distance, lineThickness);

        this.scene.app.root.addChild(this.lineEntity);
        this.scene.forceRender = true;
    }

    updateMeasureLineForScale(scale: number) {
        if (this.startPoint && this.endPoint) {
            const scaledStartPoint = this.startPoint.clone().mulScalar(scale);
            const scaledEndPoint = this.endPoint.clone().mulScalar(scale);

            const midPoint = new Vec3().add2(scaledStartPoint, scaledEndPoint).mulScalar(0.5);
            const distance = this.calculateDistance(scaledStartPoint, scaledEndPoint);
            const direction = new Vec3().sub2(scaledEndPoint, scaledStartPoint).normalize();

            if (!this.lineEntity) {
                this.lineEntity = new Entity('measureLine');

                const material = new pc.StandardMaterial();
                material.diffuse.set(1, 1, 0);
                material.emissive.set(1, 1, 0);
                material.update();

                this.lineEntity.addComponent('render', {
                    type: 'cylinder',
                    material: material
                });

                this.scene.app.root.addChild(this.lineEntity);
            }

            this.lineEntity.setPosition(midPoint);

            const up = new Vec3(0, 1, 0);
            const dot = direction.dot(up);

            if (Math.abs(dot) > 0.99) {
                const right = new Vec3(1, 0, 0);
                this.lineEntity.lookAt(direction.x > 0 ? right : new Vec3(-1, 0, 0));
            } else {
                this.lineEntity.lookAt(scaledEndPoint);
            }

            this.lineEntity.rotateLocal(90, 0, 0);

            const lineThickness = 0.02 * Math.pow(scale, 0.3);
            this.lineEntity.setLocalScale(lineThickness, distance, lineThickness);

            if (this.startPointMarker) {
                this.startPointMarker.setPosition(scaledStartPoint);
                const markerSize = 0.1 * Math.pow(scale, 0.3);
                this.startPointMarker.setLocalScale(markerSize, markerSize, markerSize);
            } else if (this.startPoint) {
                this.createPointMarker(scaledStartPoint, 'start', scale);
            }

            if (this.endPointMarker) {
                this.endPointMarker.setPosition(scaledEndPoint);
                const markerSize = 0.1 * Math.pow(scale, 0.3);
                this.endPointMarker.setLocalScale(markerSize, markerSize, markerSize);
            } else if (this.endPoint) {
                this.createPointMarker(scaledEndPoint, 'end', scale);
            }

            this.currentDistance = distance;
            this.scene.forceRender = true;
        }
    }
}
