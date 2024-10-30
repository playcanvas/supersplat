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

                const camera = document.querySelector('pc-entity[name="camera"]');
                await new Promise(resolve => setTimeout(resolve));
                const multiCamera = camera.entity.script.multiCamera;

                const frameScene = () => {
                    const gsplatComponents = app.root.findComponents('gsplat');
                    const bbox = gsplatComponents?.[0]?.instance?.meshInstance?.aabb ?? new BoundingBox();

                    multiCamera.sceneSize = bbox.halfExtents.length() * 0.2;
                    multiCamera.focus(Vec3.ZERO, new Vec3(2, 1, 2));
                };

                window.addEventListener('keydown', (e) => {
                    if (e.key === 'f') {
                        frameScene();
                    }
                });

                app.assets.on('load', () => {
                    setTimeout(frameScene);
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
