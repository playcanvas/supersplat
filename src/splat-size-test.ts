import { Events } from './events';

// Simple test function for splat size functionality
export const testSplatSize = (events: Events) => {
    console.log('Testing splat size functionality...');

    // Test basic size setting
    try {
        const currentSize = events.invoke('splatSize.getValue');
        console.log('Current splat size:', currentSize);

        // Test setting size to 2.0
        events.fire('splatSize.setGlobal', 2.0);

        const newSize = events.invoke('splatSize.getValue');
        console.log('New splat size:', newSize);

        // Test setting size back to 1.0
        setTimeout(() => {
            events.fire('splatSize.setGlobal', 1.0);
            console.log('Reset splat size to 1.0');
        }, 2000);

        // Test keyframe functionality
        setTimeout(() => {
            console.log('Testing keyframe functionality...');
            events.fire('splatSize.addKeyframe', { frame: 0, size: 1.0 });
            events.fire('splatSize.addKeyframe', { frame: 30, size: 3.0 });
            events.fire('splatSize.addKeyframe', { frame: 60, size: 0.5 });

            const keyframes = events.invoke('splatSize.keyframes');
            console.log('Added keyframes:', keyframes);
        }, 4000);

    } catch (error) {
        console.error('Error testing splat size:', error);
    }
};
