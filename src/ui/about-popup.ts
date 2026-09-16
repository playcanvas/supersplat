import { Container, Label, version as pcuiVersion } from '@playcanvas/pcui';
import { version as stVersion } from '@playcanvas/splat-transform';
import { version as engineVersion } from 'playcanvas';

import { Events } from '../events';
import { i18n } from './localization';
import logoSvg from './svg/logo.svg';
import { version as appVersion } from '../../package.json';


class AboutPopup extends Container {
    constructor(events: Events, args = {}) {
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
        i18n.bindText(header, 'popup.about.title');

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
        pcuiRow.append(pcuiName);
        pcuiRow.append(pcuiVersionL);

        // Engine
        const engineRow = new Container({
            class: 'about-dep-row'
        });
        engineRow.dom.addEventListener('click', () => {
            window.open('https://github.com/playcanvas/engine', '_blank')?.focus();
        });
        const engineName = new Label({ class: 'about-dep-name', text: 'Engine' });
        const engineVer = new Label({ class: 'about-dep-version', text: `v${engineVersion}` });
        engineRow.append(engineName);
        engineRow.append(engineVer);

        // Splat Transform
        const stRow = new Container({
            class: 'about-dep-row'
        });
        stRow.dom.addEventListener('click', () => {
            window.open('https://github.com/playcanvas/splat-transform', '_blank')?.focus();
        });
        const stName = new Label({ class: 'about-dep-name', text: 'Splat Transform' });
        const stVer = new Label({ class: 'about-dep-version', text: `v${stVersion}` });
        stRow.append(stName);
        stRow.append(stVer);

        depsContainer.append(engineRow);
        depsContainer.append(stRow);
        depsContainer.append(pcuiRow);

        const gpuRow = new Container({ id: 'about-gpu' });
        const gpuLabel = new Label({ class: 'about-dep-name' });
        i18n.bindText(gpuLabel, 'popup.about.gpu');
        const gpuName = new Label({ id: 'about-gpu-name', class: 'about-dep-version' });
        gpuRow.append(gpuLabel);
        gpuRow.append(gpuName);

        const brand = new Container({ id: 'about-brand' });
        brand.append(logoContainer);
        brand.append(appInfo);

        const details = new Container({ id: 'about-details' });
        details.append(gpuRow);
        details.append(depsContainer);

        // Assemble content
        content.append(brand);
        content.append(details);

        // Assemble dialog
        dialog.append(header);
        dialog.append(content);

        this.append(dialog);

        // Focus when shown so keyboard events work
        this.on('show', () => {
            gpuName.text = events.invoke('scene.gpu') || i18n.t('popup.about.gpu-unavailable');
            this.dom.focus();
        });
    }
}

export { AboutPopup };
