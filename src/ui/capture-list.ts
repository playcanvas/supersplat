import { Button, Container, Panel } from "@playcanvas/pcui";
import { startSpinner, stopSpinner } from "./spinner";
import { TableView } from "./table-view";

const getCaptureList = async () => {
    try {
        const captureListResponse = await fetch(`${location.origin}/api/splats`, {
            method: 'GET'
        });

        if (!captureListResponse.ok) {
            return [{
                name: `Failed to download list (${captureListResponse.statusText})`,
                status: ''
            }];
        }

        const captureListJson = await captureListResponse.json();

        if (captureListJson.result === undefined) {
            return [{
                name: 'Failed to retrieve capture list. (Make sure you are logged in).',
                status: ''
            }];
        }

        return captureListJson.result;
    } catch (error) {
        return [{
            name: error.toString(),
            status: ''
        }];
    }
};

const statusString = (captureEntry: any) => {
    return captureEntry.state ? captureEntry.state : (captureEntry.file?.filename ? 'complete' : 'queued');
};

const dateString = (captureEntry: any) => {
    const date = Date.parse(captureEntry.createdAt);
    const curr = (new Date()).getTime();

    const groupings = [
        { unit: 'y', time: 1000 * 60 * 60 * 24 * 365 },
        { unit: 'w', time: 1000 * 60 * 60 * 24 * 7 },
        { unit: 'd', time: 1000 * 60 * 60 * 24 },
        { unit: 'h', time: 1000 * 60 * 60 },
        { unit: 'm', time: 1000 * 60 },
        { unit: 's', time: 1000 },
        { unit: 'ms', time: 1 }
    ];

    for (let i = 0; i < groupings.length; ++i) {
        const value = Math.floor((curr - date) / groupings[i].time);
        if (value > 0) {
            return `${value}${groupings[i].unit}`;
        }
    }

    return '';
};

const sizeString = (captureEntry: any) => {
    return captureEntry.file?.size ? `${(captureEntry.file.size / 1024 / 1024).toFixed(2)}` : '';
};

const showCaptureList = async () => {
    const captureList = new TableView({
        id: 'capture-list',
        columns: [{
            header: 'Name',
            width: 300
        }, {
            header: 'Status'
        }, {
            header: 'Age'
        }, {
            header: 'MB'
        }]
    });

    const captureListContainer = new Container({
        id: 'capture-list-container'
    });
    captureListContainer.append(captureList);

    const load = new Button({
        class: 'capture-list-button',
        text: 'LOAD',
        enabled: false
    });

    const cancel = new Button({
        class: 'capture-list-button',
        text: 'CANCEL'
    });

    const buttons = new Container({
        id: 'capture-list-buttons',
        flex: true,
        flexDirection: 'row'
    });
    buttons.append(load);
    buttons.append(cancel);

    const captureListPanel = new Panel({
        id: 'capture-list-panel',
        headerText: 'CAPTURES',
        flex: true,
        flexDirection: 'column'
    });
    captureListPanel.append(captureListContainer);
    captureListPanel.append(buttons);

    document.body.appendChild(captureListPanel.dom);

    const result = await new Promise<boolean>((resolve) => {
        startSpinner();

        getCaptureList().then((data: any) => {
            stopSpinner();

            captureList.rows = data.map((c: any) => {
                return [c.name, statusString(c), dateString(c), sizeString(c)];
            });

            captureList.on('select', (index: number) => {
                load.enabled = data[captureList.selection].file?.filename ? true : false;
            });
    
            load.on('click', () => {
                const capture = data[captureList.selection];
                const loadUrl = `/api/assets/${capture.id}/file/${capture.file.filename}`;
                window.scene.loadModel(loadUrl, capture.name);
                resolve(true);
            });
    
            cancel.on('click', () => {
                resolve(false);
            });    
        });

        // setTimeout required here otherwise the click event that launched this panel triggers the
        // onclick handler.
        setTimeout(() => {
            document.body.onclick = (event: MouseEvent) => {
                if (!captureListPanel.dom.contains(event.target as Node)) {
                    resolve(false);
                }
            }
        });
    });

    document.body.removeChild(captureListPanel.dom);
    document.body.onclick = null;

    return result;
};

export {
    showCaptureList
}
