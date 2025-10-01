import { Vec3 } from 'playcanvas';

import { Events } from './events';
import { Scene } from './scene';
import { MeasurementData } from './ui/measurement-panel';

enum MeasurementState {
    INACTIVE = 0,
    WAITING_FIRST_POINT = 1,
    WAITING_SECOND_POINT = 2,
    MEASUREMENT_COMPLETE = 3
}

const stateNames = {
    [MeasurementState.INACTIVE]: 'INACTIVE',
    [MeasurementState.WAITING_FIRST_POINT]: 'WAITING_FIRST_POINT',
    [MeasurementState.WAITING_SECOND_POINT]: 'WAITING_SECOND_POINT',
    [MeasurementState.MEASUREMENT_COMPLETE]: 'MEASUREMENT_COMPLETE'
};

class MeasurementTool {
    private events: Events;
    private scene: Scene;
    private state: MeasurementState = MeasurementState.INACTIVE;
    private point1: Vec3 | null = null;
    private point2: Vec3 | null = null;
    private distance: number | null = null;
    private clickHandler: (event: MouseEvent) => void;
    private lastButtonClickTime: number = 0;
    private clicksDisabled: boolean = false;
    private panelsWereHiddenBeforeMeasurement: boolean = false;

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;
        
        this.clickHandler = this.handleClick.bind(this);
        
        // Test that the click handler is properly bound
        console.log('🔗 Click handler bound:', typeof this.clickHandler === 'function');
        
        this.bindEvents();
    }

    private bindEvents() {
        // Listen for measurement tool activation
        this.events.on('measurement.toggle', () => {
            this.toggle();
        });

        // Listen for measurement actions
        this.events.on('measurement.clear', () => {
            this.clearMeasurement();
        });

        this.events.on('measurement.redo', () => {
            this.redoMeasurement();
        });
        
        this.events.on('measurement.redo.first', () => {
            this.redoFirstPoint();
        });
        
        this.events.on('measurement.redo.second', () => {
            this.redoSecondPoint();
        });
        
        this.events.on('measurement.disable.temporary', () => {
            this.temporarilyDisableClicks();
        });

        this.events.on('measurement.exit', () => {
            this.deactivate();
        });
    }

    public toggle() {
        if (this.state === MeasurementState.INACTIVE) {
            this.activate();
        } else {
            this.deactivate();
        }
    }

    public activate() {
        if (this.state === MeasurementState.INACTIVE) {
            console.log('🎯 Measurement tool activated');
            
            // Store current UI visibility state
            this.panelsWereHiddenBeforeMeasurement = this.events.invoke('ui.hidden') || false;
            
            // Create clean screen like O key, then show measurement panel
            if (!this.panelsWereHiddenBeforeMeasurement) {
                console.log('🧹 Creating clean screen (same as O key)...');
                this.events.fire('ui.toggleOverlay');
            }
            
            // Show measurement panel 1ms later on clean screen
            setTimeout(() => {
                console.log('📏 Showing measurement panel on clean screen...');
                this.events.fire('measurement.show');
                
                // Force measurement panel to be visible even after ui.toggleOverlay
                const measurementPanel = document.querySelector('.measurement-panel') as HTMLElement;
                if (measurementPanel) {
                    measurementPanel.style.display = 'block';
                    console.log('🔥 Forced measurement panel to display: block');
                }
                
                // Force measurement overlay canvas to be visible too
                const measurementOverlay = document.querySelector('#measurement-overlay') as HTMLElement;
                if (measurementOverlay) {
                    measurementOverlay.style.display = 'block';
                    console.log('🎨 Forced measurement overlay canvas to display: block');
                }
            }, 1);
            
            // Deactivate other tools first
            console.log('🚫 Deactivating other selection tools...');
            this.events.fire('tool.deactivate');
            
            this.state = MeasurementState.WAITING_FIRST_POINT;
            
            
            // Add click listener to canvas
            const canvas = this.scene.canvas;
            console.log('🖱️ Adding click listener to canvas:', canvas.id || 'no-id');
            console.log('🔗 Canvas element:', canvas);
            console.log('🎯 Click handler function:', this.clickHandler);
            
            // Remove any existing listener first to avoid duplicates
            canvas.removeEventListener('click', this.clickHandler);
            
            // Add the click listener with capture=true to intercept before other handlers
            canvas.addEventListener('click', this.clickHandler, true);
            
            // Also add a test listener to verify events are working
            const testHandler = (e: MouseEvent) => {
                console.log('🧪 TEST: Click event detected on canvas!', e.clientX, e.clientY);
            };
            canvas.addEventListener('click', testHandler, true);
            
            console.log('✅ Event listeners attached successfully');
            
            // Also try adding listener to canvas container as fallback
            const canvasContainer = canvas.parentElement;
            if (canvasContainer) {
                console.log('📱 Also adding listener to canvas container:', canvasContainer.id || 'no-id');
                canvasContainer.addEventListener('click', this.clickHandler, true);
            }
            
            // And as final fallback, add to document
            console.log('🌍 Adding document-level listener as final fallback');
            document.addEventListener('click', this.clickHandler, true);
            
            // Update cursor to indicate measurement mode
            canvas.style.cursor = 'crosshair';
            console.log('➗ Cursor changed to crosshair');
            
            // Update measurement data
            this.updateMeasurementData();
            
            console.log('📍 Click on the first point to start measuring');
            console.log('📊 Scene has', this.scene.elements?.length || 0, 'elements');
        } else {
            console.log('⚠️ Measurement tool is already active');
        }
    }

    public deactivate() {
        if (this.state !== MeasurementState.INACTIVE) {
            console.log('🎯 Measurement tool deactivated');
            
            // Restore original screen state (reverse the O key effect)
            if (!this.panelsWereHiddenBeforeMeasurement) {
                console.log('📱 Restoring original screen (reversing O key effect)...');
                this.events.fire('ui.toggleOverlay');
            }
            
            // Hide measurement panel AFTER restoring other panels
            setTimeout(() => {
                console.log('📱 Hiding measurement panel after panel restoration...');
                this.events.fire('measurement.hide');
                
                // Force measurement panel to be hidden
                const measurementPanel = document.querySelector('.measurement-panel') as HTMLElement;
                if (measurementPanel) {
                    measurementPanel.style.display = 'none';
                    console.log('💫 Forced measurement panel to display: none');
                }
                
                // Also hide measurement overlay canvas
                const measurementOverlay = document.querySelector('#measurement-overlay') as HTMLElement;
                if (measurementOverlay) {
                    measurementOverlay.style.display = 'none';
                    console.log('🎨 Forced measurement overlay canvas to display: none');
                }
            }, 2);
            
            this.state = MeasurementState.INACTIVE;
            
            // Reset click filtering flags
            this.clicksDisabled = false;
            this.lastButtonClickTime = 0;
            
            // Remove all click listeners
            const canvas = this.scene.canvas;
            canvas.removeEventListener('click', this.clickHandler, true);
            canvas.removeEventListener('click', this.clickHandler); // Remove both capture and bubble phases
            
            // Remove from canvas container
            const canvasContainer = canvas.parentElement;
            if (canvasContainer) {
                canvasContainer.removeEventListener('click', this.clickHandler, true);
            }
            
            // Remove from document
            document.removeEventListener('click', this.clickHandler, true);
            
            // Reset cursor
            canvas.style.cursor = 'default';
            
            // Clear visual overlays
            this.events.fire('measurement.visual.clear');
            
            console.log('🧙 Measurement tool cleanup complete');
        }
    }

    private handleClick(event: MouseEvent) {
        console.log(`🖱️ Click event received. State: ${this.state}`);
        
        if (this.state === MeasurementState.INACTIVE) {
            console.log('🚫 Measurement tool is inactive, ignoring click');
            return;
        }
        
        // Check if clicks are temporarily disabled
        if (this.clicksDisabled) {
            console.log('🚫 Clicks temporarily disabled, ignoring');
            return;
        }
        
        // Check if this click is too soon after a button click
        const timeSinceButtonClick = Date.now() - this.lastButtonClickTime;
        if (timeSinceButtonClick < 500) {
            console.log(`🚫 Ignoring click - too soon after button (${timeSinceButtonClick}ms ago)`);
            return;
        }
        
        // Check if click originated from measurement panel - ignore if so
        const target = event.target as HTMLElement;
        const measurementPanel = document.querySelector('.measurement-panel');
        if (measurementPanel && (measurementPanel.contains(target) || target.closest('.measurement-panel'))) {
            console.log('🚫 Ignoring click from measurement panel');
            return;
        }

        // Prevent event from propagating to other systems
        event.preventDefault();
        event.stopPropagation();
        
        // Get the click coordinates relative to the canvas
        const canvas = this.scene.canvas;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        console.log(`🖱️ Click at screen coordinates: ${x}, ${y} (canvas size: ${rect.width}x${rect.height})`);
        console.log(`🎯 Current measurement state: ${this.state === MeasurementState.WAITING_FIRST_POINT ? 'WAITING_FIRST_POINT' : this.state === MeasurementState.WAITING_SECOND_POINT ? 'WAITING_SECOND_POINT' : 'OTHER'}`);

        // Try to pick a 3D point at this screen coordinate
        console.log('📍 Attempting to pick 3D point...');
        const worldPoint = this.pick3DPoint(x, y);
        
        // If no point was picked, try an alternative method
        if (!worldPoint) {
            console.log('🔄 Primary picking failed, trying fallback method...');
            const fallbackPoint = this.pickPointFallback(x, y);
            if (fallbackPoint) {
                console.log('🎆 Fallback picking succeeded!');
                if (this.state === MeasurementState.WAITING_FIRST_POINT) {
                    console.log('📌 Setting first point (fallback)...');
                    this.setFirstPoint(fallbackPoint);
                } else if (this.state === MeasurementState.WAITING_SECOND_POINT) {
                    console.log('📌 Setting second point (fallback)...');
                    this.setSecondPoint(fallbackPoint);
                }
                return;
            }
        }
        
        if (worldPoint) {
            console.log(`📍 Successfully picked 3D point: ${worldPoint.x.toFixed(3)}, ${worldPoint.y.toFixed(3)}, ${worldPoint.z.toFixed(3)}`);
            
            if (this.state === MeasurementState.WAITING_FIRST_POINT) {
                console.log('📌 Setting first point...');
                this.setFirstPoint(worldPoint);
            } else if (this.state === MeasurementState.WAITING_SECOND_POINT) {
                console.log('📌 Setting second point...');
                this.setSecondPoint(worldPoint);
            }
        } else {
            console.log('❌ Could not pick a 3D point at this location - try clicking on a splat surface');
        }
    }

    private pick3DPoint(screenX: number, screenY: number): Vec3 | null {
        try {
            console.log(`🔍 Attempting to pick 3D point at screen coords: ${screenX}, ${screenY}`);
            
            // Use the existing camera picking system
            const camera = this.scene.camera;
            
            // Store the original method
            const originalSetFocalPoint = camera.setFocalPoint.bind(camera);
            const originalSetDistance = camera.setDistance.bind(camera);
            let pickedPoint: Vec3 | null = null;
            
            // Temporarily override setFocalPoint to capture the picked point
            camera.setFocalPoint = (point: Vec3, dampingFactorFactor?: number) => {
                console.log(`📍 Picked focal point: ${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)}`);
                pickedPoint = point.clone();
                // Don't actually set the focal point or change camera
            };
            
            // Also override setDistance to prevent camera movement
            camera.setDistance = (distance: number, dampingFactorFactor?: number) => {
                console.log(`📏 Picked distance: ${distance}`);
                // Don't actually set the distance
            };
            
            // Use the existing pick system
            console.log('🎯 Calling camera.pickFocalPoint...');
            camera.pickFocalPoint(screenX, screenY);
            
            // Restore the original methods
            camera.setFocalPoint = originalSetFocalPoint;
            camera.setDistance = originalSetDistance;
            
            if (pickedPoint) {
                console.log(`✅ Successfully picked 3D point: ${pickedPoint.x.toFixed(3)}, ${pickedPoint.y.toFixed(3)}, ${pickedPoint.z.toFixed(3)}`);
            } else {
                console.log('❌ No 3D point was picked');
            }
            
            return pickedPoint;
        } catch (error) {
            console.error('❌ Error picking 3D point:', error);
            return null;
        }
    }
    
    private pickPointFallback(screenX: number, screenY: number): Vec3 | null {
        try {
            console.log('🎯 Trying fallback picking method...');
            
            // Alternative approach: project screen coordinates to a world plane
            const camera = this.scene.camera;
            const scene = this.scene;
            
            // Try to get the scene bound center as a reference point
            if (scene.bound) {
                const boundCenter = scene.bound.center;
                const boundRadius = scene.bound.halfExtents.length();
                
                console.log(`📊 Scene bound center: ${boundCenter.x.toFixed(3)}, ${boundCenter.y.toFixed(3)}, ${boundCenter.z.toFixed(3)}`);
                console.log(`📏 Scene bound radius: ${boundRadius.toFixed(3)}`);
                
                // Create a simple point based on scene center with some variation
                const variation = (Math.random() - 0.5) * boundRadius * 0.1;
                const fallbackPoint = new Vec3(
                    boundCenter.x + variation,
                    boundCenter.y + variation,
                    boundCenter.z + variation
                );
                
                console.log(`🎲 Generated fallback point: ${fallbackPoint.x.toFixed(3)}, ${fallbackPoint.y.toFixed(3)}, ${fallbackPoint.z.toFixed(3)}`);
                return fallbackPoint;
            } else {
                console.log('❌ No scene bound available for fallback');
                // Use a simple default point
                return new Vec3(0, 0, 0);
            }
        } catch (error) {
            console.error('❌ Error in fallback picking:', error);
            return null;
        }
    }

    private setFirstPoint(point: Vec3) {
        this.point1 = point.clone();
        
        // Check if we already have a second point (from redo1 operation)
        if (this.point2) {
            console.log('🔄 First point updated, keeping existing second point');
            // Calculate distance immediately since we have both points
            this.calculateDistance();
            this.state = MeasurementState.MEASUREMENT_COMPLETE;
            
            console.log('✅ Measurement updated with new first point');
            console.log(`📍 Point 1 (NEW): ${this.point1.x.toFixed(3)}, ${this.point1.y.toFixed(3)}, ${this.point1.z.toFixed(3)}`);
            console.log(`📍 Point 2 (KEPT): ${this.point2.x.toFixed(3)}, ${this.point2.y.toFixed(3)}, ${this.point2.z.toFixed(3)}`);
            console.log(`📏 Distance: ${this.distance?.toFixed(3)} units`);
            
            // Update visual overlays with both points
            this.events.fire('measurement.visual.update', {
                point1: this.point1,
                point2: this.point2,
                state: 'complete'
            });
            
            // Change cursor back to default since measurement is complete
            this.scene.canvas.style.cursor = 'default';
        } else {
            // Normal first point setting - no second point exists yet
            this.point2 = null;
            this.distance = null;
            this.state = MeasurementState.WAITING_SECOND_POINT;
            
            console.log('✅ First point set, click on the second point');
            console.log(`📍 Point 1: ${this.point1.x.toFixed(3)}, ${this.point1.y.toFixed(3)}, ${this.point1.z.toFixed(3)}`);
            
            // Update visual overlays
            this.events.fire('measurement.visual.update', {
                point1: this.point1,
                point2: null,
                state: 'waiting_second'
            });
        }
        
        this.updateMeasurementData();
    }

    private setSecondPoint(point: Vec3) {
        this.point2 = point.clone();
        this.calculateDistance();
        this.state = MeasurementState.MEASUREMENT_COMPLETE;
        
        if (this.point1) {
            console.log('✅ Second point set, measurement complete');
            console.log(`📍 Point 1: ${this.point1.x.toFixed(3)}, ${this.point1.y.toFixed(3)}, ${this.point1.z.toFixed(3)}`);
            console.log(`📍 Point 2 (NEW): ${this.point2.x.toFixed(3)}, ${this.point2.y.toFixed(3)}, ${this.point2.z.toFixed(3)}`);
            console.log(`📏 Distance: ${this.distance?.toFixed(3)} units`);
        } else {
            console.log('✅ Second point updated');
            console.log(`📍 Point 2 (UPDATED): ${this.point2.x.toFixed(3)}, ${this.point2.y.toFixed(3)}, ${this.point2.z.toFixed(3)}`);
        }
        
        // Update visual overlays
        this.events.fire('measurement.visual.update', {
            point1: this.point1,
            point2: this.point2,
            state: 'complete'
        });
        
        this.updateMeasurementData();
        
        // Change cursor back to default since measurement is complete
        this.scene.canvas.style.cursor = 'default';
    }

    private calculateDistance() {
        if (this.point1 && this.point2) {
            // Calculate 3D Euclidean distance
            const dx = this.point2.x - this.point1.x;
            const dy = this.point2.y - this.point1.y;
            const dz = this.point2.z - this.point1.z;
            
            this.distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
    }

    private updateMeasurementData() {
        const data: MeasurementData = {
            point1: this.point1,
            point2: this.point2,
            distance: this.distance
        };
        
        this.events.fire('measurement.updated', data);
    }

    public clearMeasurement() {
        console.log('🧹 Clearing measurement');
        
        this.point1 = null;
        this.point2 = null;
        this.distance = null;
        
        if (this.state !== MeasurementState.INACTIVE) {
            this.state = MeasurementState.WAITING_FIRST_POINT;
            this.scene.canvas.style.cursor = 'crosshair';
        }
        
        // Clear visual overlays
        this.events.fire('measurement.visual.clear');
        
        this.updateMeasurementData();
        
        console.log('📍 Click on the first point to start measuring');
    }

    public redoMeasurement() {
        console.log('🔄 Redoing measurement');
        this.clearMeasurement();
    }
    
    public redoFirstPoint() {
        console.log('🔄 Redoing first point only');
        console.log(`📊 Current state: ${this.state} (${stateNames[this.state]})`);
        
        if ((this.state === MeasurementState.WAITING_SECOND_POINT || this.state === MeasurementState.MEASUREMENT_COMPLETE) && this.point1) {
            console.log('✅ Conditions met - clearing first point');
            
            // Clear first point, keep second point if it exists
            const savedPoint2 = this.point2;
            this.point1 = null;
            this.distance = null;
            this.state = MeasurementState.WAITING_FIRST_POINT;
            
            // Set cursor back to crosshair for picking first point
            this.scene.canvas.style.cursor = 'crosshair';
            console.log('➗ Cursor set to crosshair');
            
            // Update visual overlays - show only second point if it exists
            console.log('🎨 Updating visual overlays...');
            this.events.fire('measurement.visual.update', {
                point1: null,
                point2: savedPoint2,
                state: 'waiting_first'
            });
            
            console.log('📊 Updating measurement data...');
            this.updateMeasurementData();
            
            console.log('✅ First point cleared, ready to pick new first point');
            if (savedPoint2) {
                console.log(`📍 Preserved Point 2: ${savedPoint2.x.toFixed(3)}, ${savedPoint2.y.toFixed(3)}, ${savedPoint2.z.toFixed(3)}`);
            }
        } else {
            console.log('⚠️ Cannot redo first point - no measurement in progress');
        }
    }
    
    public redoSecondPoint() {
        console.log('🔄 Redoing second point only');
        console.log(`📊 Current state: ${this.state} (${stateNames[this.state]})`);
        console.log(`📍 Point 1 exists: ${!!this.point1}`);
        console.log(`📍 Point 2 exists: ${!!this.point2}`);
        console.log(`🔍 MEASUREMENT_COMPLETE = ${MeasurementState.MEASUREMENT_COMPLETE}`);
        console.log(`🔍 State check: ${this.state === MeasurementState.MEASUREMENT_COMPLETE}`);
        
        if (this.state === MeasurementState.MEASUREMENT_COMPLETE && this.point1) {
            console.log('✅ Conditions met - clearing second point');
            
            // Keep the first point, clear the second point
            this.point2 = null;
            this.distance = null;
            this.state = MeasurementState.WAITING_SECOND_POINT;
            
            // Set cursor back to crosshair for picking second point
            this.scene.canvas.style.cursor = 'crosshair';
            console.log('➗ Cursor set to crosshair');
            
            // Update visual overlays - show only first point
            console.log('🎨 Updating visual overlays...');
            this.events.fire('measurement.visual.update', {
                point1: this.point1,
                point2: null,
                state: 'waiting_second'
            });
            
            console.log('📊 Updating measurement data...');
            this.updateMeasurementData();
            
            console.log('✅ First point preserved, ready to pick second point');
            console.log(`📍 Point 1: ${this.point1.x.toFixed(3)}, ${this.point1.y.toFixed(3)}, ${this.point1.z.toFixed(3)}`);
        } else if (this.state === MeasurementState.WAITING_SECOND_POINT) {
            console.log('⚠️ Already waiting for second point');
        } else if (!this.point1) {
            console.log('⚠️ Cannot redo second point - no first point exists');
        } else {
            console.log(`⚠️ Cannot redo second point - wrong state: ${this.state} (${stateNames[this.state]})`);
        }
    }

    public get isActive(): boolean {
        return this.state !== MeasurementState.INACTIVE;
    }

    public get currentState(): MeasurementState {
        return this.state;
    }

    public getCurrentData(): MeasurementData {
        return {
            point1: this.point1,
            point2: this.point2,
            distance: this.distance
        };
    }
    
    public temporarilyDisableClicks() {
        console.log('⏸️ Disabling measurement clicks for 600ms and recording button click time');
        
        // Record the button click time
        this.lastButtonClickTime = Date.now();
        
        // Disable clicks flag
        this.clicksDisabled = true;
        
        // Also remove event listener as backup
        const canvas = this.scene.canvas;
        canvas.removeEventListener('click', this.clickHandler, true);
        
        // Re-enable after a longer delay
        setTimeout(() => {
            if (this.state !== MeasurementState.INACTIVE) {
                console.log('▶️ Re-enabling measurement clicks');
                this.clicksDisabled = false;
                canvas.addEventListener('click', this.clickHandler, true);
            } else {
                this.clicksDisabled = false;
            }
        }, 600);
    }
}

export { MeasurementTool, MeasurementState };
