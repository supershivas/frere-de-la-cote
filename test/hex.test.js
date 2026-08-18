// Géométrie hexagonale. Rien ici n'est spectaculaire et tout y est piégeux :
// une distance fausse d'une case, une direction inversée, et le jeu devient
// injouable sans jamais planter. Ces tests vérifient les propriétés (symétrie,
// réciprocité, inégalité triangulaire) plutôt que des valeurs choisies à la
// main, parce que ce sont les propriétés que le reste du code suppose.

import { suite, test, assert, equal, empty } from './harness.js';
import {
  DIRS, key, parse, same, voisin, voisins, distance, disque, anneau,
  axe, ligne, versPixel, sommets, cadre,
} from '../src/hex.js';

suite('hexagones — voisinage');

test('the six directions are distinct and cancel in pairs', () => {
  const vus = new Set(DIRS.map(([q, r]) => key(q, r)));
  equal(vus.size, 6, 'les six directions doivent être distinctes');
  const bad = [];
  for (let d = 0; d < 6; d++) {
    const [q, r] = DIRS[d], [oq, or] = DIRS[(d + 3) % 6];
    if (q + oq !== 0 || r + or !== 0) bad.push(`la direction ${d} et son opposée ne s'annulent pas`);
  }
  empty(bad, 'directions that do not cancel');
});

test('every cell has exactly six neighbours, each at distance one', () => {
  const bad = [];
  for (const h of disque(3)) {
    const v = voisins(h);
    const uniques = new Set(v.map((x) => key(x.q, x.r)));
    if (uniques.size !== 6) bad.push(`${key(h.q, h.r)} a ${uniques.size} voisins distincts`);
    for (const n of v) {
      if (distance(h, n) !== 1) bad.push(`${key(h.q, h.r)} → ${key(n.q, n.r)} : distance ${distance(h, n)}`);
    }
  }
  empty(bad, 'broken neighbourhoods');
});

test('neighbourhood is reciprocal', () => {
  const bad = [];
  for (const h of disque(2)) {
    for (let d = 0; d < 6; d++) {
      const n = voisin(h, d);
      const retour = voisin(n, (d + 3) % 6);
      if (!same(retour, h)) bad.push(`${key(h.q, h.r)} dir ${d} : l'aller-retour tombe sur ${key(retour.q, retour.r)}`);
    }
  }
  empty(bad, 'non-reciprocal steps');
});

suite('hexagones — distance');

test('distance is a real metric', () => {
  const cases = disque(3);
  const bad = [];
  for (const a of cases) {
    if (distance(a, a) !== 0) bad.push(`d(${key(a.q, a.r)}, elle-même) ≠ 0`);
    for (const b of cases) {
      if (distance(a, b) !== distance(b, a)) bad.push(`asymétrie entre ${key(a.q, a.r)} et ${key(b.q, b.r)}`);
      if (!Number.isInteger(distance(a, b))) bad.push(`distance non entière ${key(a.q, a.r)}→${key(b.q, b.r)}`);
      for (const c of cases) {
        if (distance(a, c) > distance(a, b) + distance(b, c)) {
          bad.push(`inégalité triangulaire violée ${key(a.q, a.r)}/${key(b.q, b.r)}/${key(c.q, c.r)}`);
        }
      }
      if (bad.length > 3) break;
    }
    if (bad.length > 3) break;
  }
  empty(bad, 'metric violations');
});

test('the disc of radius n holds 3n(n+1)+1 cells, and the ring holds 6n', () => {
  const bad = [];
  for (let n = 0; n <= 5; n++) {
    const attendu = 3 * n * (n + 1) + 1;
    if (disque(n).length !== attendu) bad.push(`disque(${n}) : ${disque(n).length} cases pour ${attendu}`);
    const a = anneau({ q: 0, r: 0 }, n);
    const attenduAnneau = n === 0 ? 1 : 6 * n;
    if (a.length !== attenduAnneau) bad.push(`anneau(${n}) : ${a.length} cases pour ${attenduAnneau}`);
    for (const h of a) {
      if (distance({ q: 0, r: 0 }, h) !== n) bad.push(`anneau(${n}) contient une case à distance ${distance({ q: 0, r: 0 }, h)}`);
    }
  }
  empty(bad, 'wrong counts');
});

test('the disc has no duplicate cell', () => {
  const d = disque(4);
  equal(new Set(d.map((h) => key(h.q, h.r))).size, d.length, 'le disque contient un doublon');
});

suite('hexagones — axes et ligne de mire');

test('a cell is on an axis of its neighbours and nowhere else', () => {
  const o = { q: 0, r: 0 };
  const bad = [];
  for (let d = 0; d < 6; d++) {
    const n = voisin(o, d);
    if (axe(o, n) !== d) bad.push(`axe(origine, voisin ${d}) rend ${axe(o, n)}`);
    // Trois cases plus loin, l'axe ne change pas.
    const loin = { q: o.q + DIRS[d][0] * 3, r: o.r + DIRS[d][1] * 3 };
    if (axe(o, loin) !== d) bad.push(`axe à distance 3 dans la direction ${d} rend ${axe(o, loin)}`);
    // Et dans l'autre sens, c'est l'opposée — jamais la même.
    if (axe(loin, o) !== (d + 3) % 6) bad.push(`le retour depuis la direction ${d} rend ${axe(loin, o)}`);
  }
  empty(bad, 'axis mistakes');
});

test('an off-axis cell has no axis at all', () => {
  // (1,1) n'est sur aucun des six axes de l'origine : c'est une case « en biais ».
  equal(axe({ q: 0, r: 0 }, { q: 1, r: 1 }), null, '(1,1) ne devrait être sur aucun axe');
  equal(axe({ q: 0, r: 0 }, { q: 2, r: -1 }), null, '(2,-1) ne devrait être sur aucun axe');
  equal(axe({ q: 0, r: 0 }, { q: 0, r: 0 }), null, 'une case n\'est pas sur son propre axe');
});

test('the line between two cells holds exactly the cells in between', () => {
  const bad = [];
  for (let d = 0; d < 6; d++) {
    const a = { q: 0, r: 0 };
    const b = { q: DIRS[d][0] * 4, r: DIRS[d][1] * 4 };
    const l = ligne(a, b);
    if (l.length !== 3) bad.push(`direction ${d} : ${l.length} cases intermédiaires pour 3 attendues`);
    l.forEach((h, i) => {
      if (distance(a, h) !== i + 1) bad.push(`direction ${d}, case ${i} à distance ${distance(a, h)}`);
      if (same(h, a) || same(h, b)) bad.push(`direction ${d} : la ligne contient une extrémité`);
    });
  }
  // Voisines : rien entre elles.
  equal(ligne({ q: 0, r: 0 }, { q: 1, r: 0 }).length, 0, 'deux voisines n\'ont rien entre elles');
  // Hors axe : pas de ligne de mire du tout.
  equal(ligne({ q: 0, r: 0 }, { q: 1, r: 1 }), null, 'une case hors axe ne donne pas de ligne');
  empty(bad, 'broken lines');
});

suite('hexagones — projection');

test('projection is injective: no two cells land on the same point', () => {
  const vus = new Map();
  const bad = [];
  for (const h of disque(4)) {
    const p = versPixel(h);
    const k = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    if (vus.has(k)) bad.push(`${key(h.q, h.r)} et ${vus.get(k)} tombent au même pixel`);
    vus.set(k, key(h.q, h.r));
  }
  empty(bad, 'colliding projections');
});

// L'écrasement vertical EST la vue isométrique : sans lui, la grille se lit
// comme une carte vue de dessus et la profondeur disparaît.
test('the isometric squash actually flattens the board', () => {
  const b = cadre(disque(4));
  const plat = cadre(disque(4), { iso: 1 });
  assert(b.hauteur < plat.hauteur * 0.7,
    `l'écrasement ne fait que ${(100 * b.hauteur / plat.hauteur).toFixed(0)}% : ce n'est pas une vue isométrique`);
  assert(b.largeur > b.hauteur,
    `le plateau projeté fait ${b.largeur.toFixed(0)}×${b.hauteur.toFixed(0)} : il devrait être plus large que haut`);
});

test('neighbouring cells are adjacent on screen, and no closer than that', () => {
  const bad = [];
  const o = { q: 0, r: 0 };
  const centre = versPixel(o);
  const dists = voisins(o).map((n) => {
    const p = versPixel(n);
    return Math.hypot(p.x - centre.x, p.y - centre.y);
  });
  // Les six voisines ne sont pas à égale distance à l'écran — c'est le propre
  // d'une vue écrasée — mais aucune ne doit chevaucher le centre.
  for (const d of dists) if (d < 20) bad.push(`une voisine tombe à ${d.toFixed(1)} px du centre`);
  const loin = versPixel({ q: 4, r: 0 });
  assert(Math.hypot(loin.x - centre.x, loin.y - centre.y) > Math.max(...dists),
    'une case à quatre pas doit être plus loin à l\'écran qu\'une voisine');
  empty(bad, 'overlapping cells');
});

test('the six corners form a closed hexagon around the centre', () => {
  const h = { q: 2, r: -1 };
  const c = versPixel(h);
  const pts = sommets(h);
  equal(pts.length, 6, 'un hexagone a six sommets');
  const bad = [];
  for (const [x, y] of pts) {
    if (Math.hypot(x - c.x, y - c.y) < 1) bad.push('un sommet est confondu avec le centre');
  }
  // Le polygone entoure bien son centre : au moins un sommet de chaque côté.
  if (!pts.some(([x]) => x > c.x) || !pts.some(([x]) => x < c.x)) bad.push('les sommets ne bordent pas le centre horizontalement');
  if (!pts.some(([, y]) => y > c.y) || !pts.some(([, y]) => y < c.y)) bad.push('les sommets ne bordent pas le centre verticalement');
  empty(bad, 'malformed hexagons');
});
