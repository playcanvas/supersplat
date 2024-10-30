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
                    "playcanvas": "https://esm.run/playcanvas@2.2.0"
                }
            }
        </script>
        <script type="module" src="https://cdn.jsdelivr.net/npm/@playcanvas/web-components@0.1.3/dist/pwc.mjs"></script>
    </head>
    <body>
        <pc-app>
            <script type="module">
                import { registerScript } from 'playcanvas';
                import { OrbitCamera, OrbitCameraInputMouse } from "data:application/javascript;base64,{{cameraScriptSource}}";

                const app = document.querySelector('pc-app');
                await app.getApplication();
                registerScript(OrbitCamera, 'orbitCamera');
                registerScript(OrbitCameraInputMouse, 'orbitCameraInputMouse');
            </script>
            <pc-asset id="ply" type="gsplat" src="data:application/ply;base64,{{plyModel}}"></pc-asset>
            <pc-scene>
                <!-- Camera -->
                <pc-entity name="camera">
                    <pc-camera clear-color="{{clearColor}}"></pc-camera>
                    <pc-scripts>
                        <pc-script name="orbitCamera" attributes='{"inertiaFactor": 0.1}'></pc-script>
                        <pc-script name="orbitCameraInputMouse"></pc-script>
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
