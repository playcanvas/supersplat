import {
    Color,
    Entity,
    Quat,
    Vec3,
    type CameraComponent
} from 'playcanvas';
import { XrControllers } from 'playcanvas/scripts/esm/xr-controllers.mjs';
import { XrNavigation } from 'playcanvas/scripts/esm/xr-navigation.mjs';

import { Global } from './types';

// On entering/exiting AR, we need to set the camera clear color to transparent black
const initXr = (global: Global) => {
    const { app, events, state, camera, renderer } = global;

    state.hasAR = app.xr.isAvailable('immersive-ar');
    state.hasVR = app.xr.isAvailable('immersive-vr');

    // initialize ar/vr
    app.xr.on('available:immersive-ar', (available) => {
        state.hasAR = available;
    });
    app.xr.on('available:immersive-vr', (available) => {
        state.hasVR = available;
    });

    // XR sessions require a WebGL device; under WebGPU we only expose availability so
    // the UI can offer to reload the viewer in WebGL mode.
    if (renderer !== 'webgl') {
        return;
    }

    const parent = camera.parent as Entity;
    const clearColor = new Color();

    const parentPosition = new Vec3();
    const parentRotation = new Quat();
    const cameraPosition = new Vec3();
    const cameraRotation = new Quat();
    const angles = new Vec3();

    parent.addComponent('script');
    parent.script.create(XrControllers);
    parent.script.create(XrNavigation);

    app.xr.on('start', () => {
        app.autoRender = true;

        // cache original camera rig positions and rotations
        parentPosition.copy(parent.getPosition());
        parentRotation.copy(parent.getRotation());
        cameraPosition.copy(camera.getPosition());
        cameraRotation.copy(camera.getRotation());

        cameraRotation.getEulerAngles(angles);

        // copy transform to parent to XR/VR mode starts in the right place
        parent.setPosition(cameraPosition.x, 0, cameraPosition.z);
        parent.setEulerAngles(0, angles.y, 0);

        if (app.xr.type === 'immersive-ar') {
            clearColor.copy(camera.camera.clearColor);
            camera.camera.clearColor = new Color(0, 0, 0, 0);
        }
    });

    app.xr.on('end', () => {
        app.autoRender = false;

        // restore camera to pre-XR state
        parent.setPosition(parentPosition);
        parent.setRotation(parentRotation);
        camera.setPosition(cameraPosition);
        camera.setRotation(cameraRotation);

        if (app.xr.type === 'immersive-ar') {
            camera.camera.clearColor = clearColor;
        }

        // Restore the canvas to the correct position in the DOM after exiting XR. In
        // some browsers (e.g. Chrome on Android) the canvas is moved to a new root
        // during XR, and needs to be moved back on exit.
        requestAnimationFrame(() => {
            document.body.prepend(app.graphicsDevice.canvas);
            app.renderNextFrame = true;
        });
    });

    const start = (type: string) => {
        camera.camera.nearClip = 0.01;
        camera.camera.farClip = 1000;
        app.xr.start(app.root.findComponent('camera') as CameraComponent, type, 'local-floor');
    };

    events.on('startAR', () => start('immersive-ar'));
    events.on('startVR', () => start('immersive-vr'));

    events.on('inputEvent', (event) => {
        if (event === 'cancel' && app.xr.active) {
            app.xr.end();
        }
    });
};

export { initXr };
