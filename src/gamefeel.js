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
        // LE CABRAGE EST UNE ROTATION EN X, donc une vraie inclinaison dans la
        // profondeur — pas une rotation dans le plan. Un paquet qu'on soulève
        // vite bascule vers l'arrière comme un plateau ; en 2D on ne pouvait
        // que le faire pencher de côté, ce qu'une poussée droite vers le haut
        // ne justifie jamais. L'hôte doit porter une `perspective`, sinon
        // `rotateX` n'aplatit la carte que d'une fraction de pixel.
        incl: new Ressort(0, { raideur: raideur * 0.7, zeta: 0.8 }),
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
      let incl;
      if (this.direct) {
        x = m.x.x = m.x.cible; y = m.y.x = m.y.cible;
        rot = m.rot.x = m.rot.cible; ech = m.ech.x = m.ech.cible;
        incl = m.incl.x = m.incl.cible;
      } else {
        x = m.x.pas(dt); y = m.y.pas(dt); rot = m.rot.pas(dt);
        incl = m.incl.pas(dt); ech = m.ech.pas(dt);
        if (!(m.x.dort && m.y.dort && m.rot.dort && m.incl.dort && m.ech.dort)) bouge = true;
      }
      // L'ORDRE DES TRANSFORMATIONS COMPTE : le cabrage vient AVANT la rotation
      // dans le plan, sinon la carte pivote autour d'un axe déjà incliné et le
      // mouvement se lit comme une vrille.
      m.n.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotateX(${incl.toFixed(2)}deg) rotate(${rot.toFixed(2)}deg) scale(${ech.toFixed(3)})`;
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
      m.n.classList.remove('enlair', 'vise');
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
export function poussiere(hote, pt, { n = 8, force = 1, taille = 2 } = {}) {
  if (reduit()) return;
  const o = dans(hote, pt);
  const combien = Math.min(14, Math.round(n));
  for (let i = 0; i < combien; i++) {
    const d = poser(hote, 'gf-grain');
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const dist = (10 + Math.random() * 26) * force;
    d.style.left = `${o.x}px`; d.style.top = `${o.y}px`;
    // LA TAILLE EST UN RÉGLAGE, et elle décide si l'effet existe : dix-huit
    // grains de 2 px lâchés sous le pouce ne se voient pas — c'est ce qu'a
    // montré la première version du banc, où la poussière était bien peinte et
    // parfaitement invisible.
    const t = taille * (0.6 + Math.random() * 0.9);
    d.style.width = `${t.toFixed(1)}px`; d.style.height = `${t.toFixed(1)}px`;
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

/* --------------------------------------------- l'amarre (caractère I) */

/* UNE AUSSIÈRE QUI SE TEND, PUIS QUI CASSE. C'est le seul moyen de faire
   SENTIR un seuil : un geste qui a un seuil invisible se franchit par accident,
   et le joueur ne comprend ni ce qu'il vient de faire ni comment le refaire.

   EN SVG, ET NON EN DIV PIVOTÉE. Une amarre tendue est presque droite, une
   amarre molle pend : c'est la FLÈCHE de la courbe qui dit la tension, et un
   rectangle qu'on fait tourner ne peut pas pendre. Un seul `<path>` quadratique
   par carte, dont le point de contrôle descend quand la corde est molle
   (règle 12 : une masse se peint en une fois, pas en morceaux empilés). */
export function amarres(hote) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'gf-amarres');
  svg.setAttribute('aria-hidden', 'true');
  hote.appendChild(svg);
  const traits = [];
  const r = hote.getBoundingClientRect();

  return {
    /** `liste` : des paires { de, vers } en coordonnées d'ÉCRAN. `tension` va
     *  de 0 (molle) à 1 (près de rompre). */
    maj(liste, tension) {
      while (traits.length < liste.length) {
        const p = document.createElementNS(NS, 'path');
        svg.appendChild(p); traits.push(p);
      }
      traits.forEach((p, i) => {
        const paire = liste[i];
        if (!paire) { p.setAttribute('d', ''); return; }
        const ax = paire.de.x - r.left, ay = paire.de.y - r.top;
        const bx = paire.vers.x - r.left, by = paire.vers.y - r.top;
        // La flèche s'efface à mesure que la corde se tend : molle elle pend de
        // 26 px, tendue elle est droite.
        const mou = (1 - tension) * 26;
        const cx = (ax + bx) / 2, cy = (ay + by) / 2 + mou;
        p.setAttribute('d', `M ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`);
        p.style.opacity = String(0.45 + tension * 0.55);
        p.style.strokeWidth = `${(2.6 - tension * 0.9).toFixed(2)}`;
      });
    },
    /** LA RUPTURE SE VOIT. Les brins se rétractent vers leurs deux bouts : sans
     *  cela l'amarre disparaît, et disparaître n'est pas casser. */
    casser() {
      for (const p of traits) {
        if (!p.getAttribute('d')) continue;
        p.style.opacity = '1';
        p.animate([{ strokeDasharray: '200 0', opacity: 1 },
          { strokeDasharray: '0 200', opacity: 0 }],
        { duration: 220, easing: 'cubic-bezier(.4,0,1,1)' });
      }
      setTimeout(() => svg.remove(), 240);
    },
    retirer() { svg.remove(); },
  };
}

/* ------------------------------------------ la poudrière (caractère III) */

/* DE LA SCIURE EN SUSPENSION. Le râtelier est du chêne : l'air au-dessus n'est
   pas vide. Les motes dérivent lentement et en permanence — c'est ce qui
   distingue une matière d'un effet, qui n'existe qu'au moment où on le
   déclenche. Vingt au plus : au-delà on lit un brouillard, et un brouillard
   veut dire que le temps a changé. */
export function motes(hote, combien = 20) {
  if (reduit()) return () => {};
  const r = hote.getBoundingClientRect();
  const noeuds = [];
  for (let i = 0; i < Math.min(24, combien); i++) {
    const d = poser(hote, 'gf-mote');
    const taille = 1.5 + Math.random() * 2.5;
    d.style.width = `${taille}px`; d.style.height = `${taille}px`;
    d.style.left = `${Math.random() * r.width}px`;
    d.style.top = `${Math.random() * r.height}px`;
    // RÈGLE 9 : la dérive vient d'une GRAINE tenue ici, jamais recalculée
    // d'après la position courante. Tirée de l'abscisse — qui bouge — chaque
    // mote se retirait au sort soixante fois par seconde et l'air scintillait.
    const dx = (Math.random() - 0.5) * 60, dy = -14 - Math.random() * 30;
    d.animate([{ transform: 'translate(0,0)', opacity: 0 },
      { opacity: 0.5, offset: 0.2 },
      { opacity: 0.4, offset: 0.75 },
      { transform: `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px)`, opacity: 0 }],
    { duration: 4200 + Math.random() * 3600, iterations: Infinity, delay: -Math.random() * 5000 });
    noeuds.push(d);
  }
  return () => { for (const d of noeuds) d.remove(); };
}

/* LA MARQUE LAISSÉE SUR LE BOIS. Une carte enlevée découvre un rectangle plus
   clair : le râtelier se souvient d'elle. C'est le détail qui dit que la carte
   ÉTAIT POSÉE quelque part, plutôt que superposée à une image de bois. */
export function empreinte(hote, boite) {
  const r = hote.getBoundingClientRect();
  const d = poser(hote, 'gf-empreinte');
  d.style.left = `${boite.left - r.left}px`;
  d.style.top = `${boite.top - r.top}px`;
  d.style.width = `${boite.width}px`;
  d.style.height = `${boite.height}px`;
  return () => {
    d.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' })
      .onfinish = () => d.remove();
  };
}

/* DES BRAISES. Elles ne tombent que des boulets rouges : un effet qui sort de
   toutes les cartes est un filtre, un effet qui sort d'UNE carte est une
   propriété de cette carte. */
export function braises(hote, pt, n = 3) {
  if (reduit()) return;
  const o = dans(hote, pt);
  for (let i = 0; i < n; i++) {
    const d = poser(hote, 'gf-braise');
    d.style.left = `${o.x + (Math.random() - 0.5) * 30}px`;
    d.style.top = `${o.y + (Math.random() - 0.5) * 30}px`;
    d.animate([{ transform: 'translate(0,0) scale(1)', opacity: .9 },
      { transform: `translate(${((Math.random() - 0.5) * 26).toFixed(0)}px, ${(18 + Math.random() * 26).toFixed(0)}px) scale(.3)`, opacity: 0 }],
    { duration: 620 + Math.random() * 420, easing: 'ease-in' }).onfinish = () => d.remove();
  }
}

/* ------------------------------------------ la timonerie (caractère IV) */

/* LA LIGNE DE VISÉE : un trait tendu du paquet au point d'impact. Elle dit où
   le coup PARTIRA, avant qu'on lâche — c'est ce qui transforme un glissement
   en visée. Pointillée et non pleine : une ligne pleine se lit comme un lien
   déjà établi, une ligne pointillée comme une intention. */
export function visee(hote) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'gf-visee');
  svg.setAttribute('aria-hidden', 'true');
  const trait = document.createElementNS(NS, 'path');
  svg.appendChild(trait);
  hote.appendChild(svg);
  const r = hote.getBoundingClientRect();
  return {
    maj(de, vers, force) {
      const ax = de.x - r.left, ay = de.y - r.top;
      const bx = vers.x - r.left, by = vers.y - r.top;
      trait.setAttribute('d', `M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${bx.toFixed(1)} ${by.toFixed(1)}`);
      svg.style.opacity = String(Math.max(0, Math.min(1, force)));
    },
    retirer() { svg.remove(); },
  };
}

/** L'ANGLE d'un point vers un autre, en degrés, 0 = vers le haut. Les cartes
 *  de la timonerie s'orientent dessus comme des aiguilles. */
export const capVers = (de, vers) => Math.atan2(vers.x - de.x, de.y - vers.y) * 180 / Math.PI;

/* ---------------------------------------------------- le fantôme (👻) */

/* LA RÉFÉRENCE SE SUPERPOSE, ELLE NE SE CHOISIT PAS. Comparer deux gestes en
   alternant entre eux, c'est comparer deux souvenirs : on préfère toujours
   celui qu'on vient d'essayer. Superposé, l'écart se LIT — trente pixels de
   retard sont trente pixels, pas une impression.
 *
 * Le fantôme est fait de CLONES posés dans l'hôte, jamais des cartes
 * elles-mêmes : deux boucles qui peindraient les mêmes nœuds se disputeraient
 * la transformation, et c'est le bug qui a coûté le lâcher du premier banc.
 */
export function fantome(hote, noeuds) {
  const r = hote.getBoundingClientRect();
  const clones = noeuds.map((n) => {
    const b = n.getBoundingClientRect();
    const c = n.cloneNode(true);
    c.className = `${n.className} gf-fantome`;
    c.removeAttribute('id');
    c.style.cssText = `position:absolute;left:${b.left - r.left}px;top:${b.top - r.top}px;`
      + `width:${b.width}px;height:${b.height}px;margin:0;transition:none;`;
    hote.appendChild(c);
    return { n: c, cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
  });
  return {
    clones,
    /* LE GESTE DU JEU TEL QU'IL EST : le paquet colle au doigt, sans ressort et
       sans retard, et les cartes se rangent derrière la dernière touchée. */
    maj(dx, dy) {
      const tete = clones[clones.length - 1];
      const k = Math.max(0, Math.min(1, -dy / 70));
      clones.forEach((c, i) => {
        const rang = clones.length - 1 - i;
        const vers = (tete.cx - c.cx) * k + rang * 3 * k;
        const monte = (tete.cy - c.cy) * k - rang * 3 * k;
        c.n.style.transform = `translate(${(dx + vers).toFixed(1)}px, ${(dy + monte - 14).toFixed(1)}px) `
          + `rotate(${(rang * -2.5 * k).toFixed(1)}deg) scale(${(1.04 + k * 0.06).toFixed(3)})`;
      });
    },
    retirer() { for (const c of clones) c.n.remove(); },
  };
}
