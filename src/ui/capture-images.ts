import { startSpinner, stopSpinner } from './spinner';
import { reviewCapture } from './capture-review';
import * as zip from "@zip.js/zip.js";
import closeImage from '../svg/ar-close.svg';
import shutterImage from '../svg/shutter.svg';

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

    startSpinner();

    const stream = await startVideoFeed(video);

    stopSpinner();

    const infoText = document.createElement('div');
    infoText.classList.add('capture-info-text');
    document.body.append(infoText);

    const shutter = document.createElement('img');
    shutter.src = shutterImage.src;
    shutter.setAttribute('style', 'position: absolute; bottom: 40px; left: 50%; transform: translate(-50%);');
    document.body.appendChild(shutter);

    const close = document.createElement('img');
    close.src = closeImage.src;
    close.setAttribute('style', 'position: absolute; bottom: 40px; left: 20px; width: 40px; height: 40px; color: white; background-color: rgba(0, 0, 0, 0.5);');
    document.body.appendChild(close);

    // video dimensions are only valid after play event
    let videoWidth, videoHeight;
    video.addEventListener('play', () => {
        videoWidth = video.videoWidth;
        videoHeight = video.videoHeight;
    });

    const url = new URL(window.location.href);
    url.hash = '#Capture';

    // push capture state
    window.history.pushState('capture', undefined, url.toString());

    // handle user interaction
    const result = await new Promise<HTMLCanvasElement[]>((resolve) => {
        const images: HTMLCanvasElement[] = [];

        const updateInfoText = () => {
            infoText.textContent = `Capturing image ${images.length + 1}`;
        };

        const doCapture = () => {
            images.push(captureImage(video));
            updateInfoText();
        };

        updateInfoText();

        video.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse') {
                navigator?.vibrate(200);
                doCapture();
            }
        });

        video.addEventListener('pointerup', (event) => {
            if (event.pointerType !== 'mouse') {
                navigator?.vibrate(200);
                doCapture();
            }
        });

        shutter.addEventListener('click', () => {
            shutter.classList.add('fadeinout');
            navigator?.vibrate(200);
            doCapture();
        });

        shutter.addEventListener("animationend", () => {
            console.log('animationend');
            shutter.classList.remove('fadeinout');
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
    document.body.removeChild(infoText);
    document.body.removeChild(shutter);

    return result;
};

const captureReviewUploadImages = async () => {
    const toBlob = (canvas: HTMLCanvasElement) => {
        return new Promise<Blob>((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });
    };

    const uploadImagePack = async (captureName: string, data: Blob) => {
        const origin = location.origin;

        // get signed url
        const urlResponse = await fetch(`${origin}/api/projects/upload/signed-url`);
        if (!urlResponse.ok) {
            console.log(`failed to get signed url (${urlResponse.statusText})`);
            return;
        }

        const json = await urlResponse.json();

        console.log(JSON.stringify(json, null, 2));

        // upload the file to S3
        const uploadResponse = await fetch(json.signedUrl, {
            method: 'PUT',
            body: data,
            headers: {
                'Content-Type': 'binary/octet-stream'
            }
        });

        if (!uploadResponse.ok) {
            console.log(`failed to upload file (${uploadResponse.statusText})`);
            return;
        }

        // kick off processing
        const jobResponse = await fetch(`${origin}/api/splats`, {
            method: 'POST',
            body: JSON.stringify({
                filename: `${captureName}.ply`,
                s3Key: json.s3Key
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!jobResponse.ok) {
            console.log(`failed to start job (${jobResponse.statusText})`);
            return;
        }

        console.log('done');
    };

    // download the data uri
    const download = (filename: string, blob: Blob) => {
        const url = window.URL.createObjectURL(blob);

        const lnk = document.createElement('a');
        lnk.download = filename;
        lnk.href = url;

        // create a "fake" click-event to trigger the download
        if (document.createEvent) {
            const e = document.createEvent("MouseEvents");
            e.initMouseEvent("click", true, true, window,
                            0, 0, 0, 0, 0, false, false, false,
                            false, 0, null);
            lnk.dispatchEvent(e);
        } else {
            // @ts-ignore
            lnk.fireEvent?.("onclick");
        }

        window.URL.revokeObjectURL(url);
    };


    // launch capture
    const images: HTMLCanvasElement[] = await captureImages();

    // process images
    if (images.length) {
        const captureName = await reviewCapture(images);
        if (captureName) {
            const blobWriter = new zip.BlobWriter();
            const writer = new zip.ZipWriter(blobWriter);

            const infoText = document.createElement('div');
            infoText.classList.add('capture-info-text');
            infoText.textContent = 'Generating zip...';
            document.body.append(infoText);
            startSpinner();

            for (let i = 0; i < images.length; ++i) {
                const blob = await toBlob(images[i]);
                await writer.add(`data/input/image_${String(i).padStart(4, '0')}.png`, new zip.BlobReader(blob), {
                    // web workers don't seem to work
                    useWebWorkers: false
                });
            }

            await writer.close();
            const data = await blobWriter.getData();

            infoText.textContent = 'Uploading...';

            // submit image pack
            await uploadImagePack(captureName, data);

            // (TEMP) download the capture zip
            // download('capture.zip', data);

            document.body.removeChild(infoText);
            stopSpinner();
        }
    }
};

export {
    captureReviewUploadImages
};
