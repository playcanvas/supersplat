import { Events } from './events';

interface ShortcutOptions {
    ctrl?: boolean;
    shift?: boolean;
    sticky?: boolean;
    capture?: boolean;      // use capture phase - i.e. handle the events before anyone else
    func?: () => void;
    event?: string;
}

class Shortcuts {
    shortcuts: { keys: string[], options: ShortcutOptions, toggled: boolean }[] = [];

    constructor(events: Events) {
        const shortcuts = this.shortcuts;

        const handleEvent = (e: KeyboardEvent, down: boolean, capture: boolean) => {
            // skip keys in input fields
            if (!capture && e.target !== document.body) return;

            for (let i = 0; i < shortcuts.length; i++) {
                const shortcut  = shortcuts[i];
                const options = shortcut.options;

                if (shortcut.keys.includes(e.key) &&
                    ((options.capture ?? false) === capture) &&
                    !!options.ctrl === !!(e.ctrlKey || e.metaKey) &&
                    !!options.shift === !!e.shiftKey) {

                    e.stopPropagation();
                    e.preventDefault();

                    // handle sticky shortcuts
                    if (options.sticky) {
                        if (down) {
                            shortcut.toggled = e.repeat;
                        }

                        if (down === shortcut.toggled) {
                            return;
                        }
                    } else {
                        // ignore up events on non-sticky shortcuts
                        if (!down) return;
                    }

                    if (shortcuts[i].options.event) {
                        events.fire(shortcuts[i].options.event);
                    } else {
                        shortcuts[i].options.func();
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
        this.shortcuts.push({ keys, options, toggled: false });
    }
}

export {
    Shortcuts
};
