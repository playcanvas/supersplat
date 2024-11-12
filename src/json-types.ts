

type ColmapJson = ColmapPose[];

type ColmapPose = {
    id?: number,
    img_name?: string,
    width?: number,
    height?: number,
    position: [number, number, number],
    rotation: [[number, number, number], [number, number, number], [number, number, number]]
    fx?: number,
    fy?: number
};


type NerfstudioJson = NerfstudioCameraIntrinsics & { 
    frames: NerfstudioPose[]
};

type NerfstudioCameraIntrinsics = {
    camera_model?: string,
    h?: number,
    w?: number,
    file_path?: string,
    fl_x?: number,
    fl_y?: number,
    cx?: number,
    cy?: number,
    k1?: number,
    k2?: number,
    k3?: number,
    k4?: number,
    p1?: number,
    p2?: number
}

type NerfstudioPose = NerfstudioCameraIntrinsics & {    
    transform_matrix: [
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number]
    ]
};

export {
    ColmapJson, ColmapPose,
    NerfstudioJson, NerfstudioPose, NerfstudioCameraIntrinsics
};