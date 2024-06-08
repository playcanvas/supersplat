import { Container, Element, Label } from 'pcui';

class Tooltip extends Container {
    target: Element;
    align: string;
    content: Label;

    constructor(args: any = {}) {
        args = {
            ...args,
            class: 'tooltip',
            hidden: true
        };

        super(args);

        this.target = args.target;
        this.align = args.align ?? 'right';
        this.content = new Label({
            class: 'tooltip-content',
            text: args.text
        });

        this.append(this.content);

        args.target.dom.addEventListener('mouseover', () => {
            this.show();
        });

        args.target.dom.addEventListener('mouseout', () => {
            this.hide();
        });
    }

    show() {
        const style = this.dom.style;
        const target = this.target.dom;
        const rect = target.getBoundingClientRect();

        style.left = `${rect.right}px`;
        style.top = `${rect.top}px`;

        this.hidden = false;
    }

    hide() {
        this.hidden = true;
    }
}

export { Tooltip };
