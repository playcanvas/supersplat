import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { path } from 'playcanvas';

import { ElementType } from './element';
import { Events } from './events';
import { PngCompressor } from './png-compressor';
import { Scene } from './scene';
import { Splat } from './splat';
import { localize } from './ui/localization';

type ImageSettings = {
    width: number;
    height: number;
    useViewportSize: boolean;
    transparentBg: boolean;
    showDebug: boolean;
};

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

const removeExtension = (filename: string) => {
    return filename.substring(0, filename.length - path.getExtension(filename).length);
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

    // prepare the frame for rendering
    const prepareFrame = async (visibleSplats: Splat[], frame?: number) => {

        if (frame) {
            // go to first frame of the animation
            events.fire('timeline.setFrame', frame);
        }

        // manually update the camera so position and rotation are correct
        scene.camera.onUpdate(0);

        // wait for sorting to complete
        await Promise.all(visibleSplats.map((splat) => {
            // create a promise for each splat that will resolve upon sorting complete
            return new Promise<void>((resolve) => {
                const { instance } = splat.entity.gsplat;

                // listen for the sorter to complete
                const handle = instance.sorter.on('updated', () => {
                    handle.off();
                    resolve();
                });

                // manually invoke sort because internally the engine sorts after render the
                // scene call is made.
                instance.sort(scene.camera.entity);

                // in cases where the camera does not move between frames the sorter won't run
                // and we need a timeout instead. this is a hack - the engine should allow us to
                // know whether the sorter is running or not.
                setTimeout(() => {
                    resolve();
                }, 1000);
            });
        }));

        // render during next update
        scene.lockedRender = true;
    };

    events.function('render.image', async (imageSettings: ImageSettings) => {
        events.fire('startSpinner');

        try {
            const { width, height, transparentBg, showDebug, useViewportSize } = imageSettings;
            const viewportBuffer = scene.camera.entity.camera.renderTarget.colorBuffer;
            const renderWidth = useViewportSize ? viewportBuffer.width : width;
            const renderHeight = useViewportSize ? viewportBuffer.height : height;

            // start rendering to offscreen buffer only
            scene.camera.startOffscreenMode(renderWidth, renderHeight);
            scene.camera.renderOverlays = showDebug;
            if (!transparentBg) {
                scene.camera.entity.camera.clearColor.copy(events.invoke('bgClr'));
            }
            scene.lockedRenderMode = true;

            // cpu-side buffer to read pixels into
            const data = new Uint8Array(renderWidth * renderHeight * 4);


            // create a snapshot
            const createSnapshot = async () => {
                const { renderTarget } = scene.camera.entity.camera;
                const { colorBuffer } = renderTarget;

                // read the rendered frame
                await colorBuffer.read(0, 0, renderWidth, renderHeight, { renderTarget, data });

                // construct the png compressor
                if (!compressor) {
                    compressor = new PngCompressor();
                }

                // @ts-ignore
                const pixels = new Uint8ClampedArray(data.buffer);

                // the render buffer contains premultiplied alpha. so apply background color.
                if (!transparentBg) {
                    const { r, g, b } = events.invoke('bgClr');
                    for (let i = 0; i < pixels.length; i += 4) {
                        const a = 255 - pixels[i + 3];
                        pixels[i + 0] += r * a;
                        pixels[i + 1] += g * a;
                        pixels[i + 2] += b * a;
                        pixels[i + 3] = 255;
                    }
                }

                const arrayBuffer = await compressor.compress(
                    new Uint32Array(pixels.buffer),
                    colorBuffer.width,
                    colorBuffer.height
                );

                // construct filename
                const selected = events.invoke('selection') as Splat;
                const filename = `${removeExtension(selected?.name ?? 'SuperSplat')}-image.png`;

                // download
                downloadFile(arrayBuffer, filename);
            };

            const snapshotPromise = new Promise<boolean>((resolve, reject) => {
                const handle = scene.events.on('postrender', async () => {
                    handle.off();
                    try {
                        await createSnapshot();
                        resolve(true);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            // get the list of visible splats
            const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(splat => splat.visible);

            // special case the first frame
            await prepareFrame(splats);

            // wait for capture
            await snapshotPromise;


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
            scene.forceRender = true;

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
                    height
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
            const line = new Uint8Array(width * 4);

            // get the list of visible splats
            const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(splat => splat.visible);

            // capture the current video frame
            const captureFrame = async (frame: number) => {
                const { renderTarget } = scene.camera.entity.camera;
                const { colorBuffer } = renderTarget;

                // read the rendered frame
                await colorBuffer.read(0, 0, width, height, { renderTarget, data });

                // flip the buffer vertically
                for (let y = 0; y < height / 2; y++) {
                    const top = y * width * 4;
                    const bottom = (height - y - 1) * width * 4;
                    line.set(data.subarray(top, top + width * 4));
                    data.copyWithin(top, bottom, bottom + width * 4);
                    data.set(line, bottom);
                }

                // construct the video frame
                const videoFrame = new VideoFrame(data, {
                    format: 'RGBA',
                    codedWidth: width,
                    codedHeight: height,
                    timestamp: Math.floor(1e6 * frame / frameRate),
                    duration: Math.floor(1e6 / frameRate)
                });
                encoder.encode(videoFrame);
                videoFrame.close();
            };

            for (let frame = startFrame; frame <= endFrame; frame++) {
                const capturePromise = new Promise<boolean>((resolve, reject) => {
                    const handle = scene.events.on('postrender', async () => {
                        handle.off();
                        try {
                            await captureFrame(frame);
                            resolve(true);
                        } catch (error) {
                            reject(error);
                        }
                    });
                });

                // special case the first frame
                await prepareFrame(splats, frame);

                // wait for capture
                await capturePromise;
            }

            // Flush and finalize muxer
            await encoder.flush();
            muxer.finalize();

            // Download
            downloadFile(muxer.target.buffer, `${removeExtension(splats[0]?.name ?? 'SuperSplat')}-video.mp4`);

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

export { ImageSettings, VideoSettings, registerRenderEvents };
