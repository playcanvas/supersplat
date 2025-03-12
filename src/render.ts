import { path } from 'playcanvas';

import { Events } from './events';
import { localize } from './ui/localization';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { PngCompressor } from './png-compressor';
import { Scene } from './scene';
import { Splat } from './splat';

type VideoSettings = {
    startFrame: number;
    endFrame: number;
    frameRate: number;
    width: number;
    height: number;
    bitrate: number;
    transparentBg: boolean;
    showDebug: boolean;
};

const replaceExtension = (filename: string, extension: string) => {
    const removeExtension = (filename: string) => {
        return filename.substring(0, filename.length - path.getExtension(filename).length);
    };
    return `${removeExtension(filename)}${extension}`;
};

const downloadFile = (arrayBuffer: ArrayBuffer, filename: string) => {
    const blob = new Blob([arrayBuffer], { type: 'octet/stream' });
    const url = window.URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.download = filename;
    el.href = url;
    el.click();
    window.URL.revokeObjectURL(url);
};

const registerRenderEvents = (scene: Scene, events: Events) => {
    let compressor: PngCompressor;

    events.function('render.image', async () => {
        events.fire('startSpinner');

        try {
            const renderTarget = scene.camera.entity.camera.renderTarget;
            const texture = renderTarget.colorBuffer;
            const data = new Uint8Array(texture.width * texture.height * 4);

            await texture.read(0, 0, texture.width, texture.height, { renderTarget, data });

            // construct the png compressor
            if (!compressor) {
                compressor = new PngCompressor();
            }

            // @ts-ignore
            const pixels = new Uint8ClampedArray(data.buffer);

            // the render buffer contains premultiplied alpha. so apply background color.
            const { r, g, b } = events.invoke('bgClr');
            for (let i = 0; i < pixels.length; i += 4) {
                const a = 255 - pixels[i + 3];
                pixels[i + 0] += r * a;
                pixels[i + 1] += g * a;
                pixels[i + 2] += b * a;
                pixels[i + 3] = 255;
            }

            const arrayBuffer = await compressor.compress(
                new Uint32Array(pixels.buffer),
                texture.width,
                texture.height
            );

            // construct filename
            const selected = events.invoke('selection') as Splat;
            const filename = replaceExtension(selected?.filename ?? 'SuperSplat', '.png');

            // download
            downloadFile(arrayBuffer, filename);
        } finally {
            events.fire('stopSpinner');
        }
    });

    events.function('render.video', async (videoSettings: VideoSettings) => {
        events.fire('startSpinner');
        try {
            const { startFrame, endFrame, frameRate, width, height, bitrate, transparentBg, showDebug } = videoSettings;

            const muxer = new Muxer({
                target: new ArrayBufferTarget(),
                video: {
                    codec: 'avc',
                    width,
                    height,
                    // render is upside-down. use transform to flip it
                    rotation: [
                        1, 0, 0,
                        0,-1, 0,
                        0, height, 1
                    ]
                },
                fastStart: 'in-memory',
                firstTimestampBehavior: 'offset'
            });

            const encoder = new VideoEncoder({
                output: (chunk, meta) => {
                    muxer.addVideoChunk(chunk, meta);
                },
                error: (error) => {
                    console.log(error);
                }
            });

            encoder.configure({
                codec: height < 1080 ? 'avc1.420028' : 'avc1.640033', // H.264 profile low : high
                width,
                height,
                bitrate
            });

            // start rendering to offscreen buffer only
            scene.camera.startOffscreenMode(width, height);
            scene.camera.renderOverlays = showDebug;
            if (!transparentBg) {
                scene.camera.entity.camera.clearColor.copy(events.invoke('bgClr'));
            }
            scene.lockedRenderMode = true;

            // cpu-side buffer to read pixels into
            const data = new Uint8Array(width * height * 4);

            let captureFrame = -1;
            let captureResolve: (value: boolean) => void = null;
            let captureReject: (reason: any) => void = null;

            const captureFrameHandle = scene.events.on('postrender', async () => {
                const { renderTarget } = scene.camera.entity.camera;
                const { colorBuffer } = renderTarget;

                try {
                    // read the rendered frame
                    await colorBuffer.read(0, 0, width, height, { renderTarget, data });

                    // construct the video frame
                    const frame = new VideoFrame(data, {
                        format: "RGBA",
                        codedWidth: width,
                        codedHeight: height,
                        timestamp: 1e6 * captureFrame / frameRate,
                        duration: 1 / frameRate
                    });
                    encoder.encode(frame);
                    frame.close();

                    // resolve the promise
                    captureResolve(true);
                } catch (error) {
                    captureReject(error);
                }
            });

            for (let frame = startFrame; frame <= endFrame; frame++) {
                captureFrame = frame;

                // move the timeline which should invoke render
                events.fire('timeline.setFrame', frame);
                scene.lockedRender = true;

                await new Promise<boolean>((resolve, reject) => {
                    captureResolve = resolve;
                    captureReject = reject;
                });
            }

            captureFrameHandle.off();

            // Flush and finalize muxer
            await encoder.flush();
            muxer.finalize();

            // Download
            const selected = events.invoke('selection') as Splat;
            downloadFile(muxer.target.buffer, replaceExtension(selected?.filename ?? 'SuperSplat', '.mp4'));

            // Free resources
            encoder.close();

            return true;
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('render.failed'),
                message: `'${error.message ?? error}'`
            });
        } finally {
            scene.camera.endOffscreenMode();
            scene.camera.renderOverlays = true;
            scene.camera.entity.camera.clearColor.set(0, 0, 0, 0);
            scene.lockedRenderMode = false;
            scene.forceRender = true;       // camera likely moved, finish with normal render

            events.fire('stopSpinner');
        }
    });
};

export { registerRenderEvents };
