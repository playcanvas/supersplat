import { Container } from 'pcui';

class Editor {
    constructor() {
        this.initUI();
    }

    initUI() {
        const appContainer = new Container({
            dom: document.getElementById('app-container')
        });
    
        const leftContainer = new Container({
            id: 'left-container',
            resizable: 'right',
            flex: true,
            flexDirection: 'column'
        });
    
        const canvasContainer = new Container({
            id: 'canvas-container'
        });
    
        appContainer.append(leftContainer);
        appContainer.append(canvasContainer);
    };
}

export { Editor };
