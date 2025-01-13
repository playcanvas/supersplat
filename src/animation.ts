import { Events } from './events';
import { Splat } from './splat';

const registerAnimationEvents = (events: Events) => {
    // animation support
    let animationFiles: File[] = [];
    let animationSplat: Splat = null;
    let animationFrame = -1;
    let animationLoading = false;
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

        animationFiles = files.slice();
        animationFiles.sort(sorter);
        events.fire('animation.frames', animationFiles.length);
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
        if (frame < 0 || frame >= animationFiles.length) {
            return;
        }

        if (animationLoading) {
            nextFrame = frame;
            return;
        }

        if (frame === animationFrame) {
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
            animationSplat = null;
        }

        animationLoading = true;

        const file = animationFiles[frame];
        const url = URL.createObjectURL(file);
        const newSplat = await events.invoke('load', url, file.name, !animationSplat, true) as Splat;
        URL.revokeObjectURL(url);

        // wait for first frame render
        await firstRender(newSplat);

        // destroy the previous frame
        if (animationSplat) {
            animationSplat.destroy();
        }
        animationFrame = frame;
        animationSplat = newSplat;
        animationLoading = false;

        events.fire('animation.frame', frame);

        // initiate the next frame load
        if (nextFrame !== -1) {
            const frame = nextFrame;
            nextFrame = -1;
            setFrame(frame);
        }
    };

    events.function('animation.frames', () => {
        return animationFiles?.length ?? 0;
    });

    events.function('animation.frame', () => {
        return animationFrame;
    });

    events.on('animation.setFrames', (files: File[]) => {
        setFrames(files);
    });

    events.on('animation.setFrame', async (frame: number) => {
        await setFrame(frame);
    });
};

export { registerAnimationEvents };
