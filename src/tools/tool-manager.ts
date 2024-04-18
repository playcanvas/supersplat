import { Events } from '../events';

interface Tool {
    activate: () => void;
    deactivate: () => void;
}

class ToolManager {
    tools = new Map<string, Tool>();
    events: Events;
    active: string | null = null;
    coordSpace: 'local' | 'world' = 'world';

    constructor(events: Events) {
        this.events = events;

        this.events.on('tool.deactivate', () => {
            this.activate(null);
        });

        this.events.function('tool.active', () => {
            return this.active;
        });

        this.events.on('tool.localCoordSpace', () => {
            this.coordSpace = 'local';
            events.fire('tool.coordSpace', 'local');
        });

        this.events.on('tool.worldCoordSpace', () => {
            this.coordSpace = 'world';
            events.fire('tool.coordSpace', 'world');
        });

        this.events.on('tool.toggleCoordSpace', () => {
            this.events.fire(`tool.${this.coordSpace === 'local' ? 'world' : 'local'}CoordSpace`);
        });

        this.events.function('tool.coordSpace', () => {
            return this.coordSpace;
        });
    }

    register(name: string, tool: Tool) {
        this.tools.set(name, tool);

        this.events.on(`tool.${name}`, () => {
            this.activate(name);
        });
    }

    get(toolName: string) {
        return (toolName && this.tools.get(toolName)) ?? null;
    }

    activate(toolName: string | null) {
        if (toolName === this.active) {
            // re-activating the currently active tool deactivates it
            if (toolName) {
                this.activate(null);
            }
        } else {
            // deactive old tool
            if (this.active) {
                const tool = this.tools.get(this.active);
                tool.deactivate();
                this.events.fire(`tool.${this.active}.deactivated`);
                this.events.fire('tool.deactivated', this.active);
            }

            this.active = toolName;

            // activate the new
            if (this.active) {
                const tool = this.tools.get(this.active);
                tool.activate();
            }

            this.events.fire(`tool.${toolName}.activated`);
            this.events.fire('tool.activated', toolName);
        }
    }
}

export { ToolManager };
