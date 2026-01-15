import { Events } from './events';

/**
 * Modifier key requirement state.
 * - 'required': modifier must be pressed
 * - 'forbidden': modifier must NOT be pressed (default if unspecified)
 * - 'optional': don't care either way
 */
type ModifierState = 'required' | 'forbidden' | 'optional';

/**
 * A shortcut binding definition.
 */
interface ShortcutBinding {
    keys: string[];             // e.g., ['r'] or ['KeyW'] for useCode
    useCode?: boolean;          // true = use physical key position (e.code)
    ctrl?: ModifierState;
    shift?: ModifierState;
    alt?: ModifierState;
    held?: boolean;
    capture?: boolean;          // whether to use capture phase for the event listener
}

/**
 * Options for registering a shortcut handler.
 * Extends ShortcutBinding but replaces keys with event/func.
 */
interface ShortcutOptions extends Omit<ShortcutBinding, 'keys'> {
    event?: string;
    func?: (down?: boolean) => void;
}

/**
 * Check if a modifier key state matches the requirement.
 */
const checkMod = (requirement: ModifierState | undefined, isPressed: boolean): boolean => {
    switch (requirement) {
        case 'required': return isPressed;
        case 'optional': return true;
        case 'forbidden':
        default: return !isPressed;
    }
};

class Shortcuts {
    shortcuts: { keys: string[], options: ShortcutOptions }[] = [];

    constructor(events: Events) {
        const shortcuts = this.shortcuts;

        const handleEvent = (e: KeyboardEvent, down: boolean, capture: boolean) => {
            // skip keys in input fields
            if (!capture && e.target !== document.body) return;

            const isCtrlKey = e.code.startsWith('Control');
            const isShiftKey = e.code.startsWith('Shift');
            const isAltKey = e.code.startsWith('Alt');

            for (let i = 0; i < shortcuts.length; i++) {
                const shortcut = shortcuts[i];
                const options = shortcut.options;

                const ctrlMatch = isCtrlKey || checkMod(options.ctrl, !!(e.ctrlKey || e.metaKey));
                const shiftMatch = isShiftKey || checkMod(options.shift, e.shiftKey);
                const altMatch = isAltKey || checkMod(options.alt, e.altKey);

                // match against physical key position (code) or labeled key (key) based on useCode option
                const keyToMatch = options.useCode ? e.code : e.key.toLowerCase();
                const keyMatches = shortcut.keys.some(k => k.toLowerCase() === keyToMatch);

                if (keyMatches &&
                    ((options.capture ?? false) === capture) &&
                    ctrlMatch && shiftMatch && altMatch) {

                    // consume the event
                    e.stopPropagation();
                    e.preventDefault();

                    if (options.held) {
                        // Skip repeated keydown events, but fire on initial down and all up events
                        if (down && e.repeat) {
                            return;
                        }
                    } else {
                        // Non-held: ignore up events
                        if (!down) return;
                    }

                    if (shortcuts[i].options.event) {
                        events.fire(shortcuts[i].options.event, down);
                    } else {
                        shortcuts[i].options.func(down);
                    }

                    break;
                }
            }
        };

        // register keyboard handler
        document.addEventListener('keydown', (e) => {
            handleEvent(e, true, false);
        });

        document.addEventListener('keyup', (e) => {
            handleEvent(e, false, false);
        });

        // also handle capture phase
        document.addEventListener('keydown', (e) => {
            handleEvent(e, true, true);
        }, true);

        document.addEventListener('keyup', (e) => {
            handleEvent(e, false, true);
        }, true);
    }

    register(keys: string[], options: ShortcutOptions) {
        this.shortcuts.push({ keys, options });
    }
}

export { Shortcuts, ModifierState, ShortcutBinding };
