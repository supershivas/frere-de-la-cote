// Title screen: new voyage, continue, ship editor, language toggle.
import { el, mount } from '../ui.js';
import { t, getLang, setLang, onLangChange } from '../i18n.js';
import { register, go } from '../nav.js';
import { state, startNewRun, hasSave, loadGame, clearSave } from '../state.js';
import { shipThumb } from '../sprites.js';

function render() {
  state.screen = 'title';
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

  // Decorative fleet of sprites sailing under the title.
  const showcase = el('div', { class: 'title-showcase' }, [
    shipThumb({ type: 'sloop', color: '#7fd4c1', facing: 1 }, 90),
    shipThumb({ type: 'frigate', color: '#d98b5f', facing: 1 }, 110),
    shipThumb({ type: 'galleon', color: '#c9a24b', facing: 1 }, 130),
  ]);

  const langToggle = el('div', { class: 'lang-toggle' }, [
    langBtn('fr', 'FR'),
    langBtn('en', 'EN'),
  ]);

  const root = el('div', { class: 'screen title-screen' }, [
    el('div', { class: 'title-wrap' }, [
      el('h1', { class: 'game-title', text: t('game_title') }),
      el('div', { class: 'game-subtitle', text: t('game_subtitle') }),
      showcase,
      buttons,
      el('div', { class: 'title-credits', text: t('menu_credits') }),
      langToggle,
      el('div', { class: 'debug-hint', text: 'CTRL+SHIFT+D · F1-F8' }),
    ]),
  ]);
  mount(root);
}

function bigBtn(label, icon, onClick) {
  return el('button', { class: 'btn btn-big', on: { click: onClick } }, [
    el('span', { class: 'btn-icon', text: icon }),
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
