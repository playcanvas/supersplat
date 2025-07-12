import { EventHandler } from 'playcanvas';
import { EventSignatures } from './event-signatures';

// Type gymnastics for the definition below
type EventName = keyof EventSignatures & string;
type EventCallback<T extends EventName> = EventSignatures[T];
type EventParams<T extends EventName> = Parameters<EventCallback<T>>;
type EventReturn<T extends EventName> = ReturnType<EventCallback<T>>;

class Events extends EventHandler {
    functions = new Map<string, EventCallback<any>>();

    // declare an editor function
    function<T extends EventName>(name: T, fn: EventCallback<T>) {
        if (this.functions.has(name)) {
            throw new Error(`error: function ${name} already exists`);
        }
        this.functions.set(name, fn);
    }

    // invoke an editor function
    invoke<T extends EventName>(name: T, ...args: EventParams<T>): EventReturn<T> {
        const fn = this.functions.get(name);
        if (!fn) {
            console.log(`error: function not found '${name}'`);
            return;
        }
        return fn(...args);
    }

    on<T extends EventName>(name: T, callback: EventCallback<T>, scope?: any): any {
        return super.on(name, callback, scope);
    }

    fire<T extends EventName>(name: T, ...args: EventParams<T>): any {
        return super.fire(name, ...args);
    }
}

export { Events };
