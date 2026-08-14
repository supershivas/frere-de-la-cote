// Procedural pixel-art ship renderer. Draws ships on a canvas from a small
// grid template so the prototype needs no external sprite assets. Each ship
// "type" has a hull silhouette; hull color comes from the ship definition.
//
// The pixel-art Ship Editor (a game-design tool) edits these same grids, so the
// template store, the palette and a generic grid renderer are all exported.

// Grid legend:
//  . empty · H hull · D deck (dark hull) · K castle (fore/aft superstructure)
//  M mast · S sail · F flag · C cannon · W wave trim · T tentacle · E eye/glow
export const TEMPLATES = {
  sloop: [
    '.....F....',
    '.....M....',
    '....SSS...',
    '...SSSS...',
    '..SSSSS...',
    '.....M....',
    '.HHHHHHHH.',
    '..DKKKKD..',
    '..WWWWWW..',
  ],
  frigate: [
    '...F...F..',
    '...M...M..',
    '..SSS.SSS.',
    '..SSS.SSS.',
    '.HHHHHHHHH',
    '.HHHHHHHHH',
    'CHKDDDDKHC',
    '.DDDDDDDD.',
    '.WWWWWWWW.',
  ],
  galleon: [
    '..F..F..F.',
    '..M..M..M.',
    '.SSS.S.SSS',
    '.SSS.S.SSS',
    'HHHHHHHHHH',
    'HHHHHHHHHH',
    'CHKDDDDKHC',
    'CHKDDDDKHC',
    '.DDDDDDDD.',
    '.WWWWWWWW.',
  ],
  monster: [
    '.T..TT..T.',
    '..TT..TT..',
    '.MMMMMMMM.',
    'MMMEEMMEEM',
    'MMMMMMMMMM',
    'MMMEEMMEEM',
    '.MMMMMMMM.',
    '..MMMMMM..',
    '.T.T..T.T.',
  ],
};

// Editor part legend: order matters for the palette UI.
export const PART_LEGEND = [
  { ch: 'H', key: 'part_hull' },
  { ch: 'D', key: 'part_deck' },
  { ch: 'K', key: 'part_castle' },
  { ch: 'M', key: 'part_mast' },
  { ch: 'S', key: 'part_sail' },
  { ch: 'F', key: 'part_flag' },
  { ch: 'C', key: 'part_cannon' },
  { ch: 'E', key: 'part_eye' },
  { ch: 'T', key: 'part_tentacle' },
  { ch: '.', key: 'part_empty' },
];

// --- Template overrides (from the Sprite Editor) ---
// A saved shape replaces the default template for a ship type, persisted to
// localStorage so the game (and the editor) use it on the next load.
const OVERRIDE_KEY = 'fdlc_sprite_overrides';

export function saveTemplateOverride(id, gridStrings) {
  TEMPLATES[id] = gridStrings.slice();
  let all = {};
  try { all = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}'); } catch {}
  all[id] = gridStrings;
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all));
}

export function loadTemplateOverrides() {
  try {
    const all = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}');
    for (const [k, v] of Object.entries(all)) {
      if (Array.isArray(v) && v.length) TEMPLATES[k] = v;
    }
  } catch {}
}

export function resetTemplateOverride(id) {
  try {
    const all = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}');
    delete all[id];
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all));
  } catch {}
}

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + r * pct)));
  g = Math.max(0, Math.min(255, Math.round(g + g * pct)));
  b = Math.max(0, Math.min(255, Math.round(b + b * pct)));
  return `rgb(${r},${g},${b})`;
}

// Char → fill colour, given hull + flag colours.
// `color` may also be a pre-built palette object (used by the generative ship
// renderer below) — passed straight through so drawGrid's char lookup works
// unchanged for both the legacy hand-drawn templates and generated grids.
export function buildPalette(color, flag, isMonster = false) {
  if (color && typeof color === 'object') return color;
  return {
    H: color,
    D: shade(color, -0.35),
    K: shade(color, -0.18),
    M: isMonster ? color : '#5a4632',
    S: isMonster ? shade(color, 0.2) : '#efe7d0',
    F: flag,
    C: '#3a3a3a',
    W: 'rgba(255,255,255,0.5)',
    T: shade(color, -0.15),
    E: '#f4d35e',
  };
}

// Colour used for an editor swatch / grid cell of a given part char.
export function swatchColor(ch, color = '#c9a24b', flag = '#b23b3b', isMonster = false) {
  if (ch === '.') return 'transparent';
  return buildPalette(color, flag, isMonster)[ch] || color;
}

export function templateFor(type) {
  if (type === 'monster' || type === 'naval_monster') return 'monster';
  if (TEMPLATES[type]) return type;
  if (type === 'brigantine' || type === 'longboat' || type === 'merchant') return 'frigate';
  return 'frigate';
}

// Row index of the waterline — the first row made only of 'W' (foam trim) or
// empty cells. Used in combat to clip legacy hand-drawn templates so nothing
// renders "underwater" (the generative renderer below has its own waterY).
function waterlineRow(grid) {
  for (let y = 0; y < grid.length; y++) {
    if ([...grid[y]].every((c) => c === 'W' || c === '.')) return y;
  }
  return grid.length;
}

// ===========================================================================
// GENERATIVE SHIP RENDERER — ported from the validated editeur-bateau-prototype.
// A spriteSpec ({hullClass, sailsPerMast, jibs, seed, flag, colors}) is turned
// into a grid of characters (same conventions as drawGrid above: '.' = empty)
// by generateShipGrid(), then coloured by generatedShipPalette(). The result
// is rendered through the SAME unchanged drawGrid() by passing the full
// palette object as the `color` argument (see buildPalette above).
//
// New part chars (avoid the 'H'/'W' special-cased in drawGrid):
//  h hull · k keel/deck line · p sabord (gunport) · m mât · y vergue (yard)
//  b beaupré (bowsprit) · s voile · S voile ombrée/ris/tachée · j foc
//  f pavillon (fond) · g pavillon (symbole) · V pavillon (accent)
//  L bande de faction · w fenêtre/fanal · R corde (haubans) · A doré · C cuivre
//  E emblème (ton sur ton, sur la grand-voile)
// ===========================================================================

// Hull-class table: pilots hull length/height, gun rows, mast count/height,
// max jibs/sails-per-mast. Odd classes are round-hulled (galleon-like), even
// classes are lean (frigate-like) — see FAM below.
export const HULL_CLASSES = {
  1: { L: 64, hh: 15, rows: 3, ports: 13, masts: 3, mastH: 82, jibsMax: 2, sailsMax: 3 },
  2: { L: 58, hh: 15, rows: 3, ports: 12, masts: 3, mastH: 76, jibsMax: 2, sailsMax: 3 },
  3: { L: 50, hh: 13, rows: 2, ports: 11, masts: 2, mastH: 64, jibsMax: 1, sailsMax: 3 },
  4: { L: 44, hh: 13, rows: 2, ports: 9, masts: 2, mastH: 58, jibsMax: 1, sailsMax: 3 },
  5: { L: 36, hh: 11, rows: 1, ports: 7, masts: 1, mastH: 50, jibsMax: 2, sailsMax: 2 },
  6: { L: 30, hh: 10, rows: 1, ports: 5, masts: 1, mastH: 44, jibsMax: 2, sailsMax: 2 },
};
const MAST_FRAC = { 1: [0.40], 2: [0.34, 0.66], 3: [0.22, 0.48, 0.74] }; // mono-mât reculé vers la poupe
const FAM = {
  ronde: { sternA: 1.5, sternFlat: 0.16, bowA: 0.9, bowSharp: 1.5, botEnds: 0.24, botFore: 0.38, steeve: 0.70, hhMul: 1.10, bowsprMul: 1.05 },
  fine: { sternA: 0.9, sternFlat: 0.07, bowA: 0.6, bowSharp: 2.0, botEnds: 0.40, botFore: 0.65, steeve: 0.52, hhMul: 0.94, bowsprMul: 1.0 },
};
export const FLAGS = {
  Uni: ['000000000', '000000000', '000000000', '000000000', '000000000', '000000000'],
  Bandes: ['111111111', '111111111', '000000000', '000000000', '111111111', '111111111'],
  Croix: ['000010000', '000010000', '111111111', '111111111', '000010000', '000010000'],
  'Croix+point': ['000111000', '000111000', '111121111', '111121111', '000111000', '000111000'],
  Sautoir: ['100000001', '010000010', '001000100', '001000100', '010000010', '100000001'],
  Crâne: ['001111100', '011111110', '010101010', '011101110', '011111110', '001010100'],
  'Os croisés': ['110000011', '011000110', '001111100', '001111100', '011000110', '110000011'],
  Sabres: ['001000100', '000101000', '000010000', '000101000', '001000100', '011000110'],
  Sablier: ['111111111', '011111110', '000111000', '000111000', '011111110', '111111111'],
  Cœur: ['011000110', '111101111', '111111111', '011111110', '001111100', '000111000'],
  Disque: ['000111000', '001111100', '011111110', '011111110', '001111100', '000111000'],
};
export const FLAG_KEYS = Object.keys(FLAGS);

function rngFor(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Turn a spriteSpec into a grid of characters. Same seed + spec => same ship.
export function generateShipGrid(spec = {}) {
  const cls = Math.min(6, Math.max(1, Math.round(spec.hullClass) || 1));
  const c = HULL_CLASSES[cls];
  const famKey = spec.hullShape && spec.hullShape !== 'auto' ? spec.hullShape : (cls % 2 ? 'ronde' : 'fine');
  const fam = FAM[famKey] || FAM[cls % 2 ? 'ronde' : 'fine'];
  const hh = Math.round(c.hh * fam.hhMul);
  const top = 10, x0 = 6, steeve = fam.steeve;
  const bowsprLen = Math.round(c.L * (0.22 + 0.03 * (6 - cls)) * fam.bowsprMul);
  const deckMid = top + c.mastH, xS = x0, xB = x0 + c.L;
  const W = xB + bowsprLen + 6, H = deckMid + hh + 6;
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const set = (x, y, ch) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = ch; };
  const tt = (x) => (x - xS) / c.L;
  const sheer = (t) => fam.sternA * hh * Math.pow(Math.max(0, 1 - t / 0.34), 1.5) + fam.bowA * hh * Math.pow(Math.max(0, (t - 0.74) / 0.26), fam.bowSharp);
  const topAt = (x) => deckMid - sheer(tt(x));
  const botAt = (x) => deckMid + hh - fam.botEnds * hh * Math.pow(Math.abs(2 * tt(x) - 1), 1.9) - fam.botFore * hh * Math.pow(Math.max(0, (tt(x) - 0.78) / 0.22), 1.6);
  const mastXs = MAST_FRAC[c.masts].map((f) => Math.round(xS + f * c.L)); // entiers : lecture de grille fiable
  const isSolo = c.masts === 1;
  const mainIdx = c.masts === 3 ? 1 : (c.masts === 2 ? 1 : 0); // grand mât = le plus haut
  const isAft = (i) => c.masts >= 2 && i === 0; // artimon (mât arrière)
  const foreX = Math.max(...mastXs);
  const n = Math.max(1, Math.min(c.sailsMax, Math.round(spec.sailsPerMast) || 1)); // même nb de voiles par mât (hors foc)
  const mastHeight = (i) => {
    if (isSolo || i === mainIdx) return c.mastH;
    if (isAft(i)) return Math.round(c.mastH * 0.72);
    return Math.round(c.mastH * 0.86);
  };
  const bandInfo = (mx, i) => {
    const mh = mastHeight(i), baseY = topAt(mx), topY = baseY - mh, usableTop = topY + 3;
    const footLift = isAft(i) ? Math.round(hh * 0.9) : 0; // artimon : pied relevé (ne touche pas la poupe)
    const usableBot = baseY - 3 - footLift, Hn = usableBot - usableTop;
    const wgt = { 1: [1], 2: [0.46, 0.54], 3: [0.31, 0.33, 0.36] }[n];
    const baseHW = Math.round(c.L * 0.21);
    return { baseY, topY, usableTop, Hn, wgt, baseHW };
  };
  const jibMin = isSolo ? 1 : 0;
  const nJib = Math.max(jibMin, Math.min(c.jibsMax, Math.round(spec.jibs ?? jibMin)));

  // Fioritures budgétées (~4-5 actives) tirées par la graine — reproductible.
  const R = rngFor(spec.seed || 1);
  const POOL = ['figurehead', 'anchor', 'ensign', 'ratlines', 'top', 'pennants', 'spritsail', 'reef', 'copper', 'boat', 'barrels'];
  const shuf = POOL.map((v) => [v, R()]).sort((a, b) => a[1] - b[1]).map((v) => v[0]);
  const on = new Set(shuf.slice(0, 4 + Math.floor(R() * 2)));
  const cos = { windows: 2 + Math.floor(R() * 4), lanterns: 1 + Math.floor(R() * 2) };
  POOL.forEach((k) => { cos[k] = on.has(k); });

  // 1. VOILES (nb identique par mât ; artimon & mono-mât : voiles à l'arrière)
  const drawSails = (mx, i) => {
    const B = bandInfo(mx, i); let yy = B.usableTop; const aft = isAft(i) || isSolo;
    for (let b = 0; b < n; b++) {
      const bandH = Math.max(5, Math.round(B.Hn * B.wgt[b])) - 1;
      let hw = Math.max(4, Math.round(B.baseHW * Math.pow(0.86, n - 1 - b)));
      if (isAft(i)) hw = Math.round(hw * 0.72);
      const topW = Math.round(hw * 0.72), botW = hw;
      const cx = aft ? mx - Math.round(hw * 0.85) : mx;
      for (let r = 1; r < bandH; r++) {
        const w = Math.round(topW + (botW - topW) * (r / bandH));
        for (let x = cx - w; x <= cx + w; x++) set(x, yy + r, x >= cx + w - 1 ? 'S' : 's');
      }
      yy += bandH + 1;
    }
  };
  mastXs.forEach(drawSails);

  // 2. FOCS (apex en haut, base sur le beaupré, à droite)
  const fillTri = (ax, ay, bx, by, cx, cy, ch) => {
    const mn = Math.floor(Math.min(ay, by, cy)), mx2 = Math.ceil(Math.max(ay, by, cy));
    for (let y = mn; y <= mx2; y++) {
      const xs = [];
      [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]].forEach(([x1, y1, x2, y2]) => {
        if (((y >= y1 && y <= y2) || (y >= y2 && y <= y1)) && y1 !== y2) xs.push(x1 + (x2 - x1) * (y - y1) / (y2 - y1));
      });
      if (xs.length >= 2) {
        const l = Math.round(Math.min(...xs)), r = Math.round(Math.max(...xs));
        for (let x = l; x <= r; x++) if (g[y] && g[y][x] === '.') set(x, y, ch);
      }
    }
  };
  const spr = bowsprLen;
  if (isSolo) { // mono-mât : grand foc, haut+bas du mât → pointe du beaupré ; focs imbriqués
    const mx = mastXs[0];
    for (let k = 0; k < nJib; k++) {
      const outer = nJib === 1 ? 1 : k / (nJib - 1);
      const f = 0.5 + 0.5 * outer;
      const Bx = xB + spr * f, By = topAt(xB) - spr * steeve * f;
      const highY = topAt(mx) - Math.round(c.mastH * (0.60 + 0.22 * outer));
      const lowY = topAt(mx) - Math.round(c.mastH * (0.14 + 0.14 * outer));
      fillTri(mx, lowY, mx, highY, Bx, By, 'j');
    }
  } else { // multi-mâts : focs échelonnés le long du beaupré
    for (let k = 0; k < nJib; k++) {
      const f0 = k / nJib, f1 = (k + 1) / nJib;
      const Bx = xB + spr * f1, By = topAt(xB) - spr * steeve * f1;
      const Cx = xB + spr * f0, Cy = topAt(xB) - spr * steeve * f0;
      const Ax = foreX, Ay = topAt(foreX) - Math.round(c.mastH * (0.42 + 0.15 * k));
      fillTri(Ax, Ay, Bx, By, Cx, Cy, 'j');
    }
  }

  // 3. MÂTS (2px) + VERGUES (1px) — devant les voiles
  mastXs.forEach((mx, i) => {
    const B = bandInfo(mx, i); const aft = isAft(i) || isSolo;
    for (let y = B.topY; y <= B.baseY; y++) { set(mx, y, 'm'); set(mx - 1, y, 'm'); }
    let yy = B.usableTop;
    for (let b = 0; b < n; b++) {
      const bandH = Math.max(5, Math.round(B.Hn * B.wgt[b])) - 1;
      let hw = Math.max(4, Math.round(B.baseHW * Math.pow(0.86, n - 1 - b)));
      if (isAft(i)) hw = Math.round(hw * 0.72);
      const cx = aft ? mx - Math.round(hw * 0.85) : mx;
      for (let x = cx - hw - 1; x <= cx + hw + 1; x++) set(x, yy, 'y');
      yy += bandH + 1;
    }
  });

  // 4. BEAUPRÉ + PAVILLON
  for (let i = 0; i <= bowsprLen; i++) set(xB + i, topAt(xB) - i * steeve, 'b');
  const mainX = mastXs[mainIdx], mainTop = topAt(mainX) - c.mastH;
  for (let i = 0; i < 3; i++) set(mainX, mainTop - 1 - i, 'm');
  const motif = (spec.flag && spec.flag.motif) || 'Uni';
  const FL = FLAGS[motif] || FLAGS.Uni;
  for (let fy = 0; fy < 6; fy++) {
    for (let fx = 0; fx < 9; fx++) {
      const bch = FL[fy][8 - fx];
      set(mainX - 1 - fx, mainTop - 6 + fy, bch === '1' ? 'g' : bch === '2' ? 'V' : 'f');
    }
  }

  // 5. COQUE (poupe plate pilotée par la famille)
  const sternFlatY = Math.round(topAt(xS + fam.sternFlat * c.L));
  const topDeck = (x) => { const t = tt(x); let tp = topAt(x); if (t < fam.sternFlat) tp = sternFlatY; if (t < 0.035) tp -= 1; return tp; };
  for (let x = xS; x <= xB; x++) {
    const tp = topDeck(x), bt = botAt(x);
    for (let y = tp; y <= bt; y++) set(x, y, 'h');
    set(x, tp, 'k'); set(x, bt, 'k');
  }
  for (let y = Math.round(topAt(xS)); y <= Math.round(botAt(xS)); y++) set(xS, y, 'k');
  set(xS + 1, Math.round(topAt(xS)) + 3, 'p'); set(xS + 2, Math.round(topAt(xS)) + 3, 'p');
  set(xB, Math.round(topAt(xB)), 'k'); set(xB + 1, Math.round(topAt(xB)) + 1, 'k');
  for (let r = 0; r < c.rows; r++) {
    const fy = 0.40 + r * 0.22;
    for (let x = xS + 2; x <= xB - 3; x++) { const yt = topAt(x), yb = botAt(x); set(x, yt + (yb - yt) * fy, 'k'); }
    const step = (c.L - 7) / c.ports;
    for (let p = 0; p < c.ports; p++) { const x = xS + 4 + p * step, yt = topAt(x), yb = botAt(x); set(x, yt + (yb - yt) * fy, 'p'); }
  }

  // 6. COSMÉTIQUES
  const inb = (x, y) => g[y] && x >= 0 && x < W && y >= 0 && y < H;
  // LISÉRÉ (manuel, pas piloté par la graine — c'est un réglage explicite du bateau)
  const strake = (ch, dy) => { for (let x = xS + 2; x <= xB - 2; x++) { const tp = Math.round(topDeck(x)); if (inb(x, tp + dy)) set(x, tp + dy, ch); } };
  if (spec.trim === 'simple') { strake('L', 2); strake('L', 3); }
  else if (spec.trim === 'doré') { strake('A', 2); }
  else if (spec.trim === 'nelson') {
    const fy = 0.40;
    for (let x = xS + 2; x <= xB - 3; x++) {
      const yt = topAt(x), yb = botAt(x), yy = Math.round(yt + (yb - yt) * fy);
      for (let d = -1; d <= 1; d++) if (inb(x, yy + d) && g[yy + d][x] === 'h') set(x, yy + d, 'f');
    }
    const nStep = (c.L - 7) / c.ports;
    for (let p = 0; p < c.ports; p++) { const x = xS + 4 + p * nStep, yt = topAt(x), yb = botAt(x); set(x, yt + (yb - yt) * fy, 'g'); }
    strake('g', 2);
  }
  if (cos.copper) { // doublage cuivre sous la flottaison
    const wl = Math.round(deckMid + hh - hh * 0.30);
    for (let x = xS + 1; x <= xB - 1; x++) {
      const bt = Math.round(botAt(x));
      for (let y = Math.max(wl, bt - 2); y <= bt; y++) if (inb(x, y) && g[y][x] === 'h') set(x, y, 'C');
    }
  }
  { const yt = Math.round(topAt(xS)); for (let w = 0; w < cos.windows; w++) set(xS + 1 + (w % 2), yt + 4 + 2 * Math.floor(w / 2), 'w'); } // fenêtres de gallerie
  for (let l = 0; l < cos.lanterns; l++) set(xS + 1 + l, Math.round(topDeck(xS)) - 1, 'w'); // fanaux
  if (cos.figurehead) { const by = Math.round(topAt(xB)) + 1; set(xB + 1, by, 'A'); set(xB + 2, by + 1, 'A'); }
  if (cos.anchor) { const ax = xB - 3, ay = Math.round(topAt(xB - 3)) + 3; set(ax, ay, 'A'); set(ax, ay + 1, 'A'); set(ax - 1, ay + 2, 'A'); set(ax + 1, ay + 2, 'A'); }
  if (cos.ensign) { // pavillon de poupe
    const sx = xS, sy = Math.round(topDeck(xS));
    for (let i = 0; i < 4; i++) set(sx, sy - 4 - i, 'm');
    for (let fy = 0; fy < 3; fy++) for (let fx = 1; fx <= 4; fx++) set(sx - fx, sy - 6 + fy, (fx + fy) % 2 ? 'f' : 'g');
  }
  mastXs.forEach((mx, i) => { // gréement : haubans, hune, pennons
    const isMain = i === mainIdx, mh = mastHeight(i), baseY = topAt(mx), topY = baseY - mh;
    if (cos.ratlines) {
      const y0 = Math.round(baseY - mh * 0.40), y1 = Math.round(baseY - 2), spread = Math.round(c.L * 0.05) + 3;
      for (let y = y0; y <= y1; y++) {
        const t = (y - y0) / (y1 - y0 || 1), dx = Math.round(spread * t);
        if (inb(mx - dx, y) && g[y][mx - dx] === '.') set(mx - dx, y, 'R');
        if (inb(mx + dx, y) && g[y][mx + dx] === '.') set(mx + dx, y, 'R');
      }
      for (let sN = 1; sN <= 4; sN++) {
        const y = Math.round(y0 + (y1 - y0) * sN / 5), dx = Math.round(spread * ((y - y0) / (y1 - y0 || 1)));
        for (let x = mx - dx; x <= mx + dx; x++) if (inb(x, y) && g[y][x] === '.') set(x, y, 'R');
      }
    }
    if (cos.top && isMain) { const ty = Math.round(topY + mh * 0.30); for (let x = mx - 3; x <= mx + 2; x++) { set(x, ty, 'R'); set(x, ty - 1, 'R'); } }
    if (cos.pennants && !isMain) {
      for (let q = 0; q < 2; q++) set(mx, topY - 1 - q, 'm');
      for (let fx = 1; fx <= 5; fx++) set(mx - fx, topY - 2, fx % 2 ? 'f' : 'g');
    }
  });
  // EMBLÈME de voile (manuel : motif du pavillon, ton sur ton, centré sur la grand-voile)
  if (spec.emblem && spec.emblem !== 'aucun') {
    const big = spec.emblem === 'grand', sc = big ? 2 : 1;
    const Bm = bandInfo(mainX, mainIdx), FLm = FLAGS[motif] || FLAGS.Uni, emx = mainX, emy = Math.round(Bm.usableTop + Bm.Hn / 2);
    for (let fy = 0; fy < 6; fy++) {
      for (let fx = 0; fx < 9; fx++) {
        const bch = FLm[fy][fx]; if (bch === '0') continue;
        for (let ay = 0; ay < sc; ay++) {
          for (let ax = 0; ax < sc; ax++) {
            const X = Math.round(emx + (fx - 4) * sc + ax), Y = Math.round(emy + (fy - 3) * sc + ay);
            if (inb(X, Y) && (g[Y][X] === 's' || g[Y][X] === 'S')) set(X, Y, 'E');
          }
        }
      }
    }
  }
  // bandes de ris sur les voiles (pilotées par la graine)
  if (cos.reef) { for (let y = 0; y < H; y++) { if (y % 6 !== 0) continue; for (let x = 0; x < W; x++) if (g[y][x] === 's') g[y][x] = 'S'; } }
  if (cos.spritsail) { // civadière sous le beaupré
    const bx = xB + Math.round(bowsprLen * 0.55), by = Math.round(topAt(xB) - bowsprLen * steeve * 0.55);
    for (let dy = 1; dy <= 4; dy++) for (let dx = -3; dx <= 3; dx++) if (inb(bx + dx, by + dy) && g[by + dy][bx + dx] === '.') set(bx + dx, by + dy, dx >= 2 ? 'S' : 's');
  }
  if (cos.boat) { // chaloupe arrimée
    const bx = Math.round((mastXs[0] + mastXs[mastXs.length - 1]) / 2), by = Math.round(topAt(bx)) - 1;
    for (let dx = -3; dx <= 3; dx++) if (inb(bx + dx, by)) set(bx + dx, by, 'k');
    for (let dx = -2; dx <= 2; dx++) if (inb(bx + dx, by - 1)) set(bx + dx, by - 1, 'h');
  }
  if (cos.barrels) { // tonneaux sur le pont
    const bx = Math.round(mainX + c.L * 0.10), by = Math.round(topAt(bx)) - 1;
    set(bx, by, 'A'); set(bx + 1, by, 'A'); set(bx, by - 1, 'k'); set(bx + 1, by - 1, 'k');
  }

  // USURE : coulures de coque + voiles ET focs délavés + algues ; Épave = trous + bordé manquant
  if (spec.wear > 0) {
    const amt = spec.wear;
    for (let k = 0; k < amt * 16; k++) {
      const x = xS + 2 + Math.floor(R() * (c.L - 4)), yt = topAt(x), yb = botAt(x), y = Math.round(yt + (yb - yt) * (0.30 + R() * 0.6));
      if (inb(x, y) && g[y][x] === 'h') set(x, y, 'k');
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = g[y][x];
        if ((ch === 's' || ch === 'j') && R() < 0.07 * amt) g[y][x] = 'S';
      }
    }
    { const wl = Math.round(deckMid + hh - hh * 0.30);
      for (let x = xS + 1; x <= xB - 1; x++) {
        const bt = Math.round(botAt(x));
        for (let y = Math.max(wl, bt - 1); y <= bt; y++) if (inb(x, y) && g[y][x] === 'h' && R() < 0.4 * amt) set(x, y, 'C');
      } }
    if (amt >= 3) { // ÉPAVE : voiles/focs troués, planches de bordé manquantes, vergues cassées
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const ch = g[y][x];
          if ((ch === 's' || ch === 'S' || ch === 'j') && R() < 0.16) g[y][x] = '.';
          else if (ch === 'h' && R() < 0.05) g[y][x] = '.';
          else if (ch === 'y' && R() < 0.12) g[y][x] = '.';
        }
      }
    }
  }

  const waterY = Math.round(deckMid + hh - hh * 0.34);
  return {
    grid: g.map((row) => row.join('')),
    W, H, waterY,
    derived: { masts: c.masts, ports: c.rows * c.ports, sailsPerMast: n, jibs: nJib, hullClass: cls },
  };
}

// Asymmetric shade used by the generative palette (darken multiplicatively,
// lighten by approaching 255) — matches the validated prototype's math,
// distinct from the legacy shade() above which the static templates use.
function tone(hex, p) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const f = (x) => Math.max(0, Math.min(255, Math.round(x + (p < 0 ? x * p : (255 - x) * p))));
  return '#' + ((1 << 24) + (f(r) << 16) + (f(gg) << 8) + f(b)).toString(16).slice(1);
}

// Char → colour for a generated grid, derived entirely from spriteSpec.colors + flag.
export function generatedShipPalette(spec = {}) {
  const colors = spec.colors || {};
  const hull = colors.hull || '#5a3d25';
  const sail = colors.sail || '#e6d9bd';
  const faction = colors.faction || '#8a1f1f';
  const flag = spec.flag || {};
  const flagBg = flag.bg || '#161616';
  const flagSym = flag.sym || '#e6d9bd';
  const flagAccent = flag.accent || tone(flagSym, 0.35);
  return {
    // k (deck/keel line) traces the whole hull outline — at -0.45 it read as a
    // dark frame boxing the ship rather than a trim line, so it's softened.
    h: hull, k: tone(hull, -0.22), p: '#120b06',
    m: tone(hull, -0.58), y: tone(hull, -0.62), b: tone(hull, -0.55),
    s: sail, S: tone(sail, -0.16), j: tone(sail, -0.07),
    f: flagBg, g: flagSym, V: flagAccent,
    L: faction, w: '#f2d27a', R: '#241a12', A: '#c69a3a', C: '#3e7d5a',
    E: tone(sail, -0.24),
  };
}

// Cache generated grids/palettes by spec JSON — combat re-renders ship cards
// often, and re-running generateShipGrid every frame would be wasteful.
const shipGridCache = new Map();
export function getGeneratedShip(spec) {
  const key = JSON.stringify(spec);
  let hit = shipGridCache.get(key);
  if (!hit) {
    hit = generateShipGrid(spec);
    hit.palette = generatedShipPalette(spec);
    shipGridCache.set(key, hit);
    if (shipGridCache.size > 200) shipGridCache.clear(); // simple guard against unbounded growth
  }
  return hit;
}

// Render an explicit grid (array of equal-length strings) onto a canvas.
// waterline: true clips anything at/below the hull's waterline row — used in
// combat so no keel is ever visible "underwater"; the editor leaves it off.
// waterRow: explicit row index to clip at (the generative renderer already
// knows its own waterY); when omitted, `waterline: true` auto-detects it from
// the legacy hand-drawn templates' 'W' foam-trim row.
export function drawGrid(canvas, grid, { color = '#c9a24b', flag = '#b23b3b', facing = 1, damaged = 0, isMonster = false, waterline = false, waterRow = null } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rows = grid.length, cols = grid[0].length;
  const px = Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
  const ox = Math.floor((canvas.width - cols * px) / 2);
  const oy = Math.floor((canvas.height - rows * px) / 2);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  if (waterline || waterRow != null) {
    const wy = waterRow != null ? waterRow : waterlineRow(grid);
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, oy + wy * px);
    ctx.clip();
  }

  const palette = buildPalette(color, flag, isMonster);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = facing === 1 ? x : cols - 1 - x;
      const c = grid[y][cx];
      if (!c || c === '.' || c === 'W') continue; // 'W' foam trim no longer drawn
      ctx.fillStyle = palette[c] || color;
      ctx.fillRect(ox + x * px, oy + y * px, px, px);
      if (c === 'H') { // top-edge highlight for depth
        ctx.fillStyle = shade(color, 0.25);
        ctx.fillRect(ox + x * px, oy + y * px, px, Math.max(1, Math.floor(px / 4)));
      }
    }
  }

  if (damaged > 0) {
    ctx.fillStyle = `rgba(20,20,20,${0.12 * damaged})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
}

// Draw a ship by type. facing: 1 = right (player), -1 = left (enemy).
// When spriteSpec is given, the ship is generated from it instead of using a
// static template (see generateShipGrid above). waterline: true clips the
// hull at the waterline in both cases — used in combat only.
export function drawShip(canvas, { type = 'frigate', color = '#c9a24b', flag = '#b23b3b', facing = 1, damaged = 0, spriteSpec = null, waterline = false } = {}) {
  if (spriteSpec) {
    const gen = getGeneratedShip(spriteSpec);
    // Generated grids run far bigger (cell-count) than the hand-drawn templates
    // the game's fixed canvas sizes were tuned for, and their W:H ratio varies
    // by hull class — so we can't just draw at the caller's box size (that
    // would floor to 0 pixels, or stretch non-uniformly if forced via CSS).
    // Pick ONE integer px-per-cell that fits the grid inside the caller's box
    // (px_x === px_y, always), then size the canvas to exactly that — never
    // stretched, so the ship is never distorted. Centering within a larger
    // box is left to the caller's layout (flex/text-align), as elsewhere.
    const boxW = canvas.width, boxH = canvas.height;
    const scale = Math.max(1, Math.floor(Math.min(boxW / gen.W, boxH / gen.H)));
    canvas.width = gen.W * scale;
    canvas.height = gen.H * scale;
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    drawGrid(canvas, gen.grid, { color: gen.palette, flag: '', facing, damaged, waterRow: waterline ? gen.waterY : null });
    return;
  }
  const key = templateFor(type);
  drawGrid(canvas, TEMPLATES[key], { color, flag, facing, damaged, isMonster: key === 'monster', waterline });
}

// Convenience: build a small canvas element already rendered.
export function shipThumb(opts, size = 96) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.className = 'ship-canvas';
  drawShip(c, opts);
  return c;
}
