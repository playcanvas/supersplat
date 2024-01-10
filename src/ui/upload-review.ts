import { Button, Container, Label, Panel, SelectInput, TextInput } from "@playcanvas/pcui";
import { uploadImagePack } from "./capture-images";
import { startSpinner, stopSpinner } from "./spinner";

const reviewAndUpload = async (data: Blob) => {
        // name

        const nameLabel = new Label({
            class: 'upload-review-label',
            text: 'Scene Name'
        });

        const name = new TextInput({
            class: 'upload-review-value-expand',
            value: 'Upload'
        });

        const nameContainer = new Container({
            class: 'upload-review-entry'
        });

        nameContainer.append(nameLabel);
        nameContainer.append(name);

        // resolution

        const resolutionLabel = new Label({
            class: 'upload-review-label',
            text: 'Resolution'
        });

        const resolution = new SelectInput({
            class: 'upload-review-value-expand',
            defaultValue: '1600',
            options: [ 800, 1024, 1600, 1920, 3200 ].map((v) => {
                return { v: v.toString(), t: v.toString() };
            })
        });

        const resolutionContainer = new Container({
            class: 'upload-review-entry'
        });

        resolutionContainer.append(resolutionLabel);
        resolutionContainer.append(resolution);

        // iterations

        const iterationsLabel = new Label({
            class: 'upload-review-label',
            text: 'Iterations'
        });

        const iterations = new SelectInput({
            class: 'upload-review-value-expand',
            defaultValue: '7000',
            options: [ 1000, 7000, 30000, 100000 ].map((v) => {
                return { v: v.toString(), t: v.toString() };
            })
        });

        const iterationsContainer = new Container({
            class: 'upload-review-entry'
        });

        iterationsContainer.append(iterationsLabel);
        iterationsContainer.append(iterations);

        // buttons

        const apply = new Button({
            class: 'upload-review-button',
            text: 'UPLOAD'
        });
        const cancel = new Button({
            class: 'upload-review-button',
            text: 'CANCEL'
        });

        const buttons = new Container({
            id: 'upload-review-buttons',
            flex: true,
            flexDirection: 'row'
        });
        buttons.append(apply);
        buttons.append(cancel);

        // panel

        const reviewPanel = new Panel({
            id: 'upload-review-panel',
            headerText: 'UPLOAD',
            flex: true,
            flexDirection: 'column'
        });
        reviewPanel.content.append(nameContainer);
        reviewPanel.content.append(resolutionContainer);
        reviewPanel.content.append(iterationsContainer);
        reviewPanel.content.append(buttons);

        document.body.appendChild(reviewPanel.dom);

        const result = await new Promise<{ name: string, upload: boolean, download: boolean } | null>((resolve) => {
            apply.on('click', () => {
                startSpinner();
                uploadImagePack(
                    name.value,
                    parseInt(resolution.value, 10),
                    parseInt(iterations.value, 10),
                    data)
                .then(() => resolve(null))
                .finally(() => stopSpinner());
            });

            cancel.on('click', () => {
                resolve(null);
            });

            // setTimeout required here otherwise the click event that launched this panel triggers the
            // onclick handler.
            setTimeout(() => {
                document.body.onclick = (event: MouseEvent) => {
                    if (!reviewPanel.dom.contains(event.target as Node)) {
                        // event.stopPropagation();
                        event.preventDefault();
                    }
                }
            });
        });

        document.body.onclick = null;
        document.body.removeChild(reviewPanel.dom);

        return result;

};

export {
    reviewAndUpload
}
