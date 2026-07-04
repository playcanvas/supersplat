import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { i18n } from './localization';
import { Tooltips } from './tooltips';

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

        const createRow = (localeKey: string) => {
            const row = new Container({
                class: 'camera-info-row'
            });

            const key = new Label({
                class: 'camera-info-key'
            });
            i18n.bindText(key, localeKey);

            const value = new Label({
                class: 'camera-info-value'
            });

            row.append(key);
            row.append(value);
            this.append(row);

            // display holds the latest formatted value, copyText the full
            // precision equivalent. copiedUntil suppresses live updates while
            // the 'Copied!' feedback is showing.
            const state = { copyText: '', display: '', copiedUntil: 0 };

            row.dom.addEventListener('pointerdown', () => {
                navigator.clipboard.writeText(state.copyText);

                state.copiedUntil = performance.now() + 1000;
                value.text = i18n.t('cursor.copied');
                setTimeout(() => {
                    if (performance.now() >= state.copiedUntil) {
                        value.text = state.display;
                    }
                }, 1000);
            });

            tooltips.register(row, () => i18n.t('cursor.click-to-copy'), 'right');

            return {
                update: (display: string, copyText: string) => {
                    state.copyText = copyText;
                    if (state.display !== display) {
                        state.display = display;
                        if (performance.now() >= state.copiedUntil) {
                            value.text = display;
                        }
                    }
                }
            };
        };

        const positionRow = createRow('camera-info.position');
        const targetRow = createRow('camera-info.target');

        events.on('camera.showInfo', (visible: boolean) => {
            this.hidden = !visible;
        });

        events.on('prerender', () => {
            if (this.hidden) {
                return;
            }

            const { position, target } = events.invoke('camera.getPose');

            positionRow.update(
                `${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`,
                `${position.x},${position.y},${position.z}`
            );
            targetRow.update(
                `${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)}`,
                `${target.x},${target.y},${target.z}`
            );
        });
    }
}

export { CameraInfoOverlay };
