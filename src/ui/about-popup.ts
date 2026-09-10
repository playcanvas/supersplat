import { Container, Label, version as pcuiVersion, revision as pcuiRevision } from '@playcanvas/pcui';
import { version as engineVersion, revision as engineRevision } from 'playcanvas';

import { i18n } from './localization';
import logoSvg from './svg/logo.svg';
import { version as appVersion } from '../../package.json';


class AboutPopup extends Container {
    constructor(args = {}) {
        args = {
            ...args,
            id: 'about-popup',
            class: 'blocks-shortcuts',
            hidden: true,
            tabIndex: -1
        };

        super(args);

        // Handle keyboard events
        this.dom.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.hidden = true;
            }
            e.stopPropagation();
        });

        // Close when clicking outside dialog
        this.on('click', () => {
            this.hidden = true;
        });

        const dialog = new Container({
            id: 'about-dialog'
        });

        // Prevent clicks inside dialog from closing
        dialog.on('click', (event: MouseEvent) => {
            event.stopPropagation();
        });

        // Header bar
        const header = new Label({
            id: 'about-header'
        });
        i18n.bindText(header, 'menu.help.about');

        // Content area
        const content = new Container({
            id: 'about-content'
        });

        // Logo
        const logoContainer = new Container({
            id: 'about-logo'
        });
        // svg imports are data URIs (rollup plugin-image); parse to a real element
        const logoMarkup = decodeURIComponent(logoSvg.substring('data:image/svg+xml,'.length));
        logoContainer.dom.appendChild(new DOMParser().parseFromString(logoMarkup, 'image/svg+xml').documentElement);
        logoContainer.dom.addEventListener('click', () => {
            window.open('https://github.com/playcanvas/supersplat', '_blank')?.focus();
        });

        // App name and version
        const appInfo = new Container({
            id: 'about-app-info'
        });
        appInfo.dom.addEventListener('click', () => {
            window.open('https://github.com/playcanvas/supersplat', '_blank')?.focus();
        });

        const appName = new Label({
            id: 'about-app-name',
            text: 'SuperSplat'
        });

        const appVersionLabel = new Label({
            id: 'about-app-version',
            text: `v${appVersion}`
        });

        appInfo.append(appName);
        appInfo.append(appVersionLabel);

        // Dependencies
        const depsContainer = new Container({
            id: 'about-deps'
        });

        // PCUI
        const pcuiRow = new Container({
            class: 'about-dep-row'
        });
        pcuiRow.dom.addEventListener('click', () => {
            window.open('https://github.com/playcanvas/pcui', '_blank')?.focus();
        });
        const pcuiName = new Label({ class: 'about-dep-name', text: 'PCUI' });
        const pcuiVersionL = new Label({ class: 'about-dep-version', text: `v${pcuiVersion}` });
        const pcuiRev = new Label({ class: 'about-dep-revision', text: `(${pcuiRevision.substring(0, 7)})` });
        pcuiRow.append(pcuiName);
        pcuiRow.append(pcuiVersionL);
        pcuiRow.append(pcuiRev);

        // Engine
        const engineRow = new Container({
            class: 'about-dep-row'
        });
        engineRow.dom.addEventListener('click', () => {
            window.open('https://github.com/playcanvas/engine', '_blank')?.focus();
        });
        const engineName = new Label({ class: 'about-dep-name', text: 'PlayCanvas' });
        const engineVer = new Label({ class: 'about-dep-version', text: `v${engineVersion}` });
        const engineRev = new Label({ class: 'about-dep-revision', text: `(${engineRevision.substring(0, 7)})` });
        engineRow.append(engineName);
        engineRow.append(engineVer);
        engineRow.append(engineRev);

        depsContainer.append(pcuiRow);
        depsContainer.append(engineRow);

        // Assemble content
        content.append(logoContainer);
        content.append(appInfo);
        content.append(depsContainer);

        // Assemble dialog
        dialog.append(header);
        dialog.append(content);

        this.append(dialog);

        // Focus when shown so keyboard events work
        this.on('show', () => {
            this.dom.focus();
        });
    }
}

export { AboutPopup };
