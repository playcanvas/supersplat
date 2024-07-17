import { Button, Container, Label, TextInput } from 'pcui';

class Popup {
    show: (type: 'error' | 'info' | 'yesno' | 'okcancel', message: string, value?: string) => void;
    hide: () => void;
    destroy: () => void;

    constructor(parent: Container) {

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

        const background = new Container({
            id: 'popup-background'
        });

        background.append(text);
        background.append(inputValue);
        background.append(buttons);

        const container = new Container({
            id: 'popup',
            hidden: true,
            tabIndex: -1
        });

        container.append(background);

        parent.append(container);

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

        container.on('click', () => {
            containerFn();
        });

        background.on('click', (event) => {
            event.stopPropagation();
        });

        this.show = async (type: 'error' | 'info' | 'yesno' | 'okcancel', message: string, value?: string) => {
            // set the message
            text.text = message;

            if (type === 'error') {
                text.class.add('error');
                text.class.remove('info');
            } else if (type === 'info') {
                text.class.remove('error');
                text.class.add('info');
            } else {
                text.class.remove('error');
                text.class.remove('info');
            }


            // configure based on message type
            okButton.hidden = type === 'yesno';
            cancelButton.hidden = type !== 'okcancel';
            yesButton.hidden = type !== 'yesno';
            noButton.hidden = type !== 'yesno';
            container.hidden = false;

            inputValue.hidden = value === undefined;
            if (value !== undefined) {
                inputValue.value = value;
                inputValue.focus();
            }

            // take keyboard focus so shortcuts stop working
            container.dom.focus();

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
            container.hidden = true;
        };

        this.destroy = () => {
            this.hide();
            container.destroy();
        };
    }
}

export { Popup };
