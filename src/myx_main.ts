import { Events } from "./events";
import { Scene, SceneConfig } from "./scene";


function extractLevels(data: any) {
    let level1Keys = Object.keys(data); // Extract level 1 keys
    let level2Keys = [];
    let level3Values = [];

    for (const level1Key in data) {
        if (data.hasOwnProperty(level1Key)) {
            let level2 = Object.keys(data[level1Key]); // Get level 2 keys
            level2Keys.push(...level2);

            let level3 = Object.values(data[level1Key]).flat(); // Get level 3 values
            level3Values.push(...level3);
        }
    }

    return {
        level1: level1Keys,   // Array of level 1 keys
        level2: level2Keys,   // Array of level 2 keys
        level3: level3Values  // Array of all level 3 values
    };
}

async function bulkLoadLevel(scene: Scene, data: string[], folder:string, prefix:string) {
    for (let name in data) {
        setTimeout(async () => {
            const animationFrame = false;
            const filename = `${prefix}_${name}.ply`;
            const url = `/tiles/${folder}/${filename}`;
            console.log(url);
            const model = await scene.assetLoader.loadModel({ url, filename, animationFrame });
            scene.add(model);
        }, 0);
    }
}

const positionChanged = (oldPos:any, newPos:any) => {
    if (!oldPos) {
        return true;
    }

    return oldPos.x !== newPos.x || oldPos.y !== newPos.y || oldPos.z !== newPos.z;
}

const filterCloserTiles = (position: object, data:object[], threshold:number) => {
    debugger;
}

const myx_main = async (scene: Scene, config: SceneConfig, events: Events) => {
    let [l1, l2, l3]:any = [{
        data: null,
        folder: "low",
        prefix: "low"
    }, {
        data:null,
        folder: "medium",
        prefix: "med"
    }, {
        data: null,
        folder: "high",
        prefix: "high"
    }];

    let updateOld = scene.camera.onUpdate;
    let oldPos: any = undefined;
    let bulkLoaded = false;

    scene.camera.onUpdate = function (args) {
        if (typeof updateOld === "function") {
            updateOld.call(this, args); 
        }
        
        let newPos = this.entity.getPosition();
        if (positionChanged(oldPos, newPos)) {
            oldPos = { x: newPos.x, y:newPos.y, z:newPos.z}
            console.log("Update");
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

            bulkLoadLevel(scene, srcData.data, srcData.folder, srcData.prefix);
        }

        if (config.myx.scene.cameraLoad.enabled) {
            const l1_thresh = config.myx.scene.cameraLoad.l1Distance;
            const l2_thresh = config.myx.scene.cameraLoad.l2Distance;
            const l3_thresh = config.myx.scene.cameraLoad.l3Distance;

            const l1_tiles = filterCloserTiles(scene.camera.entity.getPosition(), l1, l1_thresh);
            const l2_tiles = filterCloserTiles(scene.camera.entity.getPosition(), l2, l2_thresh);
            const l3_tiles = filterCloserTiles(scene.camera.entity.getPosition(), l3, l3_thresh);
        }
    };

    fetch('/tiles/scene_tree.json')
        .then((response) => response.json())
        .then(async (data) => { 
            const {level1, level2, level3} = extractLevels(data);  
            //@ts-ignore
            l1.data = level1;
            l2.data = level2;
            l3.data = level3;
        });
    
    // events.fire('camera.toggleMode');
}

export { myx_main }