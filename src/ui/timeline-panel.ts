import { Container, Label, SelectInput, SliderInput } from 'pcui';

import { Events } from '../events';
import { Tooltips } from './tooltips';

class TimelinePanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'timeline-panel',
            hidden: true
        };

        super(args);

        const controlsContainer = new Container({
            id: 'controls-container'
        });

        const controls = new Container({
            id: 'controls'
        });

        const prev = new Label({
            class: 'button',
            text: '\uE162'
        });

        const play = new Label({
            class: 'button',
            text: '\uE131'
        });

        const next = new Label({
            class: 'button',
            text: '\uE164'
        });

        const speed = new SelectInput({
            id: 'speed',
            defaultValue: 12,
            options: [
                { v: 1, t: '1 fps' },
                { v: 6, t: '6 fps' },
                { v: 12, t: '12 fps' },
                { v: 24, t: '24 fps' },
                { v: 30, t: '30 fps' },
                { v: 60, t: '60 fps' }
            ]
        });

        controls.append(prev);
        controls.append(play);
        controls.append(next);
        controls.append(speed);

        controlsContainer.append(controls);

        const slider = new SliderInput({
            id: 'frame-slider',
            min: 0,
            max: 0,
            precision: 0,
            value: 0
        });

        this.append(controlsContainer);
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

        let timeout: number = null;

        const stop = () => {
            play.text = '\uE131';
            clearTimeout(timeout);
            timeout = null;
        };

        prev.on('click', () => {
            prevFrame();
        });

        next.on('click', () => {
            nextFrame();
        });

        play.on('click', () => {
            if (timeout) {
                stop();
            } else if (events.invoke('animation.frames') > 0) {
                const next = () => {
                    nextFrame();
                    timeout = window.setTimeout(next, 1000 / speed.value);
                };

                play.text = '\uE135';
                next();
            }
        });

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
    }
}

export { TimelinePanel };
