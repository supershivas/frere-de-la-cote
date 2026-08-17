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

// 11 decor kinds (+ "none"). 1–3 are combined per scene.
const DECOR_KINDS = ['island', 'wreck', 'rocks', 'fort', 'fishermen', 'sharkfins', 'buoy', 'lighthouse', 'iceberg', 'seagulls', 'whale'];

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
    decor = shuffled.map((kind, i) => ({ kind, x: slots[i] + (Math.random() - 0.5) * 0.06, seed: Math.random() * 100 }));
  }
  scene = { weather, decor };
  return scene;
}

export function startOcean(canvas) {
  if (!scene) randomOceanScene();
  const ctx = canvas.getContext('2d');
  let w, h, t = 0;

  function resize() { w = canvas.width = canvas.clientWidth; h = canvas.height = canvas.clientHeight; }
  resize();
  window.addEventListener('resize', resize);

  const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.85, s: Math.random() * 1.5 + 0.5, tw: Math.random() * 6 }));
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: Math.random(), y: 0.1 + Math.random() * 0.6, sc: 0.7 + Math.random() * 1.0, sp: 0.0012 + Math.random() * 0.0022, seed: i * 7.3 }));
  const gulls = Array.from({ length: 5 }, () => ({ x: Math.random(), y: 0.15 + Math.random() * 0.4, sp: 0.02 + Math.random() * 0.02, ph: Math.random() * 6 }));

  function frame() {
    t += 0.016;
    // Horizon sits high — the sea fills ~87% of the screen.
    const horizon = Math.floor(h * 0.13);
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

    // Sun / moon in the thin sky band.
    const sunX = w * 0.76, sunY = horizon * 0.45;
    ctx.globalAlpha = s.sunA;
    const g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 46);
    g.addColorStop(0, s.sun); g.addColorStop(0.4, s.sun); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sunX, sunY, 46, 0, 7); ctx.fill();
    ctx.fillStyle = s.sun; ctx.beginPath(); ctx.arc(sunX, sunY, 11, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;

    // Clouds (drift slowly).
    for (const c of clouds) {
      c.x += c.sp * 0.5;
      if (c.x > 1.2) c.x = -0.2;
      drawCloud(ctx, c.x * w, c.y * horizon, c.sc, s.cloud);
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
function drawCloud(ctx, x, y, sc, alpha) {
  if (alpha < 0.03) return;
  ctx.fillStyle = `rgba(232,238,244,${0.5 * alpha})`;
  for (const [dx, dy, r] of [[-28, 4, 16], [-8, -4, 20], [16, 2, 18], [34, 8, 13]]) {
    ctx.beginPath(); ctx.ellipse(x + dx * sc, y + dy * sc, r * sc, r * sc * 0.62, 0, 0, 7); ctx.fill();
  }
}

function drawDecor(ctx, d, horizon, w, h, color, t) {
  const x = d.x * w;
  switch (d.kind) {
    case 'island': return drawIsland(ctx, x, horizon, color);
    case 'wreck': return drawWreck(ctx, x, horizon, color, Math.sin(t * 0.6 + d.seed) * 0.04);
    case 'rocks': return drawRocks(ctx, x, horizon, color);
    case 'fort': return drawFort(ctx, x, horizon, color);
    case 'fishermen': return drawFishermen(ctx, x, horizon, color, t);
    case 'buoy': return drawBuoy(ctx, x, horizon, t + d.seed);
    case 'lighthouse': return drawLighthouse(ctx, x, horizon, color, t);
    case 'iceberg': return drawIceberg(ctx, x, horizon);
    case 'whale': return drawWhale(ctx, x, horizon, color, t + d.seed);
    default: return;
  }
}

function drawIsland(ctx, x, horizon, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 90, horizon);
  ctx.quadraticCurveTo(x - 34, horizon - 40, x, horizon - 34);
  ctx.quadraticCurveTo(x + 46, horizon - 30, x + 100, horizon);
  ctx.closePath(); ctx.fill();
  ctx.fillRect(x - 3, horizon - 44, 2, 12); // palm
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
  ctx.fillRect(-2, -30, 3, 30);
  ctx.beginPath(); ctx.moveTo(1, -28); ctx.lineTo(14, -22); ctx.lineTo(1, -14); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawFort(ctx, x, horizon, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x - 34, horizon - 22, 68, 22);      // wall
  for (let i = -34; i < 34; i += 12) ctx.fillRect(x + i, horizon - 28, 6, 6); // battlements
  ctx.fillRect(x - 8, horizon - 36, 16, 16);        // tower
  ctx.fillRect(x - 2, horizon - 44, 2, 8);          // flagpole
  ctx.fillStyle = '#7a2b2b'; ctx.fillRect(x, horizon - 44, 8, 5); // flag
}
function drawFishermen(ctx, x, horizon, color, t) {
  const yb = horizon + 4 + Math.sin(t) * 1.5;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - 16, yb); ctx.quadraticCurveTo(x, yb + 8, x + 16, yb); ctx.closePath(); ctx.fill();
  ctx.fillRect(x - 5, yb - 8, 2, 8); ctx.fillRect(x + 3, yb - 8, 2, 8); // two figures
  ctx.fillRect(x + 10, yb - 12, 1, 12); // fishing rod
}
function drawBuoy(ctx, x, horizon, t) {
  const yb = horizon + 8 + Math.sin(t * 1.6) * 2;
  ctx.fillStyle = '#c23a2a'; ctx.beginPath(); ctx.arc(x, yb, 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#e8e0d0'; ctx.fillRect(x - 5, yb - 1, 10, 2);
  ctx.fillStyle = '#c23a2a'; ctx.fillRect(x - 1, yb - 10, 2, 5);
}
function drawLighthouse(ctx, x, horizon, color, t) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - 8, horizon); ctx.lineTo(x - 5, horizon - 40); ctx.lineTo(x + 5, horizon - 40); ctx.lineTo(x + 8, horizon); ctx.closePath(); ctx.fill();
  const on = (Math.sin(t * 1.5) > 0.4);
  ctx.fillStyle = on ? 'rgba(255,230,150,0.95)' : '#3a3a2a';
  ctx.fillRect(x - 4, horizon - 48, 8, 8);
}
function drawIceberg(ctx, x, horizon) {
  ctx.fillStyle = 'rgba(200,225,235,0.85)';
  ctx.beginPath(); ctx.moveTo(x - 40, horizon); ctx.lineTo(x - 14, horizon - 34); ctx.lineTo(x + 6, horizon - 20); ctx.lineTo(x + 40, horizon); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(150,190,205,0.6)'; ctx.fillRect(x - 40, horizon, 80, 6);
}
function drawWhale(ctx, x, horizon, color, t) {
  const yb = horizon + 10;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, yb, 30, 8, 0, Math.PI, 0); ctx.fill(); // hump
  ctx.beginPath(); ctx.moveTo(x + 26, yb - 2); ctx.lineTo(x + 40, yb - 12); ctx.lineTo(x + 38, yb); ctx.closePath(); ctx.fill(); // tail
  if (Math.sin(t) > 0.6) { ctx.strokeStyle = 'rgba(200,225,240,0.6)'; ctx.beginPath(); ctx.moveTo(x - 18, yb - 4); ctx.lineTo(x - 20, yb - 20); ctx.stroke(); } // spout
}
function drawSharkFins(ctx, horizon, h, w, t, seed, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const y = horizon + 40 + ((i * 53 + seed * 7) % (h - horizon - 60));
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
