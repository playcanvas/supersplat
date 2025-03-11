import { path } from 'playcanvas';

import { Events } from './events';
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

    events.function('render.screenshot', async () => {
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
            const { startFrame, endFrame, frameRate, width, height } = videoSettings;

            const muxer = new Muxer({
                target: new ArrayBufferTarget(),
                video: {
                    codec: 'avc',
                    width,
                    height,
                },
                fastStart: 'in-memory',
                firstTimestampBehavior: 'offset'
            });

            const encoder = new VideoEncoder({
                output: (chunk, meta) => {
                    muxer.addVideoChunk(chunk, meta);
                },
                error: (error) => console.log(error)
            });

            encoder.configure({
                codec: 'avc1.420028', // H.264 codec
                width,
                height,
                bitrate: 1e8
            });

            // start rendering to offscreen buffer only
            scene.camera.startOffscreenMode(width, height);
            scene.camera.entity.camera.clearColor.copy(events.invoke('bgClr'));
            scene.lockedRenderMode = true;

            // cpu-side buffer to read pixels into
            const data = new Uint8Array(width * height * 4);

            let currentFrame = -1;
            let frameCaptured: (value: boolean) => void = null;

            const captureFrame = scene.events.on('postrender', async () => {
                const { renderTarget } = scene.camera.entity.camera;
                const { colorBuffer } = renderTarget;

                const currentF = currentFrame;
                const capturedF = frameCaptured;
                currentFrame = -1;
                frameCaptured = null;

                if (!capturedF) {
                    return;
                }

                // read the texture data
                await colorBuffer.read(0, 0, width, height, { renderTarget, data });

                // construct the next video frame
                const frame = new VideoFrame(data, {
                    format: "RGBA",
                    codedWidth: width,
                    codedHeight: height,
                    timestamp: 1e6 * currentF / frameRate,
                    duration: 1 / frameRate
                });
                encoder.encode(frame);
                frame.close();

                capturedF(true);
            });

            for (let frame = startFrame; frame <= endFrame; frame++) {
                currentFrame = frame;

                // move the timeline which should invoke render
                events.fire('timeline.setFrame', frame);
                scene.lockedRender = true;

                await new Promise<boolean>((resolve, reject) => {
                    frameCaptured = resolve;
                });
            }

            captureFrame.off();

            // Flush and finalize muxer
            await encoder.flush();
            muxer.finalize();

            // Download
            const selected = events.invoke('selection') as Splat;
            downloadFile(muxer.target.buffer, replaceExtension(selected?.filename ?? 'SuperSplat', '.mp4'));

            // Free resources
            encoder.close();
        } finally {
            scene.camera.endOffscreenMode();
            scene.camera.entity.camera.clearColor.set(0, 0, 0, 0);
            scene.lockedRenderMode = false;

            events.fire('stopSpinner');
        }
    });
};

export { registerRenderEvents };
