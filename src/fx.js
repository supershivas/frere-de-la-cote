// Combat visual effects: muzzle smoke, flying cannonballs, LOCAL impact
// explosions, ship recoil/impact jolts and floating damage numbers. All effects
// are localized to the ships involved — nothing flashes or shakes the whole
// screen. Rendered on a full-screen canvas overlay that survives re-renders.

let canvas, ctx, domLayer;
let W = 0, H = 0, dpr = 1;
let particles = [];
let running = false;
let last = 0;
let aimLine = null; // { fromIid, toIid } — purely visual firing-line overlay

export function initFx() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.id = 'fx-layer';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  domLayer = document.createElement('div');
  domLayer.id = 'fx-dom';
  document.body.appendChild(domLayer);
  resize();
  window.addEventListener('resize', resize);
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function loop(now) {
  const dt = Math.min(50, now - last) / 1000;
  last = now;
  ctx.clearRect(0, 0, W, H);
  drawAimLine();
  for (const p of particles) {
    p.life -= dt;
    p.update(dt);
    if (p.life <= 0 && p.onImpact && !p._impacted) { p._impacted = true; p.onImpact(); }
    p.draw(ctx);
  }
  particles = particles.filter((p) => p.life > 0);
  if (running) requestAnimationFrame(loop);
}

// ---- Firing line: a dashed line from the active ship to a hovered/selected
// target, purely visual — it never affects targeting logic. Clears itself if
// either ship disappears (e.g. re-render after the shot lands).
export function fxSetAimTarget(fromIid, toIid) { aimLine = { fromIid, toIid }; }
export function fxClearAimTarget() { aimLine = null; }

function drawAimLine() {
  if (!aimLine) return;
  const from = centerOf(aimLine.fromIid);
  const to = centerOf(aimLine.toIid);
  if (!from || !to) { aimLine = null; return; }
  ctx.save();
  ctx.setLineDash([9, 7]);
  ctx.strokeStyle = 'rgba(232,192,90,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.translate(to.x, to.y);
  ctx.rotate(ang);
  ctx.fillStyle = 'rgba(232,192,90,0.9)';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-11, -5); ctx.lineTo(-11, 5); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---- helpers ----
function centerOf(iid) {
  const eln = document.querySelector(`.ship-card[data-iid="${CSS.escape(String(iid))}"]`);
  if (!eln) return null;
  const r = eln.getBoundingClientRect();
  const cv = eln.querySelector('.ship-canvas');
  const cr = cv ? cv.getBoundingClientRect() : r;
  return { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2, el: eln, rect: r };
}

function rand(a, b) { return a + Math.random() * (b - a); }

// ---- particle factories ----
function spark(x, y, vx, vy, color, life, size) {
  particles.push({
    x, y, vx, vy, life, max: life, color, size,
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.vy += 260 * dt; this.vx *= 0.98; },
    draw(c) { c.globalAlpha = Math.max(0, this.life / this.max); c.fillStyle = this.color; c.fillRect(this.x, this.y, this.size, this.size); c.globalAlpha = 1; },
  });
}

function smoke(x, y, vx, vy, life, size, tint = '90,90,90') {
  particles.push({
    x, y, vx, vy, life, max: life, size, tint,
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.vy -= 12 * dt; this.size += 22 * dt; this.vx *= 0.96; },
    draw(c) { const a = Math.max(0, this.life / this.max) * 0.5; c.globalAlpha = a; c.fillStyle = `rgb(${this.tint})`; c.beginPath(); c.arc(this.x, this.y, this.size, 0, 7); c.fill(); c.globalAlpha = 1; },
  });
}

function ring(x, y, color, life, maxR) {
  particles.push({
    x, y, life, max: life, color, maxR,
    update() {},
    draw(c) { const k = 1 - this.life / this.max; c.globalAlpha = Math.max(0, this.life / this.max); c.strokeStyle = this.color; c.lineWidth = 3; c.beginPath(); c.arc(this.x, this.y, this.maxR * k, 0, 7); c.stroke(); c.globalAlpha = 1; },
  });
}

function flash(x, y, r, color, life) {
  particles.push({
    x, y, r, life, max: life, color,
    update() {},
    draw(c) { const a = Math.max(0, this.life / this.max); c.globalAlpha = a; const g = c.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r); g.addColorStop(0, this.color); g.addColorStop(1, 'transparent'); c.fillStyle = g; c.beginPath(); c.arc(this.x, this.y, this.r, 0, 7); c.fill(); c.globalAlpha = 1; },
  });
}

// ---- local ship jolts (recoil / impact) via the Web Animations API ----
function cardEl(iid) {
  return document.querySelector(`.ship-card[data-iid="${CSS.escape(String(iid))}"]`);
}
function animEl(elm, keyframes, dur) {
  if (elm && elm.animate) { try { elm.animate(keyframes, { duration: dur, easing: 'ease-out' }); } catch (e) {} }
}
// Recoil the firing ship a little, away from its target.
export function fxRecoil(iid, awayX = -8) {
  animEl(cardEl(iid), [
    { transform: 'translate(0,0)' },
    { transform: `translate(${awayX}px, -2px)` },
    { transform: 'translate(0,0)' },
  ], 200);
}
// Jolt a struck ship: a quick shudder only (no brightness flash).
function impactBumpEl(elm) {
  if (!elm) return;
  animEl(elm, [
    { transform: 'translate(0,0)' },
    { transform: 'translate(5px,-1px)' },
    { transform: 'translate(-4px,1px)' },
    { transform: 'translate(0,0)' },
  ], 240);
}
export function fxImpactBump(iid) { impactBumpEl(cardEl(iid)); }

export function fxFloatText(x, y, text, cls = '') {
  if (!domLayer) return;
  const s = document.createElement('div');
  s.className = `fx-float ${cls}`;
  s.textContent = text;
  s.style.left = x + 'px';
  s.style.top = y + 'px';
  domLayer.appendChild(s);
  setTimeout(() => s.remove(), 1100);
}

const AMMO_COLORS = {
  classic: '#ffd27f', explosive: '#ff9a3c', incendiary: '#ff5a2c',
  chain: '#bcd0e0', harpoon: '#e0c080',
};

export function fxExplosion(x, y, { scale = 1, color = '#ff9a3c' } = {}) {
  // No bright core glow — just an expanding ring, directional sparks and smoke,
  // so the hit reads as an impact without flashing the screen.
  ring(x, y, color, 0.4, 44 * scale);
  for (let i = 0; i < 12 * scale; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rand(70, 230) * scale;
    spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp, color, rand(0.3, 0.55), rand(2, 4));
  }
  for (let i = 0; i < 4 * scale; i++) smoke(x + rand(-8, 8), y + rand(-8, 8), rand(-20, 20), rand(-30, -10), rand(0.6, 1.1), rand(6, 12));
}

// Fire a cannon shot from attacker to target. Fire-and-forget visual.
// onHit (if given) runs the moment the projectile lands — used to drop the
// target's HP bar in sync with the impact rather than when the shot is fired.
export function fxCannon(fromIid, toIid, { ammo = 'classic', hit = true, damage = 0, absorbed = 0, killed = false, onHit = null } = {}) {
  const from = centerOf(fromIid);
  const to = centerOf(toIid);
  if (!from || !to) {
    // Fallback: still show the number and apply the hit if we can locate the target.
    if (to) fxImpact(to, { ammo, hit, damage, absorbed, killed, onHit });
    else if (onHit) onHit();
    return;
  }
  const color = AMMO_COLORS[ammo] || '#ffd27f';
  const dir = Math.atan2(to.y - from.y, to.x - from.x);
  const muzzleX = from.x + Math.cos(dir) * 42;
  const muzzleY = from.y + Math.sin(dir) * 20;

  // Muzzle smoke + sparks (no bright flash), plus a recoil on the firing ship.
  for (let i = 0; i < 5; i++) smoke(muzzleX, muzzleY, Math.cos(dir) * rand(20, 60), Math.sin(dir) * rand(20, 60) - 10, rand(0.4, 0.8), rand(4, 8));
  for (let i = 0; i < 6; i++) spark(muzzleX, muzzleY, Math.cos(dir + rand(-0.4, 0.4)) * rand(120, 240), Math.sin(dir + rand(-0.4, 0.4)) * rand(120, 240), color, rand(0.15, 0.3), 2);
  // Defer recoil so it runs after the combat re-render replaces the card.
  const awayX = (Math.sign(from.x - to.x) || -1) * 8;
  setTimeout(() => fxRecoil(fromIid, awayX), 0);

  // Projectile.
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const dur = Math.min(0.5, 0.12 + dist / 1400);
  const nBalls = ammo === 'chain' ? 2 : 1;
  for (let b = 0; b < nBalls; b++) {
    const offset = (b - (nBalls - 1) / 2) * 8;
    const px0 = muzzleX, py0 = muzzleY + offset;
    const px1 = to.x, py1 = to.y + offset;
    particles.push({
      x: px0, y: py0, life: dur, max: dur, color,
      update(dt) {
        const k = 1 - this.life / this.max;
        this.x = px0 + (px1 - px0) * k;
        this.y = py0 + (py1 - py0) * k - Math.sin(k * Math.PI) * 18; // slight arc
        if (Math.random() < 0.6) smoke(this.x, this.y, rand(-10, 10), rand(-10, 10), 0.3, 3, '120,120,120');
      },
      draw(c) {
        c.fillStyle = ammo === 'harpoon' ? '#d9c07a' : '#20232a';
        c.beginPath();
        if (ammo === 'harpoon') { c.save(); c.translate(this.x, this.y); c.rotate(dir); c.fillRect(-6, -1.5, 12, 3); c.restore(); }
        else { c.arc(this.x, this.y, ammo === 'explosive' ? 5 : 4, 0, 7); c.fill(); c.strokeStyle = color; c.lineWidth = 1; c.stroke(); }
      },
      onImpact: b === nBalls - 1 ? () => fxImpact(to, { ammo, hit, damage, absorbed, killed, onHit }) : null,
      _impacted: false,
    });
  }
}

function fxImpact(to, { ammo, hit, damage, absorbed, killed, onHit }) {
  const color = AMMO_COLORS[ammo] || '#ff9a3c';
  if (onHit) onHit(); // drop the HP bar exactly when the shot lands
  if (!hit) {
    // Splash miss: little water plume + MISS text.
    for (let i = 0; i < 6; i++) spark(to.x + rand(-10, 10), to.y + 20, rand(-40, 40), rand(-120, -40), '#8fd0e8', rand(0.3, 0.5), 3);
    fxFloatText(to.x, to.y - 10, 'MISS', 'miss');
    return;
  }
  const scale = ammo === 'explosive' ? 1.5 : (killed ? 1.6 : 1);
  fxExplosion(to.x, to.y, { scale, color });
  if (ammo === 'incendiary') for (let i = 0; i < 8; i++) spark(to.x, to.y, rand(-60, 60), rand(-140, -30), '#ff5a2c', rand(0.4, 0.8), 3);
  impactBumpEl(to.el); // local jolt on the struck ship only
  if (damage > 0) fxFloatText(to.x, to.y - 12, `-${damage}`, killed ? 'kill' : 'dmg');
  else if (absorbed > 0) fxFloatText(to.x, to.y - 12, `-${absorbed}🛡️`, 'shield');
  if (killed) setTimeout(() => fxExplosion(to.x, to.y, { scale: 2, color: '#ffcf6a' }), 120);
}

// Secondary explosion on a ship (e.g. explosive splash) by ship id.
export function fxSplash(iid, damage = 0, killed = false, onHit = null) {
  if (onHit) onHit();
  const p = centerOf(iid); if (!p) return;
  fxExplosion(p.x, p.y, { scale: killed ? 1.4 : 0.9, color: '#ffb14a' });
  impactBumpEl(p.el);
  if (damage > 0) fxFloatText(p.x, p.y - 12, `-${damage}`, killed ? 'kill' : 'dmg');
}

// Repair sparkle burst.
export function fxHeal(iid) {
  const p = centerOf(iid); if (!p) return;
  for (let i = 0; i < 12; i++) spark(p.x + rand(-18, 18), p.y + 20, rand(-20, 20), rand(-120, -40), '#7fe0a0', rand(0.5, 0.9), 3);
  ring(p.x, p.y, '#7fe0a0', 0.5, 40);
  fxFloatText(p.x, p.y - 12, '+♥', 'heal');
}

// Gold confetti burst for the victory modal's entrance.
export function fxCelebrate(x, y) {
  ring(x, y, '#e8c05a', 0.6, 70);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = rand(60, 240);
    spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60, '#ffd27f', rand(0.5, 1.0), rand(2, 4));
  }
}

// Shield brace shimmer (local).
export function fxBrace(iid) {
  const p = centerOf(iid); if (!p) return;
  ring(p.x, p.y, '#7ab8f0', 0.5, 40);
  for (let i = 0; i < 8; i++) spark(p.x + rand(-16, 16), p.y + rand(-14, 14), rand(-30, 30), rand(-40, 0), '#8fc4ff', rand(0.3, 0.6), 2);
}
