import { Events } from './events';
import { Splat } from './splat';

const registerPlySequenceEvents = (events: Events) => {
    let sequenceFiles: File[] = [];
    let sequenceSplat: Splat = null;
    let sequenceFrame = -1;
    let sequenceLoading = false;
    let nextFrame = -1;
    let loadingPromise: Promise<void> | null = null;

    const setFrames = (files: File[]) => {
        // eslint-disable-next-line regexp/no-super-linear-backtracking
        const regex = /(.*?)(\d+)(?:\.compressed)?\.ply$/;

        // sort frames by trailing number, if it exists
        const sorter = (a: File, b: File) => {
            const avalue = a.name?.toLowerCase().match(regex)?.[2];
            const bvalue = b.name?.toLowerCase().match(regex)?.[2];
            return (avalue && bvalue) ? parseInt(avalue, 10) - parseInt(bvalue, 10) : 0;
        };

        sequenceFiles = files.slice();
        sequenceFiles.sort(sorter);
        events.fire('timeline.frames', sequenceFiles.length);
    };

    // wait for the next render to complete
    const waitForRender = () => {
        return new Promise<void>((resolve) => {
            const off = events.on('postrender', () => {
                off.off();
                resolve();
            });
        });
    };

    const setFrame = async (frame: number) => {
        if (frame < 0 || frame >= sequenceFiles.length) {
            return;
        }

        if (sequenceLoading) {
            nextFrame = frame;
            return;
        }

        if (frame === sequenceFrame) {
            return;
        }

        // if user changed the scene, confirm
        if (events.invoke('scene.dirty')) {
            const result = await events.invoke('showPopup', {
                type: 'yesno',
                header: 'RESET SCENE',
                message: 'You have unsaved changes. Are you sure you want to reset the scene?'
            });

            if (result.action !== 'yes') {
                return;
            }

            events.fire('scene.clear');
            sequenceSplat = null;
        }

        sequenceLoading = true;

        const file = sequenceFiles[frame];
        const newSplat = await events.invoke('import', [{
            filename: file.name,
            contents: file
        }], true) as Splat[];

        // wait for the new splat to render before destroying the old one
        // (forceRender is already set by updateState during import)
        await waitForRender();

        // destroy the previous frame
        if (sequenceSplat) {
            sequenceSplat.destroy();
        }
        sequenceFrame = frame;
        sequenceSplat = newSplat[0];
        sequenceLoading = false;

        // initiate the next frame load
        if (nextFrame !== -1) {
            const frame = nextFrame;
            nextFrame = -1;
            setFrame(frame);
        }
    };

    events.on('plysequence.setFrames', (files: File[]) => {
        setFrames(files);
    });

    events.on('timeline.frame', async (frame: number) => {
        await setFrame(frame);
    });

    // Async function for video rendering to await PLY sequence frame loading
    // Returns the newly loaded splat if a new frame was loaded, null otherwise
    events.function('plysequence.setFrameAsync', async (frame: number): Promise<Splat | null> => {
        if (frame < 0 || frame >= sequenceFiles.length) {
            return null;
        }

        // If already on the correct frame and not loading, we're done
        if (sequenceFrame === frame && !sequenceLoading) {
            return null;
        }

        // If currently loading, wait for it to complete
        if (sequenceLoading && loadingPromise) {
            await loadingPromise;
        }

        // Check again after waiting - might have loaded our frame
        if (sequenceFrame === frame) {
            return null;
        }

        // Need to load the frame - create a promise we can await
        let newSplatResult: Splat | null = null;
        loadingPromise = (async () => {
            sequenceLoading = true;

            const file = sequenceFiles[frame];
            const newSplat = await events.invoke('import', [{
                filename: file.name,
                contents: file
            }], true) as Splat[];

            // destroy the previous frame
            if (sequenceSplat) {
                sequenceSplat.destroy();
            }
            sequenceFrame = frame;
            sequenceSplat = newSplat[0];
            newSplatResult = newSplat[0];
            sequenceLoading = false;
            loadingPromise = null;
        })();

        await loadingPromise;
        return newSplatResult;
    });
};

export { registerPlySequenceEvents };
