import { Events } from './events';
import { version as appVersion } from '../package.json';

class Version{

    private versionArray: number[];
    private versionString: string;

    constructor(version: string){
        this.versionString = version;
        this.versionArray = version.split('.').map(token => parseInt(token));
    } 

    toString(): string{
        return this.versionString;
    }

    get major(): number
    { return this.versionArray[0] }

    get minor(): number|null
    { return this.versionArray.length > 1 ? this.versionArray[1]: null }

    get patch(): number|null
    { return this.versionArray.length > 2 ? this.versionArray[2]: null }

    /**
     * @param other 
     * @returns Value larger 0 if this is newer than other
     */
    compare(other:Version){
        const majorDiff = this.major - other.major;
        if(majorDiff !== 0) return majorDiff;
        
        if(this.minor === null || other.minor === null) return 0;
        const minorDiff = this.minor - other.minor;
        if(minorDiff !== 0) return minorDiff;
        
        if(this.patch === null || other.patch === null) return 0;
        return this.patch - other.patch;
    }
}

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

type Update = {version: Version, fn: () => void};

const updates: Update[] = [
    {
        version: new Version('1.9'),
        fn: () => {
            /* sample update */
        }
    }
]


const STORAGEKEY_VERSION = 'supersplat.version';
const STORAGEKEY_EVENTS = 'supersplat.events';

class Persistence {

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
            this.settings[eventName] = Array.from(args).filter(arg => arg);
            localStorage.setItem(STORAGEKEY_EVENTS, JSON.stringify(this.settings));
        })
    }

    private migrateSettings(fromVersion:string){
        const valuesVersion = new Version(fromVersion);
        const codeVersion = new Version(appVersion);

        if(valuesVersion.compare(codeVersion) > 0){
            console.log('Downgrading versions is not supported. Clearing stored data...');            
            localStorage.removeItem(STORAGEKEY_EVENTS);
            localStorage.setItem(STORAGEKEY_VERSION, appVersion);
            return;
        }

        updates
            .filter(update => update.version.compare(codeVersion) <= 0)  // drop updates for newer versions (code inconsistency)
            .sort((a, b) => a.version.compare(b.version))          // make sure the updates are executed in the correct order
            .filter(update => update.version.compare(valuesVersion) > 0) // only run updates that are newer than the persisted data
            .forEach(update => {
                console.log(`Updating to ${update.version} ...`);
                update.fn();
            });
    }
}

export {Persistence};