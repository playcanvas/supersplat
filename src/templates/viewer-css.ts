const template = /* css */ `
* {
    margin: 0;
    padding: 0;
    touch-action: none;
}
body {
    overflow: hidden;
}
.hidden {
    display: none !important;
}
#infoPanel {
    font-family: 'Arial', sans-serif;
    color: #2c3e50;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
}
#infoPanelContent {
    background: rgba(255, 255, 255, 0.95);
    padding: 20px;
    border-radius: 8px;
    border: 1px solid #ddd;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}
#infoPanelContent h3 {
    margin: 0 0 12px 0;
    color: #2c3e50;
}
.control-item {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    line-height: 1.5;
}
.control-action {
    text-align: left;
}
.control-key {
    text-align: right;
    color: #666;
}
#loadingIndicator {
    font-family: 'Arial', sans-serif;
    color: #2c3e50;
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(255, 255, 255, 0.95);
    padding: 20px;
    border-radius: 8px;
    border: 1px solid #ddd;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 1000;
}
#buttonContainer {
    position: absolute;
    display: flex;
    bottom: max(16px, env(safe-area-inset-bottom));
    right: max(16px, env(safe-area-inset-right));
    gap: 8px;
}
.button {
    display: flex;
    position: relative;
    width: 40px;
    height: 40px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #ddd;
    border-radius: 8px;
    cursor: pointer;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin: 0;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition: background-color 0.2s;
    color: #2c3e50;
}
.buttonSvg {
    display: block;
    margin: auto;
}`;

export { template };
