import { EventHandler } from "playcanvas";

class Events extends EventHandler {
    functions = new Map<string, Function>();

    constructor() {
        super();
    }

    // declare an editor function
    function(name: string, fn: Function) {
        if (this.functions.has(name)) {
            throw new Error(`error: function ${name} already exists`);
        }
        this.functions.set(name, fn);
    }

    // invoke an editor function
    invoke(name: string, ...args: any[]) {
        const fn = this.functions.get(name);
        if (!fn) {
            console.log(`error: function not found '${name}'`);
            return;
        }
        return fn(...args);
    }
}

export { Events };
