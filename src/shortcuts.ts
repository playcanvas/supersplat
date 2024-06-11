import { Events } from "./events";

interface ShortcutOptions {
    ctrl?: boolean;
    shift?: boolean;
    func?: () => void;
    event?: string;
}

class Shortcuts {
    shortcuts: { keys: string[], options: ShortcutOptions }[] = [];

    constructor(events: Events) {
        const shortcuts = this.shortcuts;

        // register keyboard handler
        document.addEventListener('keydown', (e) => {
            // skip keys in input fields
            if (e.target !== document.body) return;

            for (let i = 0; i < shortcuts.length; i++) {
                if (shortcuts[i].keys.includes(e.key) &&
                    !!shortcuts[i].options.ctrl === !!(e.ctrlKey || e.metaKey) &&
                    !!shortcuts[i].options.shift === !!e.shiftKey) {
                    if (shortcuts[i].options.event) {
                        events.fire(shortcuts[i].options.event);
                    } else {
                        shortcuts[i].options.func();
                    }
                    break;
                }
            }
        });
    }

    register(keys: string[], options: ShortcutOptions) {
        this.shortcuts.push({ keys, options });
    }
}

export {
    Shortcuts
};
