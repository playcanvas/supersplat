import { Container, Label } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { makeEditable, parseNumbers } from './editable-text';
import { Events } from '../events';
import { i18n } from './localization';
import { Tooltips } from './tooltips';

// round to 2 decimals and drop trailing zeros ("0.00" -> "0", "0.50" -> "0.5")
const fmt = (n: number) => `${parseFloat(n.toFixed(2))}`;

class CameraInfoOverlay extends Container {
    constructor(events: Events, tooltips: Tooltips) {
        super({
            id: 'camera-info-overlay',
            hidden: true
        });

        // stop pointer events reaching the canvas and moving the camera
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const createRow = (letter: string, tooltipKey: string, apply: (value: number[]) => void) => {
            const row = new Container({
                class: 'camera-info-row'
            });

            const key = new Label({
                class: 'camera-info-key',
                text: letter
            });

            const value = new Label({
                class: 'camera-info-value'
            });

            row.append(key);
            row.append(value);
            this.append(row);

            tooltips.register(row, () => i18n.t(tooltipKey), 'top');

            return makeEditable(value.dom, (text) => {
                const parsed = parseNumbers(text, 3);
                if (parsed) {
                    apply(parsed);
                }
                return !!parsed;
            });
        };

        const positionRow = createRow('P', 'camera-info.position', (v) => {
            const { target } = events.invoke('camera.getPose');
            events.fire('camera.setPose', {
                position: new Vec3(v[0], v[1], v[2]),
                target: new Vec3(target.x, target.y, target.z)
            });
        });

        const targetRow = createRow('T', 'camera-info.target', (v) => {
            const { position } = events.invoke('camera.getPose');
            events.fire('camera.setPose', {
                position: new Vec3(position.x, position.y, position.z),
                target: new Vec3(v[0], v[1], v[2])
            });
        });

        events.on('camera.showInfo', (visible: boolean) => {
            this.hidden = !visible;
        });

        events.on('prerender', () => {
            if (this.hidden) {
                return;
            }

            const { position, target } = events.invoke('camera.getPose');

            positionRow.update(
                `${fmt(position.x)}, ${fmt(position.y)}, ${fmt(position.z)}`,
                `${position.x}, ${position.y}, ${position.z}`
            );
            targetRow.update(
                `${fmt(target.x)}, ${fmt(target.y)}, ${fmt(target.z)}`,
                `${target.x}, ${target.y}, ${target.z}`
            );
        });
    }
}

export { CameraInfoOverlay };
