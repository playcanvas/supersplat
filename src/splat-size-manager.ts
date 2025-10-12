import { ElementType } from './element';
import { Events } from './events';
import { Scene } from './scene';
import { Splat } from './splat';

const registerSplatSizeManagerEvents = (events: Events, scene: Scene) => {
    let globalSplatSize = 1.0;
    let splatSizeReady = false;

    // Safe function to apply size to all splats
    const applySizeToAllSplats = (size: number) => {
        console.log(`applySizeToAllSplats called with size: ${size}`);

        // Validate input
        if (typeof size !== 'number' || isNaN(size)) {
            console.warn('Invalid size value:', size);
            return;
        }

        // Don't try to apply size if we're not ready yet
        if (!splatSizeReady) {
            console.log('Splat size system not ready, storing size for later');
            return;
        }

        // Try to get splats safely
        let splats: any = null;

        // Use a simple, safe approach
        if (typeof events?.invoke === 'function') {
            try {
                splats = events.invoke('scene.allSplats');
            } catch (e) {
                console.log('Could not get splats via events, will try later');
                return;
            }
        }

        // Apply size if we have valid splats
        if (Array.isArray(splats) && splats.length > 0) {
            console.log(`Applying size ${size} to ${splats.length} splats`);

            // Safe iteration
            for (let i = 0; i < splats.length; i++) {
                try {
                    const splat = splats[i];
                    if (splat && typeof splat.splatSize !== 'undefined') {
                        splat.splatSize = size;
                    }
                } catch (e) {
                    console.warn(`Error setting size for splat ${i}:`, e);
                }
            }

            if (scene && scene.forceRender !== undefined) {
                scene.forceRender = true;
            }
        } else {
            console.log('No splats available yet');
        }
    };

    // Initialize the system when splats are available
    const initializeSplatSize = () => {
        console.log('Initializing splat size system');
        splatSizeReady = true;
        applySizeToAllSplats(globalSplatSize);
    };

    // Public API functions
    events.function('splatSize.getValue', () => {
        return globalSplatSize;
    });

    events.on('splatSize.setValue', (size: number) => {
        if (typeof size === 'number' && !isNaN(size) && size !== globalSplatSize) {
            globalSplatSize = size;
            applySizeToAllSplats(size);
            events.fire('splatSize.changed', size);
        }
    });

    events.on('splatSize.setGlobal', (size: number) => {
        if (typeof size === 'number' && !isNaN(size)) {
            globalSplatSize = size;
            applySizeToAllSplats(size);
            events.fire('splatSize.changed', size);
        }
    });

    // Handle individual splat size changes to update global value
    events.on('splat.splatSize', (splat: Splat) => {
        // If a single splat's size changes, update the global value
        // This allows UI controls to stay in sync
        if (splat.splatSize !== globalSplatSize) {
            globalSplatSize = splat.splatSize;
            events.fire('splatSize.changed', globalSplatSize);
        }
    });

    // When new splats are added, initialize the system
    events.on('scene.elementAdded', (element: any) => {
        if (element && element.type === ElementType.splat) {
            const splat = element as Splat;

            // Set initial size on the individual splat
            if (typeof splat.splatSize !== 'undefined') {
                splat.splatSize = globalSplatSize;
            }

            // Initialize the system if not already initialized
            if (!splatSizeReady) {
                setTimeout(() => {
                    initializeSplatSize();
                }, 100); // Small delay to ensure everything is ready
            }
        }
    });
};

export { registerSplatSizeManagerEvents };
