// La rade tactique (proposition D). Les invariants d'abord, puis la question
// qui décide de tout : le plateau est-il un problème *soluble et serré* ?
//
// Into the Breach tient sur une promesse — tout ce que l'ennemi fera est écrit
// avant qu'on joue, donc chaque tour a une meilleure réponse trouvable. Si
// l'aperçu ment, ou si pousser un tireur n'annule pas son tir, la promesse est
// rompue et le jeu redevient un pari. Ces tests-là sont plus importants que le
// comptage de dégâts.

import { readFileSync } from 'node:fs';
import { suite, test, assert, equal, empty } from './harness.js';
import * as D from '../src/breche.js';
import { key, distance, voisin, voisins, axe, same } from '../src/hex.js';

const rngFor = (seed) => {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
};
const rade = (seed) => D.nouvelleRade(D.genererRade(rngFor(seed)));

suite('rade tactique — invariants');

test('the rules never reach for a die', () => {
  const code = readFileSync(new URL('../src/breche.js', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
  const bad = [];
  for (const interdit of ['Math.random', 'Date.now', 'crypto']) {
    if (code.includes(interdit)) bad.push(`src/breche.js contient ${interdit}`);
  }
  empty(bad, 'entropy inside the resolution');
});

test('the same board played the same way ends the same way', () => {
  const jouer = () => {
    const B = rade(4242);
    for (let t = 0; t < 3; t++) {
      for (const u of D.nous(B)) {
        const c = D.cibles(B, u);
        if (c.length) D.agir(B, u, c[0]);
        else { const a = D.atteignables(B, u); if (a.length) D.deplacer(B, u, a[0]); }
      }
      D.finDeTour(B);
    }
    return JSON.stringify({ u: B.unites, p: B.pris, e: B.echappes, t: B.tour });
  };
  equal(jouer(), jouer(), 'deux parties identiques doivent finir identiques');
});

test('the board is always playable: reefs never wall it off', () => {
  const bad = [];
  for (let seed = 1; seed <= 200; seed++) {
    const B = rade(seed * 2654435761);
    // Deux récifs voisins feraient un mur ; le générateur les garde isolés.
    for (const k of B.recifs) {
      const [q, r] = k.split(',').map(Number);
      for (const n of voisins({ q, r })) {
        if (B.recifs.has(key(n.q, n.r))) bad.push(`rade ${seed} : récifs collés en ${k}`);
      }
    }
    // Et chacun de nos bâtiments a au moins une case où aller.
    for (const u of D.nous(B)) {
      if (!D.atteignables(B, u).length) bad.push(`rade ${seed} : ${u.nom} est enfermée`);
    }
    if (bad.length > 3) break;
  }
  empty(bad, 'unplayable boards');
});

test('nothing is ever placed on a reef, or on top of something else', () => {
  const bad = [];
  for (let seed = 1; seed <= 200; seed++) {
    const B = rade(seed * 7919);
    const occupe = new Set();
    for (const u of B.unites) {
      const k = key(u.q, u.r);
      if (B.recifs.has(k)) bad.push(`rade ${seed} : ${u.nom} posée sur un récif`);
      if (occupe.has(k)) bad.push(`rade ${seed} : deux coques en ${k}`);
      occupe.add(k);
      if (!D.dansLaRade(B, u)) bad.push(`rade ${seed} : ${u.nom} hors du plateau`);
    }
    if (bad.length > 3) break;
  }
  empty(bad, 'bad placements');
});

test('an impossible order is refused out loud and changes nothing', () => {
  const B = rade(11);
  const u = D.nous(B)[0];
  const avant = JSON.stringify(B.unites);
  const bad = [];
  if (D.deplacer(B, u, { q: 99, r: 99 })) bad.push('un déplacement hors plateau a été accepté');
  if (D.agir(B, u, { q: 99, r: 99 })) bad.push('une action sur le vide a été acceptée');
  const recif = [...B.recifs][0].split(',').map(Number);
  if (D.deplacer(B, u, { q: recif[0], r: recif[1] })) bad.push('un déplacement sur un récif a été accepté');
  if (JSON.stringify(B.unites) !== avant) bad.push('un ordre refusé a quand même bougé quelque chose');
  empty(bad, 'silent refusals');
});

test('each ship moves once and acts once per turn', () => {
  const B = rade(31337);
  const u = D.nous(B)[0];
  const a = D.atteignables(B, u);
  assert(D.deplacer(B, u, a[0]), 'le premier déplacement doit passer');
  assert(!D.deplacer(B, u, a[1] || a[0]), 'le second déplacement du même tour doit être refusé');
});

suite('rade tactique — la poussée');

// Le verbe central. Trois cas, et chacun a une conséquence différente.
function plateauNu({ recifs = [], unites }) {
  const B = D.nouvelleRade({
    rayon: 3,
    passe: new Set(['-3,0', '-3,1', '-3,2', '-3,3']),
    recifs: new Set(recifs),
    unites: unites.map((u, i) => ({
      id: i + 1, aBouge: false, aAgi: false, pvMax: u.pv, valeur: u.valeur || 0, mouvement: 2, ...u,
    })),
  });
  return B;
}

test('a broadside pushes the target one cell away', () => {
  const B = plateauNu({ unites: [
    { camp: 'nous', type: 'canonniere', nom: 'nous', q: 0, r: 0, pv: 3 },
    { camp: 'eux', type: 'escorte', nom: 'elle', q: 2, r: 0, pv: 3 },
  ] });
  const u = D.nous(B)[0], c = D.eux(B)[0];
  assert(D.agir(B, u, { q: 2, r: 0 }), 'la bordée doit passer');
  equal(c.pv, 2, 'la bordée fait 1 dégât');
  equal(`${c.q},${c.r}`, '3,0', 'elle recule d\'une case sur l\'axe');
});

test('a grapple pulls the target one cell closer, without damage', () => {
  const B = plateauNu({ unites: [
    { camp: 'nous', type: 'harponneur', nom: 'nous', q: 0, r: 0, pv: 2 },
    { camp: 'eux', type: 'transport', nom: 'elle', q: 2, r: 0, pv: 2, valeur: 120 },
  ] });
  const u = D.nous(B)[0], c = D.eux(B)[0];
  assert(D.agir(B, u, { q: 2, r: 0 }), 'le grappin doit passer');
  equal(c.pv, 2, 'le grappin ne blesse pas');
  equal(`${c.q},${c.r}`, '1,0', 'elle est halée d\'une case vers nous');
});

// Le récif est la raison d'être du terrain : il transforme une bordée en perte.
test('pushing a prize onto a reef destroys her, and her value with her', () => {
  const B = plateauNu({
    recifs: ['3,0'],
    unites: [
      { camp: 'nous', type: 'canonniere', nom: 'nous', q: 0, r: 0, pv: 3 },
      { camp: 'eux', type: 'transport', nom: 'la proie', q: 2, r: 0, pv: 2, valeur: 120 },
    ],
  });
  const u = D.nous(B)[0], c = D.eux(B)[0];
  const vu = D.apercu(B, u, { q: 2, r: 0 });
  assert(vu.choc === 'un récif', `l'aperçu doit annoncer le récif, il annonce « ${vu.choc} »`);
  assert(vu.tue && vu.perd, 'l\'aperçu doit annoncer que la proie coule et que le butin part avec');
  D.agir(B, u, { q: 2, r: 0 });
  equal(c.pv, 0, '1 de bordée + 1 de choc coulent une proie à 2 pv');
  equal(D.butin(B), 0, 'une proie coulée ne rapporte rien');
  equal(B.pris.length, 0, 'et n\'entre pas dans les prises');
});

test('a blocked push hurts both hulls', () => {
  const B = plateauNu({ unites: [
    { camp: 'nous', type: 'canonniere', nom: 'nous', q: 0, r: 0, pv: 3 },
    { camp: 'eux', type: 'escorte', nom: 'devant', q: 1, r: 0, pv: 3 },
    { camp: 'eux', type: 'escorte', nom: 'derrière', q: 2, r: 0, pv: 3 },
  ] });
  const u = D.nous(B)[0];
  const devant = B.unites.find((x) => x.nom === 'devant');
  const derriere = B.unites.find((x) => x.nom === 'derrière');
  D.agir(B, u, { q: 1, r: 0 });
  equal(devant.pv, 1, 'la cible prend la bordée et le choc');
  equal(derriere.pv, 2, 'celle qui bloque prend le choc aussi');
  equal(`${devant.q},${devant.r}`, '1,0', 'bloquée, la cible ne bouge pas');
});

// La promesse d'Into the Breach : on annule un tir en bousculant le tireur.
test('pushing a shooter cancels the shot it had announced', () => {
  const B = plateauNu({ unites: [
    { camp: 'nous', type: 'canonniere', nom: 'nous', q: 0, r: 0, pv: 3 },
    { camp: 'eux', type: 'escorte', nom: 'le tireur', q: 2, r: 0, pv: 3 },
  ] });
  assert(B.intentions.length === 1, 'l\'escorte doit avoir annoncé un tir');
  equal(B.intentions[0].q, 0, 'et viser notre case');
  const u = D.nous(B)[0];
  D.agir(B, u, { q: 2, r: 0 });
  equal(B.intentions.length, 0, 'poussé, le tireur ne tire plus');
  const pv = u.pv;
  D.finDeTour(B);
  equal(u.pv, pv, 'et nous ne prenons rien');
});

test('a shot that was not cancelled does land', () => {
  const B = plateauNu({ unites: [
    { camp: 'nous', type: 'abordeur', nom: 'nous', q: 0, r: 0, pv: 4 },
    { camp: 'eux', type: 'escorte', nom: 'le tireur', q: 2, r: 0, pv: 3 },
  ] });
  const u = D.nous(B)[0];
  equal(B.intentions.length, 1, 'le tir doit être annoncé');
  D.finDeTour(B);
  equal(u.pv, 3, 'le tir annoncé et non empêché fait son dégât');
});

// L'autre parade, purement positionnelle : sortir de l'axe.
test('stepping off the axis is a defence in itself', () => {
  const B = plateauNu({ unites: [
    { camp: 'nous', type: 'harponneur', nom: 'nous', q: 0, r: 0, pv: 2 },
    { camp: 'eux', type: 'escorte', nom: 'le tireur', q: 2, r: 0, pv: 3 },
  ] });
  const u = D.nous(B)[0];
  equal(B.intentions.length, 1, 'le tir doit être annoncé sur nous');
  // (0,1) n'est sur aucun axe de (2,0) : dq=-2, dr=+1 n'est colinéaire à
  // aucune des six directions. (1,1) en revanche EST sur l'axe sud-ouest du
  // tireur — l'erreur a été faite une fois, elle est notée ici.
  assert(axe({ q: 2, r: 0 }, { q: 1, r: 1 }) !== null, '(1,1) est bien sur un axe de (2,0)');
  assert(D.deplacer(B, u, { q: 0, r: 1 }), 'ce pas doit être possible');
  D.finDeTour(B);
  equal(u.pv, 2, 'le tir tombe dans le vide : nous n\'étions plus sur sa case');
  assert(axe({ q: 2, r: 0 }, u) === null, 'et nous ne sommes plus sur son axe');
});

suite('rade tactique — prendre ou couler');

test('boarding needs a prize already softened, and takes her whole', () => {
  const B = plateauNu({ unites: [
    { camp: 'nous', type: 'abordeur', nom: 'nous', q: 0, r: 0, pv: 4 },
    { camp: 'eux', type: 'transport', nom: 'la proie', q: 1, r: 0, pv: 2, valeur: 120 },
  ] });
  const u = D.nous(B)[0], c = D.eux(B)[0];
  assert(!D.agir(B, u, { q: 1, r: 0 }), 'une proie intacte ne s\'aborde pas');
  c.pv = 1;
  assert(D.agir(B, u, { q: 1, r: 0 }), 'entamée, elle s\'aborde');
  equal(D.butin(B), 120, 'la prise vaut son prix');
  equal(c.pv, 0, 'et elle quitte le plateau');
});

// Toute la tension de la refonte, exprimée positionnellement.
test('the value of a prize is only ever collected by boarding her', () => {
  const bad = [];
  for (let seed = 1; seed <= 150; seed++) {
    const B = rade(seed * 40503);
    // On coule tout au canon, sans jamais aborder.
    for (let t = 0; t < 8 && !B.fini; t++) {
      for (const u of D.nous(B)) {
        if (D.NOTRES[u.type].verbe === 'abordage') continue;
        const c = D.cibles(B, u);
        if (c.length) D.agir(B, u, c[0]);
      }
      D.finDeTour(B);
    }
    if (D.butin(B) !== 0) bad.push(`rade ${seed} : ${D.butin(B)} 💰 sans un seul abordage`);
    if (bad.length > 2) break;
  }
  empty(bad, 'gold from nowhere');
});

test('the preview never lies about what an action will do', () => {
  const bad = [];
  for (let seed = 1; seed <= 150; seed++) {
    const B = rade(seed * 2246822519);
    for (const u of D.nous(B)) {
      for (const h of D.cibles(B, u)) {
        const c = D.uniteEn(B, h);
        const promis = D.apercu(B, u, h);
        const pvAvant = c.pv, posAvant = `${c.q},${c.r}`;
        // On travaille sur une copie : l'aperçu doit valoir pour l'état courant.
        const copie = JSON.parse(JSON.stringify({ u: B.unites }));
        D.agir(B, u, h);
        if (promis.verbe !== 'abordage') {
          const attendu = promis.degats + (promis.choc ? 1 : 0);
          if (pvAvant - c.pv !== Math.min(attendu, pvAvant)) {
            bad.push(`rade ${seed} : ${attendu} dégât(s) promis, ${pvAvant - c.pv} infligé(s)`);
          }
          if (promis.tue !== (c.pv <= 0)) bad.push(`rade ${seed} : « coule » promis ${promis.tue}, obtenu ${c.pv <= 0}`);
          if (!promis.choc && c.pv > 0 && `${c.q},${c.r}` === posAvant) {
            bad.push(`rade ${seed} : poussée promise sans obstacle, la cible n'a pas bougé`);
          }
          if (promis.choc && `${c.q},${c.r}` !== posAvant) {
            bad.push(`rade ${seed} : choc promis (${promis.choc}), la cible a bougé quand même`);
          }
        }
        B.unites = copie.u.map((x) => ({ ...x }));
        break;                                   // une action par bâtiment suffit
      }
    }
    if (bad.length > 3) break;
  }
  empty(bad, 'lying previews');
});

suite('rade tactique — la forme du problème');

// Un plateau Into the Breach doit être *soluble et serré*. On le mesure avec
// deux joueurs volontairement bêtes : si le maladroit s'en sort aussi bien que
// l'appliqué, la position ne compte pas et le jeu n'est qu'un échange de coups.
function applique(B) {
  // Ordre des priorités : annuler un tir qui nous vise, entamer une proie,
  // l'aborder. Aucune anticipation au-delà du tour.
  for (const u of D.nous(B)) {
    const verbe = D.NOTRES[u.type].verbe;
    const tente = () => {
      const cs = D.cibles(B, u);
      if (!cs.length) return false;
      if (verbe === 'abordage') return D.agir(B, u, cs[0]);
      // Ne jamais pousser une proie sur un récif : c'est du butin détruit.
      const sûr = cs.filter((h) => {
        const vu = D.apercu(B, u, h);
        return !(vu.perd);
      });
      const menace = sûr.find((h) => B.intentions.some((i) => i.parId === D.uniteEn(B, h).id));
      const proie = sûr.find((h) => D.uniteEn(B, h).type === 'transport');
      const choix = menace || proie || sûr[0];
      return choix ? D.agir(B, u, choix) : false;
    };
    if (tente()) continue;
    // Sinon, se rapprocher d'une proie.
    const proies = D.eux(B).filter((x) => x.type === 'transport');
    if (!proies.length) continue;
    const cases = D.atteignables(B, u);
    if (!cases.length) continue;
    cases.sort((a, b) => Math.min(...proies.map((p) => distance(a, p))) - Math.min(...proies.map((p) => distance(b, p))));
    D.deplacer(B, u, cases[0]);
    tente();
  }
  D.finDeTour(B);
}

function maladroit(B) {
  // Tire sur ce qui passe, sans regarder ni les récifs ni les intentions.
  for (const u of D.nous(B)) {
    const cs = D.cibles(B, u);
    if (cs.length) { D.agir(B, u, cs[0]); continue; }
    const cases = D.atteignables(B, u);
    if (cases.length) D.deplacer(B, u, cases[0]);
  }
  D.finDeTour(B);
}

function campagne(politique, n = 200) {
  const res = [];
  for (let i = 1; i <= n; i++) {
    const B = rade(i * 1103515245);
    let garde = 0;
    while (!B.fini && garde++ < 20) politique(B);
    res.push({ or: D.butin(B), prises: B.pris.length, perdus: B.perdus.length, tour: B.tour });
  }
  const moy = (k) => res.reduce((s, x) => s + x[k], 0) / res.length;
  return { or: moy('or'), prises: moy('prises'), perdus: moy('perdus'), rien: res.filter((x) => x.or === 0).length / n };
}

test('playing well pays, and playing badly does not', () => {
  const a = campagne(applique), m = campagne(maladroit);
  console.log(`      appliqué  : ${a.or.toFixed(0)} 💰 · ${a.prises.toFixed(2)} prise(s) · ${a.perdus.toFixed(2)} perte(s) · bredouille ${(100 * a.rien).toFixed(0)}%`);
  console.log(`      maladroit : ${m.or.toFixed(0)} 💰 · ${m.prises.toFixed(2)} prise(s) · ${m.perdus.toFixed(2)} perte(s) · bredouille ${(100 * m.rien).toFixed(0)}%`);
  assert(a.or > 0, 'un joueur appliqué doit pouvoir rapporter quelque chose');
  assert(a.or > m.or * 1.3,
    `l'appliqué ne gagne que ${(a.or / Math.max(1, m.or)).toFixed(2)}× le maladroit : la position ne compte pas assez`);
});

// Serré : sortir la rade entière ne doit pas être la routine.
test('a clean sweep is not the routine outcome', () => {
  const a = campagne(applique);
  assert(a.prises < 2.6, `l'appliqué emporte ${a.prises.toFixed(2)} prises sur 3 : le plateau est trop tendre`);
  assert(a.rien < 0.5, `il repart bredouille ${(100 * a.rien).toFixed(0)}% du temps : le plateau est trop dur`);
});

test('a raid is over in a handful of turns', () => {
  const B = rade(777);
  let garde = 0;
  while (!B.fini && garde++ < 20) applique(B);
  assert(B.tour <= D.TOURS + 1, `la rade a duré ${B.tour} tours pour un plafond de ${D.TOURS}`);
  assert(B.fini, 'une rade doit toujours se conclure');
});
