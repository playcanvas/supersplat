import { Button, Container, Divider, Element, Label, TextInput, VectorInput } from 'pcui';

import { Events } from '../events';
import { SceneConfig } from 'src/scene-config';
import { Asset } from 'playcanvas';

const setUpdateDataTransferredInterval = (labelRegistry: Label, labelTraffic: Label) => {
    const totalAssetsTransferredMap = {};

    const getAssetSize = (asset: Asset) => {
        let size = 0;
        if (!asset.loaded) {
            return 0;
        }

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
    }, 500);
}

class MyxPanel extends Container {
    constructor(events: Events, config: SceneConfig, args = {}) {
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

        setUpdateDataTransferredInterval(registrySizeLabel, totalDataTransferredLabel);


        const bulkLoadButton = new Button({ text: 'Bulk Load', class: 'select-toolbar-button' });
        const bulkLoadLevelInput = new TextInput();
        const bulkLoadContainer = new Container();
        bulkLoadContainer.append(bulkLoadLevelInput);
        bulkLoadContainer.append(bulkLoadButton);

        const cameraLoadButton = new Button({ text: 'Camera Load', class: 'select-toolbar-button' });
        const cameraLoadContainer = new Container();
        const cameraDistanceInputs = new VectorInput({
            precision: 2,
            dimensions: 3,
            value: [config.myx.scene.cameraLoad.l1Distance, config.myx.scene.cameraLoad.l2Distance, config.myx.scene.cameraLoad.l3Distance],
            enabled: true
        })
        cameraLoadContainer.append(new Label({text: "Distance thresholds (L1, L2, L3)"}));
        cameraLoadContainer.append(cameraDistanceInputs);
        cameraLoadContainer.append(cameraLoadButton);

        cameraDistanceInputs.on('change', () => {
            config.myx.scene.cameraLoad.l1Distance = cameraDistanceInputs.value[0];
            config.myx.scene.cameraLoad.l2Distance = cameraDistanceInputs.value[1];
            config.myx.scene.cameraLoad.l3Distance = cameraDistanceInputs.value[2];
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
            
            config.myx.scene.bulkLoad.enabled = true;
            config.myx.scene.bulkLoad.level = level;
        });

        cameraLoadButton.dom.addEventListener('click', (ev:MouseEvent) => {
            config.myx.scene.cameraLoad.enabled = true;
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
