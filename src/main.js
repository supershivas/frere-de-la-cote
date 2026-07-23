// Bootstrap: load data + locales, register screens, wire global input, start.
import { loadData } from './data.js';
import { loadLocales, onLangChange, getLang } from './i18n.js';
import { state } from './state.js';
import { go, currentScreen } from './nav.js';
import { initDebug } from './debug.js';
import { startOcean } from './ocean.js';
import { openPause, closePause, isPauseOpen } from './pause.js';

// Register screens (side-effect imports).
import './screens/title.js';
import './map.js';
import './combat.js';
import './screens/port.js';
import './screens/shipyard.js';
import './screens/treasure.js';
import './screens/event.js';
import './screens/editor.js';

async function boot() {
  const loading = document.getElementById('loading');
  try {
    await Promise.all([loadData(), loadLocales()]);
  } catch (e) {
    if (loading) loading.innerHTML = `<div class="load-error">Failed to load game data.<br><small>${e.message}</small><br><br>Run a local server (e.g. <code>python3 -m http.server</code>) and open via http://localhost:8000</small></div>`;
    console.error(e);
    return;
  }

  window.__state = state; // debug/inspection convenience

  document.documentElement.lang = getLang();
  onLangChange((l) => {
    document.documentElement.lang = l;
    // Re-render current non-title screen so labels update live.
    const scr = currentScreen();
    if (scr && scr !== 'title') go(scr);
  });

  // Ocean background.
  const ocean = document.getElementById('ocean');
  if (ocean) startOcean(ocean);

  initDebug();
  bindGlobalKeys();

  if (loading) loading.remove();
  go('title');
}

function typingInField() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
}

function bindGlobalKeys() {
  window.addEventListener('keydown', (e) => {
    if (typingInField()) return;
    const scr = currentScreen();
    const inRun = state.inRun && scr !== 'title' && scr !== 'editor';

    // Pause / cancel.
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (scr === 'title' || scr === 'editor') return;
      if (isPauseOpen()) closePause();
      else openPause();
      e.preventDefault();
      return;
    }
    if (!inRun || isPauseOpen()) return;

    // Quick navigation to map from anywhere in a run.
    if (e.key === 'm' || e.key === 'M') { go('map'); e.preventDefault(); }
  });
}

boot();
