// LA SUITE DU JEU — `node test/run.js`, aucune installation.
//
// ELLE NE COURT QUE SUR CE QUI EST VIVANT. Le jour où la volée nue est devenue
// le jeu, cette suite en tenait onze douzièmes ailleurs : 2 287 lignes gardaient
// des modules écartés (battle, breche, hex, flotte, shipPlans) et les données de
// l'ancien moteur, contre 244 pour le plateau qu'on joue. Le total affiché
// rassurait sur la mauvaise moitié — un chiffre vert qui ne dit rien du jeu en
// cours est pire qu'un chiffre rouge.
//
// Les suites des modules écartés n'ont pas été supprimées : elles disent ce qui
// a été essayé, et elles tournent par `node test/archives.js`. On ne construit
// rien dessus.
import { run } from './harness.js';

import './simple.test.js';

console.log('\n  Frères de la Côte — la volée nue');
await run();
