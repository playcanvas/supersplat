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
        // console.log(`caps: ${JSON.stringify(track.getCapabilities(), null, 2)} constraints: ${JSON.stringify(track.getConstraints(), null, 2)} settings: ${JSON.stringify(track.getSettings(), null, 2)}}`);

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

function ImageProcessorWorker() {
    const getOutputDim = (imageBitmap: ImageBitmap | ImageData, outputMax: number) => {
        const inputMax = Math.max(imageBitmap.width, imageBitmap.height);
        const outputDim = Math.min(outputMax, inputMax);
        return {
            w: Math.ceil((imageBitmap.width / inputMax) * outputDim),
            h: Math.ceil((imageBitmap.height / inputMax) * outputDim)
        };
    };

    const processImage = async (data: any) => {
        const { id, imageBitmap, outputMax } = data;
        const outputDim = getOutputDim(imageBitmap, outputMax);

        const sizedBitmap = await createImageBitmap(imageBitmap, {
            premultiplyAlpha: 'none',
            resizeWidth: outputDim.w,
            resizeHeight: outputDim.h,
            resizeQuality: 'high'
        });

        const previewDim = getOutputDim(sizedBitmap, 100);

        const previewBitmap = await createImageBitmap(sizedBitmap, {
            premultiplyAlpha: 'none',
            resizeWidth: previewDim.w,
            resizeHeight: previewDim.h,
            resizeQuality: 'high'
        });

        const toCanvas = (imageBitmap: ImageBitmap) => {
            const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
            const context = canvas.getContext('bitmaprenderer');
            context.transferFromImageBitmap(imageBitmap);
            return canvas;
        };

        const toBlob = async (imageBitmap: ImageBitmap) => {
            const canvas = toCanvas(imageBitmap);
            return await canvas.convertToBlob({ quality: 1 });
        };

        return {
            id,
            result: {
                blob: await toBlob(sizedBitmap),
                preview: previewBitmap
            }
        };
    };

    self.onmessage = (message) => {
        processImage(message.data).then((result) => {
            postMessage(result, [result.result.preview]);
        });
    };
}

class ImageProcessor {
    worker: Worker;
    nextId = 0;
    jobs = new Map<number, (result: any) => void>();

    constructor() {
        this.worker = new Worker(URL.createObjectURL(new Blob([`(${ImageProcessorWorker.toString()})()`])));
        this.worker.onmessage = (message) => {
            this.jobs.get(message.data.id)(message.data.result);
            this.jobs.delete(message.data.id);
        };
    }

    destroy() {
        this.worker.terminate();
    }

    captureImage(video: HTMLVideoElement, outputMax = 1600) {
        const id = this.nextId++;
        return new Promise<{ blob: Blob, preview: ImageBitmap }>((resolve) => {
            this.jobs.set(id, resolve);
            createImageBitmap(video, { premultiplyAlpha: 'none' })
            .then((imageBitmap: ImageBitmap) => {
                this.worker.postMessage({ id, imageBitmap, outputMax }, [imageBitmap]);
            });
        });
    }
}

const captureImages = async () => {
    const createElement = (type: string, id: string) => {
        const result = document.createElement(type);
        result.setAttribute('id', id);
        return result;
    };

    startSpinner();

    const video = createElement('video', 'capture-images-video') as HTMLVideoElement;
    video.autoplay = true;
    video.playsInline = true;

    const stream = await startVideoFeed(video);

    const infoText = createElement('div', 'capture-images-text');

    const close = createElement('img', 'capture-images-close') as HTMLImageElement;
    close.src = closeImage.src;
    close.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });

    const shutter = createElement('img', 'capture-images-shutter') as HTMLImageElement;
    shutter.src = shutterImage.src;
    shutter.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });

    const controlBar = createElement('div', 'capture-images-control-bar');
    controlBar.appendChild(close);
    controlBar.appendChild(shutter);

    const container = createElement('div', 'capture-images-container');
    container.appendChild(video);
    container.appendChild(infoText);
    container.appendChild(controlBar);

    document.body.append(container);

    stopSpinner();

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

    const imageProcessor = new ImageProcessor();

    // handle user interaction
    const result = await new Promise<{ blob: Blob, preview: ImageBitmap }[]>((resolve) => {
        const images: Promise<{ blob: Blob, preview: ImageBitmap }>[] = [];

        const updateInfoText = () => {
            infoText.textContent = `Capturing image ${images.length + 1}`;
        };

        const doCapture = () => {
            images.push(imageProcessor.captureImage(video));
            updateInfoText();

            shutter.style.animation = `shutterAnim${images.length % 2} 0.2s ease-in-out`;
            video.style.animation = `videoAnim${images.length % 2} 0.2s ease-in-out`;
            navigator?.vibrate?.(20);
        };

        updateInfoText();

        video.addEventListener('pointerdown', (event) => {
            doCapture();
        });

        shutter.addEventListener('pointerdown', () => {
            doCapture();
        });

        close.addEventListener('click', () => {
            history.back();
        });

        window.addEventListener('popstate', (event) => {
            Promise.all(images).then((images) => {
                resolve(images);
            });
        }, false);
    });

    // cleanup
    (video.srcObject as MediaStream).getVideoTracks().forEach((track) => track.stop());
    document.body.removeChild(container);
    imageProcessor.destroy();

    return result;
};

const captureReviewUploadImages = async () => {
    const uploadImagePack = async (captureName: string, data: Blob) => {
        const origin = location.origin;

        // get signed url
        const urlResponse = await fetch(`${origin}/api/upload/signed-url`, { method: 'POST' });
        if (!urlResponse.ok) {
            window.showError(`Failed to get signed url (${urlResponse.statusText})`);
            return;
        }

        const json = await urlResponse.json();

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
    const images: { blob: Blob, preview: ImageBitmap }[] = await captureImages();

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
                await writer.add(`data/input/image_${String(i).padStart(4, '0')}.png`, new zip.BlobReader(images[i].blob), {
                    useWebWorkers: false,       // web workers don't seem to work
                    level: 0                    // no need to spend time compressing png/jpeg/webp
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
