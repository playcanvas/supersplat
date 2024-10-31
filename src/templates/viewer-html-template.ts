const template = /* html */ `
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>3D Gaussian Splat Viewer</title>
        <style>
            body {
                margin: 0;
                overflow: hidden;
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

                const multiCamera = document.querySelector('pc-entity[name="camera"]').entity.script.multiCamera;

                const frameScene = (bbox) => {
                    const sceneSize = bbox.halfExtents.length();
                    multiCamera.sceneSize = sceneSize * 0.2;
                    multiCamera.focus(bbox.center, new Vec3(2, 1, 2).normalize().mulScalar(multiCamera.sceneSize * 3).add(bbox.center));
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
    </body>
</html>
`;

export { template };
