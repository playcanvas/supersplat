import { EventHandler } from 'playcanvas';

interface Tool {
    ToolName: string;

    activate: () => void;
    deactivate: () => void;
}

class ToolManager {
    activeTool: Tool | null = null;
    tools = new Map<string, Tool>();
    events = new EventHandler();

    constructor() {

    }

    add(tool: Tool) {
        this.tools.set(tool.ToolName, tool);
    }

    get(toolName: string) {
        return toolName ? this.tools.get(toolName) : null;
    }

    activate(toolName: string) {
        const newTool = this.get(toolName);
        if (newTool === this.activeTool || newTool === undefined) {
            return false;
        }

        // deactive old tool
        if (this.activeTool) {
            this.activeTool.deactivate();
            this.events.fire('deactivated', this.activeTool);
        }

        this.activeTool = newTool;

        // activate the new
        if (this.activeTool) {
            this.activeTool.activate();
            this.events.fire('activated', this.activeTool);
        }
    }
}

export { ToolManager };
