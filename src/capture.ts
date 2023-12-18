import closeImage from './svg/ar-close.svg';

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
    return canvas;
    // return canvas.toDataURL('image/png');
};

const captureImages = async () => {
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%;');
    document.body.append(video);

    const stream = await startVideoFeed(video);

    const res = document.createElement('div');
    res.setAttribute('style', 'position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); color: white; font-size: 24px; text-shadow: 0 0 10px black; font-family: monospace;');
    document.body.append(res);

    const close = document.createElement('img');
    close.src = closeImage.src;
    close.setAttribute('style', 'position: absolute; bottom: 20px; left: 20px; width: 40px; height: 40px; color: white;');
    document.body.appendChild(close);

    // video dimensions are only valid after play event
    video.addEventListener('play', () => {
        res.textContent = `${video.videoWidth} x ${video.videoHeight}`;
    });

    // push capture state
    window.history.pushState('capture', undefined, '#Capture');

    // handle user interaction
    const result = await new Promise<HTMLCanvasElement[]>((resolve) => {
        const images: HTMLCanvasElement[] = [];

        video.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse') {
                navigator?.vibrate(200);
                images.push(captureImage(video));
            }
        });

        video.addEventListener('pointerup', (event) => {
            if (event.pointerType !== 'mouse') {
                navigator?.vibrate(200);
                images.push(captureImage(video));
            }
        });

        close.addEventListener('click', () => {
            history.back();
        });

        window.addEventListener('popstate', (event) => {
            resolve(images);
        }, false);
    });

    // cleanup
    (video.srcObject as MediaStream).getVideoTracks().forEach((track) => track.stop());
    document.body.removeChild(video);
    document.body.removeChild(close);
    document.body.removeChild(res);

    return result;
};

export {
    captureImages
};
