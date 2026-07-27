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
export function buildPalette(color, flag, isMonster = false) {
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
  if (type === 'monster' || type === 'naval_monster' || type === 'kraken') return 'monster';
  if (TEMPLATES[type]) return type;
  if (type === 'brigantine' || type === 'longboat' || type === 'merchant') return 'frigate';
  return 'frigate';
}

// The single reference generator: same grid data for the editor and combat,
// so both are always visually identical (no separate copy to keep in sync).
export function generateShipGrid(type) {
  return TEMPLATES[templateFor(type)];
}

// Row index of the waterline — the first row made only of 'W' (foam trim) or
// empty cells. Used in combat to clip the hull so nothing renders "underwater".
function waterlineRow(grid) {
  for (let y = 0; y < grid.length; y++) {
    if ([...grid[y]].every((c) => c === 'W' || c === '.')) return y;
  }
  return grid.length;
}

// Render an explicit grid (array of equal-length strings) onto a canvas.
// waterline: true clips anything at/below the hull's waterline row — used in
// combat so no keel is ever visible "underwater"; the editor leaves it off.
export function drawGrid(canvas, grid, { color = '#c9a24b', flag = '#b23b3b', facing = 1, damaged = 0, isMonster = false, waterline = false } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rows = grid.length, cols = grid[0].length;
  const px = Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
  const ox = Math.floor((canvas.width - cols * px) / 2);
  const oy = Math.floor((canvas.height - rows * px) / 2);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  if (waterline) {
    const wy = waterlineRow(grid);
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
export function drawShip(canvas, { type = 'frigate', color = '#c9a24b', flag = '#b23b3b', facing = 1, damaged = 0, waterline = false } = {}) {
  const key = templateFor(type);
  drawGrid(canvas, generateShipGrid(type), { color, flag, facing, damaged, isMonster: key === 'monster', waterline });
}

// Convenience: build a small canvas element already rendered.
export function shipThumb(opts, size = 96) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.className = 'ship-canvas';
  drawShip(c, opts);
  return c;
}
