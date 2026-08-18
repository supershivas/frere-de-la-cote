// Géométrie hexagonale — coordonnées axiales, voisinage, distance, projection.
//
// Aucune règle de jeu ici, aucun DOM : uniquement de la géométrie. C'est le
// socle de l'écran tactique (proposition D), et une erreur à ce niveau se
// traduit par des portées fausses et des poussées qui partent de travers, sans
// jamais lever d'exception.
//
// Convention : hexagones **à sommet plat** (flat-top), coordonnées axiales
// (q, r) avec la troisième implicite s = -q - r. C'est le système de Red Blob
// Games ; les six directions ci-dessous sont dans l'ordre horaire à partir de
// l'est, et cet ordre est un contrat — la poussée, la ligne de mire et le
// rendu s'y réfèrent par indice.

export const DIRS = [
  [+1, 0],   // 0 est
  [+1, -1],  // 1 nord-est
  [0, -1],   // 2 nord-ouest
  [-1, 0],   // 3 ouest
  [-1, +1],  // 4 sud-ouest
  [0, +1],   // 5 sud-est
];

export const key = (q, r) => `${q},${r}`;
export const parse = (k) => { const [q, r] = k.split(',').map(Number); return { q, r }; };
export const same = (a, b) => a.q === b.q && a.r === b.r;

export const voisin = ({ q, r }, dir) => ({ q: q + DIRS[dir][0], r: r + DIRS[dir][1] });
export const voisins = (h) => DIRS.map((_, d) => voisin(h, d));

// Distance en cases. En axial, elle passe par les trois coordonnées cubiques.
export function distance(a, b) {
  const dq = a.q - b.q, dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

// Le disque de rayon `rayon` autour de l'origine : le plateau.
export function disque(rayon) {
  const out = [];
  for (let q = -rayon; q <= rayon; q++) {
    const bas = Math.max(-rayon, -q - rayon);
    const haut = Math.min(rayon, -q + rayon);
    for (let r = bas; r <= haut; r++) out.push({ q, r });
  }
  return out;
}

// L'anneau de rayon `rayon` : utile pour placer une côte ou une batterie.
export function anneau(centre, rayon) {
  if (rayon === 0) return [{ ...centre }];
  const out = [];
  let h = { q: centre.q + DIRS[4][0] * rayon, r: centre.r + DIRS[4][1] * rayon };
  for (let d = 0; d < 6; d++) {
    for (let i = 0; i < rayon; i++) { out.push({ ...h }); h = voisin(h, d); }
  }
  return out;
}

// La direction (0-5) de `a` vers `b` si les deux sont sur un même axe, sinon
// null. C'est ce qui définit « aligné » pour une bordée : on tire le long d'un
// axe, pas en diagonale de fantaisie.
export function axe(a, b) {
  const dq = b.q - a.q, dr = b.r - a.r;
  if (dq === 0 && dr === 0) return null;
  for (let d = 0; d < 6; d++) {
    const [uq, ur] = DIRS[d];
    // Colinéaire et de même sens : dq/uq === dr/ur, en évitant la division.
    if (dq * ur - dr * uq !== 0) continue;
    if (dq * uq + dr * ur > 0) return d;
  }
  return null;
}

// Les cases entre `a` et `b` exclus, le long de leur axe. Rend null si les deux
// ne sont pas alignés — une ligne de mire n'a de sens que sur un axe.
export function ligne(a, b) {
  const d = axe(a, b);
  if (d === null) return null;
  const n = distance(a, b);
  const out = [];
  for (let i = 1; i < n; i++) out.push({ q: a.q + DIRS[d][0] * i, r: a.r + DIRS[d][1] * i });
  return out;
}

// ---------------------------------------------------------------------------
// Projection

// Vue isométrique : on projette la grille à plat, puis on l'écrase
// verticalement. Un hexagone régulier vu d'au-dessus devient un hexagone
// aplati posé au sol — c'est tout ce qu'il faut pour lire une profondeur, sans
// la lourdeur d'une vraie projection 3D.
export const ISO = 0.56;

export function versPixel({ q, r }, { taille = 40, iso = ISO } = {}) {
  return {
    x: taille * 1.5 * q,
    y: taille * Math.sqrt(3) * (r + q / 2) * iso,
  };
}

// Les six sommets du polygone, dans le même repère que versPixel.
export function sommets({ q, r }, { taille = 40, iso = ISO } = {}) {
  const c = versPixel({ q, r }, { taille, iso });
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    pts.push([c.x + taille * Math.cos(a), c.y + taille * Math.sin(a) * iso]);
  }
  return pts;
}

// Boîte englobante d'un ensemble de cases, pour cadrer le plateau sans marge
// arbitraire.
export function cadre(cases, opts = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const h of cases) {
    for (const [x, y] of sommets(h, opts)) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { x0, y0, largeur: x1 - x0, hauteur: y1 - y0 };
}
