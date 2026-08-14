// Bootstrap: load data + locales, register screens, wire global input, start.
import { loadData, loadCustomShips } from './data.js';
import { loadLocales, onLangChange, getLang } from './i18n.js';
import { state } from './state.js';
import { go, currentScreen } from './nav.js';
import { initDebug } from './debug.js';
import { startOcean } from './ocean.js';
import { loadTemplateOverrides } from './sprites.js';
import { initFx } from './fx.js';
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
import './screens/pont.js';
import './screens/bataille.js';

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
  loadTemplateOverrides(); // apply any saved custom ship sprites (legacy pixel editor)
  loadCustomShips(); // register ships authored in the Ship Editor

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

  initFx();
  initDebug();
  bindGlobalKeys();

  if (loading) loading.remove();

  // Deep link, so a work-in-progress screen can be opened (and shared) directly
  // without clicking through the menu: index.html#pont
  const deepLink = (location.hash || '').replace('#', '');
  if (deepLink && deepLink !== 'title') go(deepLink);
  else go('title');
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
