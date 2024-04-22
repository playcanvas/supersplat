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
        try {
            return fn(...args);
        } catch (error) {
            console.log(`error invoking editor function '${name}': ${error}`);
        }
        return null;
    }
}

export { Events };
