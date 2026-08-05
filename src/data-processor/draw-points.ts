import type { BlendState, GraphicsDevice, RenderTarget, Shader } from 'playcanvas';
import { PRIMITIVE_POINTS, SEMANTIC_POSITION, TYPE_FLOAT32, DepthState, VertexBuffer, VertexFormat } from 'playcanvas';

type DeviceState = GraphicsDevice & {
    renderTarget: RenderTarget;
    vx: number;
    vy: number;
    vw: number;
    vh: number;
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    updateBegin: () => void;
    updateEnd: () => void;
    setViewport: (x: number, y: number, width: number, height: number) => void;
    setScissor: (x: number, y: number, width: number, height: number) => void;
    setShader: (shader: Shader) => void;
};

let cachedDevice: GraphicsDevice = null;
let cachedVB: VertexBuffer = null;

const getInstancingVB = (device: GraphicsDevice) => {
    if (cachedVB && cachedDevice === device) {
        return cachedVB;
    }
    const format = new VertexFormat(device, [{ semantic: SEMANTIC_POSITION, components: 1, type: TYPE_FLOAT32 }]);
    format.instancing = true;
    cachedVB = new VertexBuffer(device, format, 1);
    cachedVB.lock();
    cachedVB.unlock();
    cachedDevice = device;
    return cachedVB;
};

const drawPointsWithShader = (
    device: GraphicsDevice,
    target: RenderTarget,
    shader: Shader,
    count: number,
    blendState: BlendState
) => {
    const vb = getInstancingVB(device);
    const d = device as DeviceState;

    const oldRt = d.renderTarget;
    const oldVx = d.vx,
        oldVy = d.vy,
        oldVw = d.vw,
        oldVh = d.vh;
    const oldSx = d.sx,
        oldSy = d.sy,
        oldSw = d.sw,
        oldSh = d.sh;

    d.setRenderTarget(target);
    d.updateBegin();

    const w = target ? target.width : d.width;
    const h = target ? target.height : d.height;
    d.setViewport(0, 0, w, h);
    d.setScissor(0, 0, w, h);

    d.setBlendState(blendState);
    d.setDepthState(DepthState.NODEPTH);
    d.setVertexBuffer(vb);
    d.setShader(shader);

    d.draw({
        type: PRIMITIVE_POINTS,
        base: 0,
        count,
        indexed: false
    });

    d.updateEnd();
    d.setRenderTarget(oldRt);
    d.setViewport(oldVx, oldVy, oldVw, oldVh);
    d.setScissor(oldSx, oldSy, oldSw, oldSh);
};

export { drawPointsWithShader };
