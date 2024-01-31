import { Events } from '../events';

interface Tool {
    ToolName: string;

    activate: () => void;
    deactivate: () => void;
}

class ToolManager {
    tools = new Map<string, Tool>();
    events: Events;
    active: Tool | null = null;

    constructor(events: Events) {
        this.events = events;

        this.events.on('tool:activate', (toolName: string) => {
            this.activate(toolName);
        });

        this.events.function('tool:active', () => {
            return this.active?.ToolName;
        });
    }

    register(tool: Tool) {
        this.tools.set(tool.ToolName, tool);
    }

    get(toolName: string) {
        return (toolName && this.tools.get(toolName)) ?? null;
    }

    activate(toolName: string | null) {
        const newTool = this.get(toolName);

        if (newTool === this.active) {
            // re-activating the currently active tool deactivates it
            if (newTool) {
                this.activate(null);
            }
        } else {
            // deactive old tool
            if (this.active) {
                this.active.deactivate();
                this.events.fire('tool:deactivated', this.active.ToolName);
            }

            this.active = newTool;

            // activate the new
            if (this.active) {
                this.active.activate();
            }

            this.events.fire('tool:activated', this.active?.ToolName ?? null);
        }
    }
}

export { ToolManager };
