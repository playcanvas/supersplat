import type { Pose } from './camera-poses';
import type { Events } from './events';
import type { AnimTrack, Camera, ExperienceSettings } from './splat-serialize';
import { defaultPostEffectSettings } from './splat-serialize';

type LoopMode = 'none' | 'repeat' | 'pingpong';

type ExperienceChoices = {
    includeAnimation: boolean;
    loopMode: LoopMode;
    backgroundColor: [number, number, number];
    fov: number;
};

// camera keys inside the timeline, in playback order
const orderedCameraPoses = (events: Events): Pose[] => {
    const frames = events.invoke('timeline.frames');
    return (events.invoke('camera.poses') as Pose[])
        .filter((p) => p.frame >= 0 && p.frame < frames)
        .sort((a, b) => a.frame - b.frame);
};

// the single camera track the viewer plays
const cameraAnimTrack = (events: Events, poses: Pose[], loopMode: LoopMode, fallbackFov: number): AnimTrack => {
    const frames = events.invoke('timeline.frames');
    const frameRate = events.invoke('timeline.frameRate');
    const times: number[] = [];
    const position: number[] = [];
    const target: number[] = [];
    const fov: number[] = [];

    for (const pose of poses) {
        times.push(pose.frame);
        position.push(pose.position.x, pose.position.y, pose.position.z);
        target.push(pose.target.x, pose.target.y, pose.target.z);
        fov.push(pose.fov ?? fallbackFov);
    }

    return {
        name: 'cameraAnim',
        duration: frames / frameRate,
        frameRate,
        loopMode,
        interpolation: 'spline',
        smoothness: events.invoke('timeline.smoothness'),
        keyframes: { times, values: { position, target, fov } }
    };
};

// the viewer opens on the camera that is looking at the scene now
const initialCamera = (events: Events, fov: number): Camera[] => {
    const pose = events.invoke('camera.getPose');
    return pose
        ? [
              {
                  initial: {
                      position: [pose.position.x, pose.position.y, pose.position.z] as [number, number, number],
                      target: [pose.target.x, pose.target.y, pose.target.z] as [number, number, number],
                      fov
                  }
              }
          ]
        : [];
};

// the settings.json payload shared by viewer export and publish
const buildExperienceSettings = (events: Events, choices: ExperienceChoices): ExperienceSettings => {
    const poses = orderedCameraPoses(events);
    const animTracks =
        choices.includeAnimation && poses.length > 0
            ? [cameraAnimTrack(events, poses, choices.loopMode, choices.fov)]
            : [];

    return {
        version: 2,
        tonemapping: 'none',
        highPrecisionRendering: false,
        background: { color: choices.backgroundColor },
        postEffectSettings: defaultPostEffectSettings(),
        animTracks,
        cameras: initialCamera(events, choices.fov),
        annotations: [],
        startMode: animTracks.length > 0 ? 'animTrack' : 'default'
    };
};

export { buildExperienceSettings, orderedCameraPoses };
