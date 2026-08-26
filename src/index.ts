import './ui/scss/style.scss';
import { version as pcuiVersion, revision as pcuiRevision } from '@playcanvas/pcui';
import { version as stVersion, revision as stRevision } from '@playcanvas/splat-transform';
import { version as engineVersion, revision as engineRevision } from 'playcanvas';

import { main } from './main';
import { version as appVersion } from '../package.json';
import { i18n } from './ui/localization';

// print out versions of dependent packages
// NOTE: add dummy style reference to prevent tree shaking
console.log(`SuperSplat v${appVersion} | SplatTransform v${stVersion} (${stRevision}) | Engine v${engineVersion} (${engineRevision}) | PCUI v${pcuiVersion} (${pcuiRevision})`);

// the graphics device requests webgpu only, so the most likely startup failure
// is a browser without it. Without this the rejection is an unhandled promise
// and the user is left looking at a blank page.
main().catch((err) => {
    console.error(err);

    const [key, fallback] = window.navigator.gpu ?
        ['startup.failed', 'SuperSplat failed to start. See the browser console for details.'] :
        ['startup.webgpu-unavailable', 'SuperSplat requires WebGPU, which this browser does not support. Please try the latest Chrome, Edge or Safari.'];

    // i18n is initialized early in main(), but the failure may have hit before
    // that - fall back to english when the key can't resolve
    let message = fallback;
    try {
        const localized = i18n.t(key);
        if (localized && localized !== key) {
            message = localized;
        }
    } catch (e) {
        // keep the fallback
    }

    const dom = window.document.createElement('div');
    dom.id = 'startup-error';
    dom.textContent = message;

    window.document.body.replaceChildren(dom);
});
