// LES CINQ CARACTÈRES DU GESTE DOIVENT SE DISTINGUER.
//
// C'est la leçon du premier banc, et elle a coûté une livraison. Il empilait
// cinq crans qui s'ajoutaient, et ses tests vérifiaient que les cinq
// FONCTIONNENT — la volée part, la main se refait, aucune erreur en console.
// Tous passaient. Mesuré ensuite sur le rendu réel, quatre des cinq tenaient
// dans 5 px les uns des autres, avec 0° d'écart de rotation et exactement la
// même échelle : l'échelle existait dans le code et nulle part sur l'écran.
//
// C'est la règle 6 du dépôt — une contrainte sans instrument est un vœu — et
// « les cinq variantes doivent être différentes » en était un. En voici
// l'instrument. Il regarde la CONFIGURATION ; `tools/geste-audit.mjs` regarde
// le rendu, parce qu'aucun des deux ne suffit seul : une config distincte peut
// se peindre à l'identique, et un rendu distinct peut l'être par accident.

import { suite, test, assert, equal, empty } from './harness.js';
import { GESTES, SIGNATURES, REFERENCE } from '../src/gestes.js';

suite('le geste — cinq caractères, pas cinq crans');

test('chaque caractère a une signature, et aucune n’est partagée', () => {
  // Deux caractères qui partageraient leur signature seraient le même
  // caractère sous deux noms — et c'est exactement ce que le premier banc a
  // livré. La signature n'est pas une étiquette : c'est la promesse que le
  // banc fait au joueur qui appuie sur le bouton.
  equal(GESTES.length, 5, 'le banc a cinq boutons');
  equal(new Set(SIGNATURES).size, 5, 'deux caractères partagent une signature');
  empty(GESTES.filter((g) => !g.signature || !g.question || !g.note).map((g) => g.rang),
    'des caractères sans signature, sans question ou sans texte');
});

test('chaque caractère allume au moins un ressort que les autres laissent éteint', () => {
  // LE COEUR DU TEST. On relève, pour chacun, les leviers qu'il active ; puis
  // on exige que chacun en possède au moins un que PERSONNE d'autre n'active.
  // Sans cela, on peut écrire cinq configurations différentes qui produisent
  // cinq fois le même écran — cinq réglages du même curseur.
  const LEVIERS = ['amarre', 'cabrage', 'evantail', 'poussiere', 'motes',
    'empreinte', 'visee', 'trainee', 'lancer', 'sequenceApres'];
  const allumes = new Map(GESTES.map((g) => [g.rang, LEVIERS.filter((l) => g[l])]));
  const orphelins = [];
  for (const [rang, mien] of allumes) {
    const autres = new Set([...allumes].filter(([r]) => r !== rang).flatMap(([, l]) => l));
    const propre = mien.filter((l) => !autres.has(l));
    if (!propre.length) {
      orphelins.push(`${rang} — n'allume que ${mien.join(', ') || 'rien'}, que d'autres allument déjà`);
    }
  }
  empty(orphelins, 'des caractères sans levier qui leur soit propre');
});

test('aucun caractère n’est branché sur ce que le geste ne produit pas', () => {
  // LE DÉFAUT EXACT DU PREMIER BANC. Le geste du jeu est une poussée DROITE
  // vers le haut : elle ne produit ni vitesse horizontale, ni tirage vers le
  // bas. Un différenciateur branché là-dessus ne s'allume jamais, et le
  // bouton ment.
  //
  // La vitesse d'un glissement réel a été relevée à l'instrument : médiane
  // 647 px/s, maximum 1 282 sur dix-huit relevés. Un seuil de traînée posé
  // au-dessus de la médiane n'est franchi qu'une fois sur dix-huit.
  const MEDIANE = 647;
  empty(GESTES.filter((g) => g.trainee && g.trainee > MEDIANE)
    .map((g) => `${g.rang} — seuil de traînée à ${g.trainee} px/s, au-dessus de la médiane relevée (${MEDIANE})`),
  'des seuils qu’un glissement réel ne franchit pas');
});

test('l’ombre grandit pendant tout le geste, elle ne s’allume pas', () => {
  // `--leve` suit `-dy / course`. Calée sur `tas` — 70 px — elle saturait au
  // cinquième du geste : les 280 px suivants, elle valait 1 et ne disait plus
  // rien. Une ombre qui s'allume dit « en l'air ou pas » ; une ombre qui
  // grandit dit DE COMBIEN, et c'est la seule chose qu'on lui demande.
  empty(GESTES.filter((g) => g.course < 140)
    .map((g) => `${g.rang} — course de ${g.course} px, l'ombre sature avant la fin du geste`),
  'des ombres qui saturent trop tôt');
});

test('la référence est le geste du jeu, et elle n’est pas un sixième caractère', () => {
  // LE FANTÔME SE SUPERPOSE, IL NE SE CHOISIT PAS. Comparer deux gestes en
  // alternant entre eux, c'est comparer deux souvenirs : on préfère toujours
  // celui qu'on vient d'essayer. Il doit donc rester HORS de la liste.
  assert(REFERENCE.direct === true, 'la référence colle au doigt, sans ressort');
  assert(!GESTES.includes(REFERENCE), 'la référence ne doit pas être un bouton de plus');
  empty(GESTES.filter((g) => g.direct).map((g) => g.rang),
    'des caractères qui collent au doigt — c’est le rôle de la référence, pas d’un caractère');
});
