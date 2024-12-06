const template = /* html */ `
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
        <title>SuperSplat Viewer</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                touch-action: none;
            }
            body {
                overflow: hidden;
                background-color: {{backgroundColor}};
            }
            .hidden {
                display: none !important;
            }
            #infoPanel {
                font-family: 'Arial', sans-serif;
                color: #2c3e50;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.3);
                z-index: 999;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            #infoPanelContent {
                background: rgba(255, 255, 255, 0.95);
                padding: 20px;
                border-radius: 8px;
                border: 1px solid #ddd;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }
            #infoPanelContent h3 {
                margin: 0 0 12px 0;
                color: #2c3e50;
            }
            .control-item {
                display: flex;
                justify-content: space-between;
                gap: 24px;
                line-height: 1.5;
            }
            .control-action {
                text-align: left;
            }
            .control-key {
                text-align: right;
                color: #666;
            }
            #loadingIndicator {
                font-family: 'Arial', sans-serif;
                color: #2c3e50;
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255, 255, 255, 0.95);
                padding: 20px;
                border-radius: 8px;
                border: 1px solid #ddd;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 1000;
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
            <pc-asset id="ply" type="gsplat" src="data:application/ply;base64,{{plyModel}}"></pc-asset>
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
                <!-- Light (for XR controllers) -->
                <pc-entity name="light" rotation="35 45 0">
                    <pc-light color="white" intensity="1.5"></pc-light>
                </pc-entity>
                <!-- Splat -->
                <pc-entity name="splat" rotation="0 0 180">
                    <pc-splat asset="ply"></pc-splat>
                </pc-entity>
            </pc-scene>
        </pc-app>

        <!-- Loading Indicator -->
        <div id="loadingIndicator">Loading...</div>

        <!-- Info Panel -->
        <div id="infoPanel" class="hidden" onclick="document.getElementById('infoPanel').classList.add('hidden')">
            <div id="infoPanelContent" onclick="event.stopPropagation()">
                <h3>Controls</h3>
                <div class="control-item">
                    <span class="control-action">Orbit</span>
                    <span class="control-key">Left mouse button</span>
                </div>
                <div class="control-item">
                    <span class="control-action">Pan</span>
                    <span class="control-key">Middle mouse button</span>
                </div>
                <div class="control-item">
                    <span class="control-action">Look around</span>
                    <span class="control-key">Right mouse button</span>
                </div>
                <div class="control-item">
                    <span class="control-action">Zoom</span>
                    <span class="control-key">Mouse wheel</span>
                </div>
                <div class="control-item">
                    <span class="control-action">Fly</span>
                    <span class="control-key">W,S,A,D</span>
                </div>
                <div class="control-item">
                    <span class="control-action">Fly faster</span>
                    <span class="control-key">Shift</span>
                </div>
                <div class="control-item">
                    <span class="control-action">Fly slower</span>
                    <span class="control-key">Ctrl</span>
                </div>
                <div class="control-item">
                    <span class="control-action">Frame the scene</span>
                    <span class="control-key">F</span>
                </div>
                <div class="control-item">
                    <span class="control-action">Return to origin</span>
                    <span class="control-key">R</span>
                </div>
            </div>
        </div>

        <script type="module">
            import { BoundingBox, Script, Vec3 } from 'playcanvas';

            document.addEventListener('DOMContentLoaded', async () => {
                const appElement = await document.querySelector('pc-app').ready();
                const app = await appElement.app;

                const entityElement = await document.querySelector('pc-entity[name="camera"]').ready();
                const entity = entityElement.entity;

                const resetPosition = {{resetPosition}};
                const resetTarget = {{resetTarget}};

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
                        this.entity.script.cameraControls.focus(resetTarget ?? Vec3.ZERO, resetPosition ?? new Vec3(2, 1, 2));
                    }

                    calcBound() {
                        const gsplatComponents = this.app.root.findComponents('gsplat');
                        return gsplatComponents?.[0]?.instance?.meshInstance?.aabb ?? new BoundingBox();
                    }

                    initCamara() {
                        document.getElementById('loadingIndicator').classList.add('hidden');

                        const bbox = this.calcBound();

                        if (bbox.halfExtents.length() > 100 || resetPosition || resetTarget) {
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

                    postInitialize() {
                        const assets = this.app.assets.filter(asset => asset.type === 'gsplat');
                        if (assets.length > 0) {
                            const asset = assets[0];
                            if (asset.loaded) {
                                this.initCamara();
                            } else {
                                asset.on('load', () => {
                                    this.initCamara();
                                });
                            }
                        }
                    }
                }

                entity.script.create(FrameScene);

                // Create container for buttons
                const container = document.createElement('div');
                Object.assign(container.style, {
                    position: 'absolute',
                    bottom: 'max(16px, env(safe-area-inset-bottom))',
                    right: 'max(16px, env(safe-area-inset-right))',
                    display: 'flex',
                    gap: '8px'
                });

                function createButton({ icon, title, onClick }) {
                    const button = document.createElement('button');
                    button.innerHTML = icon;
                    button.title = title;

                    Object.assign(button.style, {
                        display: 'flex',
                        position: 'relative',
                        width: '40px',
                        height: '40px',
                        background: 'rgba(255, 255, 255, 0.9)',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0',
                        margin: '0',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        transition: 'background-color 0.2s',
                        color: '#2c3e50'
                    });

                    const svg = button.querySelector('svg');
                    if (svg) {
                        svg.style.display = 'block';
                        svg.style.margin = 'auto';
                    }

                    button.onmouseenter = () => {
                        button.style.background = 'rgba(255, 255, 255, 1)';
                    };

                    button.onmouseleave = () => {
                        button.style.background = 'rgba(255, 255, 255, 0.9)';
                    };

                    if (onClick) button.onclick = onClick;

                    return button;
                }

                // Add VR button if available
                if (app.xr.isAvailable('immersive-vr')) {
                    const vrButton = createButton({
                        icon: \`<svg width="32" height="32" viewBox="0 0 48 48">
                            <path d="M30,34 L26,30 L22,30 L18,34 L14,34 C11.7908610,34 10,32.2091390 10,30 L10,18 C10,15.7908610 11.7908610,14 14,14 L34,14 C36.2091390,14 38,15.7908610 38,18 L38,30 C38,32.2091390 36.2091390,34 34,34 L30,34 Z M44,28 C44,29.1045694 43.1045694,30 42,30 C40.8954306,30 40,29.1045694 40,28 L40,20 C40,18.8954305 40.8954306,18 42,18 C43.1045694,18 44,18.8954305 44,20 L44,28 Z M8,28 C8,29.1045694 7.10456940,30 6,30 C4.89543060,30 4,29.1045694 4,28 L4,20 C4,18.8954305 4.89543060,18 6,18 C7.10456940,18 8,18.8954305 8,20 L8,28 Z" fill="currentColor">
                        </svg>\`,
                        title: 'Enter VR',
                        onClick: () => app.xr.start(app.root.findComponent('camera'), 'immersive-vr', 'local-floor')
                    });
                    container.appendChild(vrButton);
    
                    window.addEventListener('keydown', (event) => {
                        if (event.key === 'Escape') {
                            app.xr.end();
                        }
                    });
                }

                // Add fullscreen button if supported
                if (document.documentElement.requestFullscreen && document.exitFullscreen) {
                    const enterFullscreenIcon = \`<svg width="32" height="32" viewBox="0 0 24 24">
                        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" fill="currentColor"/>
                    </svg>\`;
                    const exitFullscreenIcon = \`<svg width="32" height="32" viewBox="0 0 24 24">
                        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" fill="currentColor"/>
                    </svg>\`;

                    const fullscreenButton = createButton({
                        icon: enterFullscreenIcon,
                        title: 'Toggle Fullscreen',
                        onClick: () => {
                            if (!document.fullscreenElement) {
                                document.documentElement.requestFullscreen();
                            } else {
                                document.exitFullscreen();
                            }
                        }
                    });

                    // Update icon when fullscreen state changes
                    document.addEventListener('fullscreenchange', () => {
                        fullscreenButton.innerHTML = document.fullscreenElement ? exitFullscreenIcon : enterFullscreenIcon;
                        fullscreenButton.title = document.fullscreenElement ? 'Exit Fullscreen' : 'Enter Fullscreen';
                    });

                    container.appendChild(fullscreenButton);
                }

                // Add info button
                const infoButton = createButton({
                    icon: \`<svg width="32" height="32" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/>
                    </svg>\`,
                    title: 'Show Controls',
                    onClick: () => {
                        const infoPanel = document.getElementById('infoPanel');
                        infoPanel.classList.toggle('hidden');
                    }
                });

                // Add escape key handler for info panel
                window.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        document.getElementById('infoPanel').classList.add('hidden');
                    }
                });

                container.appendChild(infoButton);

                document.body.appendChild(container);
            });
        </script>
    </body>
</html>
`;

export { template };
