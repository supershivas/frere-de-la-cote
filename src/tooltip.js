// Hover tooltip that follows the cursor. Attach with attachTooltip(el, htmlFn).

let tip;

function ensureTip() {
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'tooltip';
    tip.className = 'tooltip hidden';
    document.body.appendChild(tip);
  }
  return tip;
}

export function attachTooltip(el, contentFn) {
  const show = (e) => {
    const html = typeof contentFn === 'function' ? contentFn() : contentFn;
    if (!html) return;
    const t = ensureTip();
    t.innerHTML = html;
    t.classList.remove('hidden');
    move(e);
  };
  const move = (e) => {
    const t = ensureTip();
    const pad = 16;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    const r = t.getBoundingClientRect();
    if (x + r.width > window.innerWidth) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight) y = e.clientY - r.height - pad;
    t.style.left = `${Math.max(4, x)}px`;
    t.style.top = `${Math.max(4, y)}px`;
  };
  const hide = () => ensureTip().classList.add('hidden');
  el.addEventListener('mouseenter', show);
  el.addEventListener('mousemove', move);
  el.addEventListener('mouseleave', hide);
}

export function hideTooltip() {
  if (tip) tip.classList.add('hidden');
}
