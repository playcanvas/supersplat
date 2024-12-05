const template = /* html */ `
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
        <title>3D Gaussian Splat Viewer</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                touch-action: none;
            }
            body {
                overflow: hidden;
            }
            #infoPanel {
                position: absolute;
                left: 5px;
                bottom: 5px;
                padding: 10px;
                color: lightgrey;
                background-color: rgba(0, 0, 0, 0.5);
                font-family: sans-serif;
                font-size: 12px;
                border-radius: 6px;
                cursor: pointer;
                user-select: none;
            }
            .heading {
                display: inline-block;
                font-weight: bold;
                width: 20px;
                height: 20px;
                line-height: 20px;
                border-radius: 10px;
                color: black;
                background-color: white;
                text-align: center;
            }
            .divider {
                color: white;
                border-bottom: 1px solid gray;
                padding: 0px 0px 3px 0px;
                margin: 0px 0px 3px 0px;
                font-weight: bold;
            }
            :not(.hidden) > .heading {
                display: none;
            }
            .hidden :not(.heading) {
                display: none;
            }
        </style>
        <script type="importmap">
            {
                "imports": {
                    "playcanvas": "https://cdn.jsdelivr.net/npm/playcanvas@2.3.1/build/playcanvas.mjs"
                }
            }
        </script>
        <script type="module" src="https://cdn.jsdelivr.net/npm/@playcanvas/web-components@0.1.9/dist/pwc.mjs"></script>
    </head>
    <body>
        <pc-app antialias="false" depth="false" high-resolution="true" stencil="false">
            <pc-asset id="camera-controls" src="https://cdn.jsdelivr.net/npm/playcanvas@2.3.1/scripts/esm/camera-controls.mjs" preload></pc-asset>
            <pc-asset id="xr-controllers" src="https://cdn.jsdelivr.net/npm/playcanvas@2.3.1/scripts/esm/xr-controllers.mjs" preload></pc-asset>
            <pc-asset id="xr-navigation" src="https://cdn.jsdelivr.net/npm/playcanvas@2.3.1/scripts/esm/xr-navigation.mjs" preload></pc-asset>
            <pc-asset id="ply" type="gsplat" src="data:application/ply;base64,{{plyModel}} preload></pc-asset>
            <pc-scene>
                <!-- Camera (with XR support) -->
                <pc-entity name="camera root">
                    <pc-entity name="camera">
                        <pc-camera clear-color="{{clearColor}}"></pc-camera>
                        <pc-scripts>
                            <pc-script name="cameraControls"></pc-script>
                        </pc-scripts>
                    </pc-entity>
                    <pc-scripts>
                        <pc-script name="xrControllers"></pc-script>
                        <pc-script name="xrNavigation"></pc-script>
                    </pc-scripts>
                </pc-entity>
                <!-- Splat -->
                <pc-entity name="splat" rotation="0 0 180">
                    <pc-splat asset="ply"></pc-splat>
                </pc-entity>
            </pc-scene>
        </pc-app>

        <!-- Camera Controls -->
        <script type="module">
            import { BoundingBox, Script, Vec3 } from 'playcanvas';

            document.addEventListener('DOMContentLoaded', async () => {
                const appElement = await document.querySelector('pc-app').ready();
                const app = await appElement.app;

                const entityElement = await document.querySelector('pc-entity[name="camera"]').ready();
                const entity = entityElement.entity;

                class FrameScene extends Script {
                    frameScene(bbox) {
                        const sceneSize = bbox.halfExtents.length();
                        const distance = sceneSize / Math.sin(this.entity.camera.fov / 180 * Math.PI * 0.5);
                        this.entity.script.cameraControls.sceneSize = sceneSize;
                        this.entity.script.cameraControls.focus(bbox.center, new Vec3(2, 1, 2).normalize().mulScalar(distance).add(bbox.center));
                    }

                    resetCamera(bbox) {
                        const sceneSize = bbox.halfExtents.length();
                        this.entity.script.cameraControls.sceneSize = sceneSize * 0.2;
                        this.entity.script.cameraControls.focus(Vec3.ZERO, new Vec3(2, 1, 2));
                    }

                    calcBound() {
                        const gsplatComponents = this.app.root.findComponents('gsplat');
                        return gsplatComponents?.[0]?.instance?.meshInstance?.aabb ?? new BoundingBox();
                    }

                    postInitialize() {
                        const bbox = this.calcBound();

                        if (bbox.halfExtents.length() > 100) {
                            this.resetCamera(bbox);
                        } else {
                            this.frameScene(bbox);
                        }

                        window.addEventListener('keydown', (e) => {
                            switch (e.key) {
                                case 'f':
                                    this.frameScene(bbox);
                                    break;
                                case 'r':
                                    this.resetCamera(bbox);
                                    break;
                            }
                        });
                    }
                }

                entity.script.create(FrameScene);
            });
        </script>

        <!-- Info Panel -->
        <div id="infoPanel" class="hidden" onclick="this.classList.toggle('hidden')">
            <span class="heading">?</span>
            <div class="divider">Controls</div>
            <div>Left mouse button - Orbit</div>
            <div>Middle mouse button - Pan</div>
            <div>Right mouse button - Look around</div>
            <div>Mouse wheel - Zoom</div>
            <div>W,S,A,D - Fly</div>
            <div>Shift - Fly faster</div>
            <div>Ctrl - Fly slower</div>
            <div>F - Frame the scene</div>
            <div>R - Return to the origin</div>
        </div>
    </body>
</html>
`;

export { template };
