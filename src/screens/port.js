// Merchant Isle: repair, recruit ships, buy relics from a mysterious merchant.
import { el, mount, modal } from '../ui.js';
import { t, locName, locField } from '../i18n.js';
import { register, go } from '../nav.js';
import { DB } from '../data.js';
import { state, makeShip, addGold, addRelic, relicMods, saveGame } from '../state.js';
import { renderHud } from '../hud.js';
import { toastSuccess, toastDanger } from '../toast.js';
import { shipThumb } from '../sprites.js';
import { attachTooltip } from '../tooltip.js';

const MAX_FLEET = 5;

function render() {
  state.screen = 'port';
  const mods = relicMods();
  const repairCost = Math.round(60 * mods.repairCostMult);

  // Offers are rolled once per visit and cached on the node flow.
  if (!state._portOffers) state._portOffers = rollOffers();
  const offers = state._portOffers;

  const services = el('div', { class: 'port-services' }, [
    serviceCard('🔧', t('port_repair'), t('port_repair_desc'), `${repairCost} 💰`, () => {
      if (!spend(repairCost)) return;
      state.fleet.forEach((s) => { s.hp = s.maxHp; s.shield = s.maxShield; });
      toastSuccess(t('toast_repaired'), '🔧');
      render();
    }),
    recruitCard(offers.ship),
    relicCard(offers.relic),
  ]);

  const root = el('div', { class: 'screen port-screen' }, [
    renderHud(),
    el('div', { class: 'port-header' }, [
      el('h2', { text: `🏝️ ${t('port_title')}` }),
    ]),
    services,
    el('div', { class: 'port-fleet-preview' }, state.fleet.map((s) =>
      el('div', { class: 'mini-ship' }, [
        shipThumb({ type: s.def.type, color: s.color, facing: 1, spriteSpec: s.def.spriteSpec }, 64),
        el('div', { class: 'mini-name', text: (s.name || locName(s.def)) }),
        el('div', { class: 'mini-hp', text: `❤️ ${Math.round(s.hp)}/${s.maxHp}` }),
      ])
    )),
    el('button', { class: 'btn-level-1 leave-btn', text: `⛵ ${t('port_leave')}`, on: { click: leavePort } }),
  ]);
  mount(root);
  saveGame();
}

function leavePort() {
  state._portOffers = null;
  go('map');
}

function rollOffers() {
  const recruitable = ['sloop', 'galleon', 'frigate'];
  const shipId = recruitable[Math.floor(Math.random() * recruitable.length)];
  const relicIds = Object.keys(DB.relics).filter((id) => !state.relics.includes(id) && id !== 'kraken_relic');
  const relicId = relicIds[Math.floor(Math.random() * relicIds.length)] || null;
  const shipCosts = { sloop: 110, frigate: 150, galleon: 190 };
  const relicCosts = { rare: 175, uncommon: 125, cursed: 115, legendary: 300 };
  return {
    ship: { id: shipId, cost: shipCosts[shipId] || 120 },
    relic: relicId ? { id: relicId, cost: relicCosts[DB.relics[relicId].rarity] || 130 } : null,
  };
}

function spend(cost) {
  if (state.resources.gold < cost) { toastDanger(t('toast_not_enough_gold'), '💰'); return false; }
  addGold(-cost);
  return true;
}

function serviceCard(icon, title, desc, priceLabel, onBuy, disabled = false) {
  return el('div', { class: `service-card ${disabled ? 'disabled' : ''}` }, [
    el('div', { class: 'service-icon', text: icon }),
    el('div', { class: 'service-title', text: title }),
    el('div', { class: 'service-desc', text: desc }),
    el('button', { class: 'btn-level-3', text: `${t('buy')} · ${priceLabel}`, on: { click: () => { if (!disabled) onBuy(); } } }),
  ]);
}

function recruitCard(offer) {
  const def = DB.ships[offer.id];
  const full = state.fleet.length >= MAX_FLEET;
  const card = el('div', { class: `service-card recruit ${full ? 'disabled' : ''}` }, [
    shipThumb({ type: def.type, color: def.color, facing: 1, spriteSpec: def.spriteSpec }, 72),
    el('div', { class: 'service-title', text: `${t('port_recruit')}: ${locName(def)}` }),
    el('div', { class: 'service-desc', text: full ? t('full_fleet') : locField(def, 'desc') }),
    el('button', {
      class: 'btn-level-3', text: full ? t('fleet_full_short') : `${t('buy')} · ${offer.cost} 💰`,
      on: { click: () => {
        if (full) return;
        if (!spend(offer.cost)) return;
        state.fleet.push(makeShip(offer.id));
        toastSuccess(t('toast_new_ship'), '⚓');
        render();
      } },
    }),
  ]);
  attachTooltip(card, () => `<div class="tt-title">${locName(def)}</div><div class="tt-desc">${locField(def, 'desc')}</div>`);
  return card;
}

function relicCard(offer) {
  if (!offer) return el('div', { class: 'service-card disabled' }, [el('div', { class: 'service-title', text: t('port_buy_relic') })]);
  const rel = DB.relics[offer.id];
  const card = el('div', { class: `service-card relic rarity-${rel.rarity}` }, [
    el('div', { class: 'service-icon', text: rel.icon || '⭐' }),
    el('div', { class: 'service-title', text: `${t('port_buy_relic')}` }),
    el('div', { class: 'service-desc', text: locName(rel) }),
    el('button', { class: 'btn-level-3', text: `${t('buy')} · ${offer.cost} 💰`, on: { click: () => {
      if (!spend(offer.cost)) return;
      addRelic(offer.id);
      toastSuccess(t('toast_relic', { name: locName(rel) }), rel.icon || '⭐');
      state._portOffers.relic = null;
      render();
    } } }),
  ]);
  attachTooltip(card, () => `<div class="tt-title">${rel.icon || ''} ${locName(rel)}</div><div class="tt-desc">${locField(rel, 'desc')}</div>`);
  return card;
}

register('port', render);
