// Procedural pixel-art ship renderer. Draws ships on a canvas from a small
// grid template so the prototype needs no external sprite assets. Each ship
// "type" has a hull silhouette; hull color comes from the ship definition.

// Grid legend:
//  . = empty, H = hull, D = deck/dark hull, M = mast, S = sail, F = flag,
//  C = cannon, W = wave trim
const TEMPLATES = {
  sloop: [
    '.....F....',
    '.....M....',
    '....SSS...',
    '...SSSS...',
    '..SSSSS...',
    '.....M....',
    '.HHHHHHHH.',
    '..DDDDDD..',
    '..WWWWWW..',
  ],
  frigate: [
    '...F...F..',
    '...M...M..',
    '..SSS.SSS.',
    '..SSS.SSS.',
    '.HHHHHHHHH',
    '.HHHHHHHHH',
    'CHDDDDDDHC',
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
    'CHHDDDDHHC',
    'CHDDDDDDHC',
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

function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + r * pct)));
  g = Math.max(0, Math.min(255, Math.round(g + g * pct)));
  b = Math.max(0, Math.min(255, Math.round(b + b * pct)));
  return `rgb(${r},${g},${b})`;
}

export function templateFor(type) {
  if (type === 'monster' || type === 'naval_monster' || type === 'kraken') return 'monster';
  if (TEMPLATES[type]) return type;
  if (type === 'brigantine' || type === 'longboat' || type === 'merchant') return 'frigate';
  return 'frigate';
}

// Draw a ship onto a canvas context. facing: 1 = right (player), -1 = left (enemy).
export function drawShip(canvas, { type = 'frigate', color = '#c9a24b', flag = '#b23b3b', facing = 1, damaged = 0 } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const key = templateFor(type);
  const grid = TEMPLATES[key];
  const rows = grid.length, cols = grid[0].length;
  const px = Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
  const ox = Math.floor((canvas.width - cols * px) / 2);
  const oy = Math.floor((canvas.height - rows * px) / 2);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const isMonster = key === 'monster';
  const palette = {
    H: color,
    D: shade(color, -0.35),
    M: isMonster ? color : '#5a4632',
    S: isMonster ? shade(color, 0.2) : '#efe7d0',
    F: flag,
    C: '#3a3a3a',
    W: 'rgba(255,255,255,0.5)',
    T: shade(color, -0.15), // tentacles
    E: '#f4d35e', // eyes / glow
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = facing === 1 ? x : cols - 1 - x;
      const c = grid[y][cx];
      if (c === '.') continue;
      let fill = palette[c] || color;
      ctx.fillStyle = fill;
      ctx.fillRect(ox + x * px, oy + y * px, px, px);
      // subtle top-edge highlight on hull for depth
      if (c === 'H') {
        ctx.fillStyle = shade(color, 0.25);
        ctx.fillRect(ox + x * px, oy + y * px, px, Math.max(1, Math.floor(px / 4)));
      }
    }
  }

  // Damage overlay: scorch marks / smoke as HP drops.
  if (damaged > 0) {
    ctx.fillStyle = `rgba(20,20,20,${0.12 * damaged})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// Convenience: build a small canvas element already rendered.
export function shipThumb(opts, size = 96) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.className = 'ship-canvas';
  drawShip(c, opts);
  return c;
}
