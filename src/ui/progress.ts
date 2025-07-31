import { Container, Element, Label } from '@playcanvas/pcui';

class Progress extends Container {
    setHeader: (headerText: string) => void;
    setText: (text: string) => void;
    setProgress: (progress: number) => void;

    constructor(args = {}) {
        args = {
            ...args,
            id: 'progress-container',
            hidden: true
        };

        super(args);

        this.dom.tabIndex = 0;

        const header = new Label({
            id: 'header'
        });

        const text = new Element({
            dom: 'div',
            id: 'text'
        });

        const bar = new Element({
            dom: 'div',
            id: 'bar',
            class: 'pulsate'
        });

        const content = new Container({
            id: 'content'
        });
        content.append(text);
        content.append(bar);

        const dialog = new Container({
            id: 'dialog'
        });

        dialog.append(header);
        dialog.append(content);
        this.append(dialog);

        this.dom.addEventListener('keydown', (event) => {
            if (this.hidden) return;
            event.stopPropagation();
            event.preventDefault();
        });

        this.setHeader = (headerMsg: string) => {
            header.text = headerMsg;
        };

        this.setText = (textMsg: string) => {
            text.dom.textContent = textMsg;
        };

        this.setProgress = (progress: number) => {
            bar.dom.style.backgroundImage = `linear-gradient(90deg, #F60 0%, #F60 ${progress}%, #00000000 ${progress}%, #00000000 100%)`;
        };
    }
}

export { Progress };
