import { Asset, Quat } from 'playcanvas';

import { Events } from './events';
import { loadGSplatData, MappedReadFileSystem, validateGSplatData } from './io';
import { Scene } from './scene';
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

// PLY sequence: a set of frameNNNN.ply files, sorted by trailing frame number.
class PlyFrameSource implements FrameSource {
    private files: File[];
    private scene: Scene;

    constructor(files: File[], scene: Scene) {
        this.scene = scene;

        // eslint-disable-next-line regexp/no-super-linear-backtracking
        const regex = /(.*?)(\d+)(?:\.compressed)?\.ply$/;
        const key = (f: File) => f.name?.toLowerCase().match(regex)?.[2];
        this.files = files.slice().sort((a, b) => {
            const av = key(a);
            const bv = key(b);
            return (av && bv) ? parseInt(av, 10) - parseInt(bv, 10) : 0;
        });
    }

    get frameCount() {
        return this.files.length;
    }

    async getFrame(index: number): Promise<FrameData> {
        const file = this.files[index];
        const fileSystem = new MappedReadFileSystem();
        fileSystem.addFile(file.name, file);

        // skipReorder: animation frames prioritise load speed over morton ordering
        const { gsplatData, transform } = await loadGSplatData(file.name, fileSystem, true);
        validateGSplatData(gsplatData);

        const asset = this.scene.assetLoader.createGSplatAsset(gsplatData, file.name);
        return { asset, rotation: transform.rotation };
    }

    destroy() {}
}

/**
 * Manages animation-sequence playback (PLY sequence).
 *
 * A sequence is rendered by a single persistent Splat element whose gaussian data
 * is swapped in place each frame (Splat.replaceData). This keeps the user's
 * whole-model transform and visual properties across frames and avoids the full
 * element teardown/recreate (and scene-reset prompt) of the previous approach.
 */
const registerSequenceEvents = (events: Events, scene: Scene) => {
    let source: FrameSource | null = null;
    let splat: Splat | null = null;
    let currentFrame = -1;
    let loading = false;
    let nextFrame = -1;
    let loadingPromise: Promise<void> | null = null;

    // apply a frame's data to the persistent splat, creating it on the first frame
    const applyFrame = async (data: FrameData) => {
        if (!splat) {
            splat = new Splat(data.asset, data.rotation);
            await scene.add(splat);
        } else {
            // in-place swap: preserves entity transform, visual props and selection
            await splat.replaceData(data.asset);
        }
    };

    // release an asset whose load was abandoned (source switched mid-load)
    const discardAsset = (asset: Asset) => {
        asset.registry?.remove(asset);
        asset.unload();
    };

    const setSource = (newSource: FrameSource) => {
        source?.destroy();
        source = newSource;
        currentFrame = -1;
        nextFrame = -1;

        // tear down the previous sequence's splat so the new source's first frame
        // is bound as an initial load (applying its rotation/name) rather than
        // swapped onto the old element
        if (splat) {
            scene.remove(splat);
            splat.destroy();
            splat = null;
        }

        events.fire('timeline.frames', source.frameCount);
    };

    const setFrame = async (frame: number) => {
        if (!source || frame < 0 || frame >= source.frameCount) {
            return;
        }

        // coalesce while a frame is in flight (rapid scrubbing)
        if (loading) {
            nextFrame = frame;
            return;
        }

        if (frame === currentFrame) {
            return;
        }

        loading = true;
        const loadSource = source;
        try {
            const data = await source.getFrame(frame);
            if (source !== loadSource) {
                // source was switched (or the scene cleared) while loading — discard
                // this frame's asset rather than applying a stale one
                discardAsset(data.asset);
            } else {
                // applyFrame swaps data in place; replaceData keeps the previous frame
                // on screen until the new one has rendered, so no extra wait is needed
                await applyFrame(data);
                currentFrame = frame;
            }
        } catch (error) {
            console.error(error);
        } finally {
            loading = false;
        }

        // process the most recent frame requested while we were loading
        if (nextFrame !== -1) {
            const frameToLoad = nextFrame;
            nextFrame = -1;
            setFrame(frameToLoad);
        }
    };

    events.on('sequence.setPlyFrames', (files: File[]) => {
        setSource(new PlyFrameSource(files, scene));
    });

    events.on('timeline.frame', async (frame: number) => {
        await setFrame(frame);
    });

    // drop references when the scene is cleared (scene.clear destroys the splat)
    events.on('scene.clear', () => {
        source?.destroy();
        source = null;
        splat = null;
        currentFrame = -1;
        nextFrame = -1;
    });

    // Async per-frame advance for the video renderer (render.ts). Awaits the frame
    // swap so the splat is ready to sort, then returns the (persistent) splat when
    // the frame actually changed, or null when it didn't. Name kept for render.ts.
    events.function('plysequence.setFrameAsync', async (frame: number): Promise<Splat | null> => {
        if (!source || frame < 0 || frame >= source.frameCount) {
            return null;
        }

        if (currentFrame === frame && !loading) {
            return null;
        }

        // if a load is already in flight, wait for it before deciding
        if (loading && loadingPromise) {
            await loadingPromise;
        }

        if (currentFrame === frame) {
            return null;
        }

        loadingPromise = (async () => {
            loading = true;
            const loadSource = source;
            try {
                const data = await source.getFrame(frame);
                if (source !== loadSource) {
                    // source switched / scene cleared mid-load — discard the asset
                    discardAsset(data.asset);
                } else {
                    await applyFrame(data);
                    currentFrame = frame;
                }
            } finally {
                loading = false;
                loadingPromise = null;
            }
        })();

        await loadingPromise;
        return splat;
    });
};

export { registerSequenceEvents };
