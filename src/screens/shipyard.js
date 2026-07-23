// Shipyard: pay to permanently upgrade one ship from a rolled set of options.
import { el, mount } from '../ui.js';
import { t, locName, locField } from '../i18n.js';
import { register, go } from '../nav.js';
import { DB } from '../data.js';
import { state, applyUpgrade, addGold, saveGame } from '../state.js';
import { renderHud } from '../hud.js';
import { toastSuccess, toastDanger } from '../toast.js';
import { shipThumb } from '../sprites.js';

const UPGRADE_COST = 60;

function render() {
  state.screen = 'shipyard';
  if (!state._yardOptions) state._yardOptions = rollUpgrades(3);
  const options = state._yardOptions;
  let selectedShip = state._yardShip || state.fleet[0];
  state._yardShip = selectedShip;

  // Selecting a ship only changes the highlight — update it in place (no full
  // re-render) so the screen doesn't flash.
  const shipBtns = [];
  const shipPicker = el('div', { class: 'yard-ships' }, state.fleet.map((s) => {
    const btn = el('button', { class: `yard-ship ${s === selectedShip ? 'active' : ''}`, on: { click: () => {
      state._yardShip = s;
      shipBtns.forEach(({ ship, el: b }) => b.classList.toggle('active', ship === s));
    } } }, [
      shipThumb({ type: s.def.type, color: s.color, facing: 1 }, 60),
      el('div', { class: 'mini-name', text: (s.name || locName(s.def)) + (s.flagship ? ' ★' : '') }),
      el('div', { class: 'mini-hp', text: `Lv.${s.level}` }),
    ]);
    shipBtns.push({ ship: s, el: btn });
    return btn;
  }));

  const upWrap = el('div', { class: 'upgrade-options' }, options.map((up) =>
    el('button', { class: 'upgrade-card', on: { click: () => buy(up) } }, [
      el('div', { class: 'up-icon', text: up.icon || '⚓' }),
      el('div', { class: 'up-name', text: locName(up) }),
      el('div', { class: 'up-desc', text: locField(up, 'desc') }),
      el('div', { class: 'up-cost', text: `${UPGRADE_COST} 💰` }),
    ])
  ));

  const root = el('div', { class: 'screen yard-screen' }, [
    renderHud(),
    el('div', { class: 'port-header' }, [
      el('h2', { text: `🔨 ${t('shipyard_title')}` }),
      el('div', { class: 'map-hint', text: t('shipyard_desc') }),
    ]),
    shipPicker,
    upWrap,
    el('button', { class: 'btn btn-big leave-btn', text: `⛵ ${t('port_leave')}`, on: { click: leave } }),
  ]);
  mount(root);
  saveGame();

  function buy(up) {
    if (state.resources.gold < UPGRADE_COST) { toastDanger(t('toast_not_enough_gold'), '💰'); return; }
    addGold(-UPGRADE_COST);
    applyUpgrade(state._yardShip, up);
    toastSuccess(t('toast_upgrade_done'), up.icon || '⚓');
    leave();
  }
}

function rollUpgrades(n) {
  return [...Object.values(DB.upgrades)].sort(() => Math.random() - 0.5).slice(0, n);
}

function leave() {
  state._yardOptions = null;
  state._yardShip = null;
  go('map');
}

register('shipyard', render);
