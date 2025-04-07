import { Button, Container, Divider, Element, Label, TextInput, VectorInput } from 'pcui';

import { Events } from '../events';
import { SceneConfig } from '../scene-config';
import { Asset } from 'playcanvas';
import { myxConfig } from './myx-config';

const setUpdateDataTransferredInterval = (labelRegistry: Label, labelTraffic: Label, tilesLoadedLabel: Label) => {
    const totalAssetsTransferredMap = {};

    const getAssetSize = (asset: Asset) => {
        let size = 0;
        if (!asset.loaded) {
            return 0;
        }

        //@ts-ignore
        for (const prop of asset.resource.splatData.elements[0].properties)
            size += prop.storage.byteLength;
        return size;
    }

    setInterval(() => {
        //@ts-ignore
        let registry = window.assetLoader.registry;
        if (registry._assets.size == 0) {
            labelRegistry.value = "0 MB";
            labelTraffic.value = "0 MB";
            return;
        }
        
        let sizeRegistry = 0;
        for (const asset of registry._assets.values()) {
            const assetSize = getAssetSize(asset);
            sizeRegistry += assetSize;

            if (!Object.keys(totalAssetsTransferredMap).includes(asset._name) && asset.loaded) {
                //@ts-ignore
                totalAssetsTransferredMap[asset._name] = assetSize;
            }
        }

        labelRegistry.value = `${(sizeRegistry / (1024 * 1024)).toFixed(2)} MB`;
        const sizeTraffic = Object.values(totalAssetsTransferredMap).reduce((sum:number, value:number) => sum + value, 0);
        //@ts-ignore
        labelTraffic.value = `${(sizeTraffic / (1024 * 1024)).toFixed(2)} MB`;

        //@ts-ignore
        let loadedTiles = window.loadedTiles;
        //@ts-ignore
        let lod = window.lod;
        if (!lod || !loadedTiles) {
            tilesLoadedLabel.value = `L1:0 L2:0 L3:0`
        } else {
            const l1Loaded = loadedTiles.filter((x:string) => x.includes("low")).length;
            const l2Loaded = loadedTiles.filter((x:string) => x.includes("medium")).length;
            const l3Loaded = loadedTiles.filter((x:string) => x.includes("high")).length;
            tilesLoadedLabel.value = `L1:${l1Loaded}/${lod.l1.length} L2:${l2Loaded}/${lod.l2.length} L3:${l3Loaded}/${lod.l3.length}`
        }
    }, 500);
}

class MyxPanel extends Container {
    constructor(args = {}) {
        args = {
            ...args,
            id: 'myx-panel',
            class: 'panel'
        };

        super(args);

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const sceneHeader = new Container({
            class: 'panel-header'
        });

        const sceneIcon = new Label({
            text: '\uE344',
            class: 'panel-header-icon'
        });

        const sceneLabel = new Label({
            text: 'MYX PANEL',
            class: 'panel-header-label'
        });

        sceneHeader.append(sceneIcon);
        sceneHeader.append(sceneLabel);

        const dataHeader = new Container({
            class: 'panel-header'
        })
        const dataLabel = new Label({
            text: 'DATA',
            class: 'panel-header-label'
        });
        dataHeader.append(dataLabel);

        const dataContainer = new Container();
        dataContainer.append(new Label({text: "Registry size"}));
        const registrySizeLabel = new Label({text: "None"});
        dataContainer.append(registrySizeLabel);

        dataContainer.append(new Divider);
        dataContainer.append(new Label({text: "Total data transferred"}));
        const totalDataTransferredLabel = new Label({text: "None"});
        dataContainer.append(totalDataTransferredLabel);
        dataContainer.append(new Divider);
        dataContainer.append(new Label({text: "Tiles loaded"}));
        const tilesLoadedLabel = new Label({text: "None"});
        dataContainer.append(tilesLoadedLabel);

        setUpdateDataTransferredInterval(registrySizeLabel, totalDataTransferredLabel, tilesLoadedLabel);

        const bulkLoadButton = new Button({ text: 'Bulk Load', class: 'select-toolbar-button' });
        const bulkLoadLevelInput = new TextInput();
        const bulkLoadContainer = new Container();
        bulkLoadContainer.append(bulkLoadLevelInput);
        bulkLoadContainer.append(bulkLoadButton);

        const removeAllButton = new Button({ text: 'Remove All', class: 'select-toolbar-button' });
        bulkLoadContainer.append(removeAllButton);
        removeAllButton.dom.addEventListener('click', (ev: MouseEvent) => {
            for (let elem of window.scene.elements) {
                if (elem.type !== 'splat') {
                    continue;
                }
                setTimeout(() => {
                    window.scene.remove(elem);
                }, 0);
            }
        })


        const cameraLoadButton = new Button({ text: 'Camera Load', class: 'select-toolbar-button' });
        const cameraLoadContainer = new Container();
        const cameraDistanceInputs = new VectorInput({
            precision: 2,
            dimensions: 3,
            value: [myxConfig.scene.cameraLoad.l1Distance, myxConfig.scene.cameraLoad.l2Distance, myxConfig.scene.cameraLoad.l3Distance],
            enabled: true
        })
        cameraLoadContainer.append(new Label({text: "Distance thresholds (L1, L2, L3)"}));
        cameraLoadContainer.append(cameraDistanceInputs);
        cameraLoadContainer.append(cameraLoadButton);

        cameraDistanceInputs.on('change', () => {
            myxConfig.scene.cameraLoad.l1Distance = cameraDistanceInputs.value[0];
            myxConfig.scene.cameraLoad.l2Distance = cameraDistanceInputs.value[1];
            myxConfig.scene.cameraLoad.l3Distance = cameraDistanceInputs.value[2];
        });

        bulkLoadButton.dom.addEventListener('click', (ev: MouseEvent) => {
            let level = -1;
            try {
                level = parseInt(bulkLoadLevelInput.value);
                if (![1,2,3].includes(level)) 
                    throw new Error("Invalid value");
            } catch (e) {
                alert('Invalid value for level. Possible values: [1,2,3]');
                return;
            }
            
            myxConfig.scene.bulkLoad.enabled = true;
            myxConfig.scene.bulkLoad.level = level;
        });

        cameraLoadButton.dom.addEventListener('click', (ev:MouseEvent) => {
            myxConfig.scene.cameraLoad.enabled = true;
        })

        this.append(sceneHeader);
        this.append(new Label({text: "Tiles level"}));
        this.append(bulkLoadContainer);
        this.append(new Divider());
        this.append(cameraLoadContainer);
        this.append(dataHeader);
        this.append(dataContainer);
    }
}

export { MyxPanel };
