import { Button, Container } from 'pcui';
import { Events } from '../events';
import { Tooltips } from './tooltips';

class RightToolbar extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'right-toolbar'
        };

        super(args);

        const handleDown = (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
        };

        this.dom.addEventListener('pointerdown', (event) => {
            handleDown(event);
        });

        const translate = new Button({
            id: 'right-toolbar-translate',
            class: 'right-toolbar-button',
            icon: 'E111'
        });

        const rotate = new Button({
            id: 'right-toolbar-rotate',
            class: 'right-toolbar-button',
            icon: 'E113'
        });

        const scale = new Button({
            id: 'right-toolbar-scale',
            class: 'right-toolbar-button',
            icon: 'E112'
        });

        this.append(translate);
        this.append(rotate);
        this.append(scale);

        translate.on('click', () => events.fire('tool.move'));
        rotate.on('click', () => events.fire('tool.rotate'));
        scale.on('click', () => events.fire('tool.scale'));

        events.on('tool.activated', (toolName: string) => {
            translate.class[toolName === 'move' ? 'add' : 'remove']('active');
            rotate.class[toolName === 'rotate' ? 'add' : 'remove']('active');
            scale.class[toolName === 'scale' ? 'add' : 'remove']('active');
        });

        tooltips.register(translate, 'Translate', 'left');
        tooltips.register(rotate, 'Rotate', 'left');
        tooltips.register(scale, 'Scale', 'left');
    }
};

export { RightToolbar };
