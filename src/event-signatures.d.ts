import { Vec3 } from 'playcanvas';


/**
 * A generic type that maps event names to their function signatures.
 * It is used to type-check the on, fire, and invoke methods of the Events class.
 */
export interface EventSignatures {
    /**
     * Event to start the spinner.
     */
    'startSpinner': () => void;
    /**
     * Event to stop the spinner.
     */
    'stopSpinner': () => void;
    /**
     * Event to set the camera pose.
     * @param pose - The camera pose.
     * @param a - A number.
     */
    'camera.setPose': (pose: { position: Vec3; target: Vec3; }, a: number) => void;
    /**
     * Escape hatch for transition, allows for any string to be used as an event name.
     * This provides a smoother transition path to fully typed events.
     */
    [key: string]: (...args: any[]) => any;
}
