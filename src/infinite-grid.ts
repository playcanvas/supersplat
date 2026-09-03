import {
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    BLENDEQUATION_ADD,
    CULLFACE_NONE,
    FUNC_LESSEQUAL,
    SEMANTIC_POSITION,
    BlendState,
    Camera,
    DepthState,
    Layer,
    QuadRender,
    ScopeSpace,
    Shader,
    ShaderUtils,
    Mat4
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader } from './shaders/infinite-grid-shader';

const resolve = (scope: ScopeSpace, values: any) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

type GridPlane = 'xz' | 'xy' | 'yz';

// map plane name to the shader's plane bit (0: x (yz), 1: y (xz), 2: z (xy))
const planeIndices = { yz: 0, xz: 1, xy: 2 };

const planeMask = (planes: GridPlane[]) => planes.reduce((mask, plane) => mask | (1 << planeIndices[plane]), 0);

class InfiniteGrid extends Element {
    shader: Shader;
    quadRender: QuadRender;
    blendState = new BlendState(false);
    depthState = new DepthState(FUNC_LESSEQUAL, true);

    visible = true;
    // the planes drawn, any combination. Planes the camera views edge-on
    // produce no intersections and simply don't show
    planes: GridPlane[] = ['xz'];

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'infinite-grid',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexWGSL: vertexShader,
            fragmentWGSL: fragmentShader
        });

        this.quadRender = new QuadRender(this.shader);

        const blendState = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA
        );

        const shaderProjection = new Mat4();
        const viewProjectionMatrix = new Mat4();
        const viewPosition = [0, 0, 0];
        const viewportSize = [0, 0];

        this.scene.camera.camera.on('preRenderLayer', (layer: Layer, transparent: boolean) => {
            const { scene } = this;
            if (this.visible && this.planes.length > 0 && layer === scene.worldLayer && !transparent && scene.camera.renderOverlays) {
                const { camera } = scene;

                device.setBlendState(blendState);
                device.setCullMode(CULLFACE_NONE);
                device.setDepthState(DepthState.WRITEDEPTH);
                device.setStencilState(null, null);

                // the shader writes fragDepth from this matrix: apply the same
                // clip-z transform the engine applies for meshes (and the splat
                // renderer applies), so all depth shares one convention
                viewProjectionMatrix.mul2(
                    Camera.applyShaderProjectionTransform(camera.camera.projectionMatrix, shaderProjection, false, device.isWebGPU),
                    camera.camera.viewMatrix
                );

                const p = camera.position;
                viewPosition[0] = p.x;
                viewPosition[1] = p.y;
                viewPosition[2] = p.z;
                viewportSize[0] = camera.targetSize.width;
                viewportSize[1] = camera.targetSize.height;

                resolve(device.scope, {
                    planeMask: planeMask(this.planes),
                    matrix_viewProjection: viewProjectionMatrix.data,
                    grid_view_position: viewPosition,
                    grid_viewport_size: viewportSize
                });

                this.quadRender.render();
            }
        });
    }

    remove() {
        this.shader.destroy();
        this.quadRender.destroy();
    }

    serialize(serializer: Serializer): void {
        serializer.pack(this.visible, planeMask(this.planes));
    }
}

export { InfiniteGrid };
export type { GridPlane };
