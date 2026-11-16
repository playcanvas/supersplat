import { Button, Container, Element } from '@playcanvas/pcui';

import { i18n } from './localization';

type SwitchOption<T> = {
    value: T;
    svg: string;
    id?: string;
    // the option's accessible name
    localeKey?: string;
};

type Orientation = 'horizontal' | 'vertical';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

// A two-option switch for the toolbars (toolbar.scss, .toolbar-switch): two
// options on a dark track and a highlight that slides to the chosen one. The
// editing mode on the mode strip and the camera mode on the right toolbar are
// both this, so they look and behave alike. With selectOnClick, a click on an
// option chooses it; a toolbar that also wants press-and-hold on the switch
// passes false and calls select itself from its own press handling
const createSwitch = <T>(
    orientation: Orientation,
    options: [SwitchOption<T>, SwitchOption<T>],
    select: (value: T) => void,
    selectOnClick = true
) => {
    const container = new Container({ class: ['toolbar-switch', `toolbar-switch-${orientation}`] });
    const thumb = new Element({ class: 'toolbar-switch-thumb' });
    container.append(thumb);

    const buttons = options.map((option) => {
        const button = new Button({ id: option.id, class: 'toolbar-switch-option' });
        button.dom.appendChild(createSvg(option.svg));
        if (option.localeKey) {
            i18n.onChange(() => button.dom.setAttribute('aria-label', i18n.t(option.localeKey)), button);
        }
        if (selectOnClick) {
            button.on('click', () => select(option.value));
        }
        container.append(button);
        return button;
    });

    let value = options[0].value;
    let placed = false;

    // the highlight covers the active option. The first placement is instant,
    // later ones slide
    const place = () => {
        const active = buttons[options.findIndex((option) => option.value === value)]?.dom;
        if (!active || active.offsetWidth === 0) {
            return;
        }
        const rect = active.getBoundingClientRect();
        const parent = container.dom.getBoundingClientRect();
        thumb.dom.style.left = `${rect.left - parent.left}px`;
        thumb.dom.style.top = `${rect.top - parent.top}px`;
        thumb.dom.style.width = `${rect.width}px`;
        thumb.dom.style.height = `${rect.height}px`;
        if (!placed) {
            placed = true;
            requestAnimationFrame(() => thumb.class.add('toolbar-switch-animated'));
        }
    };

    const setValue = (next: T) => {
        value = next;
        const index = options.findIndex((option) => option.value === value);
        buttons.forEach((button, i) => {
            button.class[i === index ? 'add' : 'remove']('active');
            button.dom.setAttribute('aria-pressed', String(i === index));
        });
        container.class[index === 0 ? 'add' : 'remove']('toolbar-switch-first');
        container.class[index === 1 ? 'add' : 'remove']('toolbar-switch-second');
        place();
    };

    // relayout (first display) places the options
    new ResizeObserver(place).observe(container.dom);

    return { container, buttons, setValue };
};

export { createSwitch };
