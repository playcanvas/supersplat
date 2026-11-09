import { WebPCodec } from '@playcanvas/splat-transform';
import {
    BufferTarget,
    EncodedPacket,
    EncodedVideoPacketSource,
    MkvOutputFormat,
    MovOutputFormat,
    Mp4OutputFormat,
    Output,
    StreamTarget,
    WebMOutputFormat
} from 'mediabunny';
import { Color, path, Quat, Vec3 } from 'playcanvas';

import type { DepthMethod } from './depth-renderer';
import { normalizeDepthMethod } from './depth-renderer';
import { ElementType } from './element';
import { EquirectRenderer } from './equirect-renderer';
import type { Events } from './events';
import { encodePng, encodePngGray16 } from './png-writer';
import type { RenderMode } from './render-mode';
import type { Scene } from './scene';
import { injectSphericalMetadata } from './spherical-metadata';
import type { Splat } from './splat';
import { i18n } from './ui/localization';
import type { VideoSettings } from './video-config';
import { buildVideoEncoderConfig, getVideoCodecType } from './video-config';
import { encodeZip } from './zip-writer';

const nullClr = new Color(0, 0, 0, 0);

// Lookup maps for video output format and codec configuration
const FORMAT_CONFIG: Record<
    string,
    {
        create: (streaming: boolean) => Mp4OutputFormat | MovOutputFormat | MkvOutputFormat | WebMOutputFormat;
        extension: string;
    }
> = {
    mp4: {
        create: (streaming) => new Mp4OutputFormat({ fastStart: streaming ? false : 'in-memory' }),
        extension: 'mp4'
    },
    webm: { create: () => new WebMOutputFormat(), extension: 'webm' },
    mov: {
        create: (streaming) => new MovOutputFormat({ fastStart: streaming ? false : 'in-memory' }),
        extension: 'mov'
    },
    mkv: { create: () => new MkvOutputFormat(), extension: 'mkv' }
};

// backpressure high-water mark for the encoder queue and pending muxer writes
const MAX_QUEUE_SIZE = 5;

type ImageSettings = {
    width: number;
    height: number;
    transparentBg: boolean;
    showDebug: boolean;
    format: 'png' | 'jpeg' | 'webp';
    quality?: number; // 0..1, jpeg only
    projection?: 'standard' | 'equirect';
    levelHorizon?: boolean;
    // diagnostic render mode: depth exports a 16-bit grayscale png, overdraw a
    // heat map of the fragment counts. 'normal' (or omitted) exports colour
    renderMode?: RenderMode;
    depthMethod?: DepthMethod;
    depthData?: boolean;
};

const removeExtension = (filename: string) => {
    return filename.substring(0, filename.length - path.getExtension(filename).length);
};

const isInvalidFilenameChar = (char: string) => {
    return /[<>:"/\\|?*]/.test(char) || char.charCodeAt(0) < 32;
};

const sanitizeFilename = (filename: string) => {
    const sanitized = Array.from(filename, (char) => (isInvalidFilenameChar(char) ? '_' : char))
        .join('')
        .trim();
    return sanitized.length > 0 ? sanitized : 'supersplat';
};

// extract a plain filename from url-style names (e.g. splats imported via ?load=)
const getImportedFilename = (filename: string) => {
    const trimmed = filename.split(/[?#]/)[0];

    if (trimmed.includes('://') || trimmed.startsWith('blob:')) {
        try {
            return path.getBasename(new URL(trimmed).pathname);
        } catch {
            // fall through to the raw filename below
        }
    }

    return path.getBasename(trimmed);
};

// sorting is submitted on the GPU immediately before each render
const sortSplatsAndWait = (_scene: Scene, _splats: Splat[]) => Promise.resolve();

const downloadFile = (
    data: ArrayBuffer | Uint8Array<ArrayBuffer>,
    filename: string,
    type = 'application/octet-stream'
) => {
    const blob = new Blob([data], { type });
    const url = window.URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.download = filename;
    el.href = url;
    el.click();
    window.URL.revokeObjectURL(url);
};

const registerRenderEvents = (scene: Scene, events: Events) => {
    let webpCodec: WebPCodec;

    // default base filename for rendered output: the project document name if
    // set, otherwise the first visible splat's name
    const baseFilename = () => {
        const docName = events.invoke('doc.name');
        const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter((splat) => splat.visible);
        const source = docName || (splats[0]?.name ?? 'supersplat');
        return sanitizeFilename(removeExtension(getImportedFilename(source)));
    };

    events.function('render.baseFilename', baseFilename);

    // largest render target dimension the device supports; used by the render
    // dialogs to disable resolutions the gpu cannot produce
    events.function('render.maxTextureSize', () => scene.graphicsDevice.maxTextureSize);

    // wait for postrender to fire
    const waitPostRender = () => {
        return new Promise<boolean>((resolve, reject) => {
            let handle: { off: () => void } | null = null;
            const timer = setTimeout(() => {
                handle?.off();
                reject(new Error('Timed out waiting for a rendered frame'));
            }, 60_000);
            handle = scene.events.on('postrender', () => {
                clearTimeout(timer);
                handle?.off();
                try {
                    resolve(true);
                } catch (error) {
                    reject(error);
                }
            });
        });
    };

    const postRender = async () => {
        await waitPostRender();
        while (scene.depthRender || scene.normalRender || scene.curvatureRender) {
            // Keep this frame's depth stable during its asynchronous capacity
            // check. A live performance overlay otherwise renders newer
            // versions continuously and prevents a capture from ever settling.
            scene.renderHold++;
            let settled: boolean;
            try {
                settled = await scene.camera.depthRenderer.settle();
            } finally {
                scene.renderHold--;
            }
            if (settled) break;
            scene.forceRender = true;
            if (scene.lockedRenderMode) scene.lockedRender = true;
            await waitPostRender();
        }
        return true;
    };

    events.function('render.offscreen', async (width: number, height: number): Promise<Uint8Array> => {
        const prevOverlays = scene.camera.renderOverlays;
        const prevGizmo = scene.gizmoLayer.enabled;
        const prevCenters = scene.centersLayer.enabled;
        try {
            // start rendering to offscreen buffer only
            scene.camera.startOffscreenMode(width, height);
            scene.camera.renderOverlays = false;
            scene.gizmoLayer.enabled = false;
            scene.centersLayer.enabled = false;

            // render the next frame
            scene.forceRender = true;

            // for render to finish
            await postRender();

            // cpu-side buffer to read pixels into
            const data = new Uint8Array(width * height * 4);

            const { mainTarget, workTarget } = scene.camera;

            scene.dataProcessor.copyRt(mainTarget, workTarget);

            // read the rendered frame. the read must be immediate: nothing
            // submits the shared command encoder outside the frame, so a
            // deferred read maps the staging buffer before the copy above has
            // run and returns zeros.
            await workTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workTarget, data, immediate: true });

            // rows are read back top-down (0,0 at the top)
            return data;
        } finally {
            scene.camera.endOffscreenMode();
            scene.camera.depthRenderer.shrink();
            scene.camera.renderOverlays = prevOverlays;
            scene.gizmoLayer.enabled = prevGizmo;
            scene.centersLayer.enabled = prevCenters;
            scene.camera.camera.clearColor.set(0, 0, 0, 0);
            scene.forceRender = true; // repaint the viewport with normal rendering
        }
    });

    events.function('render.image', async (imageSettings: ImageSettings, fileStream?: FileSystemWritableFileStream) => {
        events.fire('startSpinner');

        let equirect: EquirectRenderer | null = null;
        let savedFov = 0;
        let savedOrtho = false;
        let wasPlaying = false;
        const prevGizmo = scene.gizmoLayer.enabled;
        const prevCenters = scene.centersLayer.enabled;
        const prevOverlays = scene.camera.renderOverlays;

        try {
            const { width, height, transparentBg, showDebug, format, quality, projection, levelHorizon } =
                imageSettings;
            // Freeze playback so the frame that is rendered is the frame whose
            // camera matrices we snapshot for the export metadata
            wasPlaying = !!events.invoke('timeline.playing');
            if (wasPlaying) events.fire('timeline.setPlaying', false);
            const renderMode = imageSettings.renderMode ?? 'normal';
            const depth = renderMode === 'depth';
            const diagnostic = renderMode !== 'normal';
            const is360 = !diagnostic && projection === 'equirect';

            // in 360 mode the offscreen target is a square cube face; the
            // equirect target holds the output-sized frame
            const faceSize = Math.min(height, scene.graphicsDevice.maxTextureSize);

            // start rendering to offscreen buffer only
            scene.camera.startOffscreenMode(is360 ? faceSize : width, is360 ? faceSize : height);
            // Freeze the pose while the capture settles so camera tweens cannot
            // advance between the rendered depth and the metadata snapshot
            scene.camera.captureFreeze = true;
            // depth is a replacement view rather than an overlay: force overlays
            // on so scene.depthRender engages, and the camera's pass gating hides
            // the gizmo/centers layers anyway
            // Pin the capture's mode even for 'normal': otherwise a viewport left
            // in depth/normals/edge would leak into a colour export whenever the
            // dialog's Show Debug Overlays kept renderOverlays on
            scene.camera.renderOverlays = diagnostic ? true : is360 ? false : showDebug;
            scene.captureRenderMode = renderMode;
            scene.camera.captureDepthMethod =
                imageSettings.depthMethod === undefined ? null : normalizeDepthMethod(imageSettings.depthMethod);
            scene.gizmoLayer.enabled = false;
            scene.centersLayer.enabled = false;
            if (!transparentBg && !diagnostic) {
                scene.camera.clearPass.setClearColor(events.invoke('bgClr'));
            }

            // cpu-side buffer to read pixels into
            const data = new Uint8Array(width * height * 4);

            let bytes: Uint8Array<ArrayBuffer>;
            let extension: string;
            let mimeType: string;

            if (is360) {
                savedFov = scene.camera.fov;
                savedOrtho = scene.camera.ortho;
                equirect = new EquirectRenderer(scene.graphicsDevice, faceSize, width, height);
                scene.camera.ortho = false;

                // snapshot the current camera pose. supersplat cameras never
                // roll, so with level horizon the capture frame is the
                // camera yaw, otherwise yaw and pitch
                const camPos = new Vec3().copy(scene.camera.position);
                const qCapture = new Quat();
                if (levelHorizon ?? true) {
                    qCapture.setFromEulerAngles(0, scene.camera.azim, 0);
                } else {
                    qCapture.copy(scene.camera.mainCamera.getRotation());
                }

                // all faces share direction-independent clipping planes so
                // near-plane culling cannot differ across a face boundary
                const boundRadius = scene.bound.halfExtents.length();
                const dist = new Vec3().sub2(scene.bound.center, camPos).length();
                const far = dist + boundRadius;
                const near = Math.max(1e-6, dist < boundRadius ? far / (1024 * 16) : dist - boundRadius);

                const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter((splat) => splat.visible);
                const qWorld = new Quat();

                for (let face = 0; face < 6; face++) {
                    qWorld.mul2(qCapture, EquirectRenderer.faceRotations[face]);
                    scene.camera.setPoseOverride({
                        position: camPos,
                        rotation: qWorld,
                        fov: EquirectRenderer.faceFov,
                        near,
                        far
                    });

                    // faces view different directions, so each render must
                    // wait for its own sort
                    await sortSplatsAndWait(scene, splats);

                    // render a frame and wait for it to finish
                    scene.forceRender = true;
                    await postRender();

                    scene.dataProcessor.copyRt(scene.camera.mainTarget, equirect.faceTargets[face]);
                }

                // project the faces to the equirect target and read back
                equirect.project();
                await equirect.read(data);
            } else {
                // render the next frame
                scene.forceRender = true;

                // for render to finish
                await postRender();

                // Snapshot the frame's camera before the async depth readback and
                // PNG/ZIP encoding: reading it afterwards can describe a later
                // pose than the pixels.
                const camera = scene.camera.camera;
                const cameraMetadata = {
                    worldToView: Array.from(camera.viewMatrix.data),
                    projection: Array.from(camera.projectionMatrix.data),
                    nearClip: camera.nearClip,
                    farClip: camera.farClip,
                    projectionType: scene.camera.ortho ? 'orthographic' : 'perspective'
                };

                if (depth) {
                    const depthRenderer = scene.camera.depthRenderer;
                    const texture = depthRenderer.texture;
                    const raw = (await texture.read(0, 0, width, height, { immediate: true })) as Uint32Array;
                    const floats = new Float32Array(raw.buffer, raw.byteOffset, raw.length);
                    const samples = new Uint16Array(width * height);
                    const pack = imageSettings.depthData === true;
                    // Raw package buffers are only allocated when requested; a
                    // plain depth PNG should not pay ~12 extra bytes/pixel at 8K.
                    const depthValues = pack ? new Uint8Array(width * height * 4) : null;
                    const coverageValues = pack ? new Uint8Array(width * height * 4) : null;
                    const depths = depthValues ? new DataView(depthValues.buffer) : null;
                    const coverage = coverageValues ? new DataView(coverageValues.buffer) : null;
                    const mask = pack ? new Uint8Array(width * height * 4) : null;
                    const [near, far] = depthRenderer.displayRange;
                    for (let i = 0; i < samples.length; i++) {
                        const valid = raw[i * 4 + 3] !== 0;
                        const z = valid ? floats[i * 4] : 0;
                        samples[i] = valid
                            ? Math.round(Math.min(1, Math.max(0, (z - near) / (far - near))) * 65535)
                            : 65535;
                        if (pack) {
                            depths.setFloat32(i * 4, z, true);
                            coverage.setFloat32(i * 4, floats[i * 4 + 1], true);
                            mask[i * 4] = mask[i * 4 + 1] = mask[i * 4 + 2] = valid ? 255 : 0;
                            mask[i * 4 + 3] = 255;
                        }
                    }
                    const png = await encodePngGray16(samples, width, height);
                    if (pack) {
                        const metadata = {
                            version: 1,
                            width,
                            height,
                            depthFile: 'depth.f32',
                            coverageFile: 'coverage.f32',
                            maskFile: 'valid-mask.png',
                            previewFile: 'depth.png',
                            dtype: 'float32',
                            byteOrder: 'little-endian',
                            layout: 'row-major, top-left origin',
                            shape: [height, width],
                            channels: 1,
                            strideBytes: 4,
                            depthDefinition: 'linear camera-space Z, positive forward',
                            coverageDefinition: 'accumulated alpha in [0, 1] after the contribution/coverage filters',
                            units: 'scene units; metric scale is not assumed',
                            invalidDepth: 0,
                            validMask: '255=valid, 0=invalid',
                            preview:
                                'depth.png is 16-bit grayscale normalized to displayRange; depths outside it clamp, invalid pixels are white',
                            previewTransfer: 'linear normalized (no sRGB encoding)',
                            viewportDisplayTransfer: 'pow(depth01, 1 / 2.2)',
                            method: scene.camera.captureDepthMethod ?? events.invoke('view.depthMethod'),
                            minOpacity: events.invoke('view.minOpacity'),
                            minPixelContribution: events.invoke('view.depthContribution'),
                            minCoverage: events.invoke('view.depthCoverage'),
                            quantile: events.invoke('view.depthQuantile'),
                            displayRange: { mode: events.invoke('view.depthRangeMode'), near, far },
                            projection: cameraMetadata.projectionType,
                            nearClip: cameraMetadata.nearClip,
                            farClip: cameraMetadata.farClip,
                            matrices: {
                                layout: 'column-major',
                                projectionClipSpace: 'OpenGL (-1 to 1)',
                                worldToView: cameraMetadata.worldToView,
                                projection: cameraMetadata.projection
                            }
                        };
                        bytes = encodeZip([
                            { name: 'depth.f32', data: depthValues! },
                            { name: 'coverage.f32', data: coverageValues! },
                            { name: 'valid-mask.png', data: await encodePng(mask!, width, height) },
                            { name: 'depth.png', data: png },
                            { name: 'metadata.json', data: new TextEncoder().encode(JSON.stringify(metadata, null, 2)) }
                        ]);
                        extension = 'zip';
                        mimeType = 'application/zip';
                    } else {
                        bytes = png;
                        extension = 'png';
                        mimeType = 'image/png';
                    }
                } else {
                    const { mainTarget, workTarget } = scene.camera;

                    scene.dataProcessor.copyRt(mainTarget, workTarget, scene.overdrawRender, scene.alphaRender);

                    // read the rendered frame (immediate: see render.offscreen)
                    await workTarget.colorBuffer.read(0, 0, width, height, {
                        renderTarget: workTarget,
                        data,
                        immediate: true
                    });
                }
            }

            if (!depth) {
                if (format === 'png') {
                    bytes = await encodePng(data, width, height);
                    extension = 'png';
                    mimeType = 'image/png';
                } else if (format === 'jpeg') {
                    // jpeg has no alpha channel and canvas encoding flattens
                    // transparent pixels toward black, so force full opacity
                    for (let i = 3; i < data.length; i += 4) {
                        data[i] = 255;
                    }

                    const imageData = new ImageData(
                        new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
                        width,
                        height
                    );
                    let blob: Blob;
                    if (typeof OffscreenCanvas !== 'undefined') {
                        const canvas = new OffscreenCanvas(width, height);
                        const context = canvas.getContext('2d');
                        if (!context) {
                            throw new Error('failed to create 2d context');
                        }
                        context.putImageData(imageData, 0, 0);
                        blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: quality ?? 0.9 });
                    } else {
                        // fallback for browsers without OffscreenCanvas
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const context = canvas.getContext('2d');
                        if (!context) {
                            throw new Error('failed to create 2d context');
                        }
                        context.putImageData(imageData, 0, 0);
                        blob = await new Promise<Blob>((resolve, reject) => {
                            canvas.toBlob(
                                (b) => (b ? resolve(b) : reject(new Error('failed to encode jpeg'))),
                                'image/jpeg',
                                quality ?? 0.9
                            );
                        });
                    }
                    bytes = new Uint8Array(await blob.arrayBuffer());
                    extension = 'jpg';
                    mimeType = 'image/jpeg';
                } else {
                    // construct the webp codec
                    if (!webpCodec) {
                        webpCodec = await WebPCodec.create();
                    }

                    bytes = webpCodec.encodeLosslessRGBA(data, width, height);
                    extension = 'webp';
                    mimeType = 'image/webp';
                }
            }

            if (fileStream) {
                await fileStream.write(bytes);
                await fileStream.close();
            } else {
                const suffix =
                    {
                        normal: '',
                        depth: '-depth',
                        overdraw: '-overdraw',
                        normals: '-normals',
                        alpha: '-alpha',
                        curvature: '-curvature',
                        edge: '-edge'
                    }[renderMode] ?? '';
                downloadFile(bytes, `${baseFilename()}${suffix}.${extension}`, mimeType);
            }

            return true;
        } catch (error) {
            // close the stream even on failure so the caller can remove the
            // empty file
            if (fileStream) {
                try {
                    await fileStream.close();
                } catch {
                    // stream already closed or errored
                }
            }

            await events.invoke('showPopup', {
                type: 'error',
                header: i18n.t('panel.render.failed'),
                message: `'${error.message ?? error}'`
            });

            return false;
        } finally {
            if (equirect) {
                scene.camera.setPoseOverride(null);
                scene.camera.fov = savedFov;
                scene.camera.ortho = savedOrtho;
                equirect.destroy();
                equirect = null;
            }

            scene.camera.captureFreeze = false;
            scene.camera.endOffscreenMode();
            scene.camera.depthRenderer.shrink();
            scene.camera.renderOverlays = prevOverlays;
            scene.captureRenderMode = null;
            scene.camera.captureDepthMethod = null;
            scene.camera.captureDepthRange = null;
            scene.gizmoLayer.enabled = prevGizmo;
            scene.centersLayer.enabled = prevCenters;
            scene.camera.clearPass.setClearColor(nullClr);
            scene.forceRender = true; // repaint the viewport with normal rendering

            if (wasPlaying) events.fire('timeline.setPlaying', true);
            events.fire('stopSpinner');
        }
    });

    events.function('render.video', (videoSettings: VideoSettings, fileStream: FileSystemWritableFileStream) => {
        const renderImpl = async () => {
            events.fire('progressStart', i18n.t('panel.render.render-video'), true);

            let cancelled = false;
            const cancelHandler = events.on('progressCancel', () => {
                cancelled = true;
            });
            let wasPlaying = false;
            let depthRangeLocked = false;
            const prevGizmo = scene.gizmoLayer.enabled;
            const prevCenters = scene.centersLayer.enabled;
            const prevOverlays = scene.camera.renderOverlays;
            let prevLocked = scene.lockedRenderMode;

            let encoder: VideoEncoder | null = null;
            let equirect: EquirectRenderer | null = null;
            let savedFov = 0;
            let savedOrtho = false;
            let output: Output | null = null;
            let muxerWrites = Promise.resolve();

            try {
                const {
                    startFrame,
                    endFrame,
                    frameRate,
                    width,
                    height,
                    transparentBg,
                    showDebug,
                    format,
                    codec: codecChoice,
                    projection,
                    levelHorizon
                } = videoSettings;

                const renderMode = videoSettings.renderMode ?? 'normal';
                const diagnostic = renderMode !== 'normal';
                const is360 = !diagnostic && projection === 'equirect';

                // Stop playback: the exporter drives timeline.time itself, and a
                // competing playback update would encode the wrong camera pose.
                wasPlaying = !!events.invoke('timeline.playing');
                if (wasPlaying) events.fire('timeline.setPlaying', false);

                // 360 mp4/mov exports have spherical metadata patched into the
                // finished buffer, so they render to memory with moov written
                // last (fastStart false) instead of streaming to disk
                const taggable = is360 && (format === 'mp4' || format === 'mov');

                const target = fileStream && !taggable ? new StreamTarget(fileStream) : new BufferTarget();

                // Configure output format and codec from lookup maps (default to mp4/h264)
                const formatConfig = FORMAT_CONFIG[format] ?? FORMAT_CONFIG.mp4;
                const outputFormat = formatConfig.create(taggable || !!fileStream);
                const fileExtension = formatConfig.extension;

                const encoderConfig = buildVideoEncoderConfig(videoSettings);
                const codecType = getVideoCodecType(codecChoice);

                output = new Output({
                    format: outputFormat,
                    target
                });

                const videoSource = new EncodedVideoPacketSource(codecType);
                output.addVideoTrack(videoSource, {
                    rotation: 0,
                    frameRate
                });

                await output.start();

                let encoderError: Error | null = null;
                let muxerError: Error | null = null;
                let muxerQueueSize = 0;

                // helper to create and configure a VideoEncoder instance
                const createEncoder = () => {
                    encoderError = null;
                    const enc = new VideoEncoder({
                        output: (chunk, meta) => {
                            const encodedPacket = EncodedPacket.fromEncodedChunk(chunk);
                            muxerQueueSize++;

                            // WebCodecs ignores a Promise returned by its output
                            // callback: awaiting the muxer here provides no
                            // backpressure, and a rejected write becomes an
                            // unhandled rejection that silently drops packets
                            // from the finished file. Chain the writes instead
                            // so failures surface via muxerError, muxerQueueSize
                            // drives backpressure in the encode loop, and every
                            // write has settled before output.finalize().
                            muxerWrites = muxerWrites
                                .then(async () => {
                                    if (!muxerError) {
                                        await videoSource.add(encodedPacket, meta);
                                    }
                                })
                                .catch((error) => {
                                    muxerError = error instanceof Error ? error : new Error(String(error));
                                })
                                .finally(() => {
                                    muxerQueueSize--;
                                });
                        },
                        error: (error) => {
                            encoderError = error;
                        }
                    });
                    enc.configure(encoderConfig);
                    return enc;
                };

                // fail fast on unsupported configurations (e.g. encoder
                // dimension limits) instead of erroring mid-render
                const support = await VideoEncoder.isConfigSupported(encoderConfig);
                if (!support.supported) {
                    throw new Error(`Unsupported video configuration (${codecChoice} @ ${width}x${height})`);
                }

                encoder = createEncoder();

                // in 360 mode the offscreen target is a square cube face; the
                // equirect target holds the output-sized frame
                const faceSize = Math.min(height, scene.graphicsDevice.maxTextureSize);

                // start rendering to offscreen buffer only
                scene.camera.startOffscreenMode(is360 ? faceSize : width, is360 ? faceSize : height);
                scene.camera.renderOverlays = diagnostic ? true : is360 ? false : showDebug;
                scene.captureRenderMode = renderMode;
                scene.camera.captureDepthMethod =
                    videoSettings.depthMethod === undefined ? null : normalizeDepthMethod(videoSettings.depthMethod);
                scene.gizmoLayer.enabled = false;
                scene.centersLayer.enabled = false;
                if (!transparentBg && !diagnostic) {
                    scene.camera.clearPass.setClearColor(events.invoke('bgClr'));
                }
                prevLocked = scene.lockedRenderMode;
                scene.lockedRenderMode = true;

                if (is360) {
                    savedFov = scene.camera.fov;
                    savedOrtho = scene.camera.ortho;
                    equirect = new EquirectRenderer(scene.graphicsDevice, faceSize, width, height);
                    scene.camera.ortho = false;
                }

                // cpu-side buffer to read pixels into
                const data = new Uint8Array(width * height * 4);

                // remember last camera position so we can skip sorting if the camera didn't move
                const last_pos = new Vec3(0, 0, 0);
                const last_forward = new Vec3(1, 0, 0);

                // helper to sort splats and wait for completion
                const sortAndWait = (splats: Splat[]) => sortSplatsAndWait(scene, splats);

                // prepare the frame for rendering, returns the newly loaded splat if any
                const prepareFrame = async (frameTime: number, skipSort = false): Promise<Splat | null> => {
                    // Fire timeline.time for camera animation interpolation
                    events.fire('timeline.time', frameTime);

                    // PLY sequences are discrete; choose the nearest timeline
                    // frame so float accumulation cannot select the frame before
                    // the intended one
                    const newSplat = (await events.invoke(
                        'plysequence.setFrameAsync',
                        Math.round(frameTime)
                    )) as Splat | null;

                    // manually update the camera so position and rotation are correct
                    scene.camera.onUpdate(0);

                    // 360 capture re-sorts per cube face, so skip sorting here
                    if (skipSort) {
                        return newSplat;
                    }

                    // If a new PLY was loaded, sort and wait for completion
                    if (newSplat) {
                        await sortAndWait([newSplat]);
                    } else {
                        // No new PLY - sort existing splats if camera moved
                        const pos = scene.camera.position;
                        const forward = scene.camera.forward;
                        if (!last_pos.equals(pos) || !last_forward.equals(forward)) {
                            last_pos.copy(pos);
                            last_forward.copy(forward);

                            const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(
                                (splat) => splat.visible
                            );
                            await sortAndWait(splats);
                        }
                    }

                    return newSplat;
                };

                // wrap and submit the pixels currently in the data buffer
                const encodeFrame = async (frameTime: number) => {
                    // construct the video frame
                    const videoFrame = new VideoFrame(data, {
                        format: 'RGBA',
                        codedWidth: width,
                        codedHeight: height,
                        timestamp: Math.floor(1e6 * frameTime),
                        duration: Math.floor(1e6 / frameRate)
                    });

                    // wait for encoder queue to drain if necessary (backpressure handling)
                    while (encoder.encodeQueueSize > MAX_QUEUE_SIZE) {
                        await new Promise<void>((resolve) => {
                            setTimeout(resolve, 1);
                        });
                    }
                    // muxerQueueSize is decremented by the write chain settling
                    // during the await

                    while (muxerQueueSize > MAX_QUEUE_SIZE) {
                        await muxerWrites;
                    }

                    // if the codec was reclaimed (e.g. browser backgrounded the tab),
                    // recreate the encoder and continue
                    let forceKeyFrame = false;
                    if (encoder.state === 'closed' && encoderError?.message?.includes('reclaimed')) {
                        encoder = createEncoder();
                        forceKeyFrame = true;
                    }

                    // check for non-recoverable encoder errors
                    if (encoderError || muxerError) {
                        videoFrame.close();
                        throw encoderError ?? muxerError;
                    }

                    encoder.encode(videoFrame, { keyFrame: forceKeyFrame });
                    videoFrame.close();
                };

                // capture the current video frame
                const captureFrame = async (frameTime: number) => {
                    const { mainTarget, workTarget } = scene.camera;

                    scene.dataProcessor.copyRt(mainTarget, workTarget, scene.overdrawRender, scene.alphaRender);

                    // read the rendered frame (immediate: see render.offscreen)
                    await workTarget.colorBuffer.read(0, 0, width, height, {
                        renderTarget: workTarget,
                        data,
                        immediate: true
                    });

                    await encodeFrame(frameTime);
                };

                const animFrameRate = events.invoke('timeline.frameRate');
                const duration = (endFrame - startFrame) / animFrameRate;
                const totalFrames = Math.floor(duration * frameRate) + 1;

                // work objects for 360 capture
                const camPos = new Vec3();
                const vec = new Vec3();
                const qCapture = new Quat();
                const qWorld = new Quat();

                // capture a 360 frame: render the six cube faces from the
                // animated camera position, re-sorting splats per face
                // direction, then project to equirect and encode
                const capture360 = async (frameTime: number) => {
                    // snapshot the animated camera pose. supersplat cameras
                    // never roll, so with level horizon the capture frame is
                    // the camera yaw, otherwise yaw and pitch
                    camPos.copy(scene.camera.position);
                    if (levelHorizon ?? true) {
                        qCapture.setFromEulerAngles(0, scene.camera.azim, 0);
                    } else {
                        qCapture.copy(scene.camera.mainCamera.getRotation());
                    }

                    // all faces share direction-independent clipping planes so
                    // near-plane culling cannot differ across a face boundary
                    const boundRadius = scene.bound.halfExtents.length();
                    const dist = vec.sub2(scene.bound.center, camPos).length();
                    const far = dist + boundRadius;
                    const near = Math.max(1e-6, dist < boundRadius ? far / (1024 * 16) : dist - boundRadius);

                    const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(
                        (splat) => splat.visible
                    );

                    for (let face = 0; face < 6; face++) {
                        // check for cancellation
                        if (cancelled) return;

                        qWorld.mul2(qCapture, EquirectRenderer.faceRotations[face]);
                        scene.camera.setPoseOverride({
                            position: camPos,
                            rotation: qWorld,
                            fov: EquirectRenderer.faceFov,
                            near,
                            far
                        });

                        // faces view different directions, so each render must
                        // wait for its own sort
                        await sortAndWait(splats);

                        // render a frame
                        scene.lockedRender = true;

                        // wait for render to finish
                        await postRender();

                        scene.dataProcessor.copyRt(scene.camera.mainTarget, equirect.faceTargets[face]);

                        const frameIndex = Math.round(frameTime * frameRate);
                        events.fire('progressUpdate', {
                            text: i18n.t('panel.render.rendering', { ellipsis: true }),
                            progress: (100 * (frameIndex + (face + 1) / 6)) / totalFrames
                        });
                    }

                    // project the faces to the equirect target and encode
                    equirect.project();
                    await equirect.read(data);
                    await encodeFrame(frameTime);
                };

                for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
                    const frameTime = frameIndex / frameRate;
                    // check for cancellation
                    if (cancelled) break;

                    if (is360) {
                        // restore animated-pose evaluation before the timeline
                        // advances (fov feeds the tween-to-position mapping)
                        scene.camera.setPoseOverride(null);
                        scene.camera.fov = savedFov;

                        // prepare the frame (loads PLY if needed, updates camera)
                        await prepareFrame(startFrame + frameTime * animFrameRate, true);

                        await capture360(frameTime);
                    } else {
                        // prepare the frame (loads PLY if needed, updates camera, sorts)
                        await prepareFrame(startFrame + frameTime * animFrameRate);

                        // render a frame
                        scene.lockedRender = true;

                        // wait for render to finish
                        await postRender();

                        // Freeze the first settled frame's auto range for the rest
                        // of the video. This keeps the still-image 2-98% histogram
                        // semantics while preventing per-frame renormalization.
                        if (
                            !depthRangeLocked &&
                            renderMode === 'depth' &&
                            events.invoke('view.depthRangeMode') === 'auto'
                        ) {
                            const depthRenderer = scene.camera.depthRenderer;
                            const range = depthRenderer.displayRange;
                            // An empty/stale first frame leaves [0, 1]; keep auto
                            // until a valid frame provides a real range.
                            if (
                                depthRenderer.ready &&
                                depthRenderer.validPixels > 0 &&
                                range[1] > range[0] &&
                                !(range[0] === 0 && range[1] === 1)
                            ) {
                                scene.camera.captureDepthRange = [range[0], range[1]];
                                depthRangeLocked = true;
                            }
                        }

                        // wait for capture
                        await captureFrame(frameTime);

                        events.fire('progressUpdate', {
                            text: i18n.t('panel.render.rendering', { ellipsis: true }),
                            progress: (100 * frameTime) / duration
                        });
                    }
                }

                // Flush and finalize output
                await encoder.flush();
                await muxerWrites;
                if (muxerError) {
                    throw muxerError;
                }
                await output.finalize();

                const filename = () => `${baseFilename()}.${fileExtension}`;

                if (taggable) {
                    // patch spherical metadata into the finished buffer so
                    // players auto-detect the equirectangular projection
                    if (!cancelled) {
                        let buffer = (target as BufferTarget).buffer;
                        try {
                            buffer = injectSphericalMetadata(buffer);
                        } catch (error) {
                            console.warn(`failed to inject spherical metadata: ${error.message ?? error}`);
                        }

                        if (fileStream) {
                            await fileStream.write(buffer);
                        } else {
                            downloadFile(buffer, filename());
                        }
                    }

                    // close the stream even when cancelled so the caller can
                    // remove the empty file
                    if (fileStream) {
                        await fileStream.close();
                    }
                } else if (!cancelled && !fileStream) {
                    // Download (skip if cancelled -- the caller will delete the file)
                    downloadFile((target as BufferTarget).buffer, filename());
                }

                return !cancelled;
            } catch (error) {
                // stop the encoder so no further packets are queued while
                // cleaning up
                if (encoder && encoder.state !== 'closed') {
                    encoder.close();
                }

                // the output's stream target holds a writer lock on the
                // destination file stream. drain in-flight muxer writes and
                // cancel the output to release it, otherwise the caller
                // cannot remove the partial file
                if (output) {
                    try {
                        await muxerWrites;
                        await output.cancel();
                    } catch {
                        // output already finalized or its target already closed
                    }
                }

                // tagged 360 exports write to the file stream directly, so
                // close it here too (mirrors render.image failure handling)
                if (fileStream) {
                    try {
                        await fileStream.close();
                    } catch {
                        // stream already closed or still locked by the output
                    }
                }

                await events.invoke('showPopup', {
                    type: 'error',
                    header: i18n.t('panel.render.failed'),
                    message: `'${(error as Error).message ?? error}'`
                });
                return false;
            } finally {
                if (encoder && encoder.state !== 'closed') {
                    encoder.close();
                }
                cancelHandler.off();

                if (equirect) {
                    scene.camera.setPoseOverride(null);
                    scene.camera.fov = savedFov;
                    scene.camera.ortho = savedOrtho;
                    equirect.destroy();
                    equirect = null;
                }

                scene.camera.endOffscreenMode();
                scene.camera.depthRenderer.shrink();
                scene.camera.renderOverlays = prevOverlays;
                scene.captureRenderMode = null;
                scene.camera.captureDepthMethod = null;
                scene.camera.captureDepthRange = null;
                scene.gizmoLayer.enabled = prevGizmo;
                scene.centersLayer.enabled = prevCenters;
                scene.camera.clearPass.setClearColor(nullClr);
                scene.lockedRenderMode = prevLocked;
                scene.forceRender = true; // camera likely moved, finish with normal render

                if (wasPlaying) events.fire('timeline.setPlaying', true);
                events.fire('progressEnd');
            }
        };

        // Acquire a Web Lock during encoding to signal the browser that this tab is
        // actively working, which helps prevent aggressive background throttling and
        // codec reclamation.
        if (navigator.locks) {
            return navigator.locks.request('supersplat-video-render', renderImpl);
        }
        return renderImpl();
    });
};

export { ImageSettings, registerRenderEvents };
export type { VideoSettings } from './video-config';
