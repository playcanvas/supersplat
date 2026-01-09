import { Events } from './events';

interface ShortcutOptions {
    // for modifier keys:
    // - true: require pressed
    // - false: don't check (doesn't matter)
    // - undefined (not specified): require NOT pressed
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;

    // track key held state - fires on both keydown and keyup
    held?: boolean;

    // use capture phase - i.e. handle the events before anyone else
    capture?: boolean;

    // either provide a function to call, or an event name to fire
    func?: (down?: boolean) => void;
    event?: string;
}

const checkMod = (optionValue: boolean | undefined, eventValue: boolean) => {
    switch (optionValue) {
        case true: return eventValue;
        case false: return true;
        case undefined: return !eventValue;
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
                const shortcut  = shortcuts[i];
                const options = shortcut.options;

                const ctrlMatch = isCtrlKey || checkMod(options.ctrl, !!(e.ctrlKey || e.metaKey));
                const shiftMatch = isShiftKey || checkMod(options.shift, e.shiftKey);
                const altMatch = isAltKey || checkMod(options.alt, e.altKey);

                if (shortcut.keys.includes(e.code) &&
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

export {
    Shortcuts
};
