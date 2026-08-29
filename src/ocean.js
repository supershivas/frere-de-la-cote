// Animated pixel-art sea scene on the full-screen background canvas.
// A "scene" (weather + a few decor elements) is chosen per combat / per landing
// and stays stable while it is shown (only clouds/waves drift). Use
// randomOceanScene() to roll a new one.

let raf = null;

const WEATHERS = {
  dawn:   { skyTop: '#4a3f74', skyHz: '#e6a374', seaNear: '#123a52', seaFar: '#4a5f6e', sun: '#ffd8a0', sunA: 0.9, cloud: 0.35, rain: 0, star: 0 },
  day:    { skyTop: '#37699f', skyHz: '#a9c9e0', seaNear: '#0a3a5c', seaFar: '#1d5c82', sun: '#fff4c8', sunA: 0.95, cloud: 0.25, rain: 0, star: 0 },
  cloudy: { skyTop: '#63727f', skyHz: '#aab4bc', seaNear: '#20323e', seaFar: '#385460', sun: '#d8dde0', sunA: 0.3, cloud: 0.7, rain: 0, star: 0 },
  storm:  { skyTop: '#262b33', skyHz: '#454d57', seaNear: '#0f1a22', seaFar: '#243640', sun: '#8892a0', sunA: 0.12, cloud: 0.85, rain: 1, star: 0 },
  sunset: { skyTop: '#6d3a5c', skyHz: '#e8763a', seaNear: '#2a2340', seaFar: '#7c4a48', sun: '#ff9646', sunA: 0.95, cloud: 0.4, rain: 0, star: 0 },
  night:  { skyTop: '#081026', skyHz: '#182a46', seaNear: '#061020', seaFar: '#0f2438', sun: '#e8eeff', sunA: 0.85, cloud: 0.3, rain: 0, star: 1 },
};
const WEATHER_KEYS = Object.keys(WEATHERS);

// LE DÉCOR EST NATUREL, ET IL EST AUX CARAÏBES. Quatre sortes ont été retirées,
// et il ne faut pas les reconstruire :
//
//   `lighthouse` — un phare dont la lampe s'allumait sur `Math.sin(t*1.5) > 0.4`.
//     Un clignotement binaire à 5 px sur l'horizon attire l'œil plus que la mer
//     entière, comme les trois houles retirées avant lui.
//   `iceberg`    — on est aux Caraïbes.
//   `fort`       — un créneau de château au bord de l'eau, surmonté du seul
//     aplat de couleur pure du décor : `#7a2b2b`, 8 px sur 5. Un drapeau planté.
//   `buoy`       — une balise rouge à bande blanche de 5 px de rayon se lit
//     comme un ballon de plage ; même registre que le fort.
//
// À LEUR PLACE, DES TERRES : un `rivage` qui entre par un bord de l'écran, et
// des `ile`s lointaines sans le moindre détail. Ce sont les deux seules formes
// du décor à être TIRÉES AU SORT plutôt que dessinées une fois pour toutes.
const DECOR_KINDS = ['ile', 'ilots', 'wreck', 'fishermen', 'sharkfins', 'seagulls', 'whale'];

// UNE FORME VIENT D'UNE GRAINE, UNE POSITION PEUT VENIR DU TEMPS, ET RIEN NE
// VIENT DE `w` NI DE `h`. C'est la règle 9 en une phrase, et c'est elle qui
// sépare l'épave — dont l'inclinaison vient de `t`, et c'est un MOUVEMENT, donc
// c'est juste — des anciens nuages, dont la FORME venait de leur abscisse, qui
// dérive : les bourgeons se retiraient au sort soixante fois par seconde.
function alea(g) {
  let x = (g >>> 0) || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

// UNE CÔTE, CONSTRUITE UNE FOIS ET GELÉE. `Object.freeze` fait ÉCHOUER
// bruyamment toute écriture depuis une image de rendu — les modules ES sont en
// mode strict — au lieu de laisser la terre scintiller sans que rien ne le
// signale. L'instrument fait partie de la forme.
//
// Deux sinus de phases et de fréquences tirées : une côte n'est ni une dent de
// scie régulière ni un demi-cercle, et un tirage par point donnerait du bruit
// blanc, qui ne ressemble à rien à cette échelle. La portée est une FRACTION de
// la largeur : à 412 px la côte est plus longue, elle n'est pas étirée.
function construireCote(graine, echelle = 1) {
  const r = alea(graine);
  const bord = r() < 0.5 ? -1 : 1;
  // UNE CÔTE SUR QUATRE BARRE TOUT L'HORIZON. On n'entre pas toujours dans une
  // rade par le travers : il arrive qu'on longe une terre, et l'horizon est
  // alors une ligne de relief d'un bord à l'autre. Sans ce cas, toute rade
  // ressemblait à une pointe posée dans un coin.
  const portee = (r() < 0.25 ? 1.02 : 0.26 + r() * 0.26) * echelle;
  const n = 5 + Math.floor(r() * 4);
  const a1 = r() * 6.283, a2 = r() * 6.283, k = 1.6 + r() * 2.4;
  const crete = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;                                   // 0 au bord, 1 à la pointe
    const brut = Math.sin(a1 + u * 5.1) * 0.62 + Math.sin(a2 + u * k * 5.1) * 0.38;
    // 34 px au plus contre le bord, 0 à la pointe : la terre ENTRE dans la mer
    // au lieu de s'arrêter net. 34 px, c'est un cinquième de la bande de ciel à
    // 375 × 667 — une silhouette, jamais un mur.
    const hh = (10 + (brut + 1) * 12) * (1 - u * u) * echelle;
    crete.push(Object.freeze([u * portee, Math.max(0, Math.round(hh))]));
  }
  return Object.freeze({ bord, portee, crete: Object.freeze(crete) });
}

// UNE ÎLE LOINTAINE N'A AUCUN DÉTAIL, PAR CONSTRUCTION. « Sans détail visible »
// n'est pas une consigne de retenue : c'est un plafond de 14 px de haut. À cette
// taille, un détail ne peut plus être qu'un pixel isolé, donc du bruit — et
// c'est très exactement ce qu'était le palmier de l'ancienne île, deux pixels
// sur douze plantés au même endroit à chaque partie.
function construireIle(graine) {
  const r = alea(graine);
  return Object.freeze({
    larg: 40 + r() * 70,
    haut: 6 + r() * 8,
    bosse: 0.35 + r() * 0.3,
  });
}

let scene = null;

// Maps a data/weather.json mechanical weather id to one of the decorative
// scenes above, so the backdrop reads as consistent with the combat mods
// without hardcoding game-design values into the purely visual layer.
const WEATHER_HINTS = {
  calme: 'day', brise: 'day', vent_fort: 'cloudy', brume: 'cloudy', tempete: 'storm', grain: 'storm',
};

// `weatherHint` accepts either a data/weather.json id (mapped above) or one of
// the scene keys directly, so a caller that already knows the sky it wants —
// the encounter draw picks night, dawn or storm from the hour and the sea —
// can ask for it instead of hoping the mechanical weather implies it.
export function randomOceanScene(weatherHint) {
  const hinted = weatherHint && (WEATHERS[weatherHint] ? weatherHint : WEATHER_HINTS[weatherHint]);
  const weather = hinted || WEATHER_KEYS[Math.floor(Math.random() * WEATHER_KEYS.length)];
  let decor = [];
  if (Math.random() > 0.18) { // sometimes an empty seascape
    const n = 1 + Math.floor(Math.random() * 3);
    const shuffled = DECOR_KINDS.slice().sort(() => Math.random() - 0.5).slice(0, n);
    const slots = [0.16, 0.44, 0.72, 0.86].sort(() => Math.random() - 0.5);
    decor = shuffled.map((kind, i) => ({
      kind, x: slots[i] + (Math.random() - 0.5) * 0.06,
      seed: Math.random() * 100,
      // LA FORME EST TIRÉE ICI, dans la génération, une fois pour la scène.
      forme: kind === 'ile' ? construireIle((Math.random() * 4294967295) >>> 0) : null,
    }));
  }
  // UNE RADE SUR DEUX A UNE TERRE. Le rivage n'est pas un décor posé à une
  // abscisse : il appartient à un BORD de l'écran, et il a deux plans.
  const g = (Math.random() * 4294967295) >>> 0;
  const rivage = Math.random() < 0.5 ? null
    : { proche: construireCote(g), lointain: construireCote((g + 1) >>> 0, 1.35), graine: g };
  scene = { weather, decor, rivage, astre: tirerAstre(weather) };
  return scene;
}

// L'ASTRE EST TIRÉ AVEC LA SCÈNE : son espèce, son abscisse, sa HAUTEUR et, pour
// la lune, sa phase. Il était posé en dur à `w * 0.76, horizon * 0.45` — le même
// point à chaque partie, à chaque heure, et le même disque plein la nuit que le
// jour. Un ciel dont le seul astre ne bouge jamais est un décor peint.
//
// LA HAUTEUR VIENT DE L'HEURE, et c'est la seule chose que le ciel raconte : au
// lever et au couchant l'astre rase l'horizon, à midi il est haut. Les bornes
// sont des FRACTIONS de la bande de ciel, donc elles valent à toute hauteur
// d'écran — 1 est la ligne d'eau, 0 le haut de l'écran.
const HAUTEURS = {
  dawn:   [0.62, 0.88],   // il se lève : il rase encore
  day:    [0.06, 0.34],   // haut, et c'est ce qui fait qu'il est midi
  cloudy: [0.20, 0.55],
  storm:  [0.24, 0.58],
  sunset: [0.60, 0.90],   // il tombe
  night:  [0.10, 0.80],   // la lune se promène plus librement
};

function tirerAstre(weather) {
  const [bas, haut] = HAUTEURS[weather] || HAUTEURS.day;
  return Object.freeze({
    lune: weather === 'night',
    // JAMAIS TOUJOURS AU MÊME X. Bornée à 12–88 % : collé au bord, l'astre est
    // coupé par la tranche de l'écran et se lit comme une tache.
    x: 0.12 + Math.random() * 0.76,
    y: bas + Math.random() * (haut - bas),
    // La phase, en tours : 0 nouvelle, 0,5 pleine. Tirée au hasard — ce jeu ne
    // tient pas de calendrier, et une lune qui suivrait un cycle réel demanderait
    // une date, donc une horloge, dans un module qui n'en a pas.
    phase: Math.random(),
  });
}

// `horizon` : la fraction de hauteur où la mer commence. Par défaut 0,13 —
// une mer qui remplit presque tout, ce que veulent les écrans de carte et de
// titre. L'écran de cartes la descend, pour que les navires aient du ciel
// derrière leurs voiles au lieu de se découper sur de l'eau.
// `cielHaut` : la fraction de hauteur SOUS laquelle le ciel est dégagé. Elle
// existe pour l'astre, et pour lui seul. Les étiquettes des deux navires sont
// des plaques opaques posées en haut de la mer : un soleil de midi, qui est haut
// PAR DÉFINITION, se rangeait entièrement derrière elles — on avait donc un ciel
// de midi sans soleil. C'est l'appelant qui la mesure, parce que c'est lui qui
// sait où finissent ses plaques ; ici on ne devine rien.
export function startOcean(canvas, { horizon: fraction = 0.13, cielHaut = 0 } = {}) {
  if (!scene) randomOceanScene();
  const ctx = canvas.getContext('2d');
  let w, h, t = 0;

  // LE TAMPON SE COMPTE EN PIXELS D'ÉCRAN, PAS EN PIXELS CSS. Il a longtemps
  // valu `canvas.clientWidth` : sur un téléphone à 3×, un tampon de 393 × 852
  // était étiré sur 1179 × 2556 pixels réels, avec le lissage par défaut. Le
  // ciel, les nuages et le halo du soleil en sortaient étalés — et sur un écran
  // d'ordinateur, où le rapport vaut 1, RIEN NE LE SIGNALAIT. C'est la faute la
  // plus coûteuse qu'un canvas puisse faire, et elle ne se voit que sur
  // l'appareil pour lequel le jeu est fait.
  //
  // `setTransform` remet ensuite l'échelle : tout le tracé continue de compter
  // en pixels CSS, et pas une ligne de dessin ne change. Le rapport est plafonné
  // à 3 — au-delà, on paie quatre fois les pixels pour une différence que
  // personne ne voit.
  function resize() {
    const r = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * r);
    canvas.height = Math.round(h * r);
    ctx.setTransform(r, 0, 0, r, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.85, s: Math.random() * 1.5 + 0.5, tw: Math.random() * 6 }));
  // Vitesse : un nuage n'est pas un oiseau. Même par tempête, ce qu'on voit
  // depuis un pont, c'est une masse qui glisse — quatre fois plus lentement
  // qu'avant, quel que soit le temps.
  const clouds = Array.from({ length: 5 }, (_, i) => ({ x: Math.random(), y: 0.08 + Math.random() * 0.5, sc: 0.9 + Math.random() * 1.1, sp: 0.00028 + Math.random() * 0.00042, seed: i * 7.3 }));
  const gulls = Array.from({ length: 5 }, () => ({ x: Math.random(), y: 0.15 + Math.random() * 0.4, sp: 0.02 + Math.random() * 0.02, ph: Math.random() * 6 }));

  function frame() {
    t += 0.016;
    // Horizon sits high — the sea fills ~87% of the screen.
    const horizon = Math.floor(h * fraction);
    const s = WEATHERS[scene.weather];

    // Sky.
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, s.skyTop);
    sky.addColorStop(1, s.skyHz);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);
    // A little sky colour continues just below the horizon for haze.
    ctx.fillStyle = s.skyHz;
    ctx.globalAlpha = 0.25; ctx.fillRect(0, horizon, w, 6); ctx.globalAlpha = 1;

    if (s.star > 0.02) {
      for (const st of stars) {
        if (st.y * horizon > horizon) continue;
        const a = s.star * (0.4 + 0.6 * Math.abs(Math.sin(t + st.tw)));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(st.x * w, st.y * horizon, st.s, st.s);
      }
    }

    // L'ASTRE, à sa place et à sa hauteur — tirées avec la scène, jamais écrites
    // ici. `y` est une fraction de la bande de ciel : 1 est la ligne d'eau.
    const a = scene.astre || { lune: false, x: 0.76, y: 0.45, phase: 0.5 };
    // La hauteur tirée est une fraction du ciel DÉGAGÉ, entre le bas des
    // plaques et la ligne d'eau — pas du haut de l'écran, où rien ne se voit.
    const plafond = h * cielHaut;
    const sunX = w * a.x, sunY = plafond + a.y * (horizon - plafond);
    const R = a.lune ? 13 : 11;
    ctx.globalAlpha = s.sunA;
    // LE HALO EST PLUS SERRÉ SUR LA LUNE que sur le soleil : un halo de 46 px
    // autour d'un croissant en efface la forme, et une lune sans sa phase est un
    // soleil blanc.
    const rh = a.lune ? 26 : 46;
    const g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, rh);
    g.addColorStop(0, s.sun); g.addColorStop(0.4, s.sun); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sunX, sunY, rh, 0, 7); ctx.fill();
    ctx.fillStyle = s.sun;
    if (a.lune) dessinerPhase(ctx, sunX, sunY, R, a.phase);
    else { ctx.beginPath(); ctx.arc(sunX, sunY, R, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;

    // Clouds (drift slowly).
    for (const c of clouds) {
      c.x += c.sp * 0.5;
      if (c.x > 1.2) c.x = -0.2;
      drawCloud(ctx, c.x * w, c.y * horizon, c.sc, s.cloud, c.seed);
    }

    // LA TERRE, AVANT LES DÉCORS D'HORIZON. Deux plans, et les DEUX SONT
    // OPAQUES : deux masses semi-transparentes qui se recouvrent laissent lire
    // leur recouvrement, et l'on voit deux calques au lieu d'une terre
    // (règle 12, dans son cas le plus courant). Le plan lointain est mélangé
    // vers la teinte du ciel bas — c'est la perspective aérienne, et c'est ce
    // qui met de la distance sans dessiner un seul détail.
    if (scene.rivage) {
      drawCote(ctx, scene.rivage.lointain, horizon, w, melange(s.skyHz, '#0b141d', 0.45));
      drawCote(ctx, scene.rivage.proche, horizon, w, '#0b141d');
    }

    // Horizon decor.
    const sil = 'rgba(9,17,26,0.9)';
    for (const d of scene.decor) drawDecor(ctx, d, horizon, w, h, sil, t);
    // Seagulls sit in front of the sky (drawn after decor so they read).
    if (scene.decor.some((d) => d.kind === 'seagulls')) {
      for (const gu of gulls) {
        gu.x += gu.sp * 0.016 * 6;
        if (gu.x > 1.1) gu.x = -0.1;
        drawGull(ctx, gu.x * w, gu.y * horizon, t + gu.ph);
      }
    }

    // Sea.
    const sea = ctx.createLinearGradient(0, horizon, 0, h);
    sea.addColorStop(0, s.seaFar);
    sea.addColorStop(1, s.seaNear);
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, w, h - horizon);

    // Animated wave highlights, denser closer to the viewer.
    const band = 8;
    for (let y = horizon; y < h; y += band) {
      const depth = (y - horizon) / (h - horizon);
      const phase = t * (0.6 + depth) + y * 0.05;
      const off = Math.sin(phase) * (5 + depth * 12);
      ctx.fillStyle = `rgba(180,220,240,${0.03 + depth * 0.05})`;
      for (let x = -20; x < w + 20; x += 26) {
        const wob = Math.sin((x + off) * 0.04 + t) * 3;
        ctx.fillRect(Math.floor(x + off), Math.floor(y + wob), 13, 3);
      }
    }

    // Shark fins cruise in the sea (if present).
    for (const d of scene.decor) {
      if (d.kind === 'sharkfins') drawSharkFins(ctx, horizon, h, w, t, d.seed, sil);
    }

    // Rain.
    if (s.rain > 0.05) {
      ctx.strokeStyle = `rgba(180,200,220,${0.22 * s.rain})`;
      ctx.lineWidth = 1; ctx.beginPath();
      const n = Math.floor(160 * s.rain);
      for (let i = 0; i < n; i++) {
        const rx = (i * 977 + t * 900) % w;
        const ry = (i * 613 + t * 1200) % h;
        ctx.moveTo(rx, ry); ctx.lineTo(rx - 4, ry + 12);
      }
      ctx.stroke();
    }

    raf = requestAnimationFrame(frame);
  }
  cancelAnimationFrame(raf);
  frame();
}

export function stopOcean() { if (raf) cancelAnimationFrame(raf); raf = null; }

// ---------- decor drawing ----------
// UN NUAGE EST UNE SEULE FORME, PAS UNE GRAPPE DE RONDS.
//
// C'était le défaut, et il tenait à la façon de peindre, pas au dessin : six
// ellipses remplies chacune de son côté, en semi-transparent, laissent voir
// tous leurs recouvrements — on lit six bulles empilées. Ici les bosses sont
// des arcs d'UN SEUL chemin, fermé sur une base plate et rempli d'un coup :
// les recouvrements disparaissent, il ne reste qu'une silhouette.
//
// La forme vient de `seed`, jamais de `x` : tirée de la position, elle se
// recalculait à chaque image puisque le nuage dérive, et le ciel clignotait.
function cheminNuage(ctx, x, y, sc, seed) {
  const h = (n) => {
    const v = Math.sin((seed + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  // Un cumulus a une base plate — l'air se condense à une altitude, la même
  // pour tout le nuage — et un dessus en bourgeons inégaux.
  const base = y + 8 * sc;
  const bosses = [[-32, 9], [-20, 15], [-7, 20], [7, 18], [20, 13], [32, 8]];
  ctx.beginPath();
  ctx.moveTo(x - 42 * sc, base);
  bosses.forEach(([dx, r], i) => {
    const j = h(i);
    const rr = r * (0.82 + j * 0.4) * sc;
    const cx = x + dx * sc * (0.96 + j * 0.08);
    const cy = base - rr * (0.22 + h(i + 20) * 0.34);
    ctx.arc(cx, cy, rr, Math.PI, 0, false);
  });
  ctx.lineTo(x + 42 * sc, base);
  ctx.closePath();
}

function drawCloud(ctx, x, y, sc, alpha, seed = 0) {
  if (alpha < 0.03) return;
  const base = y + 8 * sc;
  ctx.save();
  cheminNuage(ctx, x, y, sc, seed);

  // Rempli UNE fois, d'un dégradé vertical : sommet au soleil, ventre gris.
  const g = ctx.createLinearGradient(0, base - 34 * sc, 0, base + 2 * sc);
  g.addColorStop(0, `rgba(255,255,255,${0.92 * alpha})`);
  g.addColorStop(0.55, `rgba(238,242,247,${0.82 * alpha})`);
  g.addColorStop(1, `rgba(178,190,204,${0.72 * alpha})`);
  ctx.fillStyle = g;
  ctx.fill();

  // Le ventre, à l'intérieur du même contour : c'est l'ombre qui donne le
  // volume, et elle ne peut pas déborder puisqu'on découpe sur la silhouette.
  ctx.clip();
  const o = ctx.createLinearGradient(0, base - 12 * sc, 0, base + 2 * sc);
  o.addColorStop(0, 'rgba(150,164,182,0)');
  o.addColorStop(1, `rgba(138,152,170,${0.5 * alpha})`);
  ctx.fillStyle = o;
  ctx.fillRect(x - 46 * sc, base - 14 * sc, 92 * sc, 18 * sc);
  ctx.restore();
}

function drawDecor(ctx, d, horizon, w, h, color, t) {
  const x = d.x * w;
  switch (d.kind) {
    case 'ile': return drawIle(ctx, x, horizon, color, d.forme);
    case 'wreck': return drawWreck(ctx, x, horizon, color, Math.sin(t * 0.6 + d.seed) * 0.04);
    case 'ilots': return drawRocks(ctx, x, horizon, color);
    case 'fishermen': return drawFishermen(ctx, x, horizon, color, t);
    case 'whale': return drawWhale(ctx, x, horizon, color, t + d.seed);
    default: return;
  }
}

// UNE BOSSE, UN SEUL CHEMIN, UN SEUL REMPLISSAGE. L'ancienne île avait toujours
// la même silhouette et le même palmier planté au même endroit : la `seed` de la
// scène ne servait qu'aux phases d'animation, jamais à la forme. C'est la cause
// directe du « toujours le même paysage ».
// UNE PHASE DE LUNE EST UN SEUL CHEMIN, ET UN SEUL REMPLISSAGE. La part
// éclairée est bornée d'un côté par un demi-cercle et de l'autre par une
// demi-ELLIPSE — le terminateur, qui est un cercle vu de biais, donc une ellipse
// à l'écran. Son demi-axe vaut `R × cos(2πφ)` : nul à la pleine lune, égal à R
// au premier et au dernier quartier, et il CHANGE DE SIGNE au fil du cycle,
// c'est ce qui fait passer le croissant du gibbeux.
//
// Peindre un disque puis en retrancher un autre en semi-transparent donnerait à
// lire les deux disques et leur recouvrement (règle 12) ; peindre l'ombre en
// couleur de ciel marcherait tant que le ciel est uni, et se verrait le jour où
// il ne l'est plus. Un chemin, un `fill()`.
//
// φ : 0 nouvelle lune, 0,25 premier quartier, 0,5 pleine, 0,75 dernier.
function dessinerPhase(ctx, x, y, R, phase) {
  const k = Math.cos(2 * Math.PI * phase);
  const croissant = phase < 0.5;             // le côté éclairé change au milieu
  ctx.beginPath();
  ctx.arc(x, y, R, -Math.PI / 2, Math.PI / 2, croissant);
  ctx.ellipse(x, y, Math.abs(R * k), R, 0, Math.PI / 2, -Math.PI / 2, (k > 0) !== croissant);
  ctx.closePath();
  ctx.fill();
}

// Mélange deux couleurs `#rrggbb`. La perspective aérienne, en une ligne.
function melange(a, b, k) {
  const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [ar, ag, ab] = h(a), [br, bg, bb] = h(b);
  const m = (x, y) => Math.round(x + (y - x) * k);
  return `rgb(${m(ar, br)},${m(ag, bg)},${m(ab, bb)})`;
}

// LE RIVAGE : UN SEUL CHEMIN, UN SEUL `fill()`. Il entre par un bord et
// redescend dans la mer. La géométrie est lue, jamais recalculée — elle est
// gelée depuis `construireCote`, si bien qu'une écriture accidentelle depuis
// cette fonction lèverait au lieu de faire scintiller la côte.
function drawCote(ctx, cote, horizon, w, teinte) {
  const y0 = horizon + 2;
  const X = (u) => (cote.bord < 0 ? u * w : w - u * w);
  const c = cote.crete;
  ctx.beginPath();
  ctx.moveTo(X(0), y0);
  ctx.lineTo(X(c[0][0]), y0 - c[0][1]);
  for (let i = 0; i < c.length - 1; i++) {
    const [u1, h1] = c[i], [u2, h2] = c[i + 1];
    ctx.quadraticCurveTo(X(u1), y0 - h1, (X(u1) + X(u2)) / 2, y0 - (h1 + h2) / 2);
  }
  ctx.lineTo(X(c[c.length - 1][0]), y0);
  ctx.closePath();
  ctx.fillStyle = teinte;
  ctx.fill();
}

function drawIle(ctx, x, horizon, color, forme) {
  const f = forme || { larg: 90, haut: 10, bosse: 0.5 };
  const g = x - f.larg / 2, dr = x + f.larg / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(g, horizon);
  ctx.quadraticCurveTo(g + f.larg * f.bosse, horizon - f.haut * 2, dr, horizon);
  ctx.closePath();
  ctx.fill();
}

function drawRocks(ctx, x, horizon, color) {
  ctx.fillStyle = color;
  for (const [dx, dw, dh] of [[0, 24, 13], [26, 15, 8], [-24, 13, 7]]) {
    ctx.beginPath(); ctx.moveTo(x + dx - dw, horizon); ctx.lineTo(x + dx, horizon - dh); ctx.lineTo(x + dx + dw, horizon); ctx.closePath(); ctx.fill();
  }
}
function drawWreck(ctx, x, horizon, color, tilt) {
  ctx.save(); ctx.translate(x, horizon); ctx.rotate(tilt); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-30, 0); ctx.quadraticCurveTo(-26, 10, 0, 10); ctx.quadraticCurveTo(26, 10, 30, 0);
  ctx.lineTo(20, -4); ctx.lineTo(-8, -2); ctx.lineTo(-20, -6); ctx.closePath(); ctx.fill();
  // UNE ÉPAVE N'A PAS DE MÂT DROIT NI DE VOILE NETTE — c'est un bateau, ça. Elle
  // en avait un : `fillRect(-2,-30,3,30)` surmonté d'un triangle plein, et à
  // l'échelle de l'horizon cette silhouette se lisait comme une hampe surmontée
  // d'un DRAPEAU, exactement ce que le fort avait été retiré pour avoir. Le mât
  // est maintenant rompu et penché, et il ne porte plus rien.
  ctx.save();
  ctx.rotate(-0.22);
  ctx.fillRect(-2, -19, 3, 19);          // le tronçon qui reste
  ctx.fillRect(-1, -22, 2, 4);           // la cassure, plus fine
  ctx.restore();
  ctx.restore();
}
function drawFishermen(ctx, x, horizon, color, t) {
  const yb = horizon + 4 + Math.sin(t) * 1.5;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - 16, yb); ctx.quadraticCurveTo(x, yb + 8, x + 16, yb); ctx.closePath(); ctx.fill();
  ctx.fillRect(x - 5, yb - 8, 2, 8); ctx.fillRect(x + 3, yb - 8, 2, 8); // two figures
  ctx.fillRect(x + 10, yb - 12, 1, 12); // fishing rod
}
function drawWhale(ctx, x, horizon, color, t) {
  const yb = horizon + 10;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, yb, 30, 8, 0, Math.PI, 0); ctx.fill(); // hump
  ctx.beginPath(); ctx.moveTo(x + 26, yb - 2); ctx.lineTo(x + 40, yb - 12); ctx.lineTo(x + 38, yb); ctx.closePath(); ctx.fill(); // tail
  // LE SOUFFLE MONTE ET RETOMBE, il ne s'allume pas. `Math.sin(t) > 0.6` était le
  // défaut du phare sous un autre nom : un trait qui apparaît d'un coup attire
  // l'œil plus que tout le reste de la mer. Une rampe d'opacité sur ~1,2 s.
  const cycle = (t % 7) / 1.2;
  if (cycle < 1) {
    ctx.strokeStyle = `rgba(200,225,240,${(0.55 * Math.sin(cycle * Math.PI)).toFixed(3)})`;
    ctx.beginPath(); ctx.moveTo(x - 18, yb - 4); ctx.lineTo(x - 20, yb - 20 * cycle - 6); ctx.stroke();
  }
}
function drawSharkFins(ctx, horizon, h, w, t, seed, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    // LA HAUTEUR VIENT D'UNE FRACTION TIRÉE À LA GRAINE, pas d'un modulo de la
    // hauteur de la fenêtre : `% (h − horizon − 60)` faisait sauter les ailerons
    // d'un endroit à l'autre à chaque redimensionnement (règle 9).
    const fr = ((i * 53 + seed * 7) % 100) / 100;
    const y = horizon + 40 + fr * Math.max(0, h - horizon - 60);
    const x = (i * 260 + t * 22 + seed * 30) % (w + 60) - 30;
    const wob = Math.sin(t * 2 + i) * 3;
    ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x, y - 12 + wob); ctx.lineTo(x + 6, y); ctx.closePath(); ctx.fill();
  }
}
function drawGull(ctx, x, y, t) {
  const flap = Math.sin(t * 6) * 3;
  ctx.strokeStyle = 'rgba(20,28,36,0.7)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 6, y + flap); ctx.lineTo(x, y - 2); ctx.lineTo(x + 6, y + flap);
  ctx.stroke();
}
