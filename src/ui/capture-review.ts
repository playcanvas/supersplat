import { BooleanInput, Button, Container, Element, GridView, GridViewItem, Label, Panel, SelectInput, TextInput } from "@playcanvas/pcui";

const createImage = (preview: ImageBitmap, index: number) => {
    const image = document.createElement('canvas');
    image.width = preview.width;
    image.height = preview.height;
    image.getContext('2d').drawImage(preview, 0, 0);
    image.setAttribute('style', 'max-width: 100px; max-height: 100px;');

    const thumbnail = new Element({
        class: 'review-thumbnail',
        dom: 'span'
    });
    thumbnail.dom.appendChild(image);

    const item = new GridViewItem();
    item.prepend(thumbnail);

    return thumbnail;
};

const reviewCapture = async (images: { blob: Blob, preview: ImageBitmap }[]) => {
    const reviewGrid = new GridView({
        id: 'review-grid'
    });

    const reviewGridContainer = new Container({
        id: 'review-grid-container'
    });
    reviewGridContainer.append(reviewGrid);

    // name

    const nameLabel = new Label({
        class: 'review-label',
        text: 'Capture Name'
    });

    const name = new TextInput({
        class: 'review-value-expand',
        value: 'Capture'
    });

    const nameContainer = new Container({
        class: 'review-entry'
    });

    nameContainer.append(nameLabel);
    nameContainer.append(name);

    // upload

    const uploadLabel = new Label({
        class: 'review-label',
        text: 'Generate Scene'
    });

    const upload = new BooleanInput({
        class: 'review-value',
        value: true,
        width: 16
    });

    const uploadContainer = new Container({
        class: 'review-entry'
    });

    uploadContainer.append(uploadLabel);
    uploadContainer.append(upload);

    // download

    const downloadLabel = new Label({
        class: 'review-label',
        text: 'Download images'
    });

    const download = new BooleanInput({
        class: 'review-value',
        value: false,
        width: 16
    });

    const downloadContainer = new Container({
        class: 'review-entry'
    });

    downloadContainer.append(downloadLabel);
    downloadContainer.append(download);

    // buttons

    const apply = new Button({
        class: 'review-button',
        text: 'APPLY'
    });
    const cancel = new Button({
        class: 'review-button',
        text: 'CANCEL'
    });

    const buttons = new Container({
        id: 'review-buttons',
        flex: true,
        flexDirection: 'row'
    });
    buttons.append(apply);
    buttons.append(cancel);

    const reviewPanel = new Panel({
        id: 'review-panel',
        headerText: 'CAPTURE REVIEW',
        flex: true,
        flexDirection: 'column'
    });
    reviewPanel.content.append(reviewGridContainer);
    reviewPanel.content.append(nameContainer);
    reviewPanel.content.append(uploadContainer);
    reviewPanel.content.append(downloadContainer);
    reviewPanel.content.append(buttons);

    // add images
    images.forEach((image, i) => {
        reviewGrid.append(createImage(image.preview, i));
    });

    document.body.appendChild(reviewPanel.dom);

    const result = await new Promise<{ name: string, upload: boolean, download: boolean } | null>((resolve) => {
        apply.on('click', () => {
            resolve({
                name: name.value,
                upload: upload.value,
                download: download.value
            });
        });

        cancel.on('click', () => {
            resolve(null);
        });
    });

    document.body.removeChild(reviewPanel.dom);

    return result;
};

export {
    reviewCapture
}
