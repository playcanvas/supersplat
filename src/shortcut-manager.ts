import { platform } from 'playcanvas';

import { Events } from './events';
import { Shortcuts, ShortcutBinding } from './shortcuts';

// Mac uses different symbols for modifier keys
const isMac = platform.name === 'osx';

// Default shortcut bindings - the source of truth for key mappings
const defaultShortcuts: Record<string, ShortcutBinding> = {
    // Navigation
    'camera.reset': { keys: ['f'] },
    'camera.focus': { keys: ['f'], shift: 'required' },
    'camera.toggleControlMode': { keys: ['v'] },

    // Show
    'camera.toggleOverlay': { keys: [' '] },
    'camera.toggleMode': { keys: ['m'] },
    'grid.toggleVisible': { keys: ['g'] },
    'select.hide': { keys: ['h'] },
    'select.unhide': { keys: ['h'], shift: 'required' },

    // Selection
    'select.all': { keys: ['a'], alt: 'required' },
    'select.none': { keys: ['a'], alt: 'required', shift: 'required' },
    'select.invert': { keys: ['i'], ctrl: 'required' },
    'select.delete': { keys: ['Delete', 'Backspace'] },

    // Tools
    'tool.move': { keys: ['1'] },
    'tool.rotate': { keys: ['2'] },
    'tool.scale': { keys: ['3'] },
    'tool.rectSelection': { keys: ['r'] },
    'tool.lassoSelection': { keys: ['l'] },
    'tool.polygonSelection': { keys: ['p'] },
    'tool.brushSelection': { keys: ['b'] },
    'tool.floodSelection': { keys: ['o'] },
    'tool.eyedropperSelection': { keys: ['e'], alt: 'required' },
    'tool.brushSelection.smaller': { keys: ['['] },
    'tool.brushSelection.bigger': { keys: [']'] },
    'tool.deactivate': { keys: ['Escape'] },
    'tool.toggleCoordSpace': { keys: ['c'], shift: 'required' },

    // Other
    'selection.next': { keys: ['Tab'] },
    'edit.undo': { keys: ['z'], ctrl: 'required', capture: true },
    'edit.redo': { keys: ['z'], ctrl: 'required', shift: 'required', capture: true },
    'dataPanel.toggle': { keys: ['d'], alt: 'required' },

    // Camera fly keys - use physical positions (codes) for WASD layout on non-QWERTY keyboards
    'camera.fly.forward': { codes: ['KeyW'], held: true, shift: 'optional', ctrl: 'optional' },
    'camera.fly.backward': { codes: ['KeyS'], held: true, shift: 'optional', ctrl: 'optional' },
    'camera.fly.left': { codes: ['KeyA'], held: true, shift: 'optional', ctrl: 'optional' },
    'camera.fly.right': { codes: ['KeyD'], held: true, shift: 'optional', ctrl: 'optional' },
    'camera.fly.down': { codes: ['KeyQ'], held: true, shift: 'optional', ctrl: 'optional' },
    'camera.fly.up': { codes: ['KeyE'], held: true, shift: 'optional', ctrl: 'optional' },
    'camera.modifier.shift': { codes: ['ShiftLeft', 'ShiftRight'], held: true, ctrl: 'optional', alt: 'optional' },
    'camera.modifier.ctrl': { codes: ['ControlLeft', 'ControlRight'], held: true, shift: 'optional', alt: 'optional' }
};

class ShortcutManager {
    private bindings: Record<string, ShortcutBinding>;

    constructor(events: Events) {
        // Clone the defaults so they can be modified without affecting the originals
        this.bindings = {};
        for (const id in defaultShortcuts) {
            this.bindings[id] = { ...defaultShortcuts[id] };
        }

        // Create shortcuts and register all bindings
        const shortcuts = new Shortcuts(events);
        for (const id in this.bindings) {
            const binding = this.bindings[id];
            shortcuts.register({
                event: id,
                keys: binding.keys,
                codes: binding.codes,
                ctrl: binding.ctrl,
                shift: binding.shift,
                alt: binding.alt,
                held: binding.held,
                capture: binding.capture
            });
        }
    }

    /**
     * Get a shortcut binding by its event ID.
     */
    get(id: string): ShortcutBinding | undefined {
        return this.bindings[id];
    }

    /**
     * Format a shortcut for display (e.g., "Ctrl + Shift + Z" or "⌘⇧Z" on Mac).
     */
    formatShortcut(id: string): string {
        const binding = this.bindings[id];
        if (!binding) return '';

        const parts: string[] = [];

        // Use Mac symbols: ⌘ (Cmd), ⌥ (Option), ⇧ (Shift)
        if (binding.ctrl === 'required') parts.push(isMac ? '⌘' : 'Ctrl');
        if (binding.alt === 'required') parts.push(isMac ? '⌥' : 'Alt');
        if (binding.shift === 'required') parts.push(isMac ? '⇧' : 'Shift');

        // Get the first key or code for display
        let keyDisplay = binding.keys?.[0] ?? binding.codes?.[0];
        if (!keyDisplay) return '';

        if (keyDisplay === ' ') {
            keyDisplay = 'Space';
        } else if (keyDisplay === 'Escape') {
            keyDisplay = 'Esc';
        } else if (keyDisplay.startsWith('Key')) {
            // Physical key codes like 'KeyW' -> 'W'
            keyDisplay = keyDisplay.slice(3);
        } else if (keyDisplay.length === 1) {
            keyDisplay = keyDisplay.toUpperCase();
        }

        parts.push(keyDisplay);

        return isMac ? parts.join(' ') : parts.join(' + ');
    }
}

export { ShortcutManager };
