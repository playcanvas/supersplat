import {
    BUFFER_STATIC,
    PRIMITIVE_LINES,
    SEMANTIC_COLOR,
    SEMANTIC_POSITION,
    TYPE_FLOAT32,
    TYPE_UINT8,
    Mesh,
    VertexBuffer,
    VertexFormat,
} from 'playcanvas';
import { Debug } from './debug';
import { Serializer } from './serializer';

class Grid extends Debug {
    constructor() {
        super();
    }

    add() {
        super.add();

        const device = this.scene.app.graphicsDevice;

        const vertexFormat = new VertexFormat(device, [
            { semantic: SEMANTIC_POSITION, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_COLOR, components: 4, type: TYPE_UINT8, normalize: true }
        ]);

        const numLines = 21;
        const gridSize = 20;

        const data = new Float32Array(numLines * 4 * 4);
        const clrData = new Uint32Array(data.buffer);

        for (let i = 0; i < numLines; i++) {
            const a = (i / (numLines - 1) - 0.5) * gridSize;
            const b = gridSize / 2;
            const idx = i * 16;
            const clr = i === Math.floor(numLines / 2) ? 0xff000000 : 0xffa0a0a0;

            data[idx + 0] = a;
            data[idx + 1] = 0;
            data[idx + 2] = -b;
            clrData[idx + 3] = clr;

            data[idx + 4] = a;
            data[idx + 5] = 0;
            data[idx + 6] = b;
            clrData[idx + 7] = clr;

            data[idx + 8] = -b;
            data[idx + 9] = 0;
            data[idx + 10] = a;
            clrData[idx + 11] = clr;

            data[idx + 12] = b;
            data[idx + 13] = 0;
            data[idx + 14] = a;
            clrData[idx + 15] = clr;
        }

        const mesh = new Mesh(device);
        mesh.vertexBuffer = new VertexBuffer(device, vertexFormat, numLines * 4, {
            data: data.buffer
        });
        mesh.primitive[0].type = PRIMITIVE_LINES;
        mesh.primitive[0].base = 0;
        mesh.primitive[0].indexed = false;
        mesh.primitive[0].count = numLines * 4;

        this.mesh = mesh;
    }

    remove() {
        this.mesh = null;

        super.remove();
    }

    get visible() {
        return this.instance.visible;
    }

    set visible(value: boolean) {
        this.instance.visible = value;
    }

    serialize(serializer: Serializer): void {
        serializer.pack(this.visible);
    }
}

export { Grid };
