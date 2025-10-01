import { Button, Container, NumericInput, SelectInput } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import { Tooltips } from './tooltips';

class Ticks extends Container {
    private zoomLevel: number = 1.0;
    private zoomCenter: number = 0.5; // 0-1, center of zoom
    private minZoom: number = 0.1;
    private maxZoom: number = 10.0;
    
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
            const totalWidth = this.dom.getBoundingClientRect().width - padding * 2;
            
            // Calculate zoom parameters
            const zoomedFrames = Math.max(1, numFrames / this.zoomLevel);
            const startFrame = Math.max(0, Math.min(numFrames - zoomedFrames, 
                Math.floor((numFrames - zoomedFrames) * this.zoomCenter)));
            const endFrame = Math.min(numFrames - 1, startFrame + zoomedFrames - 1);
            const visibleFrames = endFrame - startFrame + 1;
            
            const labelStep = Math.max(1, Math.floor(visibleFrames / Math.max(1, Math.floor(totalWidth / 50))));
            const numLabels = Math.max(1, Math.ceil(visibleFrames / labelStep));

            const offsetFromFrame = (frame: number) => {
                if (frame < startFrame || frame > endFrame) return -1; // outside visible range
                return padding + Math.floor((frame - startFrame) / visibleFrames * totalWidth);
            };

            frameFromOffset = (offset: number) => {
                const normalizedOffset = Math.max(0, Math.min(1, (offset - padding) / totalWidth));
                return Math.max(startFrame, Math.min(endFrame, 
                    Math.floor(startFrame + normalizedOffset * visibleFrames)));
            };

            // timeline labels

            for (let i = 0; i < numLabels; i++) {
                const thisFrame = Math.floor(startFrame + i * labelStep);
                if (thisFrame <= endFrame) {
                    const offset = offsetFromFrame(thisFrame);
                    if (offset >= 0) {
                        const label = document.createElement('div');
                        label.classList.add('time-label');
                        label.style.left = `${offset}px`;
                        label.textContent = thisFrame.toString();
                        workArea.dom.appendChild(label);
                    }
                }
            }

            // keys

            const keys: HTMLElement[] = [];
            const createKey = (value: number) => {
                const offset = offsetFromFrame(value);
                if (offset < 0) return; // key is outside visible range
                
                const label = document.createElement('div');
                label.classList.add('time-label', 'key');
                label.style.left = `${offset}px`;
                let dragging = false;
                let toFrame = -1;

                label.addEventListener('pointerdown', (event) => {
                    if (!dragging && event.isPrimary) {
                        dragging = true;
                        label.classList.add('dragging');
                        label.setPointerCapture(event.pointerId);
                        event.stopPropagation();
                    }
                });

                label.addEventListener('pointermove', (event: PointerEvent) => {
                    if (dragging) {
                        toFrame = frameFromOffset(parseInt(label.style.left, 10) + event.offsetX);
                        label.style.left = `${offsetFromFrame(toFrame)}px`;
                    }
                });

                label.addEventListener('pointerup', (event: PointerEvent) => {
                    if (dragging && event.isPrimary) {
                        const fromIndex = keys.indexOf(label);
                        const fromFrame = events.invoke('timeline.keys')[fromIndex];
                        if (fromFrame !== toFrame) {
                            events.fire('timeline.move', fromFrame, toFrame);
                            events.fire('timeline.frame', events.invoke('timeline.frame'));
                        }

                        label.releasePointerCapture(event.pointerId);
                        label.classList.remove('dragging');
                        dragging = false;
                    }
                });

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
        
        // Add zoom control methods
        this.zoomIn = () => {
            this.zoomLevel = Math.min(this.maxZoom, this.zoomLevel * 1.5);
            rebuild();
        };
        
        this.zoomOut = () => {
            this.zoomLevel = Math.max(this.minZoom, this.zoomLevel / 1.5);
            rebuild();
        };
        
        this.zoomFit = () => {
            this.zoomLevel = 1.0;
            this.zoomCenter = 0.5;
            rebuild();
        };
        
        this.setZoomCenter = (centerRatio: number) => {
            this.zoomCenter = Math.max(0, Math.min(1, centerRatio));
            rebuild();
        };
        
        // Add mouse wheel zoom support
        workArea.dom.addEventListener('wheel', (event: WheelEvent) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                
                // Calculate zoom center based on mouse position
                const rect = workArea.dom.getBoundingClientRect();
                const mouseX = event.clientX - rect.left;
                const totalWidth = rect.width - 40; // account for padding
                this.zoomCenter = Math.max(0, Math.min(1, (mouseX - 20) / totalWidth));
                
                // Zoom in/out based on wheel direction
                if (event.deltaY < 0) {
                    this.zoomLevel = Math.min(this.maxZoom, this.zoomLevel * 1.2);
                } else {
                    this.zoomLevel = Math.max(this.minZoom, this.zoomLevel / 1.2);
                }
                
                rebuild();
            }
        }, { passive: false });
    }
    
    // Expose zoom methods
    zoomIn: () => void;
    zoomOut: () => void;
    zoomFit: () => void;
    setZoomCenter: (centerRatio: number) => void;
}

class TimelinePanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'timeline-panel'
        };

        super(args);

        // play controls

        const firstFrame = new Button({
            class: 'button',
            text: '≪'  // double left angle for first frame
        });

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

        const lastFrame = new Button({
            class: 'button',
            text: '≫'  // double right angle for last frame
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

        // zoom controls
        const zoomOut = new Button({
            class: ['button', 'zoom-button'],
            text: '−'  // minus symbol for zoom out
        });

        const zoomIn = new Button({
            class: ['button', 'zoom-button'],
            text: '+'  // plus symbol for zoom in
        });

        const zoomFit = new Button({
            class: ['button', 'zoom-button'],
            text: '⬜'  // square symbol for fit
        });

        const buttonControls = new Container({
            id: 'button-controls'
        });
        buttonControls.append(firstFrame);
        buttonControls.append(prev);
        buttonControls.append(play);
        buttonControls.append(next);
        buttonControls.append(lastFrame);
        buttonControls.append(addKey);
        buttonControls.append(removeKey);
        
        // Add separator and zoom controls
        const separator = document.createElement('div');
        separator.className = 'button-separator';
        buttonControls.dom.appendChild(separator);
        
        buttonControls.append(zoomOut);
        buttonControls.append(zoomIn);
        buttonControls.append(zoomFit);

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
        
        // Connect zoom buttons to ticks zoom methods
        zoomIn.on('click', () => {
            ticks.zoomIn();
        });
        
        zoomOut.on('click', () => {
            ticks.zoomOut();
        });
        
        zoomFit.on('click', () => {
            ticks.zoomFit();
        });

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
            } else {
                // if there are no keys, just to start of timeline or end
                if (dir === 'back') {
                    events.fire('timeline.setFrame', 0);
                } else {
                    events.fire('timeline.setFrame', events.invoke('timeline.frames') - 1);
                }
            }
        };

        firstFrame.on('click', () => {
            // Go to frame 0 and center view at the beginning
            events.fire('timeline.setFrame', 0);
            ticks.setZoomCenter(0.0); // Show beginning of timeline
        });

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

        lastFrame.on('click', () => {
            // Go to last frame and center view at the end
            const totalFrames = events.invoke('timeline.frames') || 180;
            events.fire('timeline.setFrame', totalFrames - 1);
            ticks.setZoomCenter(1.0); // Show end of timeline
        });

        addKey.on('click', () => {
            events.fire('timeline.add', events.invoke('timeline.frame'));
        });

        removeKey.on('click', () => {
            const index = events.invoke('timeline.keys').indexOf(events.invoke('timeline.frame'));
            if (index !== -1) {
                events.fire('timeline.remove', index);
                events.fire('timeline.frame', events.invoke('timeline.frame'));
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

        // tooltips
        tooltips.register(firstFrame, 'Go to First Frame (0)', 'top');
        tooltips.register(prev, localize('timeline.prev-key'), 'top');
        tooltips.register(play, localize('timeline.play'), 'top');
        tooltips.register(next, localize('timeline.next-key'), 'top');
        tooltips.register(lastFrame, 'Go to Last Frame', 'top');
        tooltips.register(addKey, localize('timeline.add-key'), 'top');
        tooltips.register(removeKey, localize('timeline.remove-key'), 'top');
        tooltips.register(zoomOut, 'Zoom Out (Ctrl+Wheel)', 'top');
        tooltips.register(zoomIn, 'Zoom In (Ctrl+Wheel)', 'top');
        tooltips.register(zoomFit, 'Zoom to Fit', 'top');
        tooltips.register(speed, localize('timeline.frame-rate'), 'top');
        tooltips.register(frames, localize('timeline.total-frames'), 'top');
        tooltips.register(smoothness, localize('timeline.smoothness'), 'top');
    }
}

export { TimelinePanel };
