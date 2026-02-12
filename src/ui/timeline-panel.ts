import { Button, Container, NumericInput, SelectInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { ShortcutManager } from '../shortcut-manager';
import { localize } from './localization';
import { Tooltips } from './tooltips';

class Ticks extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'ticks'
        };

        super(args);

        const workArea = new Container({
            id: 'ticks-area'
        });

        this.append(workArea);

        let frameFromOffset: (offset: number) => number;
        let moveCursor: (frame: number) => void;

        // rebuild the timeline
        const rebuild = () => {
            // clear existing labels
            workArea.dom.innerHTML = '';

            const numFrames = events.invoke('timeline.frames');
            const currentFrame = events.invoke('timeline.frame');

            const padding = 20;
            const width = this.dom.getBoundingClientRect().width - padding * 2;
            const labelStep = Math.max(1, Math.floor(numFrames / Math.max(1, Math.floor(width / 50))));
            const numLabels = Math.max(1, Math.ceil(numFrames / labelStep));

            const offsetFromFrame = (frame: number) => {
                return padding + Math.floor(frame / (numFrames - 1) * width);
            };

            frameFromOffset = (offset: number) => {
                return Math.max(0, Math.min(numFrames - 1, Math.floor((offset - padding) / width * (numFrames - 1))));
            };

            // timeline labels

            for (let i = 0; i < numLabels; i++) {
                const thisFrame = Math.floor(i * labelStep);
                const label = document.createElement('div');
                label.classList.add('time-label');
                label.style.left = `${offsetFromFrame(thisFrame)}px`;
                label.textContent = thisFrame.toString();
                workArea.dom.appendChild(label);
            }

            // keys - get from active track
            const keys = events.invoke('track.keys') as number[] ?? [];

            const createKey = (keyFrame: number) => {
                const label = document.createElement('div');
                label.classList.add('time-label', 'key');
                label.style.left = `${offsetFromFrame(keyFrame)}px`;
                label.dataset.frame = keyFrame.toString();
                let dragging = false;
                let copying = false;
                let clone: HTMLElement = null;
                let toFrame = -1;

                label.addEventListener('pointerdown', (event) => {
                    if (!dragging && event.isPrimary) {
                        dragging = true;
                        copying = event.shiftKey;
                        label.setPointerCapture(event.pointerId);
                        event.stopPropagation();

                        if (copying) {
                            // create a visual clone to drag; original stays in place
                            clone = document.createElement('div');
                            clone.classList.add('time-label', 'key', 'dragging');
                            clone.style.left = label.style.left;
                            workArea.dom.appendChild(clone);
                            label.classList.add('copying');
                        } else {
                            label.classList.add('dragging');
                        }
                    }
                });

                label.addEventListener('pointermove', (event: PointerEvent) => {
                    if (dragging) {
                        toFrame = frameFromOffset(parseInt(label.style.left, 10) + event.offsetX);
                        if (copying) {
                            clone.style.left = `${offsetFromFrame(toFrame)}px`;
                        } else {
                            label.style.left = `${offsetFromFrame(toFrame)}px`;
                        }
                    }
                });

                label.addEventListener('pointerup', (event: PointerEvent) => {
                    if (dragging && event.isPrimary) {
                        const fromFrame = parseInt(label.dataset.frame, 10);
                        if (fromFrame !== toFrame && toFrame >= 0) {
                            if (copying) {
                                events.fire('track.copyKey', fromFrame, toFrame);
                            } else {
                                events.fire('track.moveKey', fromFrame, toFrame);
                            }
                        }

                        if (copying) {
                            workArea.dom.removeChild(clone);
                            clone = null;
                            label.classList.remove('copying');
                        } else {
                            label.classList.remove('dragging');
                        }

                        label.releasePointerCapture(event.pointerId);
                        copying = false;
                        dragging = false;
                    }
                });

                workArea.dom.appendChild(label);
            };

            keys.forEach((keyFrame: number) => {
                createKey(keyFrame);
            });

            // cursor

            const cursor = document.createElement('div');
            cursor.classList.add('time-label', 'cursor');
            cursor.style.left = `${offsetFromFrame(currentFrame)}px`;
            cursor.textContent = currentFrame.toString();
            workArea.dom.appendChild(cursor);

            moveCursor = (frame: number) => {
                cursor.style.left = `${offsetFromFrame(frame)}px`;
                cursor.textContent = frame.toString();
            };
        };

        // handle scrubbing

        let scrubbing = false;

        workArea.dom.addEventListener('pointerdown', (event: PointerEvent) => {
            if (!scrubbing && event.isPrimary) {
                scrubbing = true;
                workArea.dom.setPointerCapture(event.pointerId);
                events.fire('timeline.setFrame', frameFromOffset(event.offsetX));
            }
        });

        workArea.dom.addEventListener('pointermove', (event: PointerEvent) => {
            if (scrubbing) {
                events.fire('timeline.setFrame', frameFromOffset(event.offsetX));
            }
        });

        workArea.dom.addEventListener('pointerup', (event: PointerEvent) => {
            if (scrubbing && event.isPrimary) {
                workArea.dom.releasePointerCapture(event.pointerId);
                scrubbing = false;
            }
        });

        // rebuild the timeline on dom resize
        new ResizeObserver(() => rebuild()).observe(workArea.dom);

        // rebuild when timeline frames change
        events.on('timeline.frames', () => {
            rebuild();
        });

        events.on('timeline.frame', (frame: number) => {
            moveCursor(frame);
        });

        // rebuild when track keys change
        events.on('track.keyAdded', () => {
            rebuild();
        });

        events.on('track.keyRemoved', () => {
            rebuild();
        });

        events.on('track.keyMoved', () => {
            rebuild();
        });

        events.on('track.keyUpdated', () => {
            rebuild();
        });

        events.on('track.keysLoaded', () => {
            rebuild();
        });

        events.on('track.keysCleared', () => {
            rebuild();
        });
    }
}

class TimelinePanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'timeline-panel'
        };

        super(args);

        // play controls

        const prev = new Button({
            class: 'button',
            text: '\uE162'
        });

        const play = new Button({
            class: 'button',
            text: '\uE131'
        });

        const next = new Button({
            class: 'button',
            text: '\uE164'
        });

        // key controls

        const addKey = new Button({
            class: 'button',
            text: '\uE120'
        });

        const removeKey = new Button({
            class: 'button',
            text: '\uE121',
            enabled: false
        });

        const buttonControls = new Container({
            id: 'button-controls'
        });
        buttonControls.append(prev);
        buttonControls.append(play);
        buttonControls.append(next);
        buttonControls.append(addKey);
        buttonControls.append(removeKey);

        // settings

        const speed = new SelectInput({
            id: 'speed',
            defaultValue: 30,
            options: [
                { v: 1, t: '1 fps' },
                { v: 6, t: '6 fps' },
                { v: 12, t: '12 fps' },
                { v: 24, t: '24 fps' },
                { v: 30, t: '30 fps' },
                { v: 60, t: '60 fps' }
            ]
        });

        speed.on('change', (value: string) => {
            events.fire('timeline.setFrameRate', parseInt(value, 10));
        });

        events.on('timeline.frameRate', (frameRate: number) => {
            speed.value = frameRate.toString();
        });

        const frames = new NumericInput({
            id: 'totalFrames',
            value: 180,
            min: 1,
            max: 10000,
            precision: 0
        });

        frames.on('change', (value: number) => {
            events.fire('timeline.setFrames', value);
        });

        events.on('timeline.frames', (framesIn: number) => {
            frames.value = framesIn;
        });

        // smoothness

        const smoothness = new NumericInput({
            id: 'smoothness',
            min: 0,
            max: 1,
            step: 0.05,
            value: 1
        });

        smoothness.on('change', (value: number) => {
            events.fire('timeline.setSmoothness', value);
        });

        events.on('timeline.smoothness', (smoothnessIn: number) => {
            smoothness.value = smoothnessIn;
        });

        const settingsControls = new Container({
            id: 'settings-controls'
        });
        settingsControls.append(speed);
        settingsControls.append(frames);
        settingsControls.append(smoothness);

        // append control groups

        const controlsWrap = new Container({
            id: 'controls-wrap'
        });

        const spacerL = new Container({
            class: 'spacer'
        });

        const spacerR = new Container({
            class: 'spacer'
        });
        spacerR.append(settingsControls);

        controlsWrap.append(spacerL);
        controlsWrap.append(buttonControls);
        controlsWrap.append(spacerR);

        const ticks = new Ticks(events, tooltips);

        this.append(controlsWrap);
        this.append(ticks);

        // ui handlers

        prev.on('click', (evt: MouseEvent) => {
            if (evt.shiftKey) {
                events.fire('timeline.prevKey');
            } else {
                events.fire('timeline.prevFrame');
            }
        });

        next.on('click', (evt: MouseEvent) => {
            if (evt.shiftKey) {
                events.fire('timeline.nextKey');
            } else {
                events.fire('timeline.nextFrame');
            }
        });

        play.on('click', () => {
            if (events.invoke('timeline.playing')) {
                events.fire('timeline.setPlaying', false);
            } else {
                events.fire('timeline.setPlaying', true);
            }
        });

        // Sync play button icon when playing state changes (e.g. via keyboard shortcut)
        events.on('timeline.playing', (isPlaying: boolean) => {
            play.text = isPlaying ? '\uE135' : '\uE131';
        });

        addKey.on('click', () => {
            events.fire('track.addKey');
        });

        removeKey.on('click', () => {
            const frame = events.invoke('timeline.frame');
            events.fire('track.removeKey', frame);
        });

        // Helper to check if the current frame has a key
        const canDeleteKey = () => {
            const keys = events.invoke('track.keys') as number[] ?? [];
            const frame = events.invoke('timeline.frame');
            return keys.includes(frame);
        };

        // Update key button states
        const updateKeyButtonStates = () => {
            removeKey.enabled = canDeleteKey();
        };

        // Update button states when frame changes
        events.on('timeline.frame', () => {
            updateKeyButtonStates();
        });

        // Update button states when track keys change
        events.on('track.keyAdded', () => {
            updateKeyButtonStates();
        });

        events.on('track.keyRemoved', () => {
            updateKeyButtonStates();
        });

        events.on('track.keyMoved', () => {
            updateKeyButtonStates();
        });

        events.on('track.keyUpdated', () => {
            updateKeyButtonStates();
        });

        events.on('track.keysLoaded', () => {
            updateKeyButtonStates();
        });

        events.on('track.keysCleared', () => {
            updateKeyButtonStates();
        });

        // cancel animation playback if user interacts with camera
        events.on('camera.controller', (type: string) => {
            if (events.invoke('timeline.playing')) {
                // stop
            }
        });

        // tooltips
        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');
        const tooltip = (localeKey: string, shortcutId?: string) => {
            const text = localize(localeKey);
            if (shortcutId) {
                const shortcut = shortcutManager.formatShortcut(shortcutId);
                if (shortcut) {
                    return `${text} ( ${shortcut} )`;
                }
            }
            return text;
        };

        tooltips.register(prev, tooltip('tooltip.timeline.prev-frame', 'timeline.prevFrame'), 'top');
        tooltips.register(play, tooltip('tooltip.timeline.play', 'timeline.togglePlay'), 'top');
        tooltips.register(next, tooltip('tooltip.timeline.next-frame', 'timeline.nextFrame'), 'top');
        tooltips.register(addKey, tooltip('tooltip.timeline.add-key', 'track.addKey'), 'top');
        tooltips.register(removeKey, tooltip('tooltip.timeline.remove-key', 'track.removeKey'), 'top');
        tooltips.register(speed, localize('tooltip.timeline.frame-rate'), 'top');
        tooltips.register(frames, localize('tooltip.timeline.total-frames'), 'top');
        tooltips.register(smoothness, localize('tooltip.timeline.smoothness'), 'top');
    }
}

export { TimelinePanel };
