// LES ARCHIVES — `node test/archives.js`.
//
// Les suites des modules ÉCARTÉS. Elles ne gardent aucun code que le jeu
// exécute : `src/cartes.js` (la chasse-partie en cartes, avec son état-major,
// ses reliques, sa carte annoncée et ses rechargements), `src/battle.js`,
// `src/breche.js`, `src/hex.js`, `src/flotte.js`, `src/shipPlans.js`,
// `src/voyage.js`, et les données de l'ancien moteur.
//
// ON LES GARDE, ET ON NE LES SUPPRIME PAS : elles disent ce qui a été essayé et
// ce que chaque système coûtait, ce qui est la seule chose qui empêche de le
// reconstruire. Elles ne sont simplement plus le filet du jeu.
//
// ON NE CONSTRUIT RIEN DESSUS. Si l'une casse parce qu'un module vivant a
// changé sous elle, c'est le signal qu'un lien traînait encore — à couper, pas
// à réparer.
import { run } from './harness.js';

import './data.test.js';
import './shipPlans.test.js';
import './battle.test.js';
import './rencontre.test.js';
import './flotte.test.js';
import './hex.test.js';
import './breche.test.js';
import './cartes.test.js';
import './voyage.test.js';

console.log('\n  Frères de la Côte — archives (modules écartés)');
await run();
