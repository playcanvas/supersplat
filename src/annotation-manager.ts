import { Vec3 } from 'playcanvas';

import { Events } from './events';

interface Annotation {
    name: string;
    description: string;
    position: number[];   // 3D world position [x, y, z]
    cameraPosition: number[];  // camera position when annotation was created
    cameraTarget: number[];    // camera target when annotation was created
    fov: number;
}

class AnnotationManager {
    private annotations: Annotation[] = [];
    private events: Events;

    constructor(events: Events) {
        this.events = events;

        events.function('annotations.list', () => {
            return this.annotations.map(a => ({ ...a }));
        });

        events.function('annotations.add', () => {
            const pose = events.invoke('camera.getPose');
            const fov = events.invoke('camera.fov');

            if (!pose) return null;

            // Place the annotation at the camera target (center of focus)
            const annotation: Annotation = {
                name: `Annotation ${this.annotations.length + 1}`,
                description: '',
                position: [pose.target.x, pose.target.y, pose.target.z],
                cameraPosition: [pose.position.x, pose.position.y, pose.position.z],
                cameraTarget: [pose.target.x, pose.target.y, pose.target.z],
                fov: fov
            };

            this.annotations.push(annotation);
            events.fire('annotations.changed', this.annotations);
            return annotation;
        });

        events.function('annotations.remove', (index: number) => {
            if (index >= 0 && index < this.annotations.length) {
                this.annotations.splice(index, 1);
                events.fire('annotations.changed', this.annotations);
            }
        });

        events.function('annotations.rename', (index: number, name: string) => {
            if (index >= 0 && index < this.annotations.length) {
                this.annotations[index].name = name;
                events.fire('annotations.changed', this.annotations);
            }
        });

        events.function('annotations.setDescription', (index: number, description: string) => {
            if (index >= 0 && index < this.annotations.length) {
                this.annotations[index].description = description;
                events.fire('annotations.changed', this.annotations);
            }
        });

        events.function('annotations.goto', (index: number) => {
            if (index >= 0 && index < this.annotations.length) {
                const annotation = this.annotations[index];
                const position = new Vec3(annotation.cameraPosition[0], annotation.cameraPosition[1], annotation.cameraPosition[2]);
                const target = new Vec3(annotation.cameraTarget[0], annotation.cameraTarget[1], annotation.cameraTarget[2]);

                events.fire('camera.setPose', { position, target }, 1);
                events.fire('camera.setFov', annotation.fov);
            }
        });

        events.function('annotations.setPosition', (index: number, position: number[]) => {
            if (index >= 0 && index < this.annotations.length) {
                this.annotations[index].position = position;
                events.fire('annotations.changed', this.annotations);
            }
        });

        events.function('annotations.reorder', (fromIndex: number, toIndex: number) => {
            if (fromIndex >= 0 && fromIndex < this.annotations.length && toIndex >= 0 && toIndex < this.annotations.length && fromIndex !== toIndex) {
                const [item] = this.annotations.splice(fromIndex, 1);
                this.annotations.splice(toIndex, 0, item);
                events.fire('annotations.changed', this.annotations);
            }
        });

        events.function('annotations.load', (annotations: Annotation[]) => {
            this.annotations = annotations.map(a => ({ ...a }));
            events.fire('annotations.changed', this.annotations);
        });

        events.function('annotations.update', (index: number) => {
            if (index >= 0 && index < this.annotations.length) {
                const pose = events.invoke('camera.getPose');
                const fov = events.invoke('camera.fov');

                if (pose) {
                    this.annotations[index].position = [pose.target.x, pose.target.y, pose.target.z];
                    this.annotations[index].cameraPosition = [pose.position.x, pose.position.y, pose.position.z];
                    this.annotations[index].cameraTarget = [pose.target.x, pose.target.y, pose.target.z];
                    this.annotations[index].fov = fov;
                    events.fire('annotations.changed', this.annotations);
                }
            }
        });
    }
}

export { AnnotationManager, Annotation };
