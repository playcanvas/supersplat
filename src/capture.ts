
// request video feed
const startVideoFeed = async (video: HTMLVideoElement) => {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: "environment"
        }
    });

    video.srcObject = stream;

    const promises: Promise<any>[] = [];

    stream.getVideoTracks().forEach((track: MediaStreamTrack) => {
        console.log(`caps: ${JSON.stringify(track.getCapabilities(), null, 2)} constraints: ${JSON.stringify(track.getConstraints(), null, 2)} settings: ${JSON.stringify(track.getSettings(), null, 2)}}`);

        // attempt resizing the video to max reported resolution
        promises.push(track.applyConstraints({
            width: track.getCapabilities().width.max,
            height: track.getCapabilities().height.max,
        }));
    });

    await Promise.all(promises);

    console.log('connected');

    return stream;
};

const captureImage = (video: HTMLVideoElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    console.log(`capturing image ${canvas.width}x${canvas.height}`);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
};

const captureImages = async () => {
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%;');
    document.body.append(video);

    const stream = await startVideoFeed(video);

    const buttonStyle = 'position: absolute; bottom: 10px; width: 40px; height: 40px; font-size: 24px; background-color: rgba(0, 0, 0, 0.25); text-align: center; line-height: 40px; vertical-align: middle;';

    // create UI
    const done = document.createElement('div');
    done.textContent = '✅';
    done.setAttribute('style', `${buttonStyle} left: 10px;`);
    document.body.append(done);

    const cancel = document.createElement('div');
    cancel.textContent = '❌';
    cancel.setAttribute('style', `${buttonStyle} right: 10px;`);
    document.body.append(cancel);

    const res = document.createElement('div');
    res.setAttribute('style', 'position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); color: white; font-size: 24px; text-shadow: 0 0 10px black; font-family: monospace;');
    document.body.append(res);

    // video dimensions are only valid after play event
    video.addEventListener('play', () => {
        res.textContent = `${video.videoWidth} x ${video.videoHeight}`;
    });

    // handle user interaction
    const result = await new Promise((resolve) => {
        const images: string[] = [];

        video.addEventListener('pointerdown', (event) => {
            navigator?.vibrate(10);
            images.push(captureImage(video));
        });

        done.addEventListener('click', () => {
            resolve(images);
        });

        cancel.addEventListener('click', () => {
            resolve([]);
        });
    });

    // cleanup
    video.srcObject.getVideoTracks().forEach((track) => track.stop());
    document.body.removeChild(video);
    document.body.removeChild(done);
    document.body.removeChild(cancel);
    document.body.removeChild(res);

    return result;
};

export {
    captureImages
};
