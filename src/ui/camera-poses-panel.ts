import { Button, Container, Label, NumericInput, Panel, SelectInput } from '@playcanvas/pcui';
import { Vec3 } from 'playcanvas';

import { Events } from '../events';
import { localize } from './localization';

class CameraPosesPanel extends Panel {
    private events: Events;
    private posesContainer: Container;
    private poses: any[] = [];
    private interpolationModeSelect: SelectInput | null = null;
    
    // Recording state
    private isRecording: boolean = false;
    private recordingInterval: number | null = null;
    private recordingStartFrame: number = 0;
    private recordingCount: number = 0;
    private recordButton: Button | null = null;

    constructor(events: Events, args = {}) {
        args = {
            ...args,
            headerText: 'CAMERA POSES',
            collapsible: true,
            collapsed: true,
            class: 'camera-poses-panel'
        };

        super(args);
        this.events = events;

        this.createUI();
        this.bindEvents();
        
        // Delay initial refresh to ensure camera poses system is initialized
        setTimeout(() => this.refresh(), 500);
    }
    
    destroy() {
        // Clean up recording if active
        if (this.isRecording) {
            this.stopRecording();
        }
        super.destroy?.();
    }

    private createUI() {
        // Header controls
        const headerControls = new Container({
            class: 'camera-poses-header-controls'
        });

        const refreshButton = new Button({
            text: 'Refresh',
            size: 'small'
        });
        refreshButton.on('click', () => this.refresh());

        const clearButton = new Button({
            text: 'Clear All',
            size: 'small'
        });
        clearButton.on('click', () => this.clearAllPoses());

        const applyYUpButton = new Button({
            text: 'Z-up → Y-up',
            size: 'small'
        });
        applyYUpButton.on('click', () => this.applyCoordinateConversion('zup-to-yup'));

        const invertYButton = new Button({
            text: 'Invert Y',
            size: 'small'
        });
        invertYButton.on('click', () => this.applyCoordinateConversion('invert-y'));

        const blenderToSupersplatButton = new Button({
            text: 'Blender→SS',
            size: 'small'
        });
        blenderToSupersplatButton.on('click', () => this.applyCoordinateConversion('blender-to-supersplat'));

        const resetCoordsButton = new Button({
            text: 'Reset Coords',
            size: 'small'
        });
        resetCoordsButton.on('click', () => this.applyCoordinateConversion('reset'));

        const readKeyframesButton = new Button({
            text: 'Read',
            size: 'small'
        });
        readKeyframesButton.on('click', () => this.readCurrentKeyframes());

        const updateKeyframesButton = new Button({
            text: 'Update',
            size: 'small'
        });
        updateKeyframesButton.on('click', () => this.updateTimelineKeyframes());

        const exportCameraButton = new Button({
            text: 'Export Camera',
            size: 'small',
            class: 'camera-export-button'
        });
        exportCameraButton.on('click', () => this.exportCameraAnimation());

        const sortButton = new Button({
            text: 'Sort by Frame',
            size: 'small'
        });
        sortButton.on('click', () => this.sortPoses());

        const copyToLastButton = new Button({
            text: 'Copy to Last',
            size: 'small'
        });
        copyToLastButton.on('click', () => this.copyFirstToLastFrame());

        // Recording controls (inline)
        const recordIntervalInput = new NumericInput({
            value: 1000, // Default 1 second
            min: 100,    // Minimum 100ms
            max: 10000,  // Maximum 10 seconds
            precision: 0,
            class: 'record-interval-input'
        });

        this.recordButton = new Button({
            text: 'Record',
            size: 'small',
            class: 'camera-record-button'
        });
        this.recordButton.on('click', () => this.toggleRecording(recordIntervalInput.value));

        // Stretch controls (inline)
        const stretchTargetInput = new NumericInput({
            value: 720, // Default target
            min: 1,
            max: 10000,
            precision: 0,
            class: 'stretch-target-input'
        });

        const stretchButton = new Button({
            text: 'Stretch Poses',
            size: 'small',
            class: 'camera-stretch-button'
        });
        stretchButton.on('click', () => this.stretchPoses(stretchTargetInput.value));

        // Interpolation mode controls
        const interpolationModeLabel = new Label({
            text: 'Mode:',
            class: 'camera-interpolation-label'
        });

        const interpolationModeSelect = new SelectInput({
            options: [
                { v: 'linear', t: 'Linear' },
                { v: 'circular', t: 'Circular' }
            ],
            value: 'linear',
            class: 'camera-interpolation-select'
        });
        interpolationModeSelect.on('change', (value: string) => {
            this.events.fire('camera.setInterpolationMode', value);
            console.log(`Interpolation mode changed to: ${value}`);
        });

        headerControls.append(refreshButton);
        headerControls.append(clearButton);
        headerControls.append(sortButton);
        headerControls.append(copyToLastButton);
        headerControls.append(interpolationModeLabel);
        headerControls.append(interpolationModeSelect);
        headerControls.append(recordIntervalInput);
        headerControls.append(this.recordButton);
        headerControls.append(stretchTargetInput);
        headerControls.append(stretchButton);
        headerControls.append(readKeyframesButton);
        headerControls.append(updateKeyframesButton);
        headerControls.append(exportCameraButton);
        headerControls.append(applyYUpButton);
        headerControls.append(invertYButton);
        headerControls.append(blenderToSupersplatButton);
        headerControls.append(resetCoordsButton);

        // Store reference for event handling
        this.interpolationModeSelect = interpolationModeSelect;

        // Poses container
        this.posesContainer = new Container({
            class: 'camera-poses-list'
        });

        this.append(headerControls);
        this.append(this.posesContainer);
    }

    private bindEvents() {
        // Listen for camera pose changes
        this.events.on('camera.addPose', () => {
            setTimeout(() => this.refresh(), 100); // Small delay to ensure pose is added
        });

        // Initialize interpolation mode from system
        setTimeout(() => {
            if (this.events.functions.has('camera.interpolationMode') && this.interpolationModeSelect) {
                const currentMode = this.events.invoke('camera.interpolationMode');
                this.interpolationModeSelect.value = currentMode;
            }
        }, 500);
    }

    private refresh() {
        // Check if camera.poses function exists
        if (!this.events.functions.has('camera.poses')) {
            console.warn('camera.poses function not registered yet, retrying in 1 second...');
            this.poses = [];
            
            // Retry after a delay
            setTimeout(() => {
                if (this.events.functions.has('camera.poses')) {
                    this.refresh();
                } else {
                    console.error('camera.poses function still not available after retry');
                }
            }, 1000);
            
            return;
        }
        
        // Get current poses
        try {
            this.poses = this.events.invoke('camera.poses') || [];
        } catch (error) {
            console.warn('Could not get camera poses:', error);
            this.poses = [];
        }

        // Clear existing UI
        this.posesContainer.clear();

        if (this.poses.length === 0) {
            const emptyLabel = new Label({
                text: 'No camera poses found',
                class: 'camera-poses-empty'
            });
            this.posesContainer.append(emptyLabel);
            return;
        }

        // Create UI for each pose
        this.poses.forEach((pose, index) => this.createPoseUI(pose, index));
    }

    private createPoseUI(pose: any, index: number) {
        const poseContainer = new Container({
            class: 'camera-pose-item'
        });

        // Header
        const poseHeader = new Container({
            class: 'camera-pose-header'
        });
        
        const poseTitle = new Label({
            text: `Frame ${pose.frame} - ${pose.name || 'Unnamed'}`,
            class: 'camera-pose-title'
        });

        const copyButton = new Button({
            text: 'Copy',
            size: 'small',
            class: 'camera-pose-copy'
        });
        copyButton.on('click', () => this.copyPose(index));

        const deleteButton = new Button({
            text: '×',
            size: 'small',
            class: 'camera-pose-delete'
        });
        deleteButton.on('click', () => this.deletePose(index));

        poseHeader.append(poseTitle);
        poseHeader.append(copyButton);
        poseHeader.append(deleteButton);

        // Position controls
        const positionContainer = new Container({
            class: 'camera-pose-coords'
        });
        
        const positionLabel = new Label({
            text: 'Position:',
            class: 'camera-pose-label'
        });

        const posX = new NumericInput({
            value: parseFloat(pose.position.x.toFixed(6)),
            precision: 6,
            step: 0.001,
            class: 'camera-pose-input'
        });
        posX.on('change', (value: number) => this.updatePosePosition(index, 'x', value));

        const posY = new NumericInput({
            value: parseFloat(pose.position.y.toFixed(6)),
            precision: 6,
            step: 0.001,
            class: 'camera-pose-input'
        });
        posY.on('change', (value: number) => this.updatePosePosition(index, 'y', value));

        const posZ = new NumericInput({
            value: parseFloat(pose.position.z.toFixed(6)),
            precision: 6,
            step: 0.001,
            class: 'camera-pose-input'
        });
        posZ.on('change', (value: number) => this.updatePosePosition(index, 'z', value));

        positionContainer.append(positionLabel);
        positionContainer.append(posX);
        positionContainer.append(posY);
        positionContainer.append(posZ);

        // Target controls
        const targetContainer = new Container({
            class: 'camera-pose-coords'
        });
        
        const targetLabel = new Label({
            text: 'Target:',
            class: 'camera-pose-label'
        });

        const tarX = new NumericInput({
            value: parseFloat(pose.target.x.toFixed(6)),
            precision: 6,
            step: 0.001,
            class: 'camera-pose-input'
        });
        tarX.on('change', (value: number) => this.updatePoseTarget(index, 'x', value));

        const tarY = new NumericInput({
            value: parseFloat(pose.target.y.toFixed(6)),
            precision: 6,
            step: 0.001,
            class: 'camera-pose-input'
        });
        tarY.on('change', (value: number) => this.updatePoseTarget(index, 'y', value));

        const tarZ = new NumericInput({
            value: parseFloat(pose.target.z.toFixed(6)),
            precision: 6,
            step: 0.001,
            class: 'camera-pose-input'
        });
        tarZ.on('change', (value: number) => this.updatePoseTarget(index, 'z', value));

        targetContainer.append(targetLabel);
        targetContainer.append(tarX);
        targetContainer.append(tarY);
        targetContainer.append(tarZ);

        // FOV controls
        const fovContainer = new Container({
            class: 'camera-pose-coords'
        });
        
        const fovLabel = new Label({
            text: 'FOV:',
            class: 'camera-pose-label'
        });

        const fovInput = new NumericInput({
            value: parseFloat((pose.fov || 65).toFixed(2)),
            precision: 2,
            step: 1,
            min: 1,
            max: 179,
            class: 'camera-pose-input'
        });
        fovInput.on('change', (value: number) => this.updatePoseFov(index, value));

        const fovUnit = new Label({
            text: '°',
            class: 'camera-pose-unit'
        });

        fovContainer.append(fovLabel);
        fovContainer.append(fovInput);
        fovContainer.append(fovUnit);

        poseContainer.append(poseHeader);
        poseContainer.append(positionContainer);
        poseContainer.append(targetContainer);
        poseContainer.append(fovContainer);

        this.posesContainer.append(poseContainer);
    }

    private updatePosePosition(poseIndex: number, axis: 'x' | 'y' | 'z', value: number) {
        if (poseIndex >= this.poses.length) return;
        
        const pose = this.poses[poseIndex];
        pose.position[axis] = value;
        
        // Update the pose in the system
        this.events.fire('camera.addPose', {
            name: pose.name,
            frame: pose.frame,
            position: pose.position,
            target: pose.target,
            fov: pose.fov || 65
        });
    }

    private updatePoseTarget(poseIndex: number, axis: 'x' | 'y' | 'z', value: number) {
        if (poseIndex >= this.poses.length) return;
        
        const pose = this.poses[poseIndex];
        pose.target[axis] = value;
        
        // Update the pose in the system
        this.events.fire('camera.addPose', {
            name: pose.name,
            frame: pose.frame,
            position: pose.position,
            target: pose.target,
            fov: pose.fov || 65
        });
    }

    private updatePoseFov(poseIndex: number, value: number) {
        if (poseIndex >= this.poses.length) return;
        
        const pose = this.poses[poseIndex];
        pose.fov = value;
        
        // Update the pose in the system
        this.events.fire('camera.addPose', {
            name: pose.name,
            frame: pose.frame,
            position: pose.position,
            target: pose.target,
            fov: value
        });
    }

    private deletePose(poseIndex: number) {
        if (poseIndex >= this.poses.length) return;
        
        // Remove pose from timeline
        this.events.fire('timeline.remove', poseIndex);
        
        // Refresh the UI
        setTimeout(() => this.refresh(), 100);
    }

    private clearAllPoses() {
        // Clear all poses
        this.events.fire('camera.clear-poses');
        
        // Refresh the UI
        this.refresh();
    }

    private applyCoordinateConversion(type: 'zup-to-yup' | 'invert-y' | 'blender-to-supersplat' | 'reset') {
        this.poses.forEach(pose => {
            const pos = pose.position;
            const tar = pose.target;
            
            if (type === 'zup-to-yup') {
                // Convert from Z-up to Y-up: [x, y, z] -> [x, z, -y]
                pose.position = new Vec3(pos.x, pos.z, -pos.y);
                pose.target = new Vec3(tar.x, tar.z, -tar.y);
            } else if (type === 'invert-y') {
                // Invert Y axis: [x, y, z] -> [x, -y, z]
                pose.position = new Vec3(pos.x, -pos.y, pos.z);
                pose.target = new Vec3(tar.x, -tar.y, tar.z);
            } else if (type === 'blender-to-supersplat') {
                // Convert from Blender Z-up to SuperSplat Y-up: [x, y, z] -> [x, z, -y]
                pose.position = new Vec3(pos.x, pos.z, -pos.y);
                pose.target = new Vec3(tar.x, tar.z, -tar.y);
            } else if (type === 'reset') {
                // Reset to original coordinates - you'll need to re-import to get original values
                console.log('Reset coordinates - please re-import your file to restore original values');
                return; // Don't modify anything
            }
            
            // Update the pose in the system
            this.events.fire('camera.addPose', {
                name: pose.name,
                frame: pose.frame,
                position: pose.position,
                target: pose.target,
                fov: pose.fov || 65 // Preserve FOV during coordinate conversion
            });
        });
        
        // Refresh the UI to show updated values
        setTimeout(() => this.refresh(), 100);
    }

    private readCurrentKeyframes() {
        // Read current keyframes from the timeline/camera system
        try {
            // Get current camera poses from the system
            const currentPoses = this.events.invoke('camera.poses') || [];
            
            // Get current camera state for reference
            const currentCamera = this.events.invoke('camera.getPose');
            const currentFov = this.events.invoke('camera.fov') || 65;
            
            console.log(`Read ${currentPoses.length} keyframes from timeline`);
            console.log('Current camera FOV:', currentFov);
            
            // Refresh to show any updated data
            this.refresh();
        } catch (error) {
            console.warn('Could not read keyframes:', error);
        }
    }

    private updateTimelineKeyframes() {
        // Update the timeline with any manual edits from the UI
        try {
            // Force a rebuild of the spline with current poses
            this.events.fire('camera.poses-updated');
            
            // Trigger timeline refresh
            const currentFrame = this.events.invoke('timeline.frame') || 0;
            this.events.fire('timeline.frame', currentFrame);
            
            console.log('Updated timeline keyframes with manual edits');
        } catch (error) {
            console.warn('Could not update timeline keyframes:', error);
        }
    }

    private exportCameraAnimation() {
        // Use the centralized camera export event
        this.events.fire('camera.export');
    }

    private sortPoses() {
        try {
            // Get current poses
            if (!this.events.functions.has('camera.poses')) {
                console.warn('camera.poses function not available');
                return;
            }
            const poses = this.events.invoke('camera.poses') || [];
            
            if (poses.length === 0) {
                console.log('No camera poses to sort');
                return;
            }
            
            if (poses.length === 1) {
                console.log('Only one pose exists, no sorting needed');
                return;
            }
            
            // Check if poses are already sorted
            const isAlreadySorted = poses.every((pose: any, index: number) => {
                return index === 0 || poses[index - 1].frame <= pose.frame;
            });
            
            if (isAlreadySorted) {
                console.log('Camera poses are already sorted by frame number');
                return;
            }
            
            // Create a copy and sort poses by frame number
            const sortedPoses = [...poses].sort((a: any, b: any) => a.frame - b.frame);
            
            // Clear all existing poses from the system
            this.events.fire('camera.clear-poses');
            
            // Re-add poses in sorted order
            sortedPoses.forEach((pose: any) => {
                this.events.fire('camera.addPose', {
                    name: pose.name,
                    frame: pose.frame,
                    position: pose.position,
                    target: pose.target,
                    fov: pose.fov || 65
                });
            });
            
            // Refresh the UI to show sorted poses
            setTimeout(() => this.refresh(), 100);
            
            console.log(`Sorted ${poses.length} camera poses by frame number`);
            
        } catch (error) {
            console.error('Failed to sort camera poses:', error);
        }
    }

    private copyPose(poseIndex: number) {
        try {
            if (!this.events.functions.has('camera.poses')) {
                console.warn('camera.poses function not available');
                return;
            }
            const poses = this.events.invoke('camera.poses') || [];
            
            if (poseIndex >= poses.length) {
                console.warn('Invalid pose index for copy');
                return;
            }
            
            const originalPose = poses[poseIndex];
            const totalFrames = this.events.invoke('timeline.frames') || 180;
            
            // Find next available frame number
            const usedFrames = poses.map((p: any) => p.frame);
            let newFrame = originalPose.frame + 1;
            
            // Find the next available frame
            while (usedFrames.includes(newFrame) && newFrame < totalFrames) {
                newFrame++;
            }
            
            if (newFrame >= totalFrames) {
                // If no space, ask user for frame number
                const userFrame = prompt(`Enter frame number to copy pose to (0-${totalFrames - 1}):`, newFrame.toString());
                if (userFrame === null) return; // User cancelled
                
                newFrame = parseInt(userFrame, 10);
                if (isNaN(newFrame) || newFrame < 0 || newFrame >= totalFrames) {
                    alert('Invalid frame number');
                    return;
                }
            }
            
            // Create copy of the pose
            const copiedPose = {
                name: `${originalPose.name}_copy`,
                frame: newFrame,
                position: {
                    x: originalPose.position.x,
                    y: originalPose.position.y,
                    z: originalPose.position.z
                },
                target: {
                    x: originalPose.target.x,
                    y: originalPose.target.y,
                    z: originalPose.target.z
                },
                fov: originalPose.fov || 65
            };
            
            // Add the copied pose
            this.events.fire('camera.addPose', copiedPose);
            
            // Refresh the UI
            setTimeout(() => this.refresh(), 100);
            
            console.log(`Copied pose from frame ${originalPose.frame} to frame ${newFrame}`);
            
        } catch (error) {
            console.error('Failed to copy pose:', error);
        }
    }

    private copyFirstToLastFrame() {
        try {
            if (!this.events.functions.has('camera.poses')) {
                console.warn('camera.poses function not available');
                return;
            }
            const poses = this.events.invoke('camera.poses') || [];
            
            if (poses.length === 0) {
                console.warn('No poses to copy');
                return;
            }
            
            // Sort poses to find the actual first frame
            const sortedPoses = [...poses].sort((a: any, b: any) => a.frame - b.frame);
            const firstPose = sortedPoses[0];
            const totalFrames = this.events.invoke('timeline.frames') || 180;
            const lastFrame = totalFrames - 1;
            
            // Check if there's already a pose at the last frame
            const existingLastPose = poses.find((p: any) => p.frame === lastFrame);
            if (existingLastPose) {
                const overwrite = confirm(`There's already a pose at frame ${lastFrame}. Overwrite it?`);
                if (!overwrite) return;
            }
            
            // Create copy of the first pose at the last frame
            const loopPose = {
                name: `${firstPose.name}_loop`,
                frame: lastFrame,
                position: {
                    x: firstPose.position.x,
                    y: firstPose.position.y,
                    z: firstPose.position.z
                },
                target: {
                    x: firstPose.target.x,
                    y: firstPose.target.y,
                    z: firstPose.target.z
                },
                fov: firstPose.fov || 65
            };
            
            // Add the loop pose
            this.events.fire('camera.addPose', loopPose);
            
            // Refresh the UI
            setTimeout(() => this.refresh(), 100);
            
            console.log(`Copied first frame (${firstPose.frame}) to last frame (${lastFrame}) for seamless looping`);
            
        } catch (error) {
            console.error('Failed to copy first to last frame:', error);
        }
    }

    private toggleRecording(intervalMs: number) {
        if (this.isRecording) {
            // Stop recording
            this.stopRecording();
        } else {
            // Start recording
            this.startRecording(intervalMs);
        }
    }

    private startRecording(intervalMs: number) {
        if (this.isRecording) return;

        console.log(`🔴 Starting camera pose recording with ${intervalMs}ms interval`);
        
        // Debug: Check if camera poses system is available
        if (!this.events.functions.has('camera.poses')) {
            console.error('❌ Camera poses system not available!');
            alert('Camera poses system not ready. Please wait and try again.');
            return;
        }
        
        if (!this.events.functions.has('camera.getPose')) {
            console.error('❌ Camera getPose function not available!');
            alert('Camera system not ready. Please wait and try again.');
            return;
        }
        
        this.isRecording = true;
        this.recordingStartFrame = this.events.invoke('timeline.frame') || 0;
        this.recordingCount = 0; // Reset counter
        
        console.log(`📍 Starting from frame: ${this.recordingStartFrame}`);
        
        // Update button text and style
        if (this.recordButton) {
            this.recordButton.text = 'Stop Recording';
            this.recordButton.class.add('recording');
        }
        
        // Record current pose immediately
        console.log('📸 Recording initial pose...');
        this.recordCurrentPose();
        
        // Set up interval recording
        this.recordingInterval = window.setInterval(() => {
            console.log(`⏰ Interval timer fired. Recording state: ${this.isRecording}`);
            if (this.isRecording) {
                console.log('📸 Recording interval pose...');
                this.recordCurrentPose();
            } else {
                console.log('⚠️ Recording stopped, but interval still running - clearing it');
                if (this.recordingInterval) {
                    clearInterval(this.recordingInterval);
                    this.recordingInterval = null;
                }
            }
        }, intervalMs);
        
        console.log('✅ Camera pose recording started successfully');
    }

    private stopRecording() {
        if (!this.isRecording) return;

        console.log('🛑 Stopping camera pose recording');
        
        this.isRecording = false;
        
        // Clear interval
        if (this.recordingInterval) {
            clearInterval(this.recordingInterval);
            this.recordingInterval = null;
        }
        
        // Update button text and style
        if (this.recordButton) {
            this.recordButton.text = 'Record';
            this.recordButton.class.remove('recording');
        }
        
        // Get final pose count
        try {
            const allPoses = this.events.invoke('camera.poses') || [];
            console.log(`📊 Recording session complete. Total poses: ${allPoses.length}`);
            
            if (allPoses.length === 0) {
                console.warn('⚠️ No poses were recorded! Check console for errors.');
                alert('No camera poses were recorded. Check the console for error details.');
            } else {
                console.log('✅ Successfully recorded poses:', allPoses.map((p: any) => `Frame ${p.frame}: ${p.name}`));
            }
        } catch (e) {
            console.error('Error getting final pose count:', e);
        }
        
        // Refresh to show recorded poses
        this.refresh();
        
        console.log('✅ Camera pose recording stopped');
    }

    private recordCurrentPose() {
        try {
            console.log('📸 Starting pose recording...');
            
            // Get current camera state
            const currentPose = this.events.invoke('camera.getPose');
            const currentFov = this.events.invoke('camera.fov') || 65;
            
            // Use incremental frame numbers instead of timeline frame
            // This prevents poses from overwriting each other
            const recordingFrame = this.recordingStartFrame + this.recordingCount;
            
            console.log('🎥 Camera state:', {
                currentPose: currentPose,
                currentFov: currentFov,
                recordingFrame: recordingFrame,
                recordingCount: this.recordingCount
            });
            
            if (!currentPose) {
                console.error('❌ Could not get current camera pose for recording!');
                console.log('Available functions:', Array.from(this.events.functions.keys()));
                return;
            }
            
            if (!currentPose.position || !currentPose.target) {
                console.error('❌ Camera pose missing position or target:', currentPose);
                return;
            }
            
            // Increment recording counter
            this.recordingCount++;
            
            // Create pose data with better naming
            const poseData = {
                name: `recorded_${this.recordingCount.toString().padStart(3, '0')}`,
                frame: recordingFrame, // Use incremental frame numbers
                position: new Vec3(currentPose.position.x, currentPose.position.y, currentPose.position.z),
                target: new Vec3(currentPose.target.x, currentPose.target.y, currentPose.target.z),
                fov: currentFov
            };
            
            console.log('📦 Creating pose data:', poseData);
            
            // Add pose to system
            console.log('➕ Firing camera.addPose event...');
            this.events.fire('camera.addPose', poseData);
            
            // Verify the pose was added
            setTimeout(() => {
                try {
                    const allPoses = this.events.invoke('camera.poses') || [];
                    console.log(`✅ Pose recorded! Total poses now: ${allPoses.length}`);
                    console.log('Last pose:', allPoses[allPoses.length - 1]);
                    
                    // Force refresh UI
                    this.refresh();
                } catch (e) {
                    console.error('Error verifying pose:', e);
                }
            }, 100);
            
            console.log(`📍 Recorded camera pose #${this.recordingCount} at frame ${recordingFrame}:`, 
                `${poseData.name} pos=[${poseData.position.x.toFixed(2)}, ${poseData.position.y.toFixed(2)}, ${poseData.position.z.toFixed(2)}]`, 
                `fov=${poseData.fov.toFixed(1)}°`);
            
            console.log(`🔄 Recording state check: isRecording=${this.isRecording}, interval=${this.recordingInterval ? 'active' : 'null'}`);
            
            console.log(`📍 Pose assigned to frame: ${recordingFrame} (start=${this.recordingStartFrame} + count=${this.recordingCount})`);
            
            // Optional: You can manually advance timeline by commenting out the above
            // and uncommenting the lines below:
            /*
            const totalFrames = this.events.invoke('timeline.frames') || 180;
            const nextFrame = Math.min(currentFrame + 1, totalFrames - 1);
            if (nextFrame !== currentFrame) {
                console.log(`⏭️ Advancing timeline from frame ${currentFrame} to ${nextFrame}`);
                this.events.fire('timeline.frame', nextFrame);
            }
            */
            
        } catch (error) {
            console.error('❌ Failed to record camera pose:', error);
            console.error('Error details:', error.stack);
        }
    }

    private async stretchPoses(targetFrames: number) {
        try {
            // Get current poses
            const poses = this.events.invoke('camera.poses') || [];
            
            if (poses.length === 0) {
                alert('No poses to stretch. Record some poses first.');
                return;
            }
            
            if (poses.length < 2) {
                alert('Need at least 2 poses to stretch. Current poses: ' + poses.length);
                return;
            }
            
            // Sort poses by frame to ensure correct order
            const sortedPoses = [...poses].sort((a, b) => a.frame - b.frame);
            
            // Get original frame range
            const firstFrame = sortedPoses[0].frame;
            const lastFrame = sortedPoses[sortedPoses.length - 1].frame;
            const originalRange = lastFrame - firstFrame;
            
            if (originalRange <= 0) {
                alert('Invalid frame range. Poses must have different frame numbers.');
                return;
            }
            
            console.log(`🔄 Stretching ${poses.length} poses from range ${originalRange + 1} frames to ${targetFrames} frames`);
            console.log(`Original range: frames ${firstFrame} to ${lastFrame}`);
            
            // Clear existing poses one by one (more reliable than clear-poses)
            console.log('🗑️ Clearing existing poses...');
            // Remove all poses starting from the last index to avoid index shifting issues
            for (let i = poses.length - 1; i >= 0; i--) {
                console.log(`🗑️ Removing pose ${i}: ${poses[i].name}`);
                this.events.fire('timeline.remove', i);
            }
            
            // Wait a moment for all removals to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Calculate new frame positions
            const stretchedPoses = sortedPoses.map((pose, index) => {
                // Calculate the position as a ratio (0 to 1) in the original sequence
                const positionRatio = (pose.frame - firstFrame) / originalRange;
                
                // Apply the ratio to the new target range
                const newFrame = Math.round(positionRatio * (targetFrames - 1));
                
                return {
                    ...pose,
                    name: `stretched_${(index + 1).toString().padStart(3, '0')}`,
                    frame: newFrame
                };
            });
            
            // Add stretched poses back with delays for reliability
            console.log('➕ Adding stretched poses...');
            for (let i = 0; i < stretchedPoses.length; i++) {
                const pose = stretchedPoses[i];
                console.log(`📏 Adding stretched pose ${i + 1}: ${pose.name} at frame ${pose.frame}`);
                this.events.fire('camera.addPose', pose);
                // Small delay between additions to ensure processing
                if (i < stretchedPoses.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            
            // Update timeline frames to match target if needed
            const currentTimelineFrames = this.events.invoke('timeline.frames') || 180;
            if (targetFrames > currentTimelineFrames) {
                console.log(`📏 Updating timeline from ${currentTimelineFrames} to ${targetFrames} frames`);
                this.events.fire('timeline.setFrames', targetFrames);
            }
            
            // Verify the operation worked
            await new Promise(resolve => setTimeout(resolve, 200));
            const finalPoses = this.events.invoke('camera.poses') || [];
            console.log(`🔍 Verification: Expected ${stretchedPoses.length} poses, found ${finalPoses.length}`);
            
            // Refresh UI
            setTimeout(() => this.refresh(), 300);
            
            console.log(`✅ Successfully stretched ${poses.length} poses across ${targetFrames} frames`);
            console.log('New frame distribution:', stretchedPoses.map(p => `${p.name}: frame ${p.frame}`));
            
            alert(`Successfully stretched ${poses.length} poses from ${originalRange + 1} frames to ${targetFrames} frames!\nOriginal poses cleared and ${stretchedPoses.length} new poses created.`);
            
        } catch (error) {
            console.error('❌ Failed to stretch poses:', error);
            alert('Failed to stretch poses. Check console for details.');
        }
    }

}

export { CameraPosesPanel };
