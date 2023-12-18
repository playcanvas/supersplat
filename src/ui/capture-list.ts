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
        text: 'LOAD'
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

        dataPromise.then((data) => {
            stopSpinner();

            // fill tree view
            data.forEach((capture: any) => {
                const item = new TreeViewItem({
                    class: 'capture-list-item',
                    open: false,
                    text: capture.file.filename,
                    icon: ''
                });
                captureList.append(item);
            });
        });

        load.on('click', () => {
            resolve(true);
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
