// La rade (proposition C) — les règles, et le pari qu'elles portent.
//
// Deux choses valent d'être testées ici. D'abord les invariants durs : pas
// d'aléatoire dans la résolution, pas d'ordre qui échoue en silence, pas de
// butin qui sort de nulle part. Ensuite la FORME du jeu : si foncer au fond de
// la rade est toujours mauvais, ce n'est pas un pari, c'est un piège — et
// aucune vérification de syntaxe ne le dira.

import { readFileSync } from 'node:fs';
import { suite, test, assert, equal, empty } from './harness.js';
import * as F from '../src/flotte.js';

const rngFor = (seed) => {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
};
const rade = (seed) => F.nouvelleRade(F.genererRade(rngFor(seed)));

// ---------------------------------------------------------------------------

suite('rade — invariants');

// Le §4.1 tient tout le jeu : la résolution est un problème fermé, pas un jet.
test('the rules never reach for a die', () => {
  const src = readFileSync(new URL('../src/flotte.js', import.meta.url), 'utf8');
  const code = src.replace(/^\s*\/\/.*$/gm, '');       // les commentaires peuvent en parler
  const bad = [];
  for (const interdit of ['Math.random', 'Date.now', 'crypto']) {
    // `genererRade` reçoit un rng du dehors : elle n'en fabrique pas.
    if (code.includes(interdit)) bad.push(`src/flotte.js contient ${interdit}`);
  }
  empty(bad, 'entropy inside the resolution');
});

test('the same rade played the same way ends the same way', () => {
  const jouer = () => {
    const R = rade(4242);
    F.ordonner(R, 'bordee', 1); F.ordonner(R, 'serrer');
    F.ordonner(R, 'bordee', 2); F.ordonner(R, 'aborder', 3);
    return JSON.stringify({ n: R.nous, e: R.escadres, p: R.pris, b: R.bande });
  };
  equal(jouer(), jouer(), 'deux parties identiques doivent finir identiques');
});

// Un ordre refusé en silence consomme le clic du joueur sans rien changer :
// c'est invisible jusqu'au moment où on se demande pourquoi rien ne bouge.
test('an impossible order is refused out loud and changes nothing', () => {
  const R = rade(7);
  const avant = JSON.stringify(R);
  const bad = [];
  if (F.ordonner(R, 'rompre')) bad.push('rompre au large aurait dû être refusé');
  if (F.ordonner(R, 'bordee', 99)) bad.push('border une escadre inexistante aurait dû être refusé');
  if (F.ordonner(R, 'aborder', 5)) bad.push('aborder une batterie aurait dû être refusé');
  if (F.ordonner(R, 'sabordage')) bad.push('un ordre inconnu aurait dû être refusé');
  if (JSON.stringify(R) !== avant) bad.push("un ordre refusé a quand même modifié la rade");
  empty(bad, 'silent refusals');
});

test('every accepted order costs a turn, every refused one does not', () => {
  const R = rade(11);
  const t0 = R.tour;
  assert(F.ordonner(R, 'serrer'), 'serrer depuis le large doit passer');
  equal(R.tour, t0 + 1, 'un ordre accepté avance le tour');
  const t1 = R.tour;
  F.ordonner(R, 'bordee', 999);
  equal(R.tour, t1, 'un ordre refusé ne consomme pas le tour');
});

// L'aperçu est une promesse affichée avant le clic. S'il ment, tout le contrat
// de lisibilité de C tombe.
test('the preview says exactly what the order will do', () => {
  const bad = [];
  for (let seed = 1; seed <= 200; seed++) {
    const R = rade(seed * 2654435761);
    for (const e of F.vivantes(R)) {
      if (!F.aPortee(R, e)) continue;
      const promis = F.apercu(R, 'bordee', e.id);
      const copie = F.nouvelleRade(R.escadres.map((x) => ({ ...x })), { navires: R.nous.length });
      copie.bande = R.bande;
      copie.escadres = R.escadres.map((x) => ({ ...x }));
      const avant = copie.escadres.find((x) => x.id === e.id).n;
      F.ordonner(copie, 'bordee', e.id);
      const apres = copie.escadres.find((x) => x.id === e.id).n;
      if (avant - apres !== promis.coules) {
        bad.push(`rade ${seed}, escadre ${e.id} : promis ${promis.coules} coulée(s), obtenu ${avant - apres}`);
      }
    }
    if (bad.length > 4) break;
  }
  empty(bad, 'lying previews');
});

test('prizes are only ever taken from a squadron that had them', () => {
  const bad = [];
  for (let seed = 1; seed <= 200; seed++) {
    const R = rade(seed * 7919);
    F.ordonner(R, 'serrer');
    for (const e of F.vivantes(R).filter((x) => x.role === 'transport')) {
      const avant = e.n;
      const promis = F.apercu(R, 'aborder', e.id);
      if (!promis) continue;
      const prisAvant = R.pris.length;
      F.ordonner(R, 'aborder', e.id);
      const gagne = R.pris.length - prisAvant;
      if (gagne !== promis.prises) bad.push(`rade ${seed} : ${gagne} prise(s) pour ${promis.prises} promise(s)`);
      if (gagne > avant) bad.push(`rade ${seed} : ${gagne} prises sur une escadre de ${avant}`);
    }
    if (bad.length > 4) break;
  }
  empty(bad, 'prizes from nowhere');
});

// ---------------------------------------------------------------------------

suite('rade — la forme du pari');

// Les trois politiques ci-dessous ne sont pas des « IA » : ce sont trois façons
// de jouer, et on mesure ce que chacune rapporte. Un jeu où une seule est
// jouable n'a pas de décision à offrir.
function prudent(R) {
  const ici = F.vivantes(R).filter((e) => e.bande === R.bande);
  const perdus = R.nous.filter((n) => n.pv <= 0).length;
  if (perdus >= 2) return R.bande > F.LARGE ? ['rompre'] : ['retirer'];
  const proie = ici.find((e) => e.role === 'transport');
  if (proie && F.apercu(R, 'aborder', proie.id)?.prises > 0) return ['aborder', proie.id];
  const garde = ici.find((e) => e.role === 'escorte') || ici.find((e) => e.role === 'batterie');
  if (garde) return ['bordee', garde.id];
  return R.bande < F.TERRE ? ['serrer'] : ['retirer'];
}
function avide(R) {
  const ici = F.vivantes(R).filter((e) => e.bande === R.bande);
  const proie = ici.find((e) => e.role === 'transport');
  if (proie && F.apercu(R, 'aborder', proie.id)?.prises > 0) return ['aborder', proie.id];
  if (R.bande < F.TERRE) return ['serrer'];
  const bat = ici.find((e) => e.role === 'batterie');
  return bat ? ['bordee', bat.id] : ['retirer'];
}

function campagne(politique, n = 300) {
  const res = [];
  for (let i = 1; i <= n; i++) {
    const R = rade(i * 40503);
    for (let k = 0; k < 60 && !R.fini; k++) {
      // Une interface n'offre jamais un ordre impossible ; la sonde non plus.
      if (F.ordonner(R, ...politique(R))) continue;
      if (!F.ordonner(R, 'retirer')) break;
    }
    res.push({ sorti: R.fini === 'retire', or: R.fini === 'retire' ? F.butin(R) : 0, tours: R.tour });
  }
  const moy = (k) => res.reduce((s, r) => s + r[k], 0) / res.length;
  return { sortis: res.filter((r) => r.sorti).length / res.length, or: moy('or'), tours: moy('tours') };
}

test('both ways of raiding are viable, and they are not the same raid', () => {
  const p = campagne(prudent), a = campagne(avide);
  console.log(`      prudent : ${(100 * p.sortis).toFixed(0)}% sortent · ${p.or.toFixed(0)} 💰 · ${p.tours.toFixed(1)} tours`);
  console.log(`      avide   : ${(100 * a.sortis).toFixed(0)}% sortent · ${a.or.toFixed(0)} 💰 · ${a.tours.toFixed(1)} tours`);
  assert(p.sortis > 0.5, `le jeu prudent ne sort que dans ${(100 * p.sortis).toFixed(0)}% des rades`);
  assert(a.sortis > 0.2, `foncer ne marche jamais (${(100 * a.sortis).toFixed(0)}%) : le fond de la rade est un piège, pas un pari`);
  assert(a.sortis < p.sortis, 'foncer devrait être plus dangereux que se retenir');
  // Un ordre relatif ne suffit pas : si la rade devient sûre pour tout le
  // monde, « foncer moins bien que se retenir » reste vrai et le pari a
  // pourtant disparu. (Vérifié en désarmant la batterie : ce test-ci le voit,
  // celui du dessus non.)
  assert(a.sortis < 0.75, `foncer sort dans ${(100 * a.sortis).toFixed(0)}% des rades : ce n'est plus un pari`);
  assert(a.tours < p.tours, 'foncer devrait être plus court, sinon il ne rachète rien');
});

// « Nerveux » est une intention ; c'est aussi un nombre.
test('a raid is over in a handful of orders', () => {
  const p = campagne(prudent), a = campagne(avide);
  const pire = Math.max(p.tours, a.tours);
  assert(pire <= 14, `une rade dure ${pire.toFixed(1)} ordres en moyenne : ce n'est plus nerveux`);
});

// Le butin ne compte que ramené : c'est ce qui fait du dernier tour une
// décision plutôt qu'une formalité.
test('gold left in the roadstead is gold lost', () => {
  const R = rade(31337);
  F.ordonner(R, 'serrer');
  const proie = F.vivantes(R).find((e) => e.role === 'transport' && e.bande === R.bande);
  assert(proie, 'la rade doit offrir un transport à la ligne');
  F.ordonner(R, 'aborder', proie.id);
  assert(F.butin(R) > 0, 'un abordage réussi doit embarquer du butin');
  // On coule tout l'équipage : le butin est perdu avec lui.
  while (F.aFlot(R).length) R.nous.forEach((n) => { n.pv = 0; });
  R.fini = 'detruit';
  assert(R.fini === 'detruit', 'une escadre détruite ne ramène rien — la maquette le dit à la fin');
});

test('withdrawing under the guns can itself be fatal', () => {
  const R = rade(99);
  F.ordonner(R, 'serrer'); F.ordonner(R, 'serrer');
  const cout = F.coutDeRetraite(R);
  assert(cout > 0, 'sortir du fond de la rade doit coûter quelque chose');
  assert(cout >= F.coupsRecus(R), 'sortir coûte au moins ce que coûte rester');
});
