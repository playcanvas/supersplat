import { Container, Label, Overlay, Panel } from '@playcanvas/pcui';

import { localize } from './localization';

const shortcutList = [
    { header: 'tools' },
    { key: '1', action: 'move' },
    { key: '2', action: 'rotate' },
    { key: '3', action: 'scale' },
    { key: 'R', action: 'rect-selection' },
    { key: 'B', action: 'brush-selection' },
    { key: 'O', action: 'flood-selection' },
    { key: 'P', action: 'picker-selection' },
    { key: '[ ]', action: 'brush-size' },
    { key: 'Esc', action: 'deactivate-tool' },
    { header: 'selection' },
    { key: 'Ctrl + A', action: 'select-all' },
    { key: 'Shift + A', action: 'deselect-all' },
    { key: 'Ctrl + I', action: 'invert-selection' },
    { key: 'Shift', action: 'add-to-selection' },
    { key: 'Ctrl', action: 'remove-from-selection' },
    { key: 'Delete', action: 'delete-selected-splats' },
    { header: 'show' },
    { key: 'H', action: 'hide-selected-splats' },
    { key: 'U', action: 'unhide-all-splats' },
    { key: 'D', action: 'toggle-data-panel' },
    { header: 'other' },
    { key: 'Tab', action: 'select-next-splat' },
    { key: 'Ctrl + Z', action: 'undo' },
    { key: 'Ctrl + Shift + Z', action: 'redo' },
    { key: 'Space', action: 'toggle-splat-overlay' },
    { key: 'F', action: 'focus-camera' },
    { key: 'M', action: 'toggle-camera-mode' },
    { key: 'G', action: 'toggle-grid' },
    { key: 'C', action: 'toggle-gizmo-coordinate-space' }
];

class ShortcutsPopup extends Overlay {
    constructor(args = {}) {
        args = {
            ...args,
            id: 'shortcuts-popup',
            clickable: true,
            hidden: true
        };

        super(args);

        const shortcutsContainer = new Container({
            id: 'shortcuts-container'
        });

        shortcutList.forEach((shortcut) => {
            if (shortcut.header) {
                const label = new Label({
                    class: 'shortcut-header-label',
                    text: localize(`shortcuts.${shortcut.header}`)
                });

                const entry = new Container({
                    class: 'shortcut-header'
                });

                entry.append(label);

                shortcutsContainer.append(entry);
            } else {
                const key = new Label({
                    class: 'shortcut-key',
                    text: shortcut.key
                });

                const action = new Label({
                    class: 'shortcut-action',
                    text: localize(`shortcuts.${shortcut.action}`)
                });

                const entry = new Container({
                    class: 'shortcut-entry'
                });

                entry.append(key);
                entry.append(action);

                shortcutsContainer.append(entry);
            }
        });

        const shortcutsPanel = new Panel({
            id: 'shortcuts-panel',
            headerText: localize('shortcuts.title')
        });

        shortcutsPanel.append(shortcutsContainer);

        this.append(shortcutsPanel);
    }
}

export { ShortcutsPopup };
