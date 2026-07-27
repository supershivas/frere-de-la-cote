// Title screen: new voyage, continue, ship editor, language toggle.
import { el, mount } from '../ui.js';
import { t, getLang, setLang, onLangChange, locName } from '../i18n.js';
import { register, go } from '../nav.js';
import { state, startNewRun, hasSave, loadGame, clearSave, buildSpriteSpec } from '../state.js';
import { DB } from '../data.js';
import { shipThumb } from '../sprites.js';
import { randomOceanScene } from '../ocean.js';

let pickingFaction = false;

function render() {
  state.screen = 'title';
  randomOceanScene(); // a fresh random landscape each time the menu is shown
  if (pickingFaction) return renderFactionPicker();

  const buttons = el('div', { class: 'title-buttons' });

  buttons.appendChild(bigBtn(t('menu_new_game'), '⚓', () => {
    pickingFaction = true;
    render();
  }));

  if (hasSave()) {
    buttons.appendChild(bigBtn(t('menu_continue'), '🧭', () => {
      if (loadGame()) go('map', { resume: true });
    }));
  }

  buttons.appendChild(bigBtn(t('menu_editor'), '🔨', () => go('editor')));

  const langToggle = el('div', { class: 'lang-toggle' }, [
    langBtn('fr', 'FR'),
    langBtn('en', 'EN'),
  ]);

  const root = el('div', { class: 'screen title-screen' }, [
    el('div', { class: 'title-wrap' }, [
      el('h1', { class: 'game-title', text: t('game_title') }),
      el('div', { class: 'game-subtitle', text: t('game_subtitle') }),
      buttons,
      el('div', { class: 'title-credits', text: t('menu_credits') }),
      langToggle,
      el('div', { class: 'debug-hint', text: 'CTRL+SHIFT+D · F1-F8' }),
    ]),
  ]);
  mount(root);
}

// A frigate-class hull is used as the shared preview silhouette for every
// faction card — only the identity (flag/livery) changes between them.
const PREVIEW_HULL = { hullClass: 3, hullShape: 'auto', sailsPerMast: 2, jibs: 1, wear: 0 };

function renderFactionPicker() {
  const grid = el('div', { class: 'faction-grid' }, Object.values(DB.factions).map(factionCard));

  const root = el('div', { class: 'screen title-screen' }, [
    el('div', { class: 'title-wrap' }, [
      el('h1', { class: 'game-title', text: t('choose_faction_title') }),
      el('div', { class: 'game-subtitle', text: t('choose_faction_subtitle') }),
      grid,
      el('button', { class: 'btn-level-4', text: t('close'), on: { click: () => { pickingFaction = false; render(); } } }),
    ]),
  ]);
  mount(root);
}

function factionCard(fac) {
  const preview = shipThumb({ spriteSpec: buildSpriteSpec(PREVIEW_HULL, fac.id, 99), facing: 1 }, 96);
  return el('div', {
    class: 'faction-card',
    on: { click: () => {
      pickingFaction = false;
      clearSave();
      startNewRun('frigate', fac.id);
      go('map', { fresh: true });
    } },
  }, [
    preview,
    el('div', { class: 'faction-name', text: locName(fac) }),
  ]);
}

function bigBtn(label, icon, onClick) {
  return el('button', { class: 'btn-level-1', on: { click: onClick } }, [
    el('span', { class: 'btn-ico', text: icon }),
    el('span', { text: label }),
  ]);
}

function langBtn(lang, label) {
  return el('button', {
    class: `lang-btn ${getLang() === lang ? 'active' : ''}`,
    text: label,
    on: { click: () => setLang(lang) },
  });
}

register('title', render);
// Re-render title on language change if it's the active screen.
onLangChange(() => { if (state.screen === 'title') render(); });
