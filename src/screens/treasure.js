// Treasure node: choose a safe chest (small, sure reward) or a cursed chest
// (big reward with a chance of a curse).
import { el, mount, outcomeModal } from '../ui.js';
import { t, locName, locField } from '../i18n.js';
import { register, go } from '../nav.js';
import { DB } from '../data.js';
import { state, addGold, addRelic, relicMods, saveGame } from '../state.js';
import { renderHud } from '../hud.js';

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

const done = () => go('map');

function openSafe() {
  const mods = relicMods();
  const gold = Math.round((30 + Math.floor(Math.random() * 20)) * mods.goldMult);
  addGold(gold);
  outcomeModal({
    tone: 'positive', icon: '🧰', title: t('treasure_safe'),
    lines: [`💰 <b>+${gold}</b> ${t('gold')}`], onClose: done,
  });
}

function openCursed() {
  const mods = relicMods();
  const roll = Math.random();
  const curseChance = mods.dangerUp ? 0.55 : 0.4;
  if (roll < curseChance) {
    // Curse: damage the fleet but still grab a little gold.
    state.fleet.forEach((s) => { s.hp = Math.max(1, s.hp - 25); });
    const gold = Math.round(30 * mods.goldMult);
    addGold(gold);
    outcomeModal({
      tone: 'curse', icon: '☠️', title: t('toast_curse'),
      lines: [`❤️ <b>-25</b> ${t('stat_hp')} · ${t('your_fleet')}`, `💰 <b>+${gold}</b> ${t('gold')}`], onClose: done,
    });
  } else {
    const pool = Object.keys(DB.relics).filter((id) => !state.relics.includes(id) && id !== 'kraken_relic');
    if (pool.length && Math.random() < 0.6) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      addRelic(id);
      const rel = DB.relics[id];
      outcomeModal({
        tone: 'reward', icon: rel.icon || '⭐', eyebrow: t('relic_obtained'), title: locName(rel),
        lines: [`<span class="outcome-desc">${locField(rel, 'desc')}</span>`], onClose: done,
      });
    } else {
      const gold = Math.round((90 + Math.floor(Math.random() * 60)) * mods.goldMult);
      addGold(gold);
      outcomeModal({
        tone: 'reward', icon: '💰', title: t('treasure_cursed'),
        lines: [`💰 <b>+${gold}</b> ${t('gold')}`], onClose: done,
      });
    }
  }
}

register('treasure', render);
