import { Vec3 } from 'playcanvas';

import { CubicSpline } from './anim/spline';
import { Events } from './events';

// Helper function to calculate circular interpolation points
const calculateCircularInterpolation = (poses: any[], totalFrames: number): { times: number[], points: number[] } => {
    if (poses.length < 2) {
        return { times: [], points: [] };
    }

    // Find the center point of the circle (average of all targets)
    const center = new Vec3();
    poses.forEach(pose => center.add(pose.target));
    center.mulScalar(1 / poses.length);

    // Calculate radius and angles for each pose
    const poseData = poses.map((pose) => {
        const toCamera = new Vec3().copy(pose.position).sub(center);
        const radius = toCamera.length();
        const angle = Math.atan2(toCamera.z, toCamera.x);
        return {
            ...pose,
            radius,
            angle,
            center: center.clone()
        };
    });

    // Generate interpolated points along the arc
    const interpolatedTimes: number[] = [];
    const interpolatedPoints: number[] = [];

    // Add more intermediate points for smoother circular motion
    const frameStep = Math.max(1, Math.floor(totalFrames / (poses.length * 8))); // More points for smoother arcs

    for (let frame = 0; frame < totalFrames; frame += frameStep) {
        // Find the two poses to interpolate between
        let beforePose = poseData[0];
        let afterPose = poseData[1];
        let t = 0;

        for (let i = 0; i < poseData.length - 1; i++) {
            if (frame >= poseData[i].frame && frame <= poseData[i + 1].frame) {
                beforePose = poseData[i];
                afterPose = poseData[i + 1];
                t = (frame - beforePose.frame) / (afterPose.frame - beforePose.frame);
                break;
            }
        }

        // Handle looping
        if (frame > poseData[poseData.length - 1].frame) {
            beforePose = poseData[poseData.length - 1];
            afterPose = poseData[0];
            const wrapFrame = frame - totalFrames;
            t = (totalFrames - beforePose.frame + wrapFrame) / (totalFrames - beforePose.frame + afterPose.frame);
        }

        // Interpolate angle (shortest path around circle)
        let angleDiff = afterPose.angle - beforePose.angle;
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        const interpolatedAngle = beforePose.angle + angleDiff * t;

        // Interpolate radius
        const interpolatedRadius = beforePose.radius + (afterPose.radius - beforePose.radius) * t;

        // Calculate new position on the circle
        const newPosition = new Vec3(
            center.x + Math.cos(interpolatedAngle) * interpolatedRadius,
            beforePose.position.y + (afterPose.position.y - beforePose.position.y) * t, // Linear interpolation for height
            center.z + Math.sin(interpolatedAngle) * interpolatedRadius
        );

        // Linear interpolation for target and FOV
        const newTarget = new Vec3(
            beforePose.target.x + (afterPose.target.x - beforePose.target.x) * t,
            beforePose.target.y + (afterPose.target.y - beforePose.target.y) * t,
            beforePose.target.z + (afterPose.target.z - beforePose.target.z) * t
        );

        const newFov = beforePose.fov + ((afterPose.fov || 65) - (beforePose.fov || 65)) * t;

        interpolatedTimes.push(frame);
        interpolatedPoints.push(
            newPosition.x, newPosition.y, newPosition.z,
            newTarget.x, newTarget.y, newTarget.z,
            newFov
        );
    }

    return { times: interpolatedTimes, points: interpolatedPoints };
};

// CSV Export functionality
class CameraCsvExporter {
    private data: any[] = [];
    private isRecording: boolean = false;
    private events: Events;
    private frameRate: number = 30;

    constructor(events: Events) {
        this.events = events;
    }

    async recordFullSequence(interpolationMode: 'spline' | 'circular'): Promise<string> {
        this.data = [];
        this.frameRate = this.events.invoke('timeline.frameRate') || 30;
        const totalFrames = this.events.invoke('timeline.frames') || 180;

        console.log(`📊 Recording full sequence: frames 0-${totalFrames - 1} using ${interpolationMode} mode`);

        // Check if we have camera poses
        const poses = this.events.invoke('camera.poses') || [];
        if (poses.length === 0) {
            throw new Error('No camera poses found. Please add some camera poses first.');
        }

        // Use the exact same logic as rebuildSpline() in the camera poses system
        const orderedPoses = poses.slice()
        .filter((a: any) => a.frame < totalFrames)
        .sort((a: any, b: any) => a.frame - b.frame);

        if (orderedPoses.length < 2) {
            throw new Error('Need at least 2 camera poses for animation.');
        }

        let times: number[];
        let points: number[];

        if (interpolationMode === 'circular' && orderedPoses.length >= 3) {
            // Use circular interpolation for 3 or more poses
            const circularData = calculateCircularInterpolation(orderedPoses, totalFrames);
            times = circularData.times;
            points = circularData.points;
            console.log(`Using circular interpolation with ${times.length} interpolated points`);
        } else {
            // Use standard spline interpolation
            times = orderedPoses.map((p: any) => p.frame);
            points = [];
            for (let i = 0; i < orderedPoses.length; ++i) {
                const p = orderedPoses[i];
                points.push(p.position.x, p.position.y, p.position.z);
                points.push(p.target.x, p.target.y, p.target.z);
                points.push(p.fov || 65);
            }
            console.log(`Using spline interpolation with ${times.length} control points`);
        }

        const { CubicSpline } = await import('./anim/spline');
        const spline = CubicSpline.fromPointsLooping(totalFrames, times, points, this.events.invoke('timeline.smoothness'));

        // Record every frame from 0 to totalFrames-1
        const result: number[] = [];
        for (let frame = 0; frame < totalFrames; frame++) {
            spline.evaluate(frame, result);

            this.data.push({
                frame,
                time: frame / this.frameRate,
                position_x: parseFloat(result[0].toFixed(6)),
                position_z: parseFloat(result[2].toFixed(6)),
                position_y: parseFloat(result[1].toFixed(6)),
                target_x: parseFloat(result[3].toFixed(6)),
                target_z: parseFloat(result[5].toFixed(6)),
                target_y: parseFloat(result[4].toFixed(6)),
                fov: parseFloat((result[6] || 65).toFixed(3))
            });
        }

        console.log(`📊 Recorded ${this.data.length} frames using ${interpolationMode} interpolation`);
        return this.generateCsv();
    }

    private generateCsv(): string {
        // Explicitly define column order
        const headers = ['frame', 'time', 'position_x', 'position_z', 'position_y', 'target_x', 'target_z', 'target_y', 'fov'];

        if (this.data.length === 0) {
            return `${headers.join(',')}\n`;
        }

        let csv = `${headers.join(',')}\n`;

        for (const row of this.data) {
            csv += `${headers.map(header => row[header]).join(',')}\n`;
        }

        return csv;
    }

    get isExporting(): boolean {
        return this.isRecording;
    }

    get recordedFrameCount(): number {
        return this.data.length;
    }
}


type Pose = {
    name: string,
    frame: number,
    position: Vec3,
    target: Vec3,
    fov?: number
};

const registerCameraPosesEvents = (events: Events) => {
    const poses: Pose[] = [];
    let interpolationMode: 'spline' | 'circular' = 'spline';
    const csvExporter = new CameraCsvExporter(events);

    let onTimelineChange: (frame: number) => void;

    const rebuildSpline = () => {
        const duration = events.invoke('timeline.frames');

        const orderedPoses = poses.slice()
        // filter out keys beyond the end of the timeline
        .filter(a => a.frame < duration)
        // order keys by time for spline
        .sort((a, b) => a.frame - b.frame);

        if (orderedPoses.length > 1) {
            let times: number[];
            let points: number[];

            if (interpolationMode === 'circular' && orderedPoses.length >= 3) {
                // Use circular interpolation for 3 or more poses
                const circularData = calculateCircularInterpolation(orderedPoses, duration);
                times = circularData.times;
                points = circularData.points;
                console.log(`Using circular interpolation with ${times.length} interpolated points`);
            } else {
                // Use standard spline interpolation
                times = orderedPoses.map(p => p.frame);
                points = [];
                for (let i = 0; i < orderedPoses.length; ++i) {
                    const p = orderedPoses[i];
                    points.push(p.position.x, p.position.y, p.position.z);
                    points.push(p.target.x, p.target.y, p.target.z);
                    points.push(p.fov || 65); // Default FOV if not specified
                }
                console.log(`Using spline interpolation with ${times.length} control points`);
            }

            // interpolate camera positions, camera target positions, and FOV
            const spline = CubicSpline.fromPointsLooping(duration, times, points, events.invoke('timeline.smoothness'));
            const result: number[] = [];
            const pose = { position: new Vec3(), target: new Vec3(), fov: 65 };

            // handle application update tick
            onTimelineChange = (frame: number) => {
                const time = frame;

                // evaluate the spline at current time
                spline.evaluate(time, result);

                // set camera pose and FOV
                pose.position.set(result[0], result[1], result[2]);
                pose.target.set(result[3], result[4], result[5]);
                pose.fov = result[6] || 65; // Extract interpolated FOV

                events.fire('camera.setPose', pose, 0);

                // Set the camera FOV separately if needed
                events.fire('camera.setFov', pose.fov);
            };
        } else {
            onTimelineChange = null;
        }
    };

    events.on('timeline.time', (time: number) => {
        onTimelineChange?.(time);
    });

    events.on('timeline.frame', (frame: number) => {
        onTimelineChange?.(frame);
    });

    events.on('timeline.frames', () => {
        rebuildSpline();
        events.fire('timeline.time', events.invoke('timeline.frame'));
    });

    events.on('timeline.smoothness', () => {
        rebuildSpline();
        events.fire('timeline.time', events.invoke('timeline.frame'));
    });

    // poses

    const addPose = (pose: Pose) => {
        if (pose.frame === undefined) {
            return false;
        }

        // if a pose already exists at this time, update it
        const idx = poses.findIndex(p => p.frame === pose.frame);
        if (idx !== -1) {
            poses[idx] = pose;
        } else {
            poses.push(pose);
            events.fire('timeline.addKey', pose.frame);
        }

        rebuildSpline();
    };

    const removePose = (index: number) => {
        poses.splice(index, 1);

        // remove the timeline key
        rebuildSpline();
        events.fire('timeline.removeKey', index);
    };

    const movePose = (index: number, frame: number) => {
        // remove target frame pose
        const toIndex = poses.findIndex(p => p.frame === frame);
        // move pose
        poses[index].frame = frame;
        if (toIndex !== -1) {
            removePose(toIndex);
        }


        rebuildSpline();
        events.fire('timeline.setKey', index, frame);
    };

    events.function('camera.poses', () => {
        return poses;
    });

    events.function('camera.interpolationMode', () => {
        return interpolationMode;
    });

    events.on('camera.setInterpolationMode', (mode: 'spline' | 'circular') => {
        interpolationMode = mode;
        rebuildSpline(); // Rebuild with new interpolation mode
        events.fire('timeline.time', events.invoke('timeline.frame'));
    });

    events.on('camera.addPose', (pose: Pose) => {
        addPose(pose);
    });

    events.on('timeline.add', (frame: number) => {
        // get the current camera pose and FOV
        const pose = events.invoke('camera.getPose');
        const currentFov = events.invoke('camera.fov') || 65;

        addPose({
            name: `camera_${poses.length}`,
            frame,
            position: pose.position,
            target: pose.target,
            fov: currentFov
        });
    });

    events.on('timeline.move', (frameFrom: number, frameTo: number) => {
        if (frameFrom === frameTo) return;

        const index = poses.findIndex(p => p.frame === frameFrom);
        if (index !== -1) {
            movePose(index, frameTo);
        }
    });

    events.on('timeline.remove', (index: number) => {
        removePose(index);
    });

    events.on('timeline.frames', () => {
        rebuildSpline();
    });

    events.on('timeline.setFrames', (frameCount: number) => {
        events.fire('timeline.frames', frameCount);
        rebuildSpline();
    });

    events.on('timeline.setFrameRate', (frameRate: number) => {
        // Store frame rate for future use
        // The timeline system might need to be updated to handle custom frame rates
    });

    events.on('camera.clear-poses', () => {
        // Remove all keys from timeline first (in reverse order to avoid index issues)
        for (let i = poses.length - 1; i >= 0; i--) {
            events.fire('timeline.removeKey', i);
        }

        poses.length = 0; // Clear all poses
        rebuildSpline();
    });

    // CSV Export events - now automatically records full sequence
    events.on('camera.exportCsv', async () => {
        try {
            events.fire('camera.csvExportStarted');
            const currentInterpolationMode = interpolationMode; // Use the current interpolation mode
            const csvData = await csvExporter.recordFullSequence(currentInterpolationMode);

            // Check if File System Access API is available
            if ('showSaveFilePicker' in window) {
                const fileHandle = await (window as any).showSaveFilePicker({
                    types: [{
                        description: 'CSV files',
                        accept: {
                            'text/csv': ['.csv']
                        }
                    }],
                    suggestedName: `camera-animation-${new Date().toISOString().split('T')[0]}.csv`
                });

                const writable = await fileHandle.createWritable();
                await writable.write(csvData);
                await writable.close();

                console.log(`📊 CSV exported to ${fileHandle.name}`);
            } else {
                // Fallback for browsers without File System Access API
                const blob = new Blob([csvData], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `camera-animation-${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                console.log('📊 CSV downloaded successfully');
            }

            const totalFrames = events.invoke('timeline.frames') || 180;
            events.fire('camera.csvExportCompleted', totalFrames);

        } catch (error: any) {
            if (error.name !== 'AbortError') {
                console.error('Failed to export CSV:', error);
                events.fire('camera.csvExportFailed', error.message);
            }
        }
    });

    // doc

    events.function('docSerialize.poseSets', (): any[] => {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];

        if (poses.length === 0) {
            return [];
        }

        return [{
            name: 'set0',
            poses: poses.map((pose) => {
                return {
                    name: pose.name,
                    frame: pose.frame,
                    position: pack3(pose.position),
                    target: pack3(pose.target),
                    fov: pose.fov || 65
                };
            })
        }];
    });

    events.function('docDeserialize.poseSets', (poseSets: any[]) => {
        if (poseSets.length === 0) {
            return;
        }

        const fps = events.invoke('timeline.frameRate');

        // for now, load the first poseSet
        poseSets[0].poses.forEach((docPose: any, index: number) => {
            addPose({
                name: docPose.name,
                frame: docPose.frame ?? (index * fps),
                position: new Vec3(docPose.position),
                target: new Vec3(docPose.target),
                fov: docPose.fov || 65
            });
        });
    });
};

export { registerCameraPosesEvents, Pose };
