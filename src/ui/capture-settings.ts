import { Button, Container, Label, Panel, SelectInput } from 'pcui';

interface CaptureSettings {
    resolution: number;
    iterations: number;
};

const showCaptureSettings = async (captureSettings: CaptureSettings) => {
    const captureSettingsPanel = new Panel({
        id: 'capture-settings-panel',
        headerText: 'SETTINGS',
        flex: true,
        flexDirection: 'column'
    });

    const captureSettingsContainer = new Container({
        id: 'capture-settings-container'
    });

    // resolution

    const resolutionLabel = new Label({
        class: 'capture-settings-label',
        text: 'Resolution'
    });

    const resolution = new SelectInput({
        class: 'capture-settings-value',
        defaultValue: '1600',
        options: [ 800, 1024, 1600, 1920, 3200 ].map((v) => {
            return { v: v.toString(), t: v.toString() };
        })
    });

    const resolutionContainer = new Container({
        class: 'capture-settings-entry'
    });

    resolutionContainer.append(resolutionLabel);
    resolutionContainer.append(resolution);

    // iterations

    const iterationsLabel = new Label({
        class: 'capture-settings-label',
        text: 'Iterations'
    });

    const iterations = new SelectInput({
        class: 'capture-settings-value',
        defaultValue: '7000',
        options: [ 1000, 7000, 30000, 100000 ].map((v) => {
            return { v: v.toString(), t: v.toString() };
        })
    });

    const iterationsContainer = new Container({
        class: 'capture-settings-entry'
    });

    iterationsContainer.append(iterationsLabel);
    iterationsContainer.append(iterations);

    // buttons

    const save = new Button({
        class: 'capture-settings-button',
        text: 'SAVE'
    });

    const cancel = new Button({
        class: 'capture-settings-button',
        text: 'CANCEL'
    });

    const buttons = new Container({
        id: 'capture-settings-buttons'
    });
    buttons.append(save);
    buttons.append(cancel);

    captureSettingsContainer.append(resolutionContainer);
    captureSettingsContainer.append(iterationsContainer);

    captureSettingsPanel.content.append(captureSettingsContainer);
    captureSettingsPanel.content.append(buttons);

    resolution.value = captureSettings.resolution.toString();
    iterations.value = captureSettings.iterations.toString();

    document.body.appendChild(captureSettingsPanel.dom);

    const result = await new Promise<boolean>((resolve) => {

        save.on('click', () => {
            // save settings to captureSettings
            captureSettings.resolution = parseInt(resolution.value, 10);
            captureSettings.iterations = parseInt(iterations.value, 10);
            resolve(true);
        });

        cancel.on('click', () => {
            resolve(false);
        });    

        // setTimeout required here otherwise the click event that launched this panel triggers the
        // onclick handler.
        setTimeout(() => {
            document.body.onclick = (event: MouseEvent) => {
                if (!captureSettingsPanel.dom.contains(event.target as Node)) {
                    resolve(false);
                }
            }
        });
    });

    document.body.onclick = null;
    document.body.removeChild(captureSettingsPanel.dom);

    return result;
};

export { CaptureSettings, showCaptureSettings };
