import { Vec3 } from "playcanvas";
import { Scene } from "../scene"

const directionToAzimElev = (dir: {x: number, y:number, z:number}) => {
    // Normalize input (optional but good practice)
    const length = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    const x = dir.x / length;
    const y = dir.y / length;
    const z = dir.z / length;

    // Azimuth: angle in the XZ plane from the +Z axis
    let azim = Math.atan2(x, z) * (180 / Math.PI); // atan2 returns angle from Z to X
    if (azim < 0) azim += 360; // wrap into [0, 360)

    // Elevation: angle from horizontal plane up/down
    const elev = Math.asin(y) * (180 / Math.PI); // y is the "up" direction

    return { azim, elev };
}

const convertYUpToZUp = (dir: {x: number, y:number, z:number}) => {
    return new Vec3([
        dir.x,
        -dir.z,
        dir.y
    ]);
}

const convertZUpToYUp = (dir: {x: number, y:number, z:number}) => {
    return new Vec3([
        dir.x,
        dir.z,
        -dir.y
    ]);
}

//@ts-ignore
window.setRemappedAzimElev = (scene:any, azim:any, elev:any, topAzim = 0, topElev = 90) => {

}

const cameraUpdate = (scene: Scene, data: any) => {
    const pos = new Vec3(data.pos);
    let dir = new Vec3(data.dir);
    dir = convertZUpToYUp(dir)

    // const target = pos.clone().add(dir);
    // scene.camera.setPose(pos, target, 0);

    const { azim, elev } = directionToAzimElev(dir);
    scene.camera.setAzimElev(azim, elev, 0);
}

const toggleUi = () => {
    const uiElementIds = ['data-panel', 'timeline-panel',
        'myx-panel', 'bottom-toolbar', 'right-toolbar',
        'mode-toggle', 'view-cube-container', 'scene-panel'
    ];

    function toggleDisplay(element: any) {
        if (element.style.display === 'none' || getComputedStyle(element).display === 'none') {
            element.style.display = 'block';
        } else {
            element.style.display = 'none';
        }
    }

    for (const id of uiElementIds) {
        const element = document.getElementById(id);
        if (!element) {
            continue;
        }
        toggleDisplay(element);
    }
}

const addSplat = (scene: Scene, data: any) => {
    console.log(data.path);
    setTimeout(async () => {
        // await zip.file(`splat_${i}.ply`).async('blob');
        const url = URL.createObjectURL(new Blob([data.tile]));
        const model = await scene.assetLoader.loadModel({
            url: url,
            filename: data.path
        })
        scene.add(model);
    }, 0);
}


const setupMessageHandlers = (scene: Scene) => {
    window.addEventListener("message", (event) => {
        try {
            const command = event.data;
            if (command.name === "cameraUpdate") {
                cameraUpdate(scene, command.data);
            }

            if (command.name === "addSplat") {
                addSplat(scene, command.data);
            }

            if (command.name === "toggleUi") {
                toggleUi();
            }
        } catch (e) {
            console.log("Received non-JSON message", e);
        }
    });
}

export {
    setupMessageHandlers
}