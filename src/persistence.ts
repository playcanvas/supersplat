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

export class Persistence {

    private events: Events;
    private settings: {[key: string]: any[]} = {};

    constructor(events: Events){
        this.events = events;
        this.loadSettings();

        PERSISTED_EVENTS.forEach((evt) => this.register(evt));
    }

    private loadSettings(){
        const storedString = localStorage.getItem('events');
        if(storedString){
            this.settings = JSON.parse(storedString);
            Object.entries(this.settings).forEach(([eventName, args]) => {
                this.events.fire(eventName, ...args);
            });
        }
    }

    private register(eventName: string){
        this.events.on(eventName, (...args: any[]) => {
            this.settings[eventName] = Array.from(args);
            localStorage.setItem('events', JSON.stringify(this.settings));
        })
    }
}