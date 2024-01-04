import { Button, Container, Panel, TreeView, TreeViewItem } from "@playcanvas/pcui";
import { startSpinner, stopSpinner } from "./spinner";

const getCaptureList = async () => {
    try {
        const captureListResponse = await fetch(`${location.origin}/api/splats`, {
            method: 'GET'
        });

        if (!captureListResponse.ok) {
            return [{
                name: captureListResponse.statusText,
                task: ''
            }];
        }

        const captureListJson = await captureListResponse.json();

        if (captureListJson.result === undefined) {
            return [{
                name: 'Failed to retrieve capture list. (Make sure you are logged in).',
                task: ''
            }];
        }

        return captureListJson.result;
    } catch (error) {
        return [{
            name: error.toString(),
            task: ''
        }];
    }
};

const showCaptureList = async () => {
    const captureList = new TreeView({
        id: 'capture-list',
        allowDrag: false,
        allowReordering: false,
        allowRenaming: false
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
        headerText: 'CAPTURE LIST',
        flex: true,
        flexDirection: 'column'
    });
    captureListPanel.append(captureListContainer);
    captureListPanel.append(buttons);

    document.body.appendChild(captureListPanel.dom);

    const result = await new Promise<boolean>((resolve) => {
        startSpinner();

        const map = new Map<TreeViewItem, any>();

        getCaptureList().then((data: any) => {
            stopSpinner();

            data.forEach((capture: any) => {
                const states = {
                    running: 'Processing: ',
                    failed: 'Failed: '
                };
                const item = new TreeViewItem({
                    class: 'capture-list-item',
                    // @ts-ignore
                    text: `${states[capture.task] ?? ''}${capture.name}`,
                    icon: '',
                    enabled: !!capture.file?.filename
                });
                captureList.append(item);
    
                map.set(item, capture);
            });
        });

        captureList.on('select', (item: TreeViewItem) => {
            load.enabled = item.enabled;
        });

        load.on('click', () => {
            const capture = map.get(captureList.selected[0]);
            const loadUrl = `/api/assets/${capture.id}/file/${capture.file.filename}`;
            window.scene.loadModel(loadUrl, capture.name);
            resolve(true);
        });

        cancel.on('click', () => {
            resolve(false);
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
