// Developer / debug mode. Toggle with CTRL+SHIFT+D. Console commands + F1-F8.
import { el } from './ui.js';
import { t } from './i18n.js';
import { state, addGold, grantXp, saveMeta, loadMeta } from './state.js';
import { DB } from './data.js';
import { go, currentScreen } from './nav.js';
import { toast, toastInfo, toastSuccess } from './toast.js';
import { getCombat, debugWinCombat, debugHealFleet, debugSpawn } from './combat.js';

let enabled = false;
let panel = null;
let fpsOverlay = null;
let lastFrame = performance.now();
let frames = 0;
let fps = 0;

export function initDebug() {
  window.addEventListener('keydown', onKey, true);
}

function onKey(e) {
  // Toggle debug mode.
  if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
    e.preventDefault();
    toggleDebug();
    return;
  }
  if (!enabled) return;
  // Don't hijack typing in the console input.
  if (document.activeElement && document.activeElement.id === 'debug-input') return;

  switch (e.key) {
    case 'F1': e.preventDefault(); togglePanel(); break;
    case 'F2': e.preventDefault(); cmdGold(1000); break;
    case 'F3': e.preventDefault(); cmdHeal(); break;
    case 'F4': e.preventDefault(); cmdLevelFleet(); break;
    case 'F5': e.preventDefault(); cmdWin(); break;
    case 'F6': e.preventDefault(); debugSpawn(randomEnemyId()); log('spawn enemy'); break;
    case 'F7': e.preventDefault(); debugSpawn('el_almirante', true); log('spawn boss almirante'); break;
    case 'F8': e.preventDefault(); go('editor'); break;
  }
}

function toggleDebug() {
  enabled = !enabled;
  if (enabled) {
    document.body.classList.add('debug-on');
    showPanel();
    startFps();
    toastInfo(t('debug_enabled'), '🛠️');
  } else {
    document.body.classList.remove('debug-on');
    hidePanel();
    stopFps();
    toastInfo(t('debug_disabled'), '🛠️');
  }
}

function showPanel() {
  if (panel) return;
  panel = el('div', { class: 'debug-panel', id: 'debug-panel' }, [
    el('div', { class: 'debug-title', text: `🛠️ ${t('debug_title')}` }),
    el('div', { class: 'debug-help', text: t('debug_hint') }),
  ]);
  const input = el('input', { id: 'debug-input', class: 'debug-input', attrs: { placeholder: 'gold 1000 · heal fleet · win combat · unlock all · level ship 10 · spawn enemy pirate_sloop · spawn boss almirante' } });
  input.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { runCommand(input.value); input.value = ''; }
  });
  panel.appendChild(input);
  const out = el('div', { class: 'debug-out', id: 'debug-out' });
  panel.appendChild(out);
  const keys = el('div', { class: 'debug-keys', text: 'F1 menu · F2 +or · F3 heal · F4 lvl · F5 win · F6 enemy · F7 boss · F8 editor' });
  panel.appendChild(keys);
  document.body.appendChild(panel);
  input.focus();
}

function hidePanel() { if (panel) { panel.remove(); panel = null; } }
function togglePanel() { if (panel) hidePanel(); else showPanel(); }

function log(msg) {
  const out = document.getElementById('debug-out');
  if (out) {
    const line = el('div', { class: 'debug-line', text: `› ${msg}` });
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }
}

// ---- Commands ----
function runCommand(raw) {
  const s = raw.trim();
  if (!s) return;
  const parts = s.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg1 = parts[1];
  const arg2 = parts[2];
  switch (cmd) {
    case 'gold': cmdGold(parseInt(arg1) || 100); break;
    case 'heal': cmdHeal(); break;
    case 'win': cmdWin(); break;
    case 'unlock': cmdUnlockAll(); break;
    case 'level':
      if (arg1 === 'ship' || arg1 === 'fleet') cmdLevelFleet(parseInt(arg2) || 1);
      else cmdLevelFleet(parseInt(arg1) || 1);
      break;
    case 'spawn':
      if (arg1 === 'boss') debugSpawn(resolveBoss(arg2), true);
      else debugSpawn(resolveEnemy(arg2 || arg1));
      log(`${cmd} ${arg1} ${arg2 || ''}`);
      break;
    default:
      log(`${t('debug_unknown')}: ${cmd}`);
      return;
  }
  log(s);
  refresh();
}

function cmdGold(n) { addGold(n); toastSuccess(`+${n} 💰`, '💰'); refresh(); }
function cmdHeal() {
  if (getCombat()) debugHealFleet();
  else state.fleet.forEach((s) => { s.hp = s.maxHp; s.shield = s.maxShield; });
  toastSuccess(t('toast_repaired'), '🔧');
  refresh();
}
function cmdWin() { if (getCombat()) debugWinCombat(); else toastInfo('—'); }
function cmdLevelFleet(times = 1) {
  state.fleet.forEach((s) => { for (let i = 0; i < times; i++) grantXp(s, 9999); });
  toastSuccess(`⬆️ +${times}`, '⬆️');
  refresh();
}
function cmdUnlockAll() {
  Object.keys(DB.enemies).forEach((id) => (state.discovered.enemies[id] = true));
  Object.keys(DB.bosses).forEach((id) => (state.discovered.bosses[id] = true));
  Object.keys(DB.ships).forEach((id) => (state.discovered.ships[id] = true));
  const meta = loadMeta(); meta.unlockedAll = true; saveMeta(meta);
  toastSuccess('unlock all ✓', '🔓');
}

function refresh() {
  const scr = currentScreen();
  if (scr && scr !== 'combat' && scr !== 'title' && scr !== 'editor') go(scr);
}

function randomEnemyId() {
  const ids = Object.keys(DB.enemies);
  return ids[Math.floor(Math.random() * ids.length)];
}
function resolveEnemy(name) {
  if (!name) return randomEnemyId();
  if (DB.enemies[name]) return name;
  const match = Object.keys(DB.enemies).find((id) => id.includes(name));
  return match || randomEnemyId();
}
function resolveBoss(name) {
  if (!name) return 'el_almirante';
  if (DB.bosses[name]) return name;
  const match = Object.keys(DB.bosses).find((id) => id.includes(name));
  return match || 'el_almirante';
}

// ---- FPS overlay ----
function startFps() {
  fpsOverlay = el('div', { class: 'fps-overlay', id: 'fps-overlay' });
  document.body.appendChild(fpsOverlay);
  loop();
}
function stopFps() { if (fpsOverlay) { fpsOverlay.remove(); fpsOverlay = null; } }
function loop() {
  if (!fpsOverlay) return;
  frames++;
  const now = performance.now();
  if (now - lastFrame >= 500) {
    fps = Math.round((frames * 1000) / (now - lastFrame));
    frames = 0; lastFrame = now;
    const c = getCombat();
    fpsOverlay.textContent = `FPS ${fps} · screen:${currentScreen()} · fleet:${state.fleet.length} · gold:${state.resources.gold}${c ? ` · turn:${c.round}` : ''}`;
  }
  requestAnimationFrame(loop);
}
