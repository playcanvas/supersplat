import type { Asset, Quat } from 'playcanvas';

import { EditorSplatResource } from './editor-splat-resource';
import type { Element } from './element';
import type { Events } from './events';
import type { GsafReader } from './io';
import { loadSplatSource, MappedReadFileSystem } from './io';
import type { Scene } from './scene';
import { Splat } from './splat';

type FrameData = {
    asset: Asset;
    rotation: Quat;
};

// A source of animation frames. getFrame produces a ready gsplat Asset (plus the
// orientation to apply when the persistent splat is first created) for a frame.
interface FrameSource {
    readonly frameCount: number;
    getFrame(index: number): Promise<FrameData>;
    destroy(): void;
}

// load one PLY frame into a gsplat Asset named assetName
const loadPlyFrame = async (scene: Scene, file: File, assetName = file.name): Promise<FrameData> => {
    const fileSystem = new MappedReadFileSystem();
    fileSystem.addFile(file.name, file);

    // skipReorder: animation frames prioritise load speed over morton ordering
    const { source, transform } = await loadSplatSource(file.name, fileSystem, true);
    const resource = await EditorSplatResource.create(scene.graphicsDevice, source);
    const asset = scene.assetLoader.createGSplatAsset(resource, assetName);
    return { asset, rotation: transform.rotation };
};

// PLY sequence: a set of frameNNNN.ply files, sorted by trailing frame number.
class PlyFrameSource implements FrameSource {
    private files: File[];
    private scene: Scene;

    constructor(files: File[], scene: Scene) {
        this.scene = scene;

        const regex = /(.*?)(\d+)(?:\.compressed)?\.ply$/;
        const key = (f: File) => f.name?.toLowerCase().match(regex)?.[2];
        this.files = files.slice().sort((a, b) => {
            const av = key(a);
            const bv = key(b);
            return av && bv ? parseInt(av, 10) - parseInt(bv, 10) : 0;
        });
    }

    get frameCount() {
        return this.files.length;
    }

    getFrame(index: number): Promise<FrameData> {
        return loadPlyFrame(this.scene, this.files[index]);
    }

    destroy() {
        // nothing to release
    }
}

// GSAF file: each frame is decoded to an in-memory PLY and loaded like a PLY sequence frame,
// so it can be compared directly with the frames it was encoded from.
class GsafFrameSource implements FrameSource {
    private reader: GsafReader;
    private filename: string;
    private scene: Scene;

    constructor(reader: GsafReader, filename: string, scene: Scene) {
        this.reader = reader;
        this.filename = filename;
        this.scene = scene;
    }

    get frameCount() {
        return this.reader.frameCount;
    }

    getFrame(index: number): Promise<FrameData> {
        const file = new File([this.reader.decodeFramePly(index)], `${this.filename}.${index}.ply`);
        return loadPlyFrame(this.scene, file, this.filename);
    }

    destroy() {
        this.reader.destroy();
    }
}

// One loaded sequence: its frame source, and the persistent Splat element whose gaussian
// data is swapped in place each frame (Splat.replaceData). This keeps the user's whole-model
// transform and visual properties across frames and avoids a full element teardown/recreate.
class Sequence {
    readonly source: FrameSource;
    splat: Splat | null = null;
    currentFrame = -1;
    // the frame load in flight, if any
    loading: Promise<void> | null = null;
    // the most recent frame requested while a load was in flight
    nextFrame = -1;
    // set once the sequence is dropped (its splat deleted, or the scene cleared)
    removed = false;

    constructor(source: FrameSource) {
        this.source = source;
    }
}

/**
 * Manages animation-sequence playback (PLY sequences and GSAF files). Any number of
 * sequences can be loaded at once and the timeline drives them all, so a GSAF file can be
 * played against the PLY sequence it was encoded from.
 */
const registerSequenceEvents = (events: Events, scene: Scene) => {
    let sequences: Sequence[] = [];
    let idleWaiters: (() => void)[] = [];
    // video-export frames waiting or loading. While any are, setFrame queues playback's frames
    // instead of starting loads, so playback cannot keep a sequence busy ahead of the export
    let exportsPending = 0;

    const isLoading = () => sequences.some((seq) => seq.loading);

    // resolve waiters once no frame is loading or queued behind a current load
    const notifyIdle = () => {
        if (!isLoading()) {
            idleWaiters.forEach((resolve) => resolve());
            idleWaiters = [];
        }
    };

    // release an asset whose load was abandoned (sequence dropped mid-load)
    const discardAsset = (asset: Asset) => {
        asset.registry?.remove(asset);
        asset.unload();
    };

    // the timeline runs as long as the longest sequence
    const updateTimelineFrames = () => {
        if (sequences.length) {
            events.fire('timeline.frames', Math.max(...sequences.map((seq) => seq.source.frameCount)));
        }
    };

    // the sequence's frame at timeline frame `frame`: a shorter sequence holds its last frame
    const frameFor = (seq: Sequence, frame: number) => Math.min(frame, seq.source.frameCount - 1);

    // load a frame into the sequence's persistent splat, creating it on the first frame
    const loadFrame = async (seq: Sequence, frame: number) => {
        const data = await seq.source.getFrame(frame);
        if (seq.removed) {
            // dropped while loading: discard this frame's asset rather than applying it
            discardAsset(data.asset);
            return;
        }
        if (!seq.splat) {
            seq.splat = new Splat(data.asset, data.rotation);
            await scene.add(seq.splat);
        } else {
            // in-place swap: preserves entity transform, visual props and selection.
            // replaceData keeps the previous frame on screen until the new one has
            // rendered, so no extra wait is needed
            await seq.splat.replaceData(data.asset);
        }
        seq.currentFrame = frame;
    };

    const setFrame = async (seq: Sequence, frame: number) => {
        if (seq.removed || frame < 0) {
            return;
        }
        frame = frameFor(seq, frame);

        // coalesce while a frame is in flight (rapid scrubbing) or an export frame is pending
        if (seq.loading || exportsPending) {
            seq.nextFrame = frame;
            return;
        }

        if (frame === seq.currentFrame) {
            return;
        }

        seq.loading = loadFrame(seq, frame).catch((error) => console.error(error));
        await seq.loading;
        seq.loading = null;

        // process the most recent frame requested while we were loading, unless an export
        // frame is pending: the export resumes the queue when it is done
        if (seq.nextFrame !== -1 && !exportsPending) {
            const frameToLoad = seq.nextFrame;
            seq.nextFrame = -1;
            setFrame(seq, frameToLoad);
        }

        // a follow-up load above sets loading synchronously and notifies when it ends
        notifyIdle();
    };

    const addSource = (source: FrameSource) => {
        const seq = new Sequence(source);
        sequences.push(seq);
        updateTimelineFrames();
        // start at the playhead, in step with any sequences already loaded
        setFrame(seq, events.invoke('timeline.frame'));
    };

    const removeSequence = (seq: Sequence) => {
        seq.removed = true;
        seq.source.destroy();
        sequences = sequences.filter((s) => s !== seq);
        updateTimelineFrames();
    };

    events.on('sequence.setPlyFrames', (files: File[]) => {
        addSource(new PlyFrameSource(files, scene));
    });

    events.on('sequence.setGsaf', (reader: GsafReader, filename: string) => {
        addSource(new GsafFrameSource(reader, filename, scene));
    });

    events.on('timeline.frame', (frame: number) => {
        for (const seq of sequences) {
            setFrame(seq, frame);
        }
    });

    // drop a sequence when its splat is deleted
    events.on('scene.elementDestroyed', (element: Element) => {
        const seq = sequences.find((s) => s.splat === element);
        if (seq) {
            removeSequence(seq);
        }
    });

    // drop every sequence when the scene is cleared (scene.clear destroys the splats)
    events.on('scene.clear', () => {
        for (const seq of sequences) {
            seq.removed = true;
            seq.source.destroy();
        }
        sequences = [];
    });

    // Async per-frame advance for the video renderer (render.ts). Awaits each sequence's
    // frame swap so its splat is ready to sort, then returns the splats whose frame actually
    // changed. Name kept for render.ts.
    events.function('plysequence.setFrameAsync', async (frame: number): Promise<Splat[]> => {
        const changed: Splat[] = [];
        if (frame < 0) {
            return changed;
        }

        exportsPending++;
        try {
            for (const seq of sequences.slice()) {
                const target = frameFor(seq, frame);

                // let a load already in flight finish: with an export pending, a frame
                // requested meanwhile is queued rather than loaded after it
                if (seq.loading) {
                    await seq.loading;
                }

                if (seq.removed || seq.currentFrame === target) {
                    continue;
                }

                seq.loading = loadFrame(seq, target);
                try {
                    await seq.loading;
                } finally {
                    seq.loading = null;
                    notifyIdle();
                }
                if (seq.splat) {
                    changed.push(seq.splat);
                }
            }
        } finally {
            exportsPending--;
            // load the latest frame playback queued while the export held the sequences
            if (!exportsPending) {
                for (const seq of sequences) {
                    if (seq.nextFrame !== -1 && !seq.loading) {
                        const frameToLoad = seq.nextFrame;
                        seq.nextFrame = -1;
                        setFrame(seq, frameToLoad);
                    }
                }
            }
        }
        return changed;
    });

    // resolves once every sequence's frame for the current playhead has been swapped in, so
    // callers that move the playhead can wait for its data (no-op without a sequence)
    events.function('sequence.idle', (): Promise<void> => {
        return isLoading() ? new Promise((resolve) => idleWaiters.push(resolve)) : Promise.resolve();
    });
};

export { registerSequenceEvents };
