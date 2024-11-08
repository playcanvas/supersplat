import { Events } from './events';
import { version as appVersion } from '../package.json';

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


const STORAGEKEY_VERSION = 'supersplat.version';
const STORAGEKEY_EVENTS = 'supersplat.events';

export class Persistence {

    private events: Events;
    private settings: {[key: string]: any[]} = {};

    constructor(events: Events){
        this.events = events;
        this.loadSettings();

        PERSISTED_EVENTS.forEach((evt) => this.register(evt));
    }

    private loadSettings(){
        const settingsVersion = localStorage.getItem(STORAGEKEY_VERSION);
        if(!settingsVersion){
            localStorage.setItem(STORAGEKEY_VERSION, appVersion);
            return;
        }
        else if(settingsVersion !== appVersion){
            this.migrateSettings(settingsVersion);
        }

        const storedString = localStorage.getItem(STORAGEKEY_EVENTS);
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
            localStorage.setItem(STORAGEKEY_EVENTS, JSON.stringify(this.settings));
        })
    }

    private migrateSettings(fromVersion:string){
        //TODO: No settings migration yet :)
        localStorage.removeItem(STORAGEKEY_EVENTS);
        localStorage.setItem(STORAGEKEY_VERSION, appVersion);
    }
}