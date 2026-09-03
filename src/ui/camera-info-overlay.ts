import { Container, Label } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { Events } from '../events';
import { i18n } from './localization';
import { Tooltips } from './tooltips';

// Accepts "1,2,3", "1, 2, 3", "1 2 3", with or without trailing whitespace.
const parseVector = (text: string): [number, number, number] | null => {
    const parts = text.trim().split(/[\s,]+/).filter(p => p.length > 0);
    if (parts.length !== 3) return null;
    const nums = parts.map(Number);
    if (nums.some(n => !Number.isFinite(n))) return null;
    return [nums[0], nums[1], nums[2]];
};

const flash = (dom: HTMLElement, cls: string) => {
    dom.classList.add(cls);
    setTimeout(() => dom.classList.remove(cls), 250);
};

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

        const createRow = (letter: string, tooltipKey: string, apply: (value: [number, number, number]) => void) => {
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

            const dom = value.dom;
            dom.setAttribute('contenteditable', 'plaintext-only');
            dom.setAttribute('spellcheck', 'false');

            // display holds the latest formatted value; live updates are
            // suppressed while the user is editing so their input isn't
            // overwritten by the per-frame refresh.
            let display = '';
            let editing = false;
            let canceled = false;

            dom.addEventListener('focus', () => {
                editing = true;
                canceled = false;
                // select all text so the user can start typing to replace
                const range = document.createRange();
                range.selectNodeContents(dom);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            });

            // stop key events reaching the editor's global shortcut handlers
            const stopKey = (e: KeyboardEvent) => e.stopPropagation();
            dom.addEventListener('keydown', (e: KeyboardEvent) => {
                stopKey(e);
                if (e.key === 'Enter') {
                    e.preventDefault();
                    dom.blur();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    canceled = true;
                    dom.blur();
                }
            });
            dom.addEventListener('keyup', stopKey);
            dom.addEventListener('keypress', stopKey);

            dom.addEventListener('blur', () => {
                const wasCanceled = canceled;
                editing = false;
                canceled = false;
                // clear any leftover selection
                window.getSelection()?.removeAllRanges();

                if (!wasCanceled) {
                    const parsed = parseVector(dom.textContent ?? '');
                    if (parsed) {
                        apply(parsed);
                        flash(dom, 'flash-ok');
                    } else {
                        flash(dom, 'flash-bad');
                    }
                }

                // restore the live display; the next prerender picks up any
                // pose change resulting from the edit
                dom.textContent = display;
            });

            return {
                update: (text: string) => {
                    if (editing) {
                        return;
                    }
                    if (display !== text) {
                        display = text;
                        dom.textContent = text;
                    }
                }
            };
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

            positionRow.update(`${fmt(position.x)}, ${fmt(position.y)}, ${fmt(position.z)}`);
            targetRow.update(`${fmt(target.x)}, ${fmt(target.y)}, ${fmt(target.z)}`);
        });
    }
}

export { CameraInfoOverlay };
