import { Events } from './events';

const PERSISTED_EVENTS = [
    'camera.setSplatSize',
    'camera.setOverlay',
    'camera.setMode',
    'camera.setBound',
    'camera.setFov',
    'view.setBands',
    'view.setOutlineSelection',
    'grid.setVisible'
];

const STORAGEKEY_EVENTS = 'supersplat.events';

class Persistence {
    events: Events;
    settings: {[key: string]: any[]} = {};

    constructor(events: Events) {
        this.events = events;
        this.loadSettings();

        PERSISTED_EVENTS.forEach(evt => this.register(evt));
    }

    loadSettings() {

        const storedString = localStorage.getItem(STORAGEKEY_EVENTS);
        if (storedString) {
            this.settings = JSON.parse(storedString);
            Object.entries(this.settings).forEach(([eventName, args]) => {
                this.events.fire(eventName, ...args);
            });
        }
    }

    register(eventName: string) {
        this.events.on(eventName, (...args: any[]) => {
            this.settings[eventName] = Array.from(args).filter(arg => arg);
            localStorage.setItem(STORAGEKEY_EVENTS, JSON.stringify(this.settings));
        });
    }
}

export { Persistence };
