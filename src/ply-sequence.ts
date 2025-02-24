import { Events } from './events';
import { Splat } from './splat';

const registerPlySequenceEvents = (events: Events) => {
    let sequenceFiles: File[] = [];
    let sequenceSplat: Splat = null;
    let sequenceFrame = -1;
    let sequenceLoading = false;
    let nextFrame = -1;

    const setFrames = (files: File[]) => {
        // eslint-disable-next-line regexp/no-super-linear-backtracking
        const regex = /(.*?)(\d+).ply$/;

        // sort frames by trailing number, if it exists
        const sorter = (a: File, b: File) => {
            const avalue = a.name?.match(regex)?.[2];
            const bvalue = b.name?.match(regex)?.[2];
            return (avalue && bvalue) ? parseInt(avalue, 10) - parseInt(bvalue, 10) : 0;
        };

        sequenceFiles = files.slice();
        sequenceFiles.sort(sorter);
        events.fire('timeline.frames', sequenceFiles.length);
    };

    // resolves on first render frame
    const firstRender = (splat: Splat) => {
        return new Promise<void>((resolve) => {
            splat.entity.gsplat.instance.sorter.on('updated', (count) => {
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
        const url = URL.createObjectURL(file);
        const newSplat = await events.invoke('import', url, file.name, !sequenceSplat, true) as Splat;
        URL.revokeObjectURL(url);

        // wait for first frame render
        await firstRender(newSplat);

        // destroy the previous frame
        if (sequenceSplat) {
            sequenceSplat.destroy();
        }
        sequenceFrame = frame;
        sequenceSplat = newSplat;
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
};

export { registerPlySequenceEvents };
