import type { Vec3 } from 'playcanvas';

import { Events } from '../events';

interface Tool {
    activate: () => void;
    deactivate: () => void;
    // optional: handle a transform-mode request (1/2/3 shortcuts) while this
    // tool is active. return true if consumed, otherwise the corresponding
    // transform tool is activated instead.
    setTransformMode?: (mode: 'translate' | 'rotate' | 'scale') => boolean;
    // optional: world-space focus target for the frame ('f') shortcut. return
    // null to fall back to framing the selection.
    getFocus?: () => { position: Vec3, radius: number } | null;
}

class ToolManager {
    tools = new Map<string, Tool>();
    events: Events;
    active: string | null = null;

    constructor(events: Events) {
        this.events = events;

        this.events.on('tool.deactivate', () => {
            this.activate(null);
        });

        this.events.function('tool.active', () => {
            return this.active;
        });

        // the active tool's focus target (if any), framed by camera.focus in
        // place of the selection
        this.events.function('tool.focus', () => {
            const tool = this.active ? this.tools.get(this.active) : null;
            return tool?.getFocus?.() ?? null;
        });

        let coordSpace: 'local' | 'world' = 'local';

        const setCoordSpace = (space: 'local' | 'world') => {
            if (space !== coordSpace) {
                coordSpace = space;
                events.fire('tool.coordSpace', coordSpace);
            }
        };

        events.function('tool.coordSpace', () => {
            return coordSpace;
        });

        events.on('tool.setCoordSpace', (value: 'local' | 'world') => {
            setCoordSpace(value);
        });

        events.on('tool.toggleCoordSpace', () => {
            setCoordSpace(coordSpace === 'local' ? 'world' : 'local');
        });

        // announce the initial space so ui constructed before this (e.g. the
        // bottom toolbar toggle) reflects the default; tools constructed
        // after read it via tool.coordSpace
        events.fire('tool.coordSpace', coordSpace);

        // the 1/2/3 shortcuts switch the active tool's gizmo mode if it
        // supports one (box/sphere selection), otherwise activate the
        // corresponding transform tool
        const transformShortcut = (mode: 'translate' | 'rotate' | 'scale', toolName: string) => {
            const tool = this.active ? this.tools.get(this.active) : null;
            if (!tool?.setTransformMode?.(mode)) {
                this.activate(toolName);
            }
        };

        events.on('tool.moveShortcut', () => transformShortcut('translate', 'move'));
        events.on('tool.rotateShortcut', () => transformShortcut('rotate', 'rotate'));
        events.on('tool.scaleShortcut', () => transformShortcut('scale', 'scale'));
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
