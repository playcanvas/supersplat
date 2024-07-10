import { Container, Label, Overlay, Panel } from 'pcui';

const shortcutList = [
    { header: 'TOOLS' },
    { key: '1', action: 'Move' },
    { key: '2', action: 'Rotate' },
    { key: '3', action: 'Scale' },
    { key: 'R', action: 'Rect Selection' },
    { key: 'B', action: 'Brush Selection' },
    { key: 'P', action: 'Picker Selection' },
    { key: '[ ]', action: 'Decrease/Increase brush size' },
    { key: 'Esc', action: 'Deactivate Tool' },
    { header: 'SELECTION' },
    { key: 'A', action: 'Select All' },
    { key: 'Shift + A', action: 'Deselect All' },
    { key: 'I', action: 'Invert Selection' },
    { key: 'Shift', action: 'Add to Selection' },
    { key: 'Ctrl', action: 'Remove from Selection' },
    { key: 'Delete', action: 'Delete Selected Splats' },
    { header: 'SHOW' },
    { key: 'H', action: 'Hide Selected Splats' },
    { key: 'U', action: 'Unhide All Splats' },
    { key: 'D', action: 'Toggle Data Panel' },
    { header: 'OTHER' },
    { key: 'Tab', action: 'Select Next Splat' },
    { key: 'Ctrl + Z', action: 'Undo' },
    { key: 'Ctrl + Shift + Z', action: 'Redo' },
    { key: 'Space', action: 'Toggle Splat Overlay' },
    { key: 'F', action: 'Focus Camera on current selection' },
    { key: 'M', action: 'Toggle Camera Mode'},
    { key: 'G', action: 'Toggle Grid' },
    { key: 'C', action: 'Toggle Gizmo Coordinate Space' },
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
                    text: shortcut.header
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
                    text: shortcut.action
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
            headerText: 'KEYBOARD SHORTCUTS'
        });

        shortcutsPanel.append(shortcutsContainer);

        this.append(shortcutsPanel);
    }
}

export { ShortcutsPopup };
