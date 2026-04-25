import { Events } from './events';

const THUMB_TIP = 4;
const INDEX_TIP = 8;

class GestureController {
    private events: Events;
    private video: HTMLVideoElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private handLandmarker: any = null;
    private active = false;
    private smoothedProgress = 0;
    private handVisible = false;
    private handLostTime = 0;

    constructor(events: Events) {
        this.events = events;

        // hidden video for webcam
        this.video = document.createElement('video');
        this.video.setAttribute('playsinline', '');
        this.video.setAttribute('autoplay', '');
        this.video.style.display = 'none';
        document.body.appendChild(this.video);

        // small preview canvas in corner
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'gesture-preview';
        this.canvas.width = 240;
        this.canvas.height = 180;
        this.canvas.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 16px;
            border: 2px solid #30363d;
            border-radius: 8px;
            z-index: 100;
            display: none;
            background: #000;
            transform: scaleX(-1);
        `;
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d')!;

        events.on('gesture.toggle', () => {
            if (this.active) this.stop(); else this.start();
        });
    }

    private async start() {
        if (this.active) return;
        console.log('[Gesture] Starting...');

        try {
            // dynamically import MediaPipe vision module
            const cdnUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs';
            const vision = await (new Function('url', 'return import(url)'))(cdnUrl);

            const { HandLandmarker, FilesetResolver } = vision;

            const resolver = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
            );

            this.handLandmarker = await HandLandmarker.createFromOptions(resolver, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
                    delegate: 'GPU'
                },
                runningMode: 'VIDEO',
                numHands: 1
            });

            console.log('[Gesture] HandLandmarker ready');

            // start webcam
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, facingMode: 'user' }
            });
            this.video.srcObject = stream;
            await this.video.play();

            this.active = true;
            this.canvas.style.display = 'block';
            this.smoothedProgress = 0;
            this.events.fire('gesture.active', true);

            // set dissolve effect as the active effect
            this.events.fire('particle.setEffect', 'dissolve');

            this.detect();
        } catch (err) {
            console.error('[Gesture] Failed:', err);
        }
    }

    private stop() {
        if (!this.active) return;
        this.active = false;
        this.canvas.style.display = 'none';

        const stream = this.video.srcObject as MediaStream;
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            this.video.srcObject = null;
        }

        // reset effect
        this.events.fire('particle.setProgress', 0);
        this.events.fire('gesture.active', false);
    }

    private detect() {
        if (!this.active) return;

        // draw camera feed
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

        const now = performance.now();
        const results = this.handLandmarker.detectForVideo(this.video, now);

        if (results.landmarks && results.landmarks.length > 0) {
            const hand = results.landmarks[0];
            this.handVisible = true;
            this.handLostTime = 0;

            // draw landmarks
            this.drawHand(hand);

            // pinch distance: thumb tip ↔ index tip
            const pinchDist = this.dist(hand[THUMB_TIP], hand[INDEX_TIP]);

            // map pinch to progress:
            // pinched (small distance ~0.03) → progress = 0 (intact scene)
            // spread  (large distance ~0.18) → progress = 1 (fully dissolved)
            const minD = 0.04;
            const maxD = 0.18;
            const targetProgress = Math.max(0, Math.min(1, (pinchDist - minD) / (maxD - minD)));

            // smooth
            this.smoothedProgress += (targetProgress - this.smoothedProgress) * 0.15;

            this.events.fire('particle.setProgress', this.smoothedProgress);

        } else {
            // hand not visible → slowly return to intact
            if (this.handVisible) {
                this.handVisible = false;
                this.handLostTime = now;
            }

            // after 0.5s of no hand, start fading back
            if (now - this.handLostTime > 500 && this.smoothedProgress > 0.001) {
                this.smoothedProgress *= 0.95; // exponential decay
                this.events.fire('particle.setProgress', this.smoothedProgress);
            }
        }

        requestAnimationFrame(() => this.detect());
    }

    private dist(a: any, b: any): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private drawHand(landmarks: any[]) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        const thumb = landmarks[THUMB_TIP];
        const index = landmarks[INDEX_TIP];

        // draw only thumb tip and index tip
        this.ctx.fillStyle = '#ffffff';
        for (const lm of [thumb, index]) {
            this.ctx.beginPath();
            this.ctx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // pinch line in white
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(thumb.x * w, thumb.y * h);
        this.ctx.lineTo(index.x * w, index.y * h);
        this.ctx.stroke();

        // progress bar at bottom of preview
        const pinchDist = this.dist(thumb, index);
        const progress = Math.max(0, Math.min(1, (pinchDist - 0.04) / (0.18 - 0.04)));
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(0, h - 8, w, 8);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, h - 8, w * this.smoothedProgress, 8);
    }
}

export { GestureController };
