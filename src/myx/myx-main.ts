import { Vec3 } from "playcanvas";
import { Events } from "../events";
import { Scene, SceneConfig } from "../scene";
import { setupMessageHandlers } from "./myx-communication";


function extractLevels(data: any) {
    return {
        level1: data,
        level2: data.map((x: any) => x.children).flat(),
        level3: data.map((x: any) => x.children.map((y:any) => y.children)).flat().flat() 
    };
}

const addTileToScene = async (scene: Scene, path: string) => {
    setTimeout(async () => {
        const animationFrame = false;
        const url = `/tiles/${path}`;
        const model = await scene.assetLoader.loadModel({ url, filename:path, animationFrame });
        scene.add(model);
    }, 0);
}

async function bulkLoad(scene: Scene, tiles: any[], loaded: string[]) {
    const paths = tiles.map((x:any) => x.path);
    for (let path of paths) {
        if (loaded.includes(path)) {
            continue;
        }

        addTileToScene(scene, path);
        loaded.push(path);
    }
}

const positionChanged = (oldPos:any, newPos:any) => {
    if (!oldPos) {
        return true;
    }

    return oldPos.x !== newPos.x || oldPos.y !== newPos.y || oldPos.z !== newPos.z;
}

const dist = (arr1: number[], arr2: number[]) => {
    return Math.sqrt((arr1[0] - arr2[0]) ** 2 + (arr1[1] - arr2[1]) ** 2 + (arr1[2] - arr2[2]) ** 2);
};


const filterCloserTiles = (position: any, data:any[], threshold:number) => {
    return data.filter((tile: any) => {
        const distance = dist([position.x, position.y, position.z], tile.center);
        return distance < threshold
    })
}

const myx_main = async (scene: Scene, config: SceneConfig, events: Events) => {
    let [l1, l2, l3]:any = [null, null, null];

    let updateOld = scene.camera.onUpdate;
    let oldPos: any = undefined;
    let bulkLoaded = false;

    let loadedTiles: string[] = [];
    //@ts-ignore
    window.loadedTiles = loadedTiles;

    scene.camera.onUpdate = function (args) {
        if (typeof updateOld === "function") {
            updateOld.call(this, args); 
        }
        
        let newPos = this.entity.getPosition();
        if (positionChanged(oldPos, newPos)) {
            oldPos = { x: newPos.x, y:newPos.y, z:newPos.z}
            
            if (config.myx.scene.cameraLoad.enabled) {
                const l1_thresh = config.myx.scene.cameraLoad.l1Distance;
                const l2_thresh = config.myx.scene.cameraLoad.l2Distance;
                const l3_thresh = config.myx.scene.cameraLoad.l3Distance;
                
                let cameraPos = scene.camera.entity.getPosition();
                const l1_tiles = filterCloserTiles(cameraPos, l1, l1_thresh);
                const l2_tiles = filterCloserTiles(cameraPos, l2, l2_thresh);
                const l3_tiles = filterCloserTiles(cameraPos, l3, l3_thresh);
    
                bulkLoad(scene, l1_tiles, loadedTiles);
                bulkLoad(scene, l2_tiles, loadedTiles);
                bulkLoad(scene, l3_tiles, loadedTiles);
            }
        }

        if (config.myx.scene.bulkLoad.enabled && !bulkLoaded) {
            bulkLoaded = true;
            let srcData = null;

            switch(config.myx.scene.bulkLoad.level) {
                case 1:
                    srcData = l1;
                    break;
                case 2:
                    srcData = l2;
                    break;
                case 3:
                    srcData = l3;
                    break;
            }

            bulkLoad(scene, srcData, loadedTiles);
        }
    };

    // fetch('/tiles/scene_tree.json')
    //     .then((response) => response.json())
    //     .then(async (data) => {
    //         const { level1, level2, level3 } = extractLevels(data);
    //         //@ts-ignore
    //         l1 = level1;
    //         l2 = level2;
    //         l3 = level3;
    //         //@ts-ignore
    //         window.lod = {
    //             l1: l1,
    //             l2: l2,
    //             l3: l3
    //         }
    //     });
    events.fire('camera.toggleOverlay');

    setupMessageHandlers(scene);
}

export { myx_main }