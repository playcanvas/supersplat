const template = /* html */ `
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
                    "playcanvas": "https://esm.run/playcanvas@2.2.1",
                    "multi-camera": "https://cdn.jsdelivr.net/npm/playcanvas@2.2.1/scripts/camera/multi-camera.js"
                }
            }
        </script>
        <script type="module" src="https://cdn.jsdelivr.net/npm/@playcanvas/web-components@0.1.3/dist/pwc.mjs"></script>
    </head>
    <body>
        <pc-app>
            <script type="module">
                import { Application, BoundingBox, registerScript, Script, Vec3 } from 'playcanvas';
                import { MultiCamera } from 'multi-camera';

                const app = await Application.getApplication();
                registerScript(MultiCamera, 'multiCamera');

                await new Promise(resolve => setTimeout(resolve));

                const entity = document.querySelector('pc-entity[name="camera"]').entity;
                const multiCamera = entity.script.multiCamera;

                const frameScene = (bbox) => {
                    const sceneSize = bbox.halfExtents.length();
                    const distance = sceneSize / Math.sin(entity.camera.fov / 180 * Math.PI * 0.5);
                    multiCamera.sceneSize = sceneSize;
                    multiCamera.focus(bbox.center, new Vec3(2, 1, 2).normalize().mulScalar(distance).add(bbox.center));
                };

                const resetCamera = (bbox) => {
                    const sceneSize = bbox.halfExtents.length();
                    multiCamera.sceneSize = sceneSize * 0.2;
                    multiCamera.focus(Vec3.ZERO, new Vec3(2, 1, 2));
                };

                const calcBound = () => {
                    const gsplatComponents = app.root.findComponents('gsplat');
                    return gsplatComponents?.[0]?.instance?.meshInstance?.aabb ?? new BoundingBox();
                };

                app.assets.on('load', () => {
                    setTimeout(() => {
                        const bbox = calcBound();

                        if (bbox.halfExtents.length() > 100) {
                            resetCamera(bbox);
                        } else {
                            frameScene(bbox);
                        }

                        window.addEventListener('keydown', (e) => {
                            switch (e.key) {
                                case 'f':
                                    frameScene(bbox);
                                    break;
                                case 'r':
                                    resetCamera(bbox);
                                    break;
                            }
                        });
                    });
                });
            </script>
            <pc-asset id="ply" type="gsplat" src="data:application/ply;base64,{{plyModel}}"></pc-asset>
            <pc-scene>
                <!-- Camera -->
                <pc-entity name="camera">
                    <pc-camera clear-color="{{clearColor}}"></pc-camera>
                    <pc-scripts>
                        <pc-script name="multiCamera"></pc-script>
                    </pc-scripts>
                </pc-entity>
                <!-- Splat -->
                <pc-entity name="splat" rotation="0,0,180">
                    <pc-splat asset="ply"></pc-splat>
                </pc-entity>
            </pc-scene>
        </pc-app>

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
