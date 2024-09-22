
// used the WebglStudio Shaders

import {
    Vec3,
    Vec4,
    Mat4,
    BoundingBox,
    Material,
    Asset,
    FUNC_LESSEQUAL,
    CULLFACE_NONE,
    BLEND_NORMAL,
    Color,
    PIXELFORMAT_R8_G8_B8,
    ADDRESS_REPEAT,
    FILTER_LINEAR_MIPMAP_LINEAR,
    FILTER_LINEAR,
    Mesh,
    SEMANTIC_POSITION,
    SEMANTIC_NORMAL,
    SEMANTIC_TEXCOORD0,
    PRIMITIVE_TRIANGLES,
    TYPE_FLOAT32,
    VertexFormat,
    VertexBuffer,
    VertexIterator,
    GraphicsDevice,
    IndexBuffer,
    INDEXFORMAT_UINT16,
    Shader,
    Entity,
    MeshInstance,
    AssetListLoader,
    AssetRegistry,
    config,
    Texture
} from 'playcanvas';
import { Element, ElementType } from './element';
import { PCApp } from './pc-app';

import { Serializer } from './serializer';

const vsCode = /*glsl*/ `
    precision mediump float;

    attribute vec3 a_vertex;
    attribute vec3 a_normal;
    attribute vec2 a_coord;

    uniform mat4 matrix_model;
    uniform mat4 matrix_viewProjection;

    varying vec2 v_coord;
    varying vec3 v_pos;
    varying vec3 v_normal;

    void main() {
        v_coord = a_coord;
        v_pos = (matrix_model * vec4(a_vertex,1.0)).xyz;
        v_normal = (matrix_model * vec4(a_normal,0.0)).xyz;
        gl_Position = matrix_viewProjection * matrix_model * vec4(a_vertex,1.0);
    }
`;

const fsCode = /*glsl*/ `

    precision mediump float;

    uniform vec4 u_color;
    uniform vec3 u_camera_position;
    uniform sampler2D u_texture;

    varying vec2 v_coord;
    varying vec3 v_pos;
    varying vec3 v_normal;

    vec4 surface_function( vec3 pos, vec3 normal, vec2 coord ) {
        vec2 f = vec2(1.0/64.0, 1.0/64.0);
        float brightness = texture2D(u_texture, pos.xz + f).x * 0.6 +
            texture2D(u_texture, pos.xz * 0.1 + f ).x * 0.3 +
            texture2D(u_texture, pos.xz * 0.01 + f ).x * 0.2;
        brightness /= max(1.0,0.001 * length(u_camera_position.xz - pos.xz));
        vec4 color = u_color * vec4(vec3(1.0),brightness);
        if( abs(pos.x) < 0.1 )
            color = mix(vec4(0.4,0.4,1.0,0.5),color,abs(pos.x/0.1));
        if( abs(pos.z) < 0.1 )
            color = mix(vec4(1.0,0.4,0.4,0.5),color,abs(pos.z/0.1));
            return color;
    }

    void main() {
        gl_FragColor = surface_function(v_pos,v_normal,v_coord);
    }
`;

interface MeshOptions {
    detailX?: number;
    detailY?: number;
    detail?: number;
    width?: number;
    height?: number;
    size?: number;
    xz?: boolean;
    triangles?: number[];
}

interface MeshInfo {
    vertices: number[];
    normals: number[];
    coords: number[];
    triangles: number[];
    boundingBox?: BoundingBox;
}

class WebglStudioGrid extends Element {
    mesh:Mesh;
    material: Material;
    entity:Entity;
    color:Color;

    grid_alpha=0.5;

    _visible=true;

    constructor() {
        super(ElementType.debug);
        this.color=new Color(1,1,1,this.grid_alpha);
    }

    get visible():boolean{
        return this._visible;
    }

    set visible(value:boolean){
        this._visible=value;
        console.info(this._visible);

        if(this._visible && this.entity){
            this.entity.render.show();
        }else{
            this.entity.render.hide();
        }

        if(this.scene){
            this.scene.forceRender=true;
        }
    }

    override onUpdate(deltaTime: number){
        if(this.scene.camera && this.material){
            const cameraEntity = this.scene.camera.entity;

            const cameraMatrix = cameraEntity.getWorldTransform().clone();
            const cameraPosition = cameraMatrix.getTranslation();
            this.material.setParameter('u_camera_position',[cameraPosition.x,cameraPosition.y,cameraPosition.z]);
        }
    }

    add() {

        const device = this.scene.app.graphicsDevice;

        this.material=this.createMaterial(this.scene.app,this.color);
        const info=this.createPlane({xz:true, detail: 10});
        this.mesh=this.createMesh(device,info);

        const meshInstance = new MeshInstance(this.mesh, this.material);

        this.entity = new Entity();
        this.entity.addComponent("render",
            {
                type: 'asset',
                meshInstances: [meshInstance]
            }
        );

        this.scene.contentRoot.addChild(this.entity);

        this.entity.setPosition(new Vec3(0,0,0));
        this.entity.setLocalScale(10000, 10000, 10000);
    }

    remove() {
        this.scene.contentRoot.removeChild(this.entity);
    }

    private createPlane(options: MeshOptions): MeshInfo {
        options = options || {};
        options.triangles = [];

        const detailX = options.detailX || options.detail || 1;
        const detailY = options.detailY || options.detail || 1;
        let width = options.width || options.size || 1;
        let height = options.height || options.size || 1;
        const xz = options.xz;

        width *= 0.5;
        height *= 0.5;

        const triangles: number[] = [];
        const vertices: number[] = [];
        const coords: number[] = [];
        const normals: number[] = [];

        const N = new Vec3(0, 0, 1);
        if (xz) {
            N.set(0, 1, 0);
        }

        for (let y = 0; y <= detailY; y++) {
            const t = y / detailY;
            for (let x = 0; x <= detailX; x++) {
                const s = x / detailX;
                if (xz) {
                    vertices.push((2 * s - 1) * width, 0, -(2 * t - 1) * height);
                } else {
                    vertices.push((2 * s - 1) * width, (2 * t - 1) * height, 0);
                }
                coords.push(s, t);
                normals.push(N.x, N.y, N.z);

                if (x < detailX && y < detailY) {
                    const i = x + y * (detailX + 1);
                    if (xz) {
                        // Horizontal plane
                        triangles.push(i + 1, i + detailX + 1, i);
                        triangles.push(i + 1, i + detailX + 2, i + detailX + 1);
                    } else {
                        // Vertical plane
                        triangles.push(i, i + 1, i + detailX + 1);
                        triangles.push(i + detailX + 1, i + 1, i + detailX + 2);
                    }
                }
            }
        }

        const center = new Vec3(0, 0, 0);
        const halfExtents = xz  ? new Vec3(width, 0, height) : new Vec3(width, height, 0);
        const boundingBox = new BoundingBox(center, halfExtents);

        return {vertices:vertices, normals: normals, coords: coords, triangles: triangles,boundingBox: boundingBox };
    }

    private createMaterial(app:PCApp,color:Color): Material{

        const material = new Material();

        material.depthTest = false;
        material.depthFunc = FUNC_LESSEQUAL;
        material.depthWrite=false;

        material.blendType = BLEND_NORMAL;
        material.cull = CULLFACE_NONE;

        material.depthBias = 1;
        material.slopeDepthBias = -100.0;


        const shader = new Shader(app.graphicsDevice, {
            attributes: {
                a_vertex: SEMANTIC_POSITION,
                a_normal: SEMANTIC_NORMAL,
                a_coord: SEMANTIC_TEXCOORD0
            },
            vshader: vsCode,
            fshader: fsCode
        });

        material.shader=shader;
        material.update();

        const textureAsset = new Asset(
            'u_texture',
            'texture',
            { url: '../static/images/grid.png' },
            {
                format: PIXELFORMAT_R8_G8_B8,
                addressU: ADDRESS_REPEAT,
                addressV: ADDRESS_REPEAT,
                minFilter:FILTER_LINEAR_MIPMAP_LINEAR,
                magFilter:FILTER_LINEAR,
                anisotropy:4
            }
        );

        const assetListLoader = new AssetListLoader([textureAsset], app.assets);
        assetListLoader.load((err: string | null, failed: Asset[]) => {
            if (err) {
                console.error('grid.png loaded error: ', err);
            } else {
                if(!failed){
                    material.setParameter('u_texture',textureAsset.resource as Texture);
                    material.setParameter('u_color',[color.r ,color.g,color.b,color.a]);
                    this.scene.forceRender=true;
                }
            }
        });

        return material;
    }

    private createMesh(device:GraphicsDevice,meshInfo:MeshInfo):Mesh{

        const mesh = new Mesh(device);

        const vertexFormat = new VertexFormat(device, [
            { semantic: SEMANTIC_POSITION, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_NORMAL, components: 3, type: TYPE_FLOAT32 },
            { semantic: SEMANTIC_TEXCOORD0, components: 2, type: TYPE_FLOAT32 }
        ]);

        const vertexBuffer = new VertexBuffer(device, vertexFormat, meshInfo.vertices.length / 3);

        const iterator = new VertexIterator(vertexBuffer);
        for (let i = 0; i < meshInfo.vertices.length / 3; i++) {
            iterator.element[SEMANTIC_POSITION].set(meshInfo.vertices[i * 3 + 0], meshInfo.vertices[i * 3 + 1], meshInfo.vertices[i * 3 + 2]);
            iterator.element[SEMANTIC_NORMAL].set(meshInfo.normals[i * 3 + 0], meshInfo.normals[i * 3 + 1], meshInfo.normals[i * 3 + 2]);
            iterator.element[SEMANTIC_TEXCOORD0].set(meshInfo.coords[i * 2 + 0], meshInfo.coords[i * 2 + 1]);
            iterator.next();
        }
        iterator.end();

        const indexBuffer = new IndexBuffer(device, INDEXFORMAT_UINT16, meshInfo.triangles.length);
        const indices = new Uint16Array(indexBuffer.lock());
        indices.set(meshInfo.triangles);
        indexBuffer.unlock();

        mesh.vertexBuffer = vertexBuffer;
        mesh.indexBuffer[0] = indexBuffer;
        mesh.primitive[0].type = PRIMITIVE_TRIANGLES;
        mesh.primitive[0].base = 0;
        mesh.primitive[0].count = meshInfo.triangles.length;
        mesh.primitive[0].indexed = true;

        return mesh;

    }
}

export { WebglStudioGrid };
