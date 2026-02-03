import { Container, Label } from '@playcanvas/pcui';

import { Events } from '../events';
import { ShortcutManager } from '../shortcut-manager';
import { localize } from './localization';

// Popup display configuration - maps shortcuts to categories and locale keys
// This is separate from the shortcut bindings themselves (separation of concerns)
interface ShortcutDisplayItem {
    id: string;           // event ID to look up in ShortcutManager
    localeKey: string;    // localization key for the action description
}

interface HintDisplayItem {
    displayKey: string;   // what to show in the key column
    localeKey: string;    // localization key for the action description
}

interface CategoryConfig {
    localeKey: string;
    shortcuts: ShortcutDisplayItem[];
    hints?: HintDisplayItem[];
}

// Display configuration for the shortcuts popup
const popupConfig: Record<string, CategoryConfig> = {
    navigation: {
        localeKey: 'popup.shortcuts.navigation',
        shortcuts: [
            { id: 'camera.reset', localeKey: 'popup.shortcuts.reset-camera' },
            { id: 'camera.focus', localeKey: 'popup.shortcuts.focus-camera' },
            { id: 'camera.toggleControlMode', localeKey: 'popup.shortcuts.toggle-control-mode' }
        ]
    },
    camera: {
        localeKey: 'popup.shortcuts.camera',
        shortcuts: [],
        hints: [
            { displayKey: 'W / A / S / D', localeKey: 'popup.shortcuts.fly-movement' },
            { displayKey: 'Q / E', localeKey: 'popup.shortcuts.fly-vertical' },
            { displayKey: 'Shift', localeKey: 'popup.shortcuts.fly-speed-fast' },
            { displayKey: 'Alt', localeKey: 'popup.shortcuts.fly-speed-slow' }
        ]
    },
    show: {
        localeKey: 'popup.shortcuts.show',
        shortcuts: [
            { id: 'camera.toggleOverlay', localeKey: 'popup.shortcuts.toggle-splat-overlay' },
            { id: 'camera.toggleMode', localeKey: 'popup.shortcuts.toggle-overlay-mode' },
            { id: 'grid.toggleVisible', localeKey: 'popup.shortcuts.toggle-grid' },
            { id: 'select.hide', localeKey: 'popup.shortcuts.lock-selected-splats' },
            { id: 'select.unhide', localeKey: 'popup.shortcuts.unlock-all-splats' }
        ]
    },
    selection: {
        localeKey: 'popup.shortcuts.selection',
        shortcuts: [
            { id: 'select.all', localeKey: 'popup.shortcuts.select-all' },
            { id: 'select.none', localeKey: 'popup.shortcuts.deselect-all' },
            { id: 'select.invert', localeKey: 'popup.shortcuts.invert-selection' },
            { id: 'select.delete', localeKey: 'popup.shortcuts.delete-selected-splats' }
        ],
        hints: [
            { displayKey: 'Shift', localeKey: 'popup.shortcuts.add-to-selection' },
            { displayKey: 'Ctrl', localeKey: 'popup.shortcuts.remove-from-selection' }
        ]
    },
    tools: {
        localeKey: 'popup.shortcuts.tools',
        shortcuts: [
            { id: 'tool.move', localeKey: 'popup.shortcuts.move' },
            { id: 'tool.rotate', localeKey: 'popup.shortcuts.rotate' },
            { id: 'tool.scale', localeKey: 'popup.shortcuts.scale' },
            { id: 'tool.rectSelection', localeKey: 'popup.shortcuts.rect-selection' },
            { id: 'tool.lassoSelection', localeKey: 'popup.shortcuts.lasso-selection' },
            { id: 'tool.polygonSelection', localeKey: 'popup.shortcuts.polygon-selection' },
            { id: 'tool.brushSelection', localeKey: 'popup.shortcuts.brush-selection' },
            { id: 'tool.floodSelection', localeKey: 'popup.shortcuts.flood-selection' },
            { id: 'tool.eyedropperSelection', localeKey: 'popup.shortcuts.eyedropper-selection' },
            { id: 'tool.deactivate', localeKey: 'popup.shortcuts.deactivate-tool' },
            { id: 'tool.toggleCoordSpace', localeKey: 'popup.shortcuts.toggle-gizmo-coordinate-space' }
        ],
        hints: [
            { displayKey: '[ ]', localeKey: 'popup.shortcuts.brush-size' }
        ]
    },
    playback: {
        localeKey: 'popup.shortcuts.playback',
        shortcuts: [
            { id: 'timeline.togglePlay', localeKey: 'popup.shortcuts.play-pause' },
            { id: 'timeline.prevFrame', localeKey: 'popup.shortcuts.prev-frame' },
            { id: 'timeline.nextFrame', localeKey: 'popup.shortcuts.next-frame' },
            { id: 'timeline.prevKey', localeKey: 'popup.shortcuts.prev-key' },
            { id: 'timeline.nextKey', localeKey: 'popup.shortcuts.next-key' },
            { id: 'timeline.addKey', localeKey: 'popup.shortcuts.add-key' },
            { id: 'timeline.removeKey', localeKey: 'popup.shortcuts.remove-key' }
        ]
    },
    other: {
        localeKey: 'popup.shortcuts.other',
        shortcuts: [
            { id: 'edit.undo', localeKey: 'popup.shortcuts.undo' },
            { id: 'edit.redo', localeKey: 'popup.shortcuts.redo' },
            { id: 'dataPanel.toggle', localeKey: 'popup.shortcuts.toggle-data-panel' }
        ]
    }
};

// Category display order
const categoryOrder = ['navigation', 'camera', 'show', 'selection', 'tools', 'playback', 'other'];

class ShortcutsPopup extends Container {
    constructor(events: Events, args = {}) {
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

        // Get the shortcut manager from events
        const shortcutManager: ShortcutManager = events.invoke('shortcutManager');

        // Build the shortcut list from the popup display configuration
        for (const categoryId of categoryOrder) {
            const config = popupConfig[categoryId];
            if (!config) continue;

            // Add category header
            const headerLabel = new Label({
                class: 'shortcut-header-label',
                text: localize(config.localeKey)
            });

            const headerEntry = new Container({
                class: 'shortcut-header'
            });

            headerEntry.append(headerLabel);
            content.append(headerEntry);

            // Add shortcuts for this category
            for (const item of config.shortcuts) {
                const keyText = shortcutManager.formatShortcut(item.id);
                if (!keyText) continue;  // Skip if shortcut not found

                const key = new Label({
                    class: 'shortcut-key',
                    text: keyText
                });

                const action = new Label({
                    class: 'shortcut-action',
                    text: localize(item.localeKey)
                });

                const entry = new Container({
                    class: 'shortcut-entry'
                });

                entry.append(key);
                entry.append(action);
                content.append(entry);
            }

            // Add hints for this category (non-shortcut display items)
            if (config.hints) {
                for (const hint of config.hints) {
                    const key = new Label({
                        class: 'shortcut-key',
                        text: hint.displayKey
                    });

                    const action = new Label({
                        class: 'shortcut-action',
                        text: localize(hint.localeKey)
                    });

                    const entry = new Container({
                        class: 'shortcut-entry'
                    });

                    entry.append(key);
                    entry.append(action);
                    content.append(entry);
                }
            }
        }

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
