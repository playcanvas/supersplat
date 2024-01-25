import { Container, Label, Overlay, Panel } from 'pcui';

const shortcutList = [
    { key: 'F', action: 'Focus camera' },
    { key: 'I', action: 'Invert selection' },
    { key: '1', action: 'Move Tool' },
    { key: '2', action: 'Rotate Tool' },
    { key: '3', action: 'Scale Tool' },
    { key: 'R', action: 'Rect Tool' },
    { key: 'B', action: 'Brush Tool' },
    { key: '[ ]', action: 'Decrease/Increase brush size' },
    { key: 'Shift', action: 'Add to selection' },
    { key: 'Ctrl', action: 'Remove from selection' },
    { key: 'Delete', action: 'Delete selected splats' },
    { key: 'Esc', action: 'Cancel rect selection' },
    { key: 'Ctrl + Z', action: 'Undo' },
    { key: 'Ctrl + Shift + Z', action: 'Redo' },
    { key: 'Space', action: 'Toggle debug splat display' }
];

class ShortcutsPopup extends Overlay {
    constructor(args = {}) {
        args = Object.assign(args, {
            id: 'shortcuts-popup',
            clickable: true,
            hidden: true
        });

        super(args);

        const shortcutsContainer = new Container({
            id: 'shortcuts-container'
        });

        shortcutList.forEach((shortcut) => {
            const key = new Label({
                class: 'shortcut-key',
                text: shortcut.key
            });

            const action = new Label({
                class: 'shortcut-action',
                text: shortcut.action
            });

            const entry = new Container({
                class: 'shortcut-entry'
            });

            entry.append(key);
            entry.append(action);

            shortcutsContainer.append(entry);
        });

        const shortcutsPanel = new Panel({
            id: 'shortcuts-panel',
            headerText: 'KEYBOARD SHORTCUTS'
        });

        shortcutsPanel.append(shortcutsContainer);

        this.append(shortcutsPanel);
    }
}

export { ShortcutsPopup };
