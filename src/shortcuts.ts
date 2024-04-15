
class Shortcuts {
    shortcuts: { keys: string[], ctrl: boolean, shift: boolean, func: () => void}[] = [];

    constructor() {
        
    }

    register(keys: string[], ctrl = false, shift = false, func: () => void) {
        this.shortcuts.push({ keys, ctrl, shift, func });
    };
};

export {
    Shortcuts
};
