// Animated pixel-art ocean background rendered on a full-screen canvas.
// Cheap procedural waves + drifting highlights for ambiance.

let raf = null;

export function startOcean(canvas) {
  const ctx = canvas.getContext('2d');
  let w, h, t = 0;

  function resize() {
    w = canvas.width = canvas.clientWidth;
    h = canvas.height = canvas.clientHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function frame() {
    t += 0.016;
    // Vertical gradient: deep ocean.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b2a4a');
    g.addColorStop(0.5, '#0a3a5c');
    g.addColorStop(1, '#062033');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Wave bands (chunky pixel rows).
    const band = 8;
    for (let y = 0; y < h; y += band) {
      const depth = y / h;
      const phase = t * (0.6 + depth) + y * 0.05;
      const off = Math.sin(phase) * (6 + depth * 10);
      const alpha = 0.03 + depth * 0.05;
      ctx.fillStyle = `rgba(140,200,230,${alpha})`;
      for (let x = -20; x < w + 20; x += 28) {
        const wob = Math.sin((x + off) * 0.04 + t) * 3;
        ctx.fillRect(Math.floor(x + off), Math.floor(y + wob), 14, 3);
      }
    }
    raf = requestAnimationFrame(frame);
  }
  cancelAnimationFrame(raf);
  frame();
}

export function stopOcean() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
}
