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
    keys?: string[];        // list of keys
    codes?: string[];       // list of codes
    ctrl?: ModifierState;
    shift?: ModifierState;
    alt?: ModifierState;
    held?: boolean;
    repeat?: boolean;       // whether to fire on keyboard repeat events (for non-held shortcuts)
    capture?: boolean;      // whether to use capture phase for the event listener
}

/**
 * Options for registering a shortcut handler.
 * Extends ShortcutBinding with event/func handler.
 */
interface ShortcutOptions extends ShortcutBinding {
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
    shortcuts: ShortcutOptions[] = [];

    constructor(events: Events) {
        const shortcuts = this.shortcuts;

        const handleEvent = (e: KeyboardEvent, down: boolean, capture: boolean) => {
            // skip if focus is elsewhere (input fields, modals, etc.)
            if (e.target !== document.body) return;

            const isCtrlKey = e.code.startsWith('Control');
            const isShiftKey = e.code.startsWith('Shift');
            const isAltKey = e.code.startsWith('Alt');

            for (let i = 0; i < shortcuts.length; i++) {
                const options = shortcuts[i];

                const ctrlMatch = isCtrlKey || checkMod(options.ctrl, !!(e.ctrlKey || e.metaKey));
                const shiftMatch = isShiftKey || checkMod(options.shift, e.shiftKey);
                const altMatch = isAltKey || checkMod(options.alt, e.altKey);

                // Match if key matches keys array OR code matches codes array
                const keyMatches = (options.keys?.some(k => k.toLowerCase() === e.key.toLowerCase()) ||
                                    options.codes?.some(c => c === e.code)) ?? false;

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
                        // Also ignore repeated keydown events unless repeat is explicitly allowed
                        if (!down || (e.repeat && !options.repeat)) return;
                    }

                    if (options.event) {
                        // Only pass 'down' state for held shortcuts
                        if (options.held) {
                            events.fire(options.event, down);
                        } else {
                            events.fire(options.event);
                        }
                    } else {
                        options.func(down);
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

    register(options: ShortcutOptions) {
        this.shortcuts.push(options);
    }
}

export { Shortcuts, ModifierState, ShortcutBinding };
