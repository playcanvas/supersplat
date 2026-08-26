import './ui/scss/style.scss';
import { version as pcuiVersion, revision as pcuiRevision } from '@playcanvas/pcui';
import { version as stVersion, revision as stRevision } from '@playcanvas/splat-transform';
import { version as engineVersion, revision as engineRevision } from 'playcanvas';

import { main } from './main';
import { version as appVersion } from '../package.json';

// print out versions of dependent packages
// NOTE: add dummy style reference to prevent tree shaking
console.log(`SuperSplat v${appVersion} | SplatTransform v${stVersion} (${stRevision}) | Engine v${engineVersion} (${engineRevision}) | PCUI v${pcuiVersion} (${pcuiRevision})`);

// the graphics device requests webgpu only, so the most likely startup failure
// is a browser without it. Without this the rejection is an unhandled promise
// and the user is left looking at a blank page.
main().catch((err) => {
    console.error(err);

    const message = window.navigator.gpu ?
        'SuperSplat failed to start. See the browser console for details.' :
        'SuperSplat requires WebGPU, which this browser does not support. Please try the latest Chrome, Edge or Safari.';

    const dom = window.document.createElement('div');
    dom.id = 'startup-error';
    dom.textContent = message;

    window.document.body.replaceChildren(dom);
});
