import { Button, Container, Element, GridView, GridViewItem, Label, Panel, SelectInput, TextInput } from "@playcanvas/pcui";

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
        class: 'review-value',
        value: 'Capture'
    });

    const nameContainer = new Container({
        class: 'review-entry'
    });

    nameContainer.append(nameLabel);
    nameContainer.append(name);

    // resolution

    const resolutionLabel = new Label({
        class: 'review-label',
        text: 'Resolution'
    });

    const resolution = new SelectInput({
        class: 'review-value',
        defaultValue: '1600',
        options: [ 800, 1024, 1600, 1920, 3200 ].map((v) => {
            return { v: v.toString(), t: v.toString() };
        })
    });

    const resolutionContainer = new Container({
        class: 'review-entry'
    });

    resolutionContainer.append(resolutionLabel);
    resolutionContainer.append(resolution);

    // iterations

    const iterationsLabel = new Label({
        class: 'review-label',
        text: 'Iterations'
    });

    const iterations = new SelectInput({
        class: 'review-value',
        defaultValue: '7000',
        options: [ 1000, 7000, 30000, 100000 ].map((v) => {
            return { v: v.toString(), t: v.toString() };
        })
    });

    const iterationsContainer = new Container({
        class: 'review-entry'
    });

    iterationsContainer.append(iterationsLabel);
    iterationsContainer.append(iterations);

    // buttons

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
    reviewPanel.content.append(resolutionContainer);
    reviewPanel.content.append(iterationsContainer);
    reviewPanel.content.append(buttons);

    // add images
    images.forEach((image, i) => {
        reviewGrid.append(createImage(image.preview, i));
    });

    document.body.appendChild(reviewPanel.dom);

    const result = await new Promise<{ name: string, resolution: number, iterations: number } | null>((resolve) => {
        upload.on('click', () => {
            resolve({
                name: name.value,
                resolution: parseInt(resolution.value, 10),
                iterations: parseInt(iterations.value, 10)
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
