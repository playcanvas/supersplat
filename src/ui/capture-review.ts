import { Button, Container, Element, GridView, GridViewItem, Panel } from "@playcanvas/pcui";

const createImage = (canvas: HTMLCanvasElement, index: number) => {
    canvas.setAttribute('style', 'max-width: 100px; max-height: 100px;');

    const thumbnail = new Element({
        class: 'review-thumbnail',
        dom: 'span'
    });
    thumbnail.dom.appendChild(canvas);

    const item = new GridViewItem();
    item.prepend(thumbnail);

    return thumbnail;
};

const reviewCapture = async (images: HTMLCanvasElement[]) => {
    const reviewGrid = new GridView({
        id: 'review-grid'
    });

    const reviewGridContainer = new Container({
        id: 'review-grid-container'
    });
    reviewGridContainer.append(reviewGrid);

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
    reviewPanel.content.append(buttons);

    // add images
    images.forEach((image, i) => {
        reviewGrid.append(createImage(image, i));
    });

    document.body.appendChild(reviewPanel.dom);

    const result = await new Promise<boolean>((resolve) => {
        upload.on('click', () => {
            resolve(true);
        });

        cancel.on('click', () => {
            resolve(false);
        });
    });

    document.body.removeChild(reviewPanel.dom);

    return result;
};

export {
    reviewCapture
}
