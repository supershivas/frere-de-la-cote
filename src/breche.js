// La rade en vue tactique — proposition D, façon *Into the Breach*.
//
// Ce que D emprunte à Into the Breach, et pourquoi :
//   - **Information parfaite.** Tout ce que l'ennemi fera au prochain tour est
//     écrit sur le plateau avant qu'on joue. Un tour est un problème résolu,
//     pas un pari (brief §4.1).
//   - **La poussée est le verbe central.** On ne gagne pas en faisant plus de
//     dégâts, on gagne en déplaçant le problème : pousser un tireur annule son
//     tir, pousser une proie sur un récif la détruit — et détruit sa valeur.
//   - **On ne gagne pas en tuant tout.** La rade se réveille en cinq tours ;
//     ce qu'on emporte est ce qu'on a abordé avant.
//
// Ce que D garde de la rade : le butin est la seule mesure, et il ne compte
// que ramené. Couler une proie, c'est perdre ce pour quoi on est venu.
//
// Règles PURES : aucun DOM, aucun minuteur, aucun aléatoire. L'entropie vit
// dans `genererRade`, qui compose le plateau avant le premier tour.

import { DIRS, key, distance, disque, voisins, voisin, axe, ligne, same } from './hex.js';

export const TOURS = 5;
export const RAYON = 3;

// Nos trois bâtiments. Chacun a UN verbe, et les trois ne se remplacent pas :
// c'est ce qui fait qu'une position est bonne ou mauvaise pour l'un et pas
// pour l'autre.
export const NOTRES = {
  canonniere: {
    nom: 'La Trompeuse', role: 'Canonnière', pv: 3, mouvement: 2,
    verbe: 'bordee', portee: 3,
    dit: 'Bordée : 1 dégât et la repousse d\'une case, le long d\'un axe.',
  },
  harponneur: {
    nom: 'Le Furet', role: 'Harponneur', pv: 2, mouvement: 4,
    verbe: 'grappin', portee: 2,
    dit: 'Grappin : la tire d\'une case vers vous. Aucun dégât — c\'est ce qui la met à portée d\'abordage.',
  },
  abordeur: {
    nom: 'La Sœur-Grise', role: 'Abordeur', pv: 4, mouvement: 2,
    verbe: 'abordage', portee: 1,
    dit: 'Abordage : prend une proie entamée sur une case voisine. C\'est la seule façon d\'emporter quoi que ce soit.',
  },
};

export const EUX = {
  escorte:   { nom: 'Escorte', pv: 2, mouvement: 1, tire: 1, portee: 3, valeur: 0 },
  transport: { nom: 'Transport', pv: 2, mouvement: 1, tire: 0, portee: 0, valeur: 120 },
  batterie:  { nom: 'Batterie de côte', pv: 4, mouvement: 0, tire: 2, portee: 4, valeur: 0 },
};

// ---------------------------------------------------------------------------
// Le plateau

export const estRecif = (B, h) => B.recifs.has(key(h.q, h.r));
export const dansLaRade = (B, h) => distance({ q: 0, r: 0 }, h) <= B.rayon;
export const estPasse = (B, h) => B.passe.has(key(h.q, h.r));
export const uniteEn = (B, h) => B.unites.find((u) => u.pv > 0 && u.q === h.q && u.r === h.r) || null;
export const libre = (B, h) => dansLaRade(B, h) && !estRecif(B, h) && !uniteEn(B, h);

export const nous = (B) => B.unites.filter((u) => u.camp === 'nous' && u.pv > 0);
export const eux = (B) => B.unites.filter((u) => u.camp === 'eux' && u.pv > 0);
export const butin = (B) => B.pris.reduce((s, p) => s + p.valeur, 0);

// Cases atteignables par une unité : parcours en largeur, les récifs et les
// autres bâtiments bloquent. On ne traverse pas une coque.
export function atteignables(B, u) {
  const vus = new Map([[key(u.q, u.r), 0]]);
  const file = [{ q: u.q, r: u.r }];
  const out = [];
  while (file.length) {
    const h = file.shift();
    const d = vus.get(key(h.q, h.r));
    if (d >= u.mouvement) continue;
    for (const n of voisins(h)) {
      const k = key(n.q, n.r);
      if (vus.has(k)) continue;
      if (!dansLaRade(B, n) || estRecif(B, n) || uniteEn(B, n)) continue;
      vus.set(k, d + 1);
      out.push(n);
      file.push(n);
    }
  }
  return out;
}

// Cibles d'une action : le long d'un axe, sans coque interposée.
export function cibles(B, u) {
  if (u.aAgi || u.pv <= 0) return [];
  const def = NOTRES[u.type];
  const out = [];
  for (let d = 0; d < 6; d++) {
    for (let i = 1; i <= def.portee; i++) {
      const h = { q: u.q + DIRS[d][0] * i, r: u.r + DIRS[d][1] * i };
      if (!dansLaRade(B, h)) break;
      const cible = uniteEn(B, h);
      if (estRecif(B, h)) break;             // un récif masque la ligne de mire
      if (!cible) continue;
      if (cible.camp === 'eux') out.push(h);
      break;                                  // la première coque rencontrée arrête tout
    }
  }
  return out.filter((h) => estValide(B, u, h));
}

function estValide(B, u, h) {
  const c = uniteEn(B, h);
  if (!c || c.camp !== 'eux') return false;
  if (NOTRES[u.type].verbe === 'abordage') {
    // On n'aborde qu'une proie, et seulement quand elle est entamée.
    return c.type === 'transport' && c.pv <= 1 && distance(u, h) === 1;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Aperçu — ce que l'action fera, écrit avant qu'on la donne (§4.2)

export function apercu(B, u, h) {
  const c = uniteEn(B, h);
  if (!c || !estValide(B, u, h)) return null;
  const verbe = NOTRES[u.type].verbe;
  if (verbe === 'abordage') {
    return { verbe, texte: `Prise : ${c.valeur} 💰. Elle sort de la rade avec nous.`, valeur: c.valeur };
  }
  const d = axe(u, c);
  const sens = verbe === 'bordee' ? d : (d + 3) % 6;
  const dest = voisin(c, sens);
  const choc = obstacle(B, dest);
  const degats = verbe === 'bordee' ? 1 : 0;
  const total = degats + (choc ? 1 : 0);
  const tue = c.pv - total <= 0;
  const perd = tue && c.type === 'transport';
  return {
    verbe, degats, dest: choc ? null : dest, choc, tue, perd,
    texte: [
      degats ? `1 dégât` : `aucun dégât`,
      choc ? `elle heurte ${choc} et prend 1 de plus` : `elle recule d'une case`,
      tue ? (perd ? '— et elle coule : le butin coule avec elle' : '— et elle coule') : `il lui resterait ${c.pv - total}`,
    ].join(', ') + '.',
  };
}

// Ce qui empêche une poussée d'aboutir, nommé en clair pour l'aperçu.
function obstacle(B, h) {
  if (!dansLaRade(B, h)) return 'la passe';
  if (estRecif(B, h)) return 'un récif';
  const u = uniteEn(B, h);
  if (u) return u.camp === 'nous' ? 'un des nôtres' : 'une autre coque';
  return null;
}

// ---------------------------------------------------------------------------
// Les ordres. Chaque bâtiment peut se déplacer puis agir, une fois par tour.

export function deplacer(B, u, h) {
  if (B.fini || u.aBouge || u.pv <= 0) return false;
  if (!atteignables(B, u).some((x) => same(x, h))) return false;
  u.q = h.q; u.r = h.r; u.aBouge = true;
  return true;
}

export function agir(B, u, h) {
  if (B.fini || u.aAgi || u.pv <= 0) return false;
  const vu = apercu(B, u, h);
  if (!vu) return false;
  const c = uniteEn(B, h);

  if (vu.verbe === 'abordage') {
    B.pris.push({ nom: c.nom, valeur: c.valeur });
    c.pv = 0;
    B.journal.push(`${u.nom} aborde ${c.nom} — ${c.valeur} 💰 embarqués.`);
  } else {
    if (vu.degats) frapper(B, c, vu.degats, 'bordée');
    if (c.pv > 0) pousser(B, c, axe(u, c), vu.verbe === 'grappin' ? -1 : 1);
    if (vu.verbe === 'grappin') B.journal.push(`${u.nom} harponne ${c.nom} et la hale d'une case.`);
  }
  // Un tireur poussé ou coulé ne tire plus : son intention tombe. C'est le
  // cœur du jeu — on annule un tir en bousculant celui qui l'a annoncé, pas en
  // le tuant.
  B.intentions = B.intentions.filter((i) => {
    const tireur = B.unites.find((x) => x.id === i.parId);
    return tireur && tireur.pv > 0 && tireur.q === i.deQ && tireur.r === i.deR;
  });
  u.aAgi = true;
  return true;
}

// Poussée d'une case. `sens` = +1 dans la direction `d`, -1 à l'opposé.
// Bloquée, elle devient un choc : une case de moins, un dégât de plus, des
// deux côtés s'il y a quelqu'un en face. C'est la mécanique qui rend le récif
// intéressant et le tir imprudent coûteux.
function pousser(B, c, d, sens) {
  const dir = sens > 0 ? d : (d + 3) % 6;
  const dest = voisin(c, dir);
  const quoi = obstacle(B, dest);
  if (!quoi) { c.q = dest.q; c.r = dest.r; return; }
  frapper(B, c, 1, `un choc contre ${quoi}`);
  const autre = uniteEn(B, dest);
  if (autre) frapper(B, autre, 1, 'un choc');
}

function frapper(B, c, n, cause) {
  c.pv -= n;
  if (c.pv > 0) return;
  c.pv = 0;
  if (c.camp === 'nous') {
    B.perdus.push({ nom: c.nom });
    B.journal.push(`${c.nom} sombre (${cause}).`);
  } else {
    B.journal.push(c.type === 'transport'
      ? `${c.nom} coule (${cause}) — sa cargaison avec elle.`
      : `${c.nom} coule (${cause}).`);
  }
}

// ---------------------------------------------------------------------------
// Fin de tour : la rade répond, puis annonce ce qu'elle fera ensuite.

export function finDeTour(B) {
  if (B.fini) return false;

  // 1. Les tirs annoncés au tour précédent partent, dans l'ordre des unités.
  for (const i of B.intentions) {
    const tireur = B.unites.find((u) => u.id === i.parId);
    if (!tireur || tireur.pv <= 0) continue;
    const touche = uniteEn(B, { q: i.q, r: i.r });
    if (!touche) { B.journal.push(`${tireur.nom} tire dans le vide.`); continue; }
    frapper(B, touche, i.degats, `le tir de ${tireur.nom}`);
  }

  // 2. Les proies gagnent la passe. Celle qui l'atteint est perdue pour nous.
  for (const t of eux(B).filter((u) => u.type === 'transport')) {
    const pas = versLaPasse(B, t);
    if (!pas) continue;
    t.q = pas.q; t.r = pas.r;
    if (estPasse(B, t)) {
      t.pv = 0;
      B.echappes.push({ nom: t.nom, valeur: t.valeur });
      B.journal.push(`${t.nom} gagne la passe. Elle est hors d'atteinte.`);
    }
  }

  B.tour++;
  for (const u of B.unites) { u.aBouge = false; u.aAgi = false; }
  telegraphier(B);
  conclure(B);
  return true;
}

// La proie va vers la sortie la plus proche, par le chemin le plus court. Aucun
// tirage : à situation égale, elle fait toujours le même pas.
function versLaPasse(B, t) {
  const sorties = [...B.passe].map((k) => { const [q, r] = k.split(',').map(Number); return { q, r }; });
  const vers = (h) => Math.min(...sorties.map((s) => distance(h, s)));
  const actuelle = vers(t);
  let meilleur = null;
  for (const n of voisins(t)) {
    if (!dansLaRade(B, n) || estRecif(B, n) || uniteEn(B, n)) continue;
    if (vers(n) >= actuelle) continue;             // jamais un pas qui ne rapproche pas
    // À égalité, la case de plus petite clé : aucun tirage, donc prévisible.
    if (!meilleur || vers(n) < vers(meilleur) || cle(n) < cle(meilleur)) meilleur = n;
  }
  return meilleur;
}
const cle = (h) => `${h.q},${h.r}`;

// Ce que la rade fera au prochain tour, écrit sur le plateau. Une escorte vise
// la coque la plus proche à portée ; la batterie vise la plus proche tout court.
// Déterministe, donc lisible : le joueur peut le prévoir sans le mémoriser.
function telegraphier(B) {
  B.intentions = [];
  for (const u of eux(B)) {
    const def = EUX[u.type];
    if (!def.tire) continue;
    const proies = nous(B)
      .filter((n) => distance(u, n) <= def.portee && axe(u, n) !== null)
      .filter((n) => (ligne(u, n) || []).every((h) => !estRecif(B, h) && !uniteEn(B, h)))
      .sort((a, b) => distance(u, a) - distance(u, b) || a.id - b.id);
    if (!proies.length) continue;
    B.intentions.push({
      parId: u.id, q: proies[0].q, r: proies[0].r, degats: def.tire,
      // La position du tireur AU MOMENT de l'annonce : c'est elle qui permet de
      // savoir qu'il a été déplacé depuis, et donc que son tir tombe.
      deQ: u.q, deR: u.r,
    });
  }
}

function conclure(B) {
  if (!nous(B).length) { B.fini = 'detruit'; B.journal.push('Plus une coque à nous dans la rade.'); return; }
  if (B.tour > B.tours) { B.fini = 'retire'; B.journal.push('La rade est réveillée. On sort avec ce qu\'on tient.'); }
}

// Sortir plus tôt : le butin est acquis, le reste est perdu. Toujours jouable —
// c'est ce qui fait de chaque tour supplémentaire une décision.
export function sortir(B) {
  if (B.fini) return false;
  B.fini = 'retire';
  B.journal.push('On met le cap au large.');
  return true;
}

// ---------------------------------------------------------------------------
// Composition. C'est ICI que l'aléatoire entre, et nulle part ailleurs.

const NOMS_EUX = {
  escorte: ['La Sentinelle', 'El Vigía', 'Le Garde-Côte', 'De Wachter'],
  transport: ['Nuestra Señora', 'El Rosario', 'Le Saint-Jean', 'De Zeemeeuw', 'La Concepción'],
  batterie: ['Le fort', 'Le môle armé', 'La pointe'],
};

export function genererRade(rng, { rayon = RAYON } = {}) {
  const r = () => rng();
  const pick = (a) => a[Math.floor(r() * a.length) % a.length];
  const cases = disque(rayon);

  // La passe est le bord ouest : c'est par là que la flotte s'échappe, et par
  // là que nous sommes entrés.
  const passe = new Set(cases.filter((h) => h.q === -rayon).map((h) => key(h.q, h.r)));

  // Les récifs : jamais sur la passe, jamais au centre (on y place la flotte),
  // et jamais assez nombreux pour fermer le plateau.
  const recifs = new Set();
  const candidats = cases.filter((h) => !passe.has(key(h.q, h.r)) && distance({ q: 0, r: 0 }, h) >= 1);
  const combien = 4 + Math.floor(r() * 3);
  let garde = 0;
  while (recifs.size < combien && garde++ < 200) {
    const h = candidats[Math.floor(r() * candidats.length) % candidats.length];
    const k = key(h.q, h.r);
    if (recifs.has(k)) continue;
    // Deux récifs voisins forment un mur : on les garde isolés pour que le
    // plateau reste traversable et que chaque récif soit une menace lisible.
    if (voisins(h).some((n) => recifs.has(key(n.q, n.r)))) continue;
    recifs.add(k);
  }

  const unites = [];
  let id = 1;
  const poser = (camp, type, nom, h, def) => {
    unites.push({
      id: id++, camp, type, nom,
      q: h.q, r: h.r, pv: def.pv, pvMax: def.pv,
      mouvement: def.mouvement, valeur: def.valeur || 0,
      aBouge: false, aAgi: false,
    });
  };

  // Nos trois bâtiments entrent par la passe. Les cases sont consommées une à
  // une : répartir par proportion faisait tomber deux coques sur la même case
  // dès que la colonne d'entrée était courte.
  const entrees = cases
    .filter((h) => h.q === -rayon + 1 && !recifs.has(key(h.q, h.r)))
    .sort((a, b) => a.r - b.r);
  const secours = cases
    .filter((h) => h.q <= -rayon + 2 && !recifs.has(key(h.q, h.r)))
    .sort((a, b) => a.q - b.q || a.r - b.r);
  const dispo = [...entrees, ...secours];
  for (const [type, def] of Object.entries(NOTRES)) {
    const i = dispo.findIndex((h) => !unites.some((u) => u.q === h.q && u.r === h.r));
    const h = i >= 0 ? dispo.splice(i, 1)[0] : cases.find((c) => !unites.some((u) => same(u, c)));
    poser('nous', type, def.nom, h, def);
  }

  // La batterie tient le fond de la rade, à l'opposé de la passe.
  const fond = cases.filter((h) => h.q === rayon && !recifs.has(key(h.q, h.r)));
  poser('eux', 'batterie', pick(NOMS_EUX.batterie), fond[Math.floor(fond.length / 2)] || cases[0], EUX.batterie);

  // Deux escortes et trois proies, au milieu, sur des cases encore libres.
  const milieu = cases.filter((h) =>
    h.q > -rayon + 1 && h.q < rayon &&
    !recifs.has(key(h.q, h.r)) &&
    !unites.some((u) => u.q === h.q && u.r === h.r));
  const tirees = [];
  let g2 = 0;
  while (tirees.length < 5 && g2++ < 300) {
    const h = milieu[Math.floor(r() * milieu.length) % milieu.length];
    if (tirees.some((x) => same(x, h))) continue;
    tirees.push(h);
  }
  const nomsT = [...NOMS_EUX.transport];
  tirees.forEach((h, i) => {
    if (i < 2) poser('eux', 'escorte', pick(NOMS_EUX.escorte), h, EUX.escorte);
    else {
      const n = nomsT.splice(Math.floor(r() * nomsT.length) % Math.max(1, nomsT.length), 1)[0] || 'Une prise';
      poser('eux', 'transport', n, h, EUX.transport);
    }
  });

  return { rayon, passe, recifs, unites };
}

export function nouvelleRade(plan, { tours = TOURS } = {}) {
  const B = {
    tour: 1, tours,
    rayon: plan.rayon,
    passe: plan.passe,
    recifs: plan.recifs,
    unites: plan.unites,
    intentions: [],
    pris: [], perdus: [], echappes: [],
    journal: [],
    fini: null,
  };
  telegraphier(B);
  return B;
}
