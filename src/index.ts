import './ui/scss/style.scss';
import { version as pcuiVersion, revision as pcuiRevision } from '@playcanvas/pcui';
import { version as engineVersion, revision as engineRevision } from 'playcanvas';

import { main } from './main';
import { version as appVersion } from '../package.json';

// print out versions of dependent packages
// NOTE: add dummy style reference to prevent tree shaking
console.log(`SuperSplat v${appVersion} | PCUI v${pcuiVersion} (${pcuiRevision}) | Engine v${engineVersion} (${engineRevision})`);

// find the container element and pass it to main
const container = document.getElementById('supersplat-container');
if (!container) {
    console.error('SuperSplat container element not found. Please add a div with id="supersplat-container" to your HTML.');
} else {
    main(container);
}
