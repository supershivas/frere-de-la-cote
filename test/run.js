// Test entry point — `node test/run.js`, no install required.
import { run } from './harness.js';

import './data.test.js';
import './shipPlans.test.js';
import './battle.test.js';
import './rencontre.test.js';
import './flotte.test.js';
import './hex.test.js';
import './breche.test.js';
import './cartes.test.js';

console.log('\n  Frères de la Côte — data & integrity checks');
await run();
