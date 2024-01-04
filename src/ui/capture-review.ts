import { Button, Container, Element, GridView, GridViewItem, Label, Panel, TextInput } from "@playcanvas/pcui";

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

    const nameLabel = new Label({
        id: 'review-name-label',
        text: 'Capture Name'
    });

    const name = new TextInput({
        id: 'review-name',
        value: 'Capture'
    });

    const nameContainer = new Container({
        id: 'review-name-container',
        flex: true,
        flexDirection: 'row'
    });

    nameContainer.append(nameLabel);
    nameContainer.append(name);

    const upload = new Button({
        class: 'review-button',
        text: 'UPLOAD'
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
    buttons.append(upload);
    buttons.append(cancel);

    const reviewPanel = new Panel({
        id: 'review-panel',
        headerText: 'CAPTURE REVIEW',
        flex: true,
        flexDirection: 'column'
    });
    reviewPanel.content.append(reviewGridContainer);
    reviewPanel.content.append(nameContainer);
    reviewPanel.content.append(buttons);

    // add images
    images.forEach((image, i) => {
        reviewGrid.append(createImage(image.preview, i));
    });

    document.body.appendChild(reviewPanel.dom);

    const result = await new Promise<string>((resolve) => {
        upload.on('click', () => {
            resolve(name.value);
        });

        cancel.on('click', () => {
            resolve('');
        });
    });

    document.body.removeChild(reviewPanel.dom);

    return result;
};

export {
    reviewCapture
}
