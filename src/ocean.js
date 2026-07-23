// Animated pixel-art sea scene rendered on the full-screen background canvas:
// a sky with a shifting weather cycle, a horizon line, a distant island, a
// shipwreck and rocks, and an animated sea. Shared behind every screen.

let raf = null;

// Weather presets. Colours are interpolated as the cycle advances.
const WEATHERS = {
  dawn:   { skyTop: '#4a3f74', skyHz: '#e6a374', seaNear: '#123a52', seaFar: '#4a5f6e', sun: '#ffd8a0', sunA: 0.9, sunY: 0.34, cloud: 0.35, rain: 0, star: 0 },
  day:    { skyTop: '#37699f', skyHz: '#a9c9e0', seaNear: '#0a3a5c', seaFar: '#1d5c82', sun: '#fff4c8', sunA: 0.95, sunY: 0.16, cloud: 0.25, rain: 0, star: 0 },
  cloudy: { skyTop: '#63727f', skyHz: '#aab4bc', seaNear: '#20323e', seaFar: '#385460', sun: '#d8dde0', sunA: 0.35, sunY: 0.15, cloud: 0.7, rain: 0, star: 0 },
  storm:  { skyTop: '#262b33', skyHz: '#454d57', seaNear: '#0f1a22', seaFar: '#243640', sun: '#8892a0', sunA: 0.15, sunY: 0.13, cloud: 0.85, rain: 1, star: 0 },
  sunset: { skyTop: '#6d3a5c', skyHz: '#e8763a', seaNear: '#2a2340', seaFar: '#7c4a48', sun: '#ff9646', sunA: 0.95, sunY: 0.38, cloud: 0.4, rain: 0, star: 0 },
  night:  { skyTop: '#081026', skyHz: '#182a46', seaNear: '#061020', seaFar: '#0f2438', sun: '#e8eeff', sunA: 0.85, sunY: 0.22, cloud: 0.3, rain: 0, star: 1 },
};
const ORDER = ['dawn', 'day', 'cloudy', 'storm', 'sunset', 'night'];
const HOLD = 16;   // seconds each weather holds
const FADE = 5;    // seconds to cross-fade to the next weather

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}
function lerpState(w1, w2, t) {
  return {
    skyTop: lerpColor(w1.skyTop, w2.skyTop, t),
    skyHz: lerpColor(w1.skyHz, w2.skyHz, t),
    seaNear: lerpColor(w1.seaNear, w2.seaNear, t),
    seaFar: lerpColor(w1.seaFar, w2.seaFar, t),
    sun: lerpColor(w1.sun, w2.sun, t),
    sunA: lerp(w1.sunA, w2.sunA, t),
    sunY: lerp(w1.sunY, w2.sunY, t),
    cloud: lerp(w1.cloud, w2.cloud, t),
    rain: lerp(w1.rain, w2.rain, t),
    star: lerp(w1.star, w2.star, t),
  };
}

export function startOcean(canvas) {
  const ctx = canvas.getContext('2d');
  let w, h, t = 0;

  function resize() { w = canvas.width = canvas.clientWidth; h = canvas.height = canvas.clientHeight; }
  resize();
  window.addEventListener('resize', resize);

  // Precompute a starfield and a few clouds so they stay stable frame to frame.
  const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.45, s: Math.random() * 1.5 + 0.5, tw: Math.random() * 6 }));
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: Math.random(), y: 0.08 + Math.random() * 0.28, sc: 0.6 + Math.random() * 0.9, sp: 0.004 + Math.random() * 0.01, seed: i * 7.3 }));

  function frame() {
    t += 0.016;
    const horizon = Math.floor(h * 0.5);

    // --- Weather cycle ---
    const cycle = HOLD + FADE;
    const total = ORDER.length * cycle;
    const tt = t % total;
    const idx = Math.floor(tt / cycle);
    const within = tt - idx * cycle;
    const blend = within < HOLD ? 0 : (within - HOLD) / FADE;
    const cur = WEATHERS[ORDER[idx]];
    const nxt = WEATHERS[ORDER[(idx + 1) % ORDER.length]];
    const s = lerpState(cur, nxt, blend);

    // --- Sky ---
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, s.skyTop);
    sky.addColorStop(1, s.skyHz);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);

    // Stars (night).
    if (s.star > 0.02) {
      for (const st of stars) {
        const a = s.star * (0.4 + 0.6 * Math.abs(Math.sin(t + st.tw)));
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(st.x * w, st.y * horizon, st.s, st.s);
      }
    }

    // Sun / moon.
    const sunX = w * 0.76, sunY = horizon * s.sunY;
    ctx.globalAlpha = s.sunA;
    const g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 60);
    g.addColorStop(0, s.sun); g.addColorStop(0.3, s.sun); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sunX, sunY, 60, 0, 7); ctx.fill();
    ctx.fillStyle = s.sun;
    ctx.beginPath(); ctx.arc(sunX, sunY, 16, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;

    // Clouds.
    for (const c of clouds) {
      c.x += c.sp * 0.016 * 8;
      if (c.x > 1.2) c.x = -0.2;
      drawCloud(ctx, c.x * w, c.y * horizon, c.sc, s.cloud);
    }

    // --- Distant silhouettes on the horizon (island, rocks, wreck) ---
    const sil = 'rgba(9,17,26,0.9)';
    drawIsland(ctx, w * 0.16, horizon, w, sil);
    drawRocks(ctx, w * 0.62, horizon, sil);
    drawWreck(ctx, w * 0.87, horizon, sil, Math.sin(t * 0.6) * 0.04);

    // --- Sea ---
    const sea = ctx.createLinearGradient(0, horizon, 0, h);
    sea.addColorStop(0, s.seaFar);
    sea.addColorStop(1, s.seaNear);
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, w, h - horizon);

    // Chunky animated wave highlights, denser closer to the viewer.
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

    // --- Rain (storm) ---
    if (s.rain > 0.05) {
      ctx.strokeStyle = `rgba(180,200,220,${0.25 * s.rain})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
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

function drawCloud(ctx, x, y, sc, alpha) {
  if (alpha < 0.03) return;
  ctx.fillStyle = `rgba(232,238,244,${0.5 * alpha})`;
  for (const [dx, dy, r] of [[-28, 4, 16], [-8, -4, 20], [16, 2, 18], [34, 8, 13]]) {
    ctx.beginPath(); ctx.ellipse(x + dx * sc, y + dy * sc, r * sc, r * sc * 0.62, 0, 0, 7); ctx.fill();
  }
}

function drawIsland(ctx, x, horizon, w, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 110, horizon);
  ctx.quadraticCurveTo(x - 40, horizon - 46, x, horizon - 40);
  ctx.quadraticCurveTo(x + 55, horizon - 34, x + 120, horizon);
  ctx.closePath();
  ctx.fill();
  // a couple of palm-like ticks
  ctx.fillRect(x - 4, horizon - 52, 2, 12);
}

function drawRocks(ctx, x, horizon, color) {
  ctx.fillStyle = color;
  for (const [dx, dw, dh] of [[0, 26, 14], [30, 16, 9], [-26, 14, 8]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx - dw, horizon);
    ctx.lineTo(x + dx, horizon - dh);
    ctx.lineTo(x + dx + dw, horizon);
    ctx.closePath();
    ctx.fill();
  }
}

function drawWreck(ctx, x, horizon, color, tilt) {
  ctx.save();
  ctx.translate(x, horizon);
  ctx.rotate(tilt);
  ctx.fillStyle = color;
  // broken hull
  ctx.beginPath();
  ctx.moveTo(-34, 0);
  ctx.quadraticCurveTo(-30, 12, 0, 12);
  ctx.quadraticCurveTo(30, 12, 34, 0);
  ctx.lineTo(24, -4); ctx.lineTo(-10, -2); ctx.lineTo(-24, -6);
  ctx.closePath();
  ctx.fill();
  // leaning mast + torn sail
  ctx.fillRect(-2, -34, 3, 34);
  ctx.beginPath();
  ctx.moveTo(1, -32); ctx.lineTo(16, -26); ctx.lineTo(1, -16);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function stopOcean() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
}
