const createImageDom = (canvas: HTMLCanvasElement, index: number) => {
    const div = document.createElement('div');
    div.setAttribute('style', 'display: flex; flex-direction: column; width: 100px; height: 120px; border: 8px solid black; background-color: white;');

    canvas.setAttribute('style', 'max-width: 100px; max-height: 100px;')

    const text = document.createElement('div');
    text.textContent = `${index}`;
    text.setAttribute('style', 'text-align: center;');

    div.appendChild(canvas);
    div.appendChild(text);

    // canvas.setAttribute('style', 'width: 100px; height: 100px; border: 8px solid black;');
    // parent.appendChild(image);

    return div;
};

const reviewCapture = async (images: HTMLCanvasElement[]) => {
    const parent = document.createElement('div');
    parent.setAttribute('style', 'position: absolute; top: 80px; left: 80px; right: 80px; bottom: 80px;');

    images.forEach((image, index) => {
        parent.appendChild(createImageDom(image, index));
    });

    const upload = document.createElement('button');
    upload.textContent = 'Upload';

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';

    parent.appendChild(upload);
    parent.appendChild(cancel);

    document.body.append(parent);

    const result = await new Promise<boolean>((resolve) => {
        upload.addEventListener('click', () => {
            resolve(true);
        });

        cancel.addEventListener('click', () => {
            resolve(false);
        });
    });

    document.body.removeChild(parent);

    return result;
};

export {
    reviewCapture
}