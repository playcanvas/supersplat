import { Container, Label } from '@playcanvas/pcui';

import { localize } from './localization';

const shortcutList = [
    { header: 'navigation' },
    { key: 'C', action: 'reset-camera' },
    { key: 'F', action: 'focus-camera' },
    { key: 'V', action: 'toggle-control-mode' },
    { header: 'camera' },
    { key: 'W/A/S/D', action: 'fly-movement' },
    { key: 'Q/E', action: 'fly-vertical' },
    { key: 'Shift', action: 'fly-speed-fast' },
    { key: 'Ctrl', action: 'fly-speed-slow' },
    { header: 'show' },
    { key: 'Space', action: 'toggle-splat-overlay' },
    { key: 'M', action: 'toggle-overlay-mode' },
    { key: 'G', action: 'toggle-grid' },
    { key: 'H', action: 'lock-selected-splats' },
    { key: 'Shift + H', action: 'unlock-all-splats' },
    { header: 'selection' },
    { key: 'Alt + A', action: 'select-all' },
    { key: 'Alt + Shift + A', action: 'deselect-all' },
    { key: 'Ctrl + I', action: 'invert-selection' },
    { key: 'Shift', action: 'add-to-selection' },
    { key: 'Ctrl', action: 'remove-from-selection' },
    { key: 'Delete', action: 'delete-selected-splats' },
    { header: 'tools' },
    { key: '1', action: 'move' },
    { key: '2', action: 'rotate' },
    { key: '3', action: 'scale' },
    { key: 'R', action: 'rect-selection' },
    { key: 'L', action: 'lasso-selection' },
    { key: 'P', action: 'polygon-selection' },
    { key: 'B', action: 'brush-selection' },
    { key: 'O', action: 'flood-selection' },
    { key: 'Alt + E', action: 'eyedropper-selection' },
    { key: '[ ]', action: 'brush-size' },
    { key: 'Esc', action: 'deactivate-tool' },
    { key: 'Shift + C', action: 'toggle-gizmo-coordinate-space' },
    { header: 'other' },
    { key: 'Tab', action: 'select-next-splat' },
    { key: 'Ctrl + Z', action: 'undo' },
    { key: 'Ctrl + Shift + Z', action: 'redo' },
    { key: 'Alt + D', action: 'toggle-data-panel' }
];

class ShortcutsPopup extends Container {
    constructor(args = {}) {
        args = {
            ...args,
            id: 'shortcuts-popup',
            hidden: true,
            tabIndex: -1
        };

        super(args);

        // Handle keyboard events to prevent global shortcuts from firing
        this.dom.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.hidden = true;
            }
            e.stopPropagation();
        });

        // Close when clicking outside dialog
        this.on('click', () => {
            this.hidden = true;
        });

        const dialog = new Container({
            id: 'dialog'
        });

        // Prevent clicks inside dialog from closing
        dialog.on('click', (event: MouseEvent) => {
            event.stopPropagation();
        });

        // Header
        const header = new Label({
            id: 'header',
            text: localize('popup.shortcuts.title').toUpperCase()
        });

        // Content
        const content = new Container({
            id: 'content'
        });

        shortcutList.forEach((shortcut) => {
            if (shortcut.header) {
                const label = new Label({
                    class: 'shortcut-header-label',
                    text: localize(`popup.shortcuts.${shortcut.header}`)
                });

                const entry = new Container({
                    class: 'shortcut-header'
                });

                entry.append(label);

                content.append(entry);
            } else {
                const key = new Label({
                    class: 'shortcut-key',
                    text: shortcut.key
                });

                const action = new Label({
                    class: 'shortcut-action',
                    text: localize(`popup.shortcuts.${shortcut.action}`)
                });

                const entry = new Container({
                    class: 'shortcut-entry'
                });

                entry.append(key);
                entry.append(action);

                content.append(entry);
            }
        });

        dialog.append(header);
        dialog.append(content);

        this.append(dialog);
    }

    set hidden(value: boolean) {
        super.hidden = value;
        if (!value) {
            // Take keyboard focus so shortcuts stop working
            this.dom.focus();
        }
    }

    get hidden(): boolean {
        return super.hidden;
    }
}

export { ShortcutsPopup };
