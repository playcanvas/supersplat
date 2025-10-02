import { Vec3 } from 'playcanvas';

import { Events } from './events';
import { Scene } from './scene';

interface MeasurementVisualData {
    point1: Vec3 | null;
    point2: Vec3 | null;
    state: 'waiting_first' | 'waiting_second' | 'complete';
}

class MeasurementVisual {
    private events: Events;
    private scene: Scene;
    private canvas: HTMLCanvasElement;
    private overlayCanvas: HTMLCanvasElement;
    private overlayContext: CanvasRenderingContext2D;
    private currentData: MeasurementVisualData | null = null;
    private animationFrameId: number | null = null;

    constructor(events: Events, scene: Scene, canvas: HTMLCanvasElement) {
        this.events = events;
        this.scene = scene;
        this.canvas = canvas;

        this.createOverlayCanvas();
        this.bindEvents();
    }

    private createOverlayCanvas() {
        // Create overlay canvas for drawing measurement visuals
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.id = 'measurement-overlay';
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.top = '0';
        this.overlayCanvas.style.left = '0';
        this.overlayCanvas.style.pointerEvents = 'none'; // Allow clicks to pass through
        this.overlayCanvas.style.zIndex = '999'; // Above canvas but below UI
        
        // Set canvas size to match main canvas
        this.updateCanvasSize();
        
        // Get 2D context
        this.overlayContext = this.overlayCanvas.getContext('2d')!;
        
        // Add to canvas container
        const canvasContainer = this.canvas.parentElement;
        if (canvasContainer) {
            canvasContainer.appendChild(this.overlayCanvas);
        }
        
        // Listen for canvas resize
        window.addEventListener('resize', () => {
            this.updateCanvasSize();
        });
    }

    private updateCanvasSize() {
        const rect = this.canvas.getBoundingClientRect();
        this.overlayCanvas.width = rect.width;
        this.overlayCanvas.height = rect.height;
        this.overlayCanvas.style.width = `${rect.width}px`;
        this.overlayCanvas.style.height = `${rect.height}px`;
    }

    private bindEvents() {
        // Listen for measurement visual updates
        this.events.on('measurement.visual.update', (data: MeasurementVisualData) => {
            this.updateVisual(data);
        });

        // Listen for measurement visual clear
        this.events.on('measurement.visual.clear', () => {
            this.clearVisual();
        });
    }

    private updateVisual(data: MeasurementVisualData) {
        console.log('🎨 Visual update received:', {
            point1: data.point1,
            point2: data.point2,
            state: data.state
        });
        this.currentData = data;
        this.startAnimation();
    }

    private clearVisual() {
        this.currentData = null;
        this.stopAnimation();
        this.clearCanvas();
    }

    private startAnimation() {
        if (this.animationFrameId !== null) {
            console.log('⚠️ Animation already running');
            return; // Already animating
        }

        console.log('🎨 Starting visual animation...');
        
        const animate = () => {
            if (this.currentData) {
                this.render();
                this.animationFrameId = requestAnimationFrame(animate);
            } else {
                console.log('🚫 Stopping animation - no data');
                this.animationFrameId = null;
            }
        };

        this.animationFrameId = requestAnimationFrame(animate);
        console.log('✅ Animation started');
    }

    private stopAnimation() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    private render() {
        if (!this.currentData) {
            console.log('🚫 No current data to render');
            return;
        }

        console.log('🎨 Rendering measurement visuals...', {
            point1: this.currentData.point1,
            point2: this.currentData.point2,
            state: this.currentData.state
        });

        // Clear canvas
        this.clearCanvas();

        // Update canvas size if needed
        this.updateCanvasSize();

        const ctx = this.overlayContext;
        const camera = this.scene.camera;

        // Convert 3D points to screen coordinates
        console.log('📏 Converting points to screen coordinates...');
        const screenPoint1 = this.worldToScreen(this.currentData.point1);
        const screenPoint2 = this.worldToScreen(this.currentData.point2);
        
        console.log('📍 Screen points:', { screenPoint1, screenPoint2 });

        // Draw point 1 if it exists (GREEN for start point)
        if (screenPoint1) {
            console.log(`🟢 Drawing point 1 (START - GREEN) at: ${screenPoint1.x.toFixed(1)}, ${screenPoint1.y.toFixed(1)}`);
            this.drawPoint(ctx, screenPoint1.x, screenPoint1.y, '#00ff00', 6); // Green dot, 6px diameter
        } else {
            console.log('❌ No screen point 1 to draw');
        }

        // Draw point 2 if it exists (RED for end point)
        if (screenPoint2) {
            console.log(`🔴 Drawing point 2 (END - RED) at: ${screenPoint2.x.toFixed(1)}, ${screenPoint2.y.toFixed(1)}`);
            this.drawPoint(ctx, screenPoint2.x, screenPoint2.y, '#ff0000', 6); // Red dot, 6px diameter
        } else {
            console.log('❌ No screen point 2 to draw');
        }

        // Draw line between points if both exist
        if (screenPoint1 && screenPoint2) {
            console.log(`➖ Drawing line from ${screenPoint1.x.toFixed(1)},${screenPoint1.y.toFixed(1)} to ${screenPoint2.x.toFixed(1)},${screenPoint2.y.toFixed(1)}`);
            this.drawLine(ctx, screenPoint1.x, screenPoint1.y, screenPoint2.x, screenPoint2.y, '#ffffff', 2); // White line, 2px width
        } else {
            console.log('❌ Cannot draw line - missing screen points');
        }
    }

    private worldToScreen(worldPoint: Vec3 | null): { x: number, y: number } | null {
        if (!worldPoint) return null;

        try {
            const camera = this.scene.camera;
            const screenVec = new Vec3();
            
            console.log(`🌍 Converting world point to screen: ${worldPoint.x.toFixed(3)}, ${worldPoint.y.toFixed(3)}, ${worldPoint.z.toFixed(3)}`);
            
            camera.worldToScreen(worldPoint, screenVec);
            
            console.log(`📺 Screen coordinates (pixels): ${screenVec.x.toFixed(3)}, ${screenVec.y.toFixed(3)}`);
            
            // The worldToScreen method already returns pixel coordinates, not normalized coordinates
            const canvasRect = this.overlayCanvas.getBoundingClientRect();
            const x = screenVec.x;
            const y = screenVec.y;
            
            console.log(`🎯 Final screen coordinates: ${x.toFixed(1)}, ${y.toFixed(1)} (canvas: ${canvasRect.width}x${canvasRect.height})`);
            
            // Check if point is within screen bounds (with some tolerance)
            if (x >= -50 && x <= canvasRect.width + 50 && y >= -50 && y <= canvasRect.height + 50) {
                return { x, y };
            } else {
                console.log(`⚠️ Point outside screen bounds: ${x.toFixed(1)}, ${y.toFixed(1)}`);
                return { x, y }; // Still return it, let the drawing handle clipping
            }
            
        } catch (error) {
            console.warn('❌ Error converting world to screen coordinates:', error);
            return null;
        }
    }

    private drawPoint(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, diameter: number) {
        ctx.save();
        
        // Draw outer ring for better visibility
        ctx.beginPath();
        ctx.arc(x, y, diameter / 2 + 1, 0, 2 * Math.PI);
        ctx.fillStyle = '#000000';
        ctx.fill();
        
        // Draw main dot
        ctx.beginPath();
        ctx.arc(x, y, diameter / 2, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        
        // Draw inner highlight
        ctx.beginPath();
        ctx.arc(x, y, diameter / 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.8;
        ctx.fill();
        
        ctx.restore();
    }

    private drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
        ctx.save();
        
        // Draw outer line for better visibility
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = width + 2;
        ctx.stroke();
        
        // Draw main line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
        
        ctx.restore();
    }

    private clearCanvas() {
        const ctx = this.overlayContext;
        ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }

    public destroy() {
        this.stopAnimation();
        this.clearVisual();
        
        // Remove overlay canvas
        if (this.overlayCanvas.parentElement) {
            this.overlayCanvas.parentElement.removeChild(this.overlayCanvas);
        }
        
        // Remove event listeners
        window.removeEventListener('resize', () => {
            this.updateCanvasSize();
        });
    }
}

export { MeasurementVisual, MeasurementVisualData };
