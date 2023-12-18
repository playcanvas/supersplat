import { Button, Container, Panel, TreeView, TreeViewItem } from "@playcanvas/pcui";
import { startSpinner, stopSpinner } from "./spinner";

const getCaptureList = async () => {
    const origin = location.origin;

    const captureListResponse = await fetch(`${origin}/api/splats`, {
        method: 'GET'
    });

    const captureListJson = await captureListResponse.json();

    console.log(JSON.stringify(captureListJson, null, 2));

    return captureListJson.result;
};

const showCaptureList = async () => {
    const dataPromise = getCaptureList();

    const captureList = new TreeView({
        id: 'capture-list',
        allowDrag: false,
        allowReordering: false,
        allowRenaming: false
    });

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
    captureListPanel.append(captureList);
    captureListPanel.append(buttons);

    document.body.appendChild(captureListPanel.dom);

    const result = await new Promise<boolean>((resolve) => {
        startSpinner();

        const map = new Map<TreeViewItem, any>();

        dataPromise.then((data) => {
            stopSpinner();

            // fill tree view
            data.forEach((capture: any) => {
                const item = new TreeViewItem({
                    class: 'capture-list-item',
                    open: false,
                    text: `${capture.name}${capture.file?.filename ?? " (busy...)"}`,
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
            const url = new URL(location.href);
            url.searchParams.set('load', `/api/assets/${capture.id}/file/${capture.file.filename}`);
            location.href = url.toString();
            // resolve(true);
        });

        cancel.on('click', () => {
            resolve(false);
        });
    });

    document.body.removeChild(captureListPanel.dom);

    return result;
};

export {
    showCaptureList
}
