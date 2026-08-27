// LE GAMEFEEL DU GESTE — les primitives, et rien qu'elles.
//
// Ce module ne connaît ni les cartes, ni les munitions, ni la prise. Il ne
// connaît que des NŒUDS qu'on traîne et un HÔTE dans lequel les choses volent.
// C'est voulu : le banc d'essai `docs/refonte/mockups/f-gamefeel.html` compare
// cinq réglages du MÊME geste, et une primitive qui saurait ce qu'est une
// munition n'aurait pas pu servir aux cinq.
//
// TROIS RÈGLES DU DÉPÔT SONT EN JEU ICI, et chacune a déjà coûté un bug :
//
//   RÈGLE 9 — on ne tire jamais une valeur STABLE d'une entrée qui BOUGE. Les
//   boîtes de départ du paquet sont mesurées UNE FOIS, au franchissement du
//   seuil. Relues à chaque `pointermove`, elles reviennent DÉJÀ transformées :
//   la position calculée dépend de la précédente, et les cartes tremblent.
//
//   RÈGLE 11 — ce qui vole appartient au DÉCOR, pas à la page. Toute chose
//   lancée ici est posée DANS l'hôte qu'on lui donne, en coordonnées relatives
//   à lui, jamais sur `document.body` en `position: fixed` : le repère d'un
//   élément fixé dépend de ses ancêtres (`transform`, `filter`, `contain`…),
//   ce qu'on ne contrôle pas.
//
//   RÈGLE 8 — on ne capture jamais le pointeur avant que le geste soit un
//   GLISSEMENT. La capture est prise au franchissement du seuil, pas au
//   `pointerdown` : plus tôt, elle redirige le `click` suivant vers la zone
//   capturante et plus aucune carte ne peut être touchée.
//
// AUCUNE DÉPENDANCE, et ce n'est pas de la coquetterie : le dépôt n'a pas de
// bundler, les maquettes chargent `src/*.js` en modules bruts et
// `tools/bundle-mockup.mjs` doit pouvoir en faire un fichier autonome qui
// s'ouvre sans serveur. Un ressort tient en vingt lignes ; une bibliothèque de
// tween tient en quarante kilo-octets et en une résolution de CDN.

/** Le mouvement réduit se relit à CHAQUE appel : l'utilisateur peut changer
 *  son réglage sans recharger la page, et une valeur figée au chargement
 *  aurait menti pour le reste de la session. */
export const reduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------ le ressort */

/* UN RESSORT, PAS UNE COURBE DE BÉZIER. Une transition CSS part d'un point et
   arrive à un autre en un temps fixe : si la cible change en cours de route —
   et sous le doigt, elle change soixante fois par seconde — la transition
   redémarre, et le mouvement se hache. Un ressort n'a pas de durée : il a une
   position, une vitesse et une cible, et il rattrape la cible où qu'elle
   aille. C'est la différence entre une carte qui SUIT le doigt et une carte
   qui COLLE au doigt.

   L'AMORTISSEMENT (`zeta`) est le seul réglage qui compte :
     1     — critique : elle arrive et s'arrête, sans dépasser. Sobre.
     0,7   — elle dépasse d'un cheveu et revient. C'est là qu'est le plaisir.
     0,45  — elle rebondit deux fois. Au-delà, c'est du caoutchouc.

   INTÉGRATION À PAS FIXE. Un ressort raide intégré avec le `dt` réel de la
   frame explose dès qu'une frame est longue (un onglet qui reprend la main
   donne un `dt` de 300 ms). On découpe en pas de 1/240 s, et on plafonne le
   `dt` à 50 ms : au pire le ressort prend du retard, il ne part jamais à
   l'infini. */
export class Ressort {
  constructor(x = 0, { raideur = 220, zeta = 0.75 } = {}) {
    this.x = x; this.v = 0; this.cible = x;
    this.raideur = raideur; this.zeta = zeta;
  }
  regler(raideur, zeta) { this.raideur = raideur; this.zeta = zeta; return this; }
  /** Repose le ressort à `x`, immobile — pour un début de geste. */
  poser(x) { this.x = x; this.v = 0; this.cible = x; return this; }
  pas(dt) {
    const h = 1 / 240;
    let reste = Math.min(0.05, dt);
    const c = 2 * this.zeta * Math.sqrt(this.raideur);
    while (reste > 0) {
      const p = Math.min(h, reste); reste -= p;
      const a = this.raideur * (this.cible - this.x) - c * this.v;
      this.v += a * p;
      this.x += this.v * p;
    }
    return this.x;
  }
  /** Assez près et assez lent pour qu'on puisse cesser de peindre. */
  get dort() { return Math.abs(this.cible - this.x) < 0.05 && Math.abs(this.v) < 0.05; }
}

/* LA BOUCLE S'ARRÊTE TOUTE SEULE. Une boucle rAF qui tourne en permanence
   pour un geste qui dure une seconde tient le téléphone éveillé et vide la
   batterie pour rien. `boucle()` rend une fonction d'arrêt, et `fn` peut
   rendre `false` pour se terminer elle-même quand tous ses ressorts dorment. */
export function boucle(fn) {
  let id = 0, dernier = performance.now(), vivant = true;
  const pas = (t) => {
    if (!vivant) return;
    const dt = Math.min(0.05, (t - dernier) / 1000); dernier = t;
    if (fn(dt) === false) { vivant = false; return; }
    id = requestAnimationFrame(pas);
  };
  id = requestAnimationFrame(pas);
  return () => { vivant = false; cancelAnimationFrame(id); };
}

/* ------------------------------------------------------------ le paquet */

/* LE PAQUET QU'ON TRAÎNE. Chaque nœud reçoit deux ressorts — un par axe — plus
   un pour la rotation et un pour l'échelle. La cible de ces ressorts est
   recalculée à chaque frame par `viser()` ; l'intégration, elle, est la même
   pour tous les réglages. C'est ce qui rend les cinq variantes comparables :
   elles ne changent QUE les cibles et les raideurs, jamais le solveur.
 *
 * `nodes` — les éléments, DANS L'ORDRE OÙ LE DOIGT LES A CHOISIS. Pas dans
 *   l'ordre du DOM : `querySelectorAll` rend les cartes de gauche à droite, si
 *   bien qu'en sélectionnant de droite à gauche le tas se formait à l'autre
 *   bout de la main. La TÊTE du paquet — celle qui est sous le doigt — est le
 *   DERNIER élément.
 */
export class Paquet {
  constructor(nodes, { raideur = 260, zeta = 0.72, direct = false } = {}) {
    this.direct = direct;
    // RÈGLE 9 : les boîtes sont prises ICI, une fois, avant la première
    // transformation. Tout le reste du geste s'exprime en écart à ce repère.
    this.membres = nodes.map((n) => {
      const r = n.getBoundingClientRect();
      n.style.transition = 'none';   // le ressort peint, la transition gênerait
      n.style.willChange = 'transform';
      return {
        n, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
        x: new Ressort(0, { raideur, zeta }), y: new Ressort(0, { raideur, zeta }),
        rot: new Ressort(0, { raideur: raideur * 0.8, zeta: 0.7 }),
        ech: new Ressort(1, { raideur: raideur * 1.1, zeta: 0.9 }),
      };
    });
  }
  get tete() { return this.membres[this.membres.length - 1]; }
  /** `f(membre, rang, i)` pose `cible` sur les quatre ressorts du membre.
   *  Rang 0 = la tête, celle qui est sous le doigt. */
  viser(f) {
    const n = this.membres.length;
    this.membres.forEach((m, i) => f(m, n - 1 - i, i));
  }
  /** Intègre et peint. `direct` court-circuite les ressorts : c'est la
   *  variante de référence, celle où le paquet colle au doigt. */
  peindre(dt) {
    let bouge = false;
    this.membres.forEach((m, i) => {
      let x, y, rot, ech;
      if (this.direct) {
        x = m.x.x = m.x.cible; y = m.y.x = m.y.cible;
        rot = m.rot.x = m.rot.cible; ech = m.ech.x = m.ech.cible;
      } else {
        x = m.x.pas(dt); y = m.y.pas(dt); rot = m.rot.pas(dt); ech = m.ech.pas(dt);
        if (!(m.x.dort && m.y.dort && m.rot.dort && m.ech.dort)) bouge = true;
      }
      m.n.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${ech.toFixed(3)})`;
      m.n.style.zIndex = String(20 + i);
    });
    return bouge;
  }
  /** Repose tout : les nœuds retrouvent leur place et leurs transitions CSS. */
  rendre() {
    for (const m of this.membres) {
      m.n.style.transition = ''; m.n.style.transform = '';
      m.n.style.zIndex = ''; m.n.style.willChange = '';
      m.n.style.removeProperty('--leve');
    }
    this.membres = [];
  }
}

/* ------------------------------------------------- ce qui vole dans l'hôte */

// RÈGLE 11 : tout ce qui suit est posé DANS l'hôte, en coordonnées relatives à
// lui. `dans()` convertit une position d'écran en position d'hôte — c'est le
// seul endroit du module où l'on touche à `getBoundingClientRect`.
export function dans(hote, pt) {
  const r = hote.getBoundingClientRect();
  return { x: pt.x - r.left, y: pt.y - r.top };
}

function poser(hote, cls) {
  const d = document.createElement('div');
  d.className = cls;
  hote.appendChild(d);
  return d;
}

/* LA POUSSIÈRE DE CARTON. Un paquet qu'on soulève d'un râtelier de chêne lève
   de la poussière, pas des étincelles : des grains ternes, courts, qui
   retombent. C'est la seule chose qui dit que la carte a QUITTÉ le bois — sans
   elle, elle glisse sur une vitre. Plafonné à 14 grains : au-delà on lit un
   nuage, et un nuage veut dire qu'autre chose a explosé. */
export function poussiere(hote, pt, { n = 8, force = 1 } = {}) {
  if (reduit()) return;
  const o = dans(hote, pt);
  const combien = Math.min(14, Math.round(n));
  for (let i = 0; i < combien; i++) {
    const d = poser(hote, 'gf-grain');
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const dist = (10 + Math.random() * 26) * force;
    d.style.left = `${o.x}px`; d.style.top = `${o.y}px`;
    const taille = 1.5 + Math.random() * 2;
    d.style.width = `${taille}px`; d.style.height = `${taille}px`;
    d.animate([
      { transform: 'translate(-50%,-50%) translate(0,0)', opacity: 0.55 },
      { transform: `translate(-50%,-50%) translate(${(Math.cos(ang) * dist).toFixed(1)}px, ${(Math.sin(ang) * dist + 14).toFixed(1)}px)`, opacity: 0 },
    ], { duration: 380 + Math.random() * 260, easing: 'cubic-bezier(.15,.7,.4,1)' })
      .onfinish = () => d.remove();
  }
}

/* LA TRAÎNÉE : une image rémanente de la carte, qui se fane sur place. Elle ne
   se peint QUE si le paquet va assez vite — posée à chaque frame, elle
   maquille le mouvement au lieu de le souligner, et à trois cartes sur un
   téléphone elle coûte trente nœuds par seconde pour rien. */
export function trainee(hote, node, { opacite = 0.3 } = {}) {
  if (reduit()) return;
  const r = node.getBoundingClientRect();
  const o = dans(hote, { x: r.left, y: r.top });
  const d = poser(hote, 'gf-trainee');
  d.style.left = `${o.x}px`; d.style.top = `${o.y}px`;
  d.style.width = `${r.width}px`; d.style.height = `${r.height}px`;
  d.style.transform = node.style.transform ? '' : '';
  d.animate([{ opacity: opacite }, { opacity: 0 }],
    { duration: 240, easing: 'ease-out' }).onfinish = () => d.remove();
}

/* L'ÉCRAN TREMBLE — sur l'HÔTE, jamais sur la page. Secouer `body` déplace
   aussi le râtelier et la main : les cartes qu'on vient de lâcher sautent avec
   le décor, et le geste a l'air d'avoir raté. */
export function secousse(hote, px, duree = 320) {
  if (!px || !hote || reduit()) return;
  const pas = [];
  for (let i = 0; i <= 8; i++) {
    const k = px * (1 - i / 8);
    pas.push({ transform: `translate(${(i % 2 ? -k : k).toFixed(1)}px, ${((i % 3 ? k : -k) * 0.5).toFixed(1)}px)` });
  }
  pas.push({ transform: 'none' });
  hote.animate(pas, { duration: duree, easing: 'ease-out' });
}

/** L'ÉCLAIR : un voile blanc très bref. Il dit « ça a porté » avant même que
 *  le chiffre monte. */
export function eclair(hote, force = 1) {
  if (!hote || reduit()) return;
  const f = poser(hote, 'flash');
  f.animate([{ opacity: 0 }, { opacity: 0.55 * force, offset: 0.12 }, { opacity: 0 }],
    { duration: 260, easing: 'ease-out' }).onfinish = () => f.remove();
}

/** L'ONDE DE CHOC : un anneau qui s'ouvre depuis le point d'impact. Réservée
 *  au dernier cran — c'est le seul effet que les autres n'ont pas. */
export function onde(hote, pt) {
  if (!hote || reduit()) return;
  const o = dans(hote, pt);
  const d = poser(hote, 'onde');
  d.style.left = `${o.x}px`; d.style.top = `${o.y}px`;
  d.animate([
    { transform: 'translate(-50%,-50%) scale(.2)', opacity: .8, borderWidth: '3px' },
    { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0, borderWidth: '1px' },
  ], { duration: 620, easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = () => d.remove();
}

/* DU BOIS ARRACHÉ, pas une boule de feu. Un boulet dans un bordé de chêne fait
   voler des copeaux : c'est le bois qui dit que la coque a pris, la fumée
   seule dit « quelque chose a explosé ». Réutilise `.copeau`, déjà défini pour
   la mer de l'écran de cartes — règle 3 : un composant partagé n'a qu'une
   définition. */
export function copeaux(hote, pt, { n = 10, force = 1 } = {}) {
  if (reduit()) return;
  const teintes = ['#b98a4b', '#8a6234', '#e6d9bd', '#5a3d25'];
  const o = dans(hote, pt);
  for (let i = 0; i < Math.min(26, n); i++) {
    const d = poser(hote, 'copeau');
    const ang = Math.PI + (Math.PI * (0.15 + Math.random() * 0.7)) * (Math.random() < 0.5 ? 1 : -1);
    const dist = (22 + Math.random() * 46) * force;
    d.style.left = `${o.x}px`; d.style.top = `${o.y}px`;
    d.style.background = teintes[i % teintes.length];
    d.style.width = `${2 + Math.random() * 3}px`;
    d.style.height = `${1 + Math.random() * 2}px`;
    d.animate([
      { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
      { transform: `translate(-50%,-50%) translate(${(Math.cos(ang) * dist).toFixed(1)}px, ${(-Math.abs(Math.sin(ang)) * dist * 0.7 + 26).toFixed(1)}px) rotate(${(Math.random() * 540 - 270).toFixed(0)}deg)`, opacity: 0 },
    ], { duration: 520 + Math.random() * 340, easing: 'cubic-bezier(.2,.7,.4,1)' })
      .onfinish = () => d.remove();
  }
}

/* LE CHIFFRE ROULE, DEPUIS UNE VALEUR TENUE DANS L'ANIMATION. Relu dans le DOM
   pour repartir, c'est tirer une valeur stable d'une entrée qui bouge
   (règle 9) : deux roulements qui se chevauchent partaient chacun d'un nombre
   à demi écrit. */
export function rouler(node, de, a, duree = 260) {
  if (!node) return;
  if (reduit()) { node.textContent = String(Math.round(a)); return; }
  const t0 = performance.now();
  const pas = (t) => {
    const k = Math.min(1, (t - t0) / duree);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = String(Math.round(de + (a - de) * e));
    if (k < 1) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}

/** Un nombre qui jaillit d'un nœud vers le haut, dans l'hôte. */
export function jaillir(hote, pt, texte, cls = '') {
  if (reduit()) return;
  const o = dans(hote, pt);
  const d = poser(hote, `gf-nb ${cls}`);
  d.textContent = texte;
  d.style.left = `${o.x}px`; d.style.top = `${o.y}px`;
  d.animate([
    { transform: 'translate(-50%, 0) scale(.7)', opacity: 0 },
    { transform: 'translate(-50%, -14px) scale(1.15)', opacity: 1, offset: .25 },
    { transform: 'translate(-50%, -46px) scale(1)', opacity: 0 },
  ], { duration: 760, easing: 'cubic-bezier(.2,.9,.3,1)' }).onfinish = () => d.remove();
}

/** Le centre d'un élément, en coordonnées d'ÉCRAN. */
export function centre(node, fx = 0.5, fy = 0.5) {
  const r = node.getBoundingClientRect();
  return { x: r.left + r.width * fx, y: r.top + r.height * fy };
}

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
