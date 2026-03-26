import { Vec3 } from 'playcanvas';

import { Events } from './events';

interface View {
    name: string;
    position: number[];
    target: number[];
    fov: number;
}

class ViewManager {
    private views: View[] = [];
    private events: Events;

    constructor(events: Events) {
        this.events = events;

        events.function('views.list', () => {
            return this.views.map(v => ({ ...v }));
        });

        events.function('views.add', () => {
            const pose = events.invoke('camera.getPose');
            const fov = events.invoke('camera.fov');

            if (!pose) return null;

            const view: View = {
                name: `View ${this.views.length + 1}`,
                position: [pose.position.x, pose.position.y, pose.position.z],
                target: [pose.target.x, pose.target.y, pose.target.z],
                fov: fov
            };

            this.views.push(view);
            events.fire('views.changed', this.views);
            return view;
        });

        events.function('views.remove', (index: number) => {
            if (index >= 0 && index < this.views.length) {
                this.views.splice(index, 1);
                events.fire('views.changed', this.views);
            }
        });

        events.function('views.rename', (index: number, name: string) => {
            if (index >= 0 && index < this.views.length) {
                this.views[index].name = name;
                events.fire('views.changed', this.views);
            }
        });

        events.function('views.goto', (index: number) => {
            if (index >= 0 && index < this.views.length) {
                const view = this.views[index];
                const position = new Vec3(view.position[0], view.position[1], view.position[2]);
                const target = new Vec3(view.target[0], view.target[1], view.target[2]);

                events.fire('camera.setPose', { position, target }, 1);
                events.fire('camera.setFov', view.fov);
            }
        });

        events.function('views.load', (views: View[]) => {
            this.views = views.map(v => ({ ...v }));
            events.fire('views.changed', this.views);
        });

        events.function('views.reorder', (fromIndex: number, toIndex: number) => {
            if (fromIndex >= 0 && fromIndex < this.views.length && toIndex >= 0 && toIndex < this.views.length && fromIndex !== toIndex) {
                const [item] = this.views.splice(fromIndex, 1);
                this.views.splice(toIndex, 0, item);
                events.fire('views.changed', this.views);
            }
        });

        events.function('views.update', (index: number) => {
            if (index >= 0 && index < this.views.length) {
                const pose = events.invoke('camera.getPose');
                const fov = events.invoke('camera.fov');

                if (pose) {
                    this.views[index].position = [pose.position.x, pose.position.y, pose.position.z];
                    this.views[index].target = [pose.target.x, pose.target.y, pose.target.z];
                    this.views[index].fov = fov;
                    events.fire('views.changed', this.views);
                }
            }
        });
    }
}

export { ViewManager, View };
