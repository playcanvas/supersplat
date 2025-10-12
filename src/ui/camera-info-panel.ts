import { Container, Label, Panel } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { Events } from '../events';

class CameraInfoPanel extends Panel {
    private events: Events;
    private cameraPositionLabel: Label;
    private cameraTargetLabel: Label;
    private visible: boolean = false;
    private updateInterval: number | null = null;
    private contextMenu: HTMLDivElement | null = null;

    constructor(events: Events) {
        super({
            id: 'camera-info-panel',
            class: 'camera-info-panel',
            headerText: 'CAMERA INFO',
            collapsible: false,
            collapsed: false,
            removable: false
        });

        this.events = events;
        this.createUI();
        this.bindEvents();
        this.setupContextMenu();

        // Start visible and immediately responsive
        this.visible = true;
        this.dom.style.display = 'block';

        // Start regular updates immediately (60 FPS for smooth updates)
        this.updateInterval = window.setInterval(() => {
            this.updateFromCurrentCamera();
        }, 1000 / 60);

        // Initial update
        this.updateFromCurrentCamera();

        console.log('Camera info panel started visible and responsive');
    }

    private createUI() {
        // Camera Position container
        const cameraPositionContainer = new Container({
            class: 'camera-info-row'
        });

        const cameraPositionLabelText = new Label({
            text: 'Camera:',
            class: 'camera-info-label'
        });

        this.cameraPositionLabel = new Label({
            text: '0.000, 0.000, 0.000',
            class: 'camera-info-value'
        });

        cameraPositionContainer.append(cameraPositionLabelText);
        cameraPositionContainer.append(this.cameraPositionLabel);

        // Camera Target container
        const cameraTargetContainer = new Container({
            class: 'camera-info-row'
        });

        const cameraTargetLabelText = new Label({
            text: 'Target:',
            class: 'camera-info-label'
        });

        this.cameraTargetLabel = new Label({
            text: '0.000, 0.000, 0.000',
            class: 'camera-info-value'
        });

        cameraTargetContainer.append(cameraTargetLabelText);
        cameraTargetContainer.append(this.cameraTargetLabel);

        // Add containers to panel
        this.append(cameraPositionContainer);
        this.append(cameraTargetContainer);
    }

    private setupContextMenu() {
        // Ensure DOM is ready before setting up context menu
        const setupWhenReady = () => {
            if (!this.dom) {
                console.log('DOM not ready yet, retrying in 100ms');
                setTimeout(setupWhenReady, 100);
                return;
            }

            // Create context menu
            this.contextMenu = document.createElement('div');
            this.contextMenu.className = 'camera-info-context-menu';
            this.contextMenu.style.cssText = `
                position: fixed;
                background: #2a2a2a;
                border: 1px solid #555;
                border-radius: 4px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
                padding: 8px 0;
                z-index: 10000;
                display: none;
                min-width: 180px;
                pointer-events: auto;
                user-select: none;
            `;

            // Create copy menu item
            const copyItem = this.createMenuItem('Copy Camera Data', () => {
                console.log('Copy menu item clicked');
                this.copyCameraData();
                this.hideContextMenu();
            });

            // Create save to JSON menu item
            const saveItem = this.createMenuItem('Save to JSON File', () => {
                console.log('Save to JSON menu item clicked');
                this.saveCameraDataToFile();
                this.hideContextMenu();
            });

            this.contextMenu.appendChild(copyItem);
            this.contextMenu.appendChild(saveItem);

            // Remove border from last item
            saveItem.style.borderBottom = 'none';
            document.body.appendChild(this.contextMenu);

            // Add right-click event listener to panel with more specific targeting
            console.log('Setting up context menu for camera info panel');
            // Debug info: console.log('Panel classes:', this.dom.className);
            // Debug info: console.log('Panel style display:', window.getComputedStyle(this.dom).display);

            // Add event listener to both the main panel and its content
            const addContextMenuToElement = (element: HTMLElement, name: string) => {
                element.addEventListener('contextmenu', (e) => {
                    console.log(`Context menu event triggered on ${name}`, e.target);
                    e.preventDefault();
                    e.stopPropagation();
                    this.showContextMenu(e.clientX, e.clientY);
                });

                // Also add a test click listener to verify events are working
                element.addEventListener('click', (e) => {
                    // Debug: console.log(`Click event on ${name}`, e.target);
                });
            };

            addContextMenuToElement(this.dom, 'main panel');

            // Also add to content areas
            const contentElements = this.dom.querySelectorAll('.pcui-panel-content, .camera-info-row');
            contentElements.forEach((el, idx) => {
                addContextMenuToElement(el as HTMLElement, `content element ${idx}`);
            });

            // Hide context menu when clicking elsewhere
            document.addEventListener('click', (e) => {
                if (this.contextMenu && !this.contextMenu.contains(e.target as Node)) {
                    this.hideContextMenu();
                }
            });

            // Block camera controls when mouse is over the panel
            this.setupMouseEventBlocking();

            console.log('Context menu setup complete');
        };

        setupWhenReady();
    }

    private showContextMenu(x: number, y: number) {
        console.log('showContextMenu called at position:', x, y);
        if (!this.contextMenu) {
            console.error('Context menu not found!');
            return;
        }

        console.log('Showing context menu:', this.contextMenu);
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.style.display = 'block';

        // Adjust position if menu goes outside viewport
        const rect = this.contextMenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (rect.right > viewportWidth) {
            this.contextMenu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > viewportHeight) {
            this.contextMenu.style.top = `${y - rect.height}px`;
        }
    }

    private hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'none';
        }
    }

    private getCameraDataObject() {
        // Get current camera data
        const pose = this.events.invoke('camera.getPose');
        const fov = this.events.invoke('camera.fov') || 65;
        const bgColor = this.events.invoke('bgClr');

        if (!pose || !pose.position || !pose.target) {
            throw new Error('Could not get camera pose data');
        }

        // Format data according to specification with background color
        return {
            background: {
                color: [
                    parseFloat((bgColor?.r || 0).toFixed(3)),
                    parseFloat((bgColor?.g || 0).toFixed(3)),
                    parseFloat((bgColor?.b || 0).toFixed(3)),
                    parseFloat((bgColor?.a || 1).toFixed(3))
                ]
            },
            camera: {
                fov: parseFloat(fov.toFixed(1)),
                position: [
                    parseFloat(pose.position.x.toFixed(3)),
                    parseFloat(pose.position.y.toFixed(3)),
                    parseFloat(pose.position.z.toFixed(3))
                ],
                target: [
                    parseFloat(pose.target.x.toFixed(3)),
                    parseFloat(pose.target.y.toFixed(3)),
                    parseFloat(pose.target.z.toFixed(3))
                ],
                startAnim: 'orbit'
            }
        };
    }

    private async copyCameraData() {
        try {
            const cameraData = this.getCameraDataObject();
            const jsonString = JSON.stringify(cameraData, null, 2);

            // Copy to clipboard using modern API if available, fallback to legacy method
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(jsonString);
                console.log('Camera data copied to clipboard using modern API');
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = jsonString;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                console.log('Camera data copied to clipboard using fallback method');
            }

            // Show brief confirmation in console and potentially UI feedback
            console.log('Camera data copied:', jsonString);
            // Optional: Show a brief visual confirmation
            this.showCopyConfirmation();

        } catch (error) {
            console.error('Failed to copy camera data:', error);
            // Could show error popup here if needed
        }
    }

    private showCopyConfirmation() {
        // Create temporary confirmation message
        const confirmation = document.createElement('div');
        confirmation.textContent = 'Camera data copied!';
        confirmation.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            z-index: 10001;
            font-size: 14px;
            font-weight: 500;
            animation: fadeInOut 2s ease-in-out;
        `;

        // Add fadeInOut animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateY(-10px); }
                20% { opacity: 1; transform: translateY(0); }
                80% { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(-10px); }
            }
        `;

        if (!document.querySelector('style[data-camera-copy-animation]')) {
            style.setAttribute('data-camera-copy-animation', 'true');
            document.head.appendChild(style);
        }

        document.body.appendChild(confirmation);

        // Remove after animation
        setTimeout(() => {
            if (confirmation.parentNode) {
                confirmation.parentNode.removeChild(confirmation);
            }
        }, 2000);
    }

    private async saveCameraDataToFile() {
        try {
            const cameraData = this.getCameraDataObject();
            const jsonString = JSON.stringify(cameraData, null, 2);

            // Check if File System Access API is available
            if ('showSaveFilePicker' in window) {
                // Modern browsers with File System Access API
                try {
                    const fileHandle = await (window as any).showSaveFilePicker({
                        types: [{
                            description: 'JSON files',
                            accept: {
                                'application/json': ['.json']
                            }
                        }],
                        suggestedName: `camera-data-${new Date().toISOString().split('T')[0]}.json`
                    });

                    const writable = await fileHandle.createWritable();
                    await writable.write(jsonString);
                    await writable.close();

                    console.log('Camera data saved to file successfully');
                    this.showSaveConfirmation();
                } catch (error: any) {
                    if (error.name !== 'AbortError') {
                        throw error;
                    }
                    // User cancelled the save dialog
                    console.log('Save cancelled by user');
                }
            } else {
                // Fallback for browsers without File System Access API
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `camera-data-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                console.log('Camera data downloaded as file');
                this.showSaveConfirmation();
            }

        } catch (error) {
            console.error('Failed to save camera data to file:', error);
            this.showSaveError();
        }
    }

    private showSaveConfirmation() {
        const confirmation = document.createElement('div');
        confirmation.textContent = 'Camera data saved to file!';
        confirmation.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            z-index: 10001;
            font-size: 14px;
            font-weight: 500;
            animation: fadeInOut 2s ease-in-out;
        `;

        document.body.appendChild(confirmation);

        setTimeout(() => {
            if (confirmation.parentNode) {
                confirmation.parentNode.removeChild(confirmation);
            }
        }, 2000);
    }

    private showSaveError() {
        const errorMsg = document.createElement('div');
        errorMsg.textContent = 'Failed to save camera data!';
        errorMsg.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            z-index: 10001;
            font-size: 14px;
            font-weight: 500;
            animation: fadeInOut 3s ease-in-out;
        `;

        document.body.appendChild(errorMsg);

        setTimeout(() => {
            if (errorMsg.parentNode) {
                errorMsg.parentNode.removeChild(errorMsg);
            }
        }, 3000);
    }

    private setupMouseEventBlocking() {
        // Block camera control events but allow UI events like contextmenu
        const cameraControlEvents = [
            'mousedown', 'mouseup', 'mousemove',
            'pointerdown', 'pointerup', 'pointermove',
            'wheel'
        ];

        // Block camera control events
        cameraControlEvents.forEach((eventName) => {
            this.dom.addEventListener(eventName, (e) => {
                // Stop the event from bubbling up to camera controls
                e.stopPropagation();

                // For wheel events, also prevent default to stop zoom
                if (eventName === 'wheel') {
                    e.preventDefault();
                }

                // Uncomment for debugging: console.log(`Blocked ${eventName} event from reaching camera controls`);
            }, true); // Use capture phase to catch events early
        });

        // For click and dblclick, we need to be more careful to allow UI interaction
        // but prevent camera focus/selection events
        ['click', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (e) => {
                // Only stop propagation, don't prevent default
                // This allows UI elements to work but prevents camera focus
                e.stopPropagation();

                // Uncomment for debugging: console.log(`Blocked ${eventName} from camera but allowed UI interaction`);
            }, true);
        });

        // DO NOT block contextmenu - we want right-click to work for our context menu!

        // Also add CSS to ensure the panel blocks pointer events to underlying elements
        this.dom.style.pointerEvents = 'auto';
        this.dom.style.userSelect = 'text'; // Allow text selection in the panel

        console.log('Mouse event blocking setup complete for camera info panel');
    }

    private createMenuItem(text: string, onClick: () => void): HTMLDivElement {
        const item = document.createElement('div');
        item.className = 'camera-info-context-menu-item';
        item.textContent = text;
        item.style.cssText = `
            padding: 8px 16px;
            color: white;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
            user-select: none;
            border-bottom: 1px solid #444;
        `;

        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = '#444';
        });

        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'transparent';
        });

        item.addEventListener('click', onClick);

        return item;
    }

    private bindEvents() {
        // Update camera info when camera pose changes
        this.events.on('camera.setPose', (pose: { position: Vec3, target: Vec3 }) => {
            this.updateCameraInfo(pose.position, pose.target);
        });

        // Also listen for general camera updates
        this.events.on('camera.updated', () => {
            this.updateFromCurrentCamera();
        });

        // Listen for toggle event
        this.events.on('camera.info.toggle', () => {
            this.toggle();
        });

        // Listen for show/hide events
        this.events.on('camera.info.show', () => {
            this.show();
        });

        this.events.on('camera.info.hide', () => {
            this.hide();
        });
    }

    private updateFromCurrentCamera() {
        try {
            // Get current camera pose
            if (this.events.functions.has('camera.getPose')) {
                const pose = this.events.invoke('camera.getPose');
                if (pose && pose.position && pose.target) {
                    this.updateCameraInfo(pose.position, pose.target);
                }
            }
        } catch (error) {
            console.warn('Could not get current camera pose:', error);
        }
    }

    private updateCameraInfo(position: Vec3, target: Vec3) {
        if (!this.visible) return; // Don't update if not visible to save performance

        // Format position
        const posText = `${position.x.toFixed(3)}, ${position.y.toFixed(3)}, ${position.z.toFixed(3)}`;
        this.cameraPositionLabel.text = posText;

        // Format target
        const targetText = `${target.x.toFixed(3)}, ${target.y.toFixed(3)}, ${target.z.toFixed(3)}`;
        this.cameraTargetLabel.text = targetText;
    }

    public toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    public show() {
        if (!this.visible) {
            this.visible = true;
            this.dom.style.display = 'block';

            // Update immediately when shown
            this.updateFromCurrentCamera();

            // Start regular updates if not already running
            if (!this.updateInterval) {
                this.updateInterval = window.setInterval(() => {
                    this.updateFromCurrentCamera();
                }, 1000 / 60);
            }

            // Fire event
            this.events.fire('camera.info.visible', true);
            console.log('Camera info panel shown');
        }
    }

    public hide() {
        if (this.visible) {
            this.visible = false;
            this.dom.style.display = 'none';

            // Stop regular updates
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }

            // Fire event
            this.events.fire('camera.info.visible', false);
            console.log('Camera info panel hidden');
        }
    }

    destroy() {
        // Clean up context menu
        if (this.contextMenu && this.contextMenu.parentNode) {
            this.contextMenu.parentNode.removeChild(this.contextMenu);
            this.contextMenu = null;
        }

        // Clean up update interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Call parent destroy if it exists
        if (super.destroy) {
            super.destroy();
        }
    }

    public get isVisible(): boolean {
        return this.visible;
    }
}

export { CameraInfoPanel };
