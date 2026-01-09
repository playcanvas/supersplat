/**
 * WebGPU device management for SOG compression.
 * Creates a standalone WebGPU graphics device using PlayCanvas's WebgpuGraphicsDevice.
 */

import {
    PIXELFORMAT_BGRA8,
    Texture,
    WebgpuGraphicsDevice
} from 'playcanvas';

/**
 * Wrapper for a WebGPU graphics device used for compute operations.
 */
class GpuDevice {
    device: WebgpuGraphicsDevice;
    private backbuffer: Texture;

    constructor(device: WebgpuGraphicsDevice, backbuffer: Texture) {
        this.device = device;
        this.backbuffer = backbuffer;
    }

    destroy() {
        this.backbuffer.destroy();
        this.device.destroy();
    }
}

// Cached GPU device for reuse across exports
let cachedDevice: GpuDevice | null = null;

/**
 * Create or retrieve a cached WebGPU device for compute operations.
 * The device is created once and reused for subsequent exports.
 *
 * @returns Promise resolving to a GpuDevice
 * @throws Error if WebGPU is not available
 */
const getGpuDevice = async (): Promise<GpuDevice> => {
    if (cachedDevice) {
        return cachedDevice;
    }

    if (!navigator.gpu) {
        throw new Error('WebGPU is not available in this browser');
    }

    // Create a minimal canvas for the graphics device
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;

    const graphicsDevice = new WebgpuGraphicsDevice(canvas, {
        antialias: false,
        depth: false,
        stencil: false
    });

    await graphicsDevice.createDevice();

    // Create external backbuffer (required by PlayCanvas)
    const backbuffer = new Texture(graphicsDevice, {
        width: 1024,
        height: 512,
        name: 'SogComputeBackbuffer',
        mipmaps: false,
        format: PIXELFORMAT_BGRA8
    });

    // @ts-ignore - externalBackbuffer is an internal property
    graphicsDevice.externalBackbuffer = backbuffer;

    cachedDevice = new GpuDevice(graphicsDevice, backbuffer);
    return cachedDevice;
};

/**
 * Destroy the cached GPU device if it exists.
 * Call this when cleaning up resources.
 */
const destroyGpuDevice = () => {
    if (cachedDevice) {
        cachedDevice.destroy();
        cachedDevice = null;
    }
};

export { GpuDevice, getGpuDevice, destroyGpuDevice };
