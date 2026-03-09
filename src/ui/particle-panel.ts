import { Button, Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';

class ParticlePanel extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'particle-panel',
            hidden: true
        };

        super(args);

        const header = new Label({
            text: 'Particle Effects',
            class: 'particle-panel-header'
        });

        const buttonsContainer = new Container({
            class: 'particle-panel-buttons'
        });

        const effects = [
            { id: 'dissolve', label: 'Dissolve' },
            { id: 'none', label: 'Reset' }
        ];

        const buttons: Map<string, Button> = new Map();

        for (const effect of effects) {
            const btn = new Button({
                text: effect.label,
                class: 'particle-panel-btn'
            });

            // use DOM click event directly
            btn.dom.addEventListener('click', (e: Event) => {
                e.stopPropagation();
                console.log('[ParticlePanel] clicked:', effect.id);
                if (effect.id === 'none') {
                    events.fire('particle.reset');
                } else {
                    events.fire('particle.trigger', effect.id);
                }
            });

            buttons.set(effect.id, btn);
            buttonsContainer.append(btn);
        }

        this.append(header);
        this.append(buttonsContainer);

        // stop pointer events from reaching the canvas
        this.dom.addEventListener('pointerdown', (e: Event) => {
            e.stopPropagation();
        });

        // highlight active effect
        events.on('particle.effectChanged', (effect: string) => {
            buttons.forEach((btn, id) => {
                btn.class[id === effect ? 'add' : 'remove']('active');
            });
        });
    }
}

export { ParticlePanel };
