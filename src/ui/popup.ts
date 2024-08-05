import { Button, Container, Label, TextInput } from 'pcui';

interface ShowOptions {
    type: 'error' | 'info' | 'yesno' | 'okcancel';
    message: string;
    header?: string;
    value?: string;
}

class Popup extends Container {
    show: (options: ShowOptions) => void;
    hide: () => void;
    destroy: () => void;

    constructor(args = {}) {
        args = {
            id: 'popup',
            hidden: true,
            tabIndex: -1,
            ...args
        };

        super(args);

        const dialog = new Container({
            id: 'popup-dialog'
        });

        const header = new Label({
            id: 'popup-header'
        });

        const text = new Label({
            id: 'popup-text'
        });

        const inputValue = new TextInput({
            id: 'popup-text-input'
        });

        const okButton = new Button({
            class: 'popup-button',
            text: 'OK'
        });

        const cancelButton = new Button({
            class: 'popup-button',
            text: 'Cancel'
        });

        const yesButton = new Button({
            class: 'popup-button',
            text: 'Yes'
        });

        const noButton = new Button({
            class: 'popup-button',
            text: 'No'
        });

        const buttons = new Container({
            id: 'popup-buttons'
        });

        buttons.append(okButton);
        buttons.append(cancelButton);
        buttons.append(yesButton);
        buttons.append(noButton);

        dialog.append(header);
        dialog.append(text);
        dialog.append(inputValue);
        dialog.append(buttons);

        this.append(dialog);

        let okFn: () => void;
        let cancelFn: () => void;
        let yesFn: () => void;
        let noFn: () => void;
        let containerFn: () => void;

        okButton.on('click', () => {
            okFn();
        });

        cancelButton.on('click', () => {
            cancelFn();
        });

        yesButton.on('click', () => {
            yesFn();
        });

        noButton.on('click', () => {
            noFn();
        });

        this.on('click', () => {
            containerFn();
        });

        dialog.on('click', (event) => {
            event.stopPropagation();
        });

        this.show = async (options: ShowOptions) => {
            header.text = options.header;
            text.text = options.message;

            const { type, value } = options;

            ['error', 'info', 'yesno', 'okcancel'].forEach((t) => {
                text.class[t === type ? 'add' : 'remove'](t);
            });

            // configure based on message type
            okButton.hidden = type === 'yesno';
            cancelButton.hidden = type !== 'okcancel';
            yesButton.hidden = type !== 'yesno';
            noButton.hidden = type !== 'yesno';
            this.hidden = false;

            inputValue.hidden = value === undefined;
            if (value !== undefined) {
                inputValue.value = value;
                inputValue.focus();
            }

            // take keyboard focus so shortcuts stop working
            this.dom.focus();

            return new Promise<{action: string, value?: string}>((resolve) => {
                okFn = () => {
                    this.hide();
                    resolve({
                        action: 'ok',
                        value: value !== undefined && inputValue.value
                    });
                };
                cancelFn = () => {
                    this.hide();
                    resolve({ action: 'cancel' });
                };
                yesFn = () => {
                    this.hide();
                    resolve({ action: 'yes' });
                };
                noFn = () => {
                    this.hide();
                    resolve({ action: 'no' });
                };
                containerFn = () => {
                    if (type === 'info') {
                        cancelFn();
                    }
                };
            });
        };

        this.hide = () => {
            this.hidden = true;
        };

        this.destroy = () => {
            this.hide();
            this.destroy();
        };
    }
}

export { Popup, ShowOptions };
