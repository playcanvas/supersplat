import { Button, Container, Label, NumericInput, SelectInput, SliderInput } from 'pcui';

import { Events } from '../events';
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

        let addKey: (value: number) => void;
        let removeKey: (index: number) => void;
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

            // keys

            const keys: HTMLElement[] = [];
            const createKey = (value: number) => {
                const label = document.createElement('div');
                label.classList.add('time-label', 'key');
                label.style.left = `${offsetFromFrame(value)}px`;
                workArea.dom.appendChild(label);
                keys.push(label);
            };

            (events.invoke('timeline.keys') as number[]).forEach(createKey);

            addKey = (value: number) => {
                createKey(value);
            };

            removeKey = (index: number) => {
                workArea.dom.removeChild(keys[index]);
                keys.splice(index, 1);
            };

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

        events.on('timeline.keyAdded', (value: number) => {
            addKey(value);
        });

        events.on('timeline.keyRemoved', (index: number) => {
            removeKey(index);
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

        speed.on('change', (value: number) => {
            events.fire('timeline.setFrameRate', value);
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

        const settingsControls = new Container({
            id: 'settings-controls'
        });
        settingsControls.append(speed);
        settingsControls.append(frames);

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

        const skip = (dir: 'forward' | 'back') => {
            const orderedKeys = (events.invoke('timeline.keys') as number[]).map((frame, index) => {
                return { frame, index };
            }).sort((a, b) => a.frame - b.frame);

            if (orderedKeys.length > 0) {
                const frame = events.invoke('timeline.frame');
                const nextKey = orderedKeys.findIndex(k => (dir === 'back' ? k.frame >= frame : k.frame > frame));
                const l = orderedKeys.length;

                if (nextKey === -1) {
                    events.fire('timeline.setFrame', orderedKeys[dir === 'back' ? l - 1 : 0].frame);
                } else {
                    events.fire('timeline.setFrame', orderedKeys[dir === 'back' ? (nextKey + l - 1) % l : nextKey].frame);
                }
            }
        };

        prev.on('click', () => {
            skip('back');
        });

        play.on('click', () => {
            if (events.invoke('timeline.playing')) {
                events.fire('timeline.setPlaying', false);
                play.text = '\uE131';
            } else {
                events.fire('timeline.setPlaying', true);
                play.text = '\uE135';
            }
        });

        next.on('click', () => {
            skip('forward');
        });

        addKey.on('click', () => {
            events.fire('timeline.add', events.invoke('timeline.frame'));
        });

        removeKey.on('click', () => {
            const index = events.invoke('timeline.keys').indexOf(events.invoke('timeline.frame'));
            if (index !== -1) {
                events.fire('timeline.remove', index);
            }
        });

        const canDelete = (frame: number) => events.invoke('timeline.keys').includes(frame);

        events.on('timeline.frame', (frame: number) => {
            removeKey.enabled = canDelete(frame);
        });

        events.on('timeline.keyRemoved', (index: number) => {
            removeKey.enabled = canDelete(events.invoke('timeline.frame'));
        });

        events.on('timeline.keyAdded', (frame: number) => {
            removeKey.enabled = canDelete(frame);
        });

        // cancel animation playback if user interacts with camera
        events.on('camera.controller', (type: string) => {
            if (events.invoke('timeline.playing')) {
                // stop
            }
        });

        // ply animations

        const slider = new SliderInput({
            id: 'frame-slider',
            min: 0,
            max: 0,
            precision: 0,
            value: 0,
            hidden: true
        });

        this.append(slider);

        const prevFrame = () => {
            const frames = events.invoke('animation.frames');
            if (frames > 0) {
                const frame = events.invoke('animation.frame');
                events.fire('animation.setFrame', (frame - 1 + frames) % frames);
            }
        };

        const nextFrame = () => {
            const frames = events.invoke('animation.frames');
            if (frames > 0) {
                const frame = events.invoke('animation.frame');
                events.fire('animation.setFrame', (frame + 1) % frames);
            }
        };

        slider.on('change', (value: number) => {
            events.fire('animation.setFrame', value);
        });

        events.on('animation.frames', (frames: number) => {
            this.hidden = frames === 0;
            slider.max = slider.sliderMax = frames - 1;
        });

        events.on('animation.frame', (frame: number) => {
            slider.value = frame;
        });

        tooltips.register(prev, localize('timeline.prev-key'), 'top');
        tooltips.register(play, localize('timeline.play'), 'top');
        tooltips.register(next, localize('timeline.next-key'), 'top');
        tooltips.register(addKey, localize('timeline.add-key'), 'top');
        tooltips.register(removeKey, localize('timeline.remove-key'), 'top');
        tooltips.register(speed, localize('timeline.frame-rate'), 'top');
        tooltips.register(frames, localize('timeline.total-frames'), 'top');
    }
}

export { TimelinePanel };
