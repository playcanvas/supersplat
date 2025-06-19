import { Container, Element } from '@playcanvas/pcui';

class Spinner extends Container {
    constructor(args = {}) {
        args = {
            ...args,
            id: 'spinner-container',
            hidden: true
        };

        super(args);

        this.dom.tabIndex = 0;

        const spinner = new Element({
            dom: 'div',
            class: 'spinner'
        });

        this.append(spinner);

        this.dom.addEventListener('keydown', (event) => {
            if (this.hidden) return;
            event.stopPropagation();
            event.preventDefault();
        });
    }
}

export { Spinner };
