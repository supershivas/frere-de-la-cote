// Treasure node: choose a safe chest (small, sure reward) or a cursed chest
// (big reward with a chance of a curse).
import { el, mount } from '../ui.js';
import { t, locName } from '../i18n.js';
import { register, go } from '../nav.js';
import { DB } from '../data.js';
import { state, addGold, addRelic, relicMods, saveGame } from '../state.js';
import { renderHud } from '../hud.js';
import { toastSuccess, toastDanger } from '../toast.js';

function render() {
  state.screen = 'treasure';
  const root = el('div', { class: 'screen treasure-screen' }, [
    renderHud(),
    el('div', { class: 'event-panel' }, [
      el('h2', { text: `💰 ${t('treasure_title')}` }),
      el('p', { class: 'event-text', text: t('treasure_text') }),
      el('div', { class: 'chest-row' }, [
        chest('🧰', t('treasure_safe'), t('treasure_safe_desc'), openSafe),
        chest('💀', t('treasure_cursed'), t('treasure_cursed_desc'), openCursed),
      ]),
    ]),
  ]);
  mount(root);
  saveGame();
}

function chest(icon, title, desc, onClick) {
  return el('button', { class: 'chest-card', on: { click: onClick } }, [
    el('div', { class: 'chest-icon', text: icon }),
    el('div', { class: 'chest-title', text: title }),
    el('div', { class: 'chest-desc', text: desc }),
  ]);
}

function openSafe() {
  const mods = relicMods();
  const gold = Math.round((40 + Math.floor(Math.random() * 30)) * mods.goldMult);
  addGold(gold);
  toastSuccess(t('toast_gold_gain', { n: gold }), '💰');
  go('map');
}

function openCursed() {
  const mods = relicMods();
  const roll = Math.random();
  const curseChance = mods.dangerUp ? 0.55 : 0.4;
  if (roll < curseChance) {
    // Curse: damage the fleet a bit but still grab some gold.
    state.fleet.forEach((s) => { s.hp = Math.max(1, s.hp - 25); });
    toastDanger(t('toast_curse'), '☠️');
    const gold = Math.round(30 * mods.goldMult);
    addGold(gold);
  } else {
    // Big reward: a relic if available, else lots of gold.
    const pool = Object.keys(DB.relics).filter((id) => !state.relics.includes(id) && id !== 'kraken_relic');
    if (pool.length && Math.random() < 0.6) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      addRelic(id);
      toastSuccess(t('toast_relic', { name: locName(DB.relics[id]) }), DB.relics[id].icon || '⭐');
    } else {
      const gold = Math.round((120 + Math.floor(Math.random() * 80)) * mods.goldMult);
      addGold(gold);
      toastSuccess(t('toast_gold_gain', { n: gold }), '💰');
    }
  }
  go('map');
}

register('treasure', render);
