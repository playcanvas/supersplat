import { Button, Container, Label, TextInput } from '@playcanvas/pcui';

import { localize } from './localization';
import { Tooltips } from './tooltips';

interface ShowOptions {
    type: 'error' | 'info' | 'yesno' | 'okcancel';
    message: string;
    header?: string;
    link?: string;
}

class Popup extends Container {
    show: (options: ShowOptions) => void;
    hide: () => void;
    destroy: () => void;

    constructor(tooltips: Tooltips, args = {}) {
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

        const linkText = new Label({
            id: 'popup-link-text'
        });

        const linkCopy = new Button({
            id: 'popup-link-copy',
            icon: 'E351'
        });

        const linkRow = new Container({
            id: 'popup-link-row'
        });

        linkRow.append(linkText);
        linkRow.append(linkCopy);

        const okButton = new Button({
            class: 'popup-button',
            text: localize('popup.ok')
        });

        const cancelButton = new Button({
            class: 'popup-button',
            text: localize('popup.cancel')
        });

        const yesButton = new Button({
            class: 'popup-button',
            text: localize('popup.yes')
        });

        const noButton = new Button({
            class: 'popup-button',
            text: localize('popup.no')
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
        dialog.append(linkRow);
        dialog.append(buttons);

        this.append(dialog);

        let okFn: () => void;
        let cancelFn: () => void;
        let yesFn: () => void;
        let noFn: () => void;
        let containerFn: () => void;
        let copyFn: () => void;

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

        linkCopy.on('click', () => {
            copyFn();
        });

        this.show = (options: ShowOptions) => {
            header.text = options.header;
            text.text = options.message;

            const { type, link } = options;

            ['error', 'info', 'yesno', 'okcancel'].forEach((t) => {
                text.class[t === type ? 'add' : 'remove'](t);
            });

            // configure based on message type
            okButton.hidden = type === 'yesno';
            cancelButton.hidden = type !== 'okcancel';
            yesButton.hidden = type !== 'yesno';
            noButton.hidden = type !== 'yesno';
            this.hidden = false;
            
            // Special handling for SOR popups - position in bottom-right
            if (options.header && options.header.includes('SOR')) {
                console.log('🔧 POPUP.TS: Detected SOR popup, applying bottom-right positioning...');
                
                // Set attributes for CSS targeting
                dialog.dom.setAttribute('data-sor-popup', 'true');
                dialog.dom.classList.add('sor-popup-positioned');
                
                // Also apply monospace styling to the text content
                text.dom.style.fontFamily = 'Consolas, Monaco, "Courier New", monospace';
                text.dom.style.fontSize = '12px';
                text.dom.style.lineHeight = '1.4';
                text.dom.style.textAlign = 'left';
                text.dom.style.whiteSpace = 'pre-line';
                
                console.log('🔧 POPUP.TS: SOR popup attributes and styling applied');
            } else {
                // This is NOT a SOR popup - ensure SOR attributes are cleared
                console.log('🔧 POPUP.TS: Non-SOR popup detected, clearing SOR attributes...');
                
                // Remove SOR attributes to ensure normal centering
                dialog.dom.removeAttribute('data-sor-popup');
                dialog.dom.classList.remove('sor-popup-positioned');
                
                // Reset text styling to defaults
                text.dom.style.fontFamily = '';
                text.dom.style.fontSize = '';
                text.dom.style.lineHeight = '';
                text.dom.style.textAlign = '';
                text.dom.style.whiteSpace = '';
                
                console.log('🔧 POPUP.TS: SOR attributes cleared for normal popup');
            }

            linkRow.hidden = link === undefined;
            if (link !== undefined) {
                linkText.dom.innerHTML = `<a href='${link}' target='_blank'>${link}</a>`;
                linkCopy.icon = 'E352';
            }

            // take keyboard focus so shortcuts stop working
            this.dom.focus();

            return new Promise<{action: string, value?: string}>((resolve) => {
                okFn = () => {
                    this.hide();
                    resolve({
                        action: 'ok'
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
                    if (type === 'info' && link === undefined) {
                        cancelFn();
                    }
                };
                copyFn = () => {
                    navigator.clipboard.writeText(link);
                    linkCopy.icon = 'E348';
                };
            });
        };

        this.hide = () => {
            this.hidden = true;
        };

        this.destroy = () => {
            this.hide();
            super.destroy();
        };

        tooltips.register(linkCopy, localize('popup.copy-to-clipboard'));
    }
}

export { ShowOptions, Popup };
