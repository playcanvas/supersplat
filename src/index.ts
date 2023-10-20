import { main } from './main';
import { version as supersplatVersion } from '../package.json';
import { version as pcuiVersion, revision as pcuiRevision } from 'pcui';
import { version as engineVersion, revision as engineRevision } from 'playcanvas';
import './style.scss';

// print out versions of dependent packages
console.log(`Supersplat v${supersplatVersion} | PCUI v${pcuiVersion} (${pcuiRevision}) | PlayCanvas Engine v${engineVersion} (${engineRevision})`);

main();