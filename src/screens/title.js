// Title screen: new voyage, continue, ship editor, language toggle.
import { el, mount } from '../ui.js';
import { t, getLang, setLang, onLangChange } from '../i18n.js';
import { register, go } from '../nav.js';
import { state, startNewRun, hasSave, loadGame, clearSave } from '../state.js';
import { randomOceanScene } from '../ocean.js';

function render() {
  state.screen = 'title';
  randomOceanScene(); // a fresh random landscape each time the menu is shown
  const buttons = el('div', { class: 'title-buttons' });

  buttons.appendChild(bigBtn(t('menu_new_game'), '⚓', () => {
    clearSave();
    startNewRun('frigate');
    go('map', { fresh: true });
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
