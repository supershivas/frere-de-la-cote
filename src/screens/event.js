// Narrative events (Mysterious Isle nodes). Data-driven from events.json.
import { el, mount, outcomeModal } from '../ui.js';
import { t, locField, locName } from '../i18n.js';
import { register, go } from '../nav.js';
import { DB } from '../data.js';
import { state, addGold, addRelic, combatMods, saveGame } from '../state.js';
import { renderHud } from '../hud.js';
import { toastInfo, toastSuccess } from '../toast.js';

// Whether an event is reachable right now, per its optional `require` block:
// { weather: "tempete" } current node's weather must match,
// { minReputation: 3 } state.resources.reputation must be at least that,
// { act: 2 } current act must match exactly.
function meetsRequire(req) {
  if (!req) return true;
  if (req.weather) {
    const node = state.map && state.map.byId[state.currentNodeId];
    if (!node || node.weather !== req.weather) return false;
  }
  if (req.minReputation != null && state.resources.reputation < req.minReputation) return false;
  if (req.act != null && state.act !== req.act) return false;
  return true;
}

function eligibleEventIds() {
  const ids = Object.keys(DB.events).filter((id) => meetsRequire(DB.events[id].require));
  if (ids.length) return ids;
  // Never fall back into an event whose requirement isn't met — fall back to
  // unconditional events instead.
  return Object.keys(DB.events).filter((id) => !DB.events[id].require);
}

function pickEvent() {
  const ids = eligibleEventIds();
  return DB.events[ids[Math.floor(Math.random() * ids.length)]];
}

function render(opts = {}) {
  state.screen = 'event';
  const ev = (opts.eventId && DB.events[opts.eventId]) || pickEvent();
  state._currentEvent = ev;

  const choices = el('div', { class: 'event-choices' });
  ev.choices.forEach((choice) => {
    const affordable = !choice.cost || state.resources.gold >= (choice.cost.gold || 0);
    const btn = el('button', {
      class: `btn-level-3 event-choice ${affordable ? '' : 'disabled'}`,
      text: locField(choice, 'label'),
      on: { click: () => { if (affordable) resolveChoice(choice); } },
    });
    if (!affordable) btn.disabled = true;
    choices.appendChild(btn);
  });

  const root = el('div', { class: 'screen event-screen' }, [
    renderHud(),
    el('div', { class: 'event-panel' }, [
      el('div', { class: 'event-illus', text: '🌫️' }),
      el('h2', { text: locField(ev, 'title') }),
      el('p', { class: 'event-text', text: locField(ev, 'text') }),
      el('div', { class: 'event-prompt', text: t('event_choose') }),
      choices,
    ]),
  ]);
  mount(root);
  saveGame();
}

function resolveChoice(choice) {
  if (choice.cost && choice.cost.gold) addGold(-choice.cost.gold);
  const outcome = pickOutcome(choice.outcomes);
  applyOutcome(outcome);
}

function pickOutcome(outcomes) {
  const total = outcomes.reduce((a, o) => a + (o.weight || 1), 0);
  let r = Math.random() * total;
  for (const o of outcomes) {
    r -= o.weight || 1;
    if (r <= 0) return o;
  }
  return outcomes[0];
}

function applyOutcome(o) {
  const mods = combatMods();
  const msg = locField(o, 'toast');
  const done = () => go('map');
  const show = (tone, icon, lines) => outcomeModal({ tone, icon, title: msg || '', lines, onClose: done });

  switch (o.type) {
    case 'gold': {
      const g = Math.round((o.value || 0) * mods.goldMult);
      addGold(g);
      return show('positive', '💰', [`💰 <b>+${g}</b> ${t('gold')}`]);
    }
    case 'damage_flagship': {
      const fs = state.fleet.find((s) => s.flagship) || state.fleet[0];
      if (fs) fs.hp = Math.max(1, fs.hp - (o.value || 0));
      return show('negative', '⚠️', [`❤️ <b>-${o.value || 0}</b> ${t('stat_hp')}`]);
    }
    case 'damage_fleet':
      state.fleet.forEach((s) => { s.hp = Math.max(1, s.hp - (o.value || 0)); });
      return show('negative', '🌊', [`❤️ <b>-${o.value || 0}</b> ${t('stat_hp')} · ${t('your_fleet')}`]);
    case 'heal_fleet':
      state.fleet.forEach((s) => { s.hp = Math.min(s.maxHp, s.hp + (o.value || 0)); });
      return show('positive', '💤', [`❤️ <b>+${o.value || 0}</b> ${t('stat_hp')} · ${t('your_fleet')}`]);
    case 'relic_random': {
      const pool = Object.keys(DB.relics).filter((id) => !state.relics.includes(id) && id !== 'kraken_relic');
      if (pool.length) {
        const id = pool[Math.floor(Math.random() * pool.length)];
        addRelic(id);
        const rel = DB.relics[id];
        return show('reward', rel.icon || '⭐', [`<b>${locName(rel)}</b>`, `<span class="tt-desc">${locField(rel, 'desc')}</span>`]);
      }
      addGold(80);
      return show('positive', '💰', [`💰 <b>+80</b> ${t('gold')}`]);
    }
    case 'rare_materials':
      state.resources.rareMaterials += o.value || 1;
      return show('reward', '⭐', [`⭐ <b>+${o.value || 1}</b> ${t('rare_materials')}`]);
    case 'reputation':
      state.resources.reputation += o.value || 1;
      return show('neutral', '🏴‍☠️', [`🏴‍☠️ <b>+${o.value || 1}</b> ${t('reputation')}`]);
    case 'wood':
      state.resources.wood = Math.max(0, state.resources.wood + (o.value || 0));
      return show(o.value < 0 ? 'negative' : 'positive', '🪵', [`🪵 <b>${o.value >= 0 ? '+' : ''}${o.value || 0}</b> ${t('wood')}`]);
    case 'repair_fleet':
      state.fleet.forEach((s) => { s.hp = s.maxHp; s.shield = s.maxShield; });
      return show('positive', '🔧', [`🔧 ${t('port_repair')}`]);
    case 'weather_change':
      if (DB.weather[o.value]) {
        state.forcedNextWeather = o.value;
        const w = DB.weather[o.value];
        return show('neutral', w.icon || '🌊', [`${w.icon || ''} <b>${locName(w)}</b>`]);
      }
      return show('neutral', '📜', []);
    case 'combat':
      toastInfo(msg, '⚔️');
      go('combat', { kind: 'combat', danger: 1 });
      return; // combat flow handles navigation
    case 'none':
    default:
      return show('neutral', '📜', []);
  }
}

register('event', render);
