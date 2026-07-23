// Turn-based naval combat engine. Readable, deterministic damage; enemy
// intentions shown before the player acts (Into the Breach style).
import { el, mount, shipCard, bar } from './ui.js';
import { t, locName, locField } from './i18n.js';
import { register, go } from './nav.js';
import { DB } from './data.js';
import {
  state, relicMods, addGold, grantXp, discover, applyUpgrade, hasRelic,
} from './state.js';
import { renderHud } from './hud.js';
import { toast, toastSuccess, toastDanger, toastInfo } from './toast.js';
import { getAbility } from './abilities.js';
import { attachTooltip } from './tooltip.js';
import { modal } from './ui.js';
import { fxCannon, fxSplash, fxHeal, fxBrace, fxScreenShake } from './fx.js';

let C = null; // active combat controller

// ---- Enemy instance ----
let enemyIid = 1;
function makeEnemy(defId, { isBoss = false, scale = 1 } = {}) {
  const def = isBoss ? DB.bosses[defId] : DB.enemies[defId];
  const s = def.stats;
  return {
    iid: `e${enemyIid++}`,
    defId, def, isBoss,
    name: locName(def),
    maxHp: Math.round(s.hp * scale),
    hp: Math.round(s.hp * scale),
    armor: s.armor,
    maxShield: s.shield || 0,
    shield: s.shield || 0,
    damage: Math.round(s.damage * scale),
    accuracy: s.accuracy,
    speed: s.speed,
    baseSpeed: s.speed,
    evasion: s.evasion || 0,
    morale: s.morale || 50,
    effects: [],
    color: def.color || '#8a8f98',
    intent: null,
    phaseIdx: 0,
    multiAttack: 1,
    damageMult: 1,
    isEnemy: true,
  };
}

// ---- Enemy roster generation ----
function buildEnemies({ kind, danger = 1, bossId }) {
  if (kind === 'boss') {
    const boss = makeEnemy(bossId, { isBoss: true });
    discover('bosses', bossId);
    return [boss];
  }
  const smallPool = ['pirate_longboat', 'pirate_sloop', 'thief_brigantine', 'armed_merchant'];
  const list = [];
  const act = state.act;
  let n = kind === 'elite' ? 2 + (danger >= 2 ? 1 : 0) : 1 + Math.min(2, danger);
  n = Math.max(1, Math.min(4, n));
  for (let i = 0; i < n; i++) {
    let id;
    if (kind === 'elite' && i === 0) id = 'royal_frigate';
    else if (danger >= 2 && Math.random() < 0.35) id = 'royal_frigate';
    else id = smallPool[Math.floor(Math.random() * smallPool.length)];
    const scale = 1 + (act - 1) * 0.25 + (kind === 'elite' ? 0.15 : 0);
    list.push(makeEnemy(id, { scale }));
    discover('enemies', id);
  }
  return list;
}

// ---- Damage model ----
function isImmobile(ship) {
  return (ship.effects || []).some((e) => e.type === 'immobilized');
}

function computeHit(attacker, defender, { ignoreEvasionPct = 0, forceHit = false } = {}) {
  if (forceHit) return true;
  const ev = isImmobile(defender) ? 0 : (defender.evasion || 0) * (1 - ignoreEvasionPct);
  const chance = Math.max(0.1, Math.min(0.98, attacker.accuracy - ev));
  return Math.random() < chance;
}

function moraleFactor(ship) {
  return 0.9 + (ship.morale || 50) / 500; // 50 morale => 1.0
}

// Temporary armor from a brace/reinforce effect, on top of base armor.
function effectiveArmor(ship) {
  const braced = (ship.effects || []).find((e) => e.type === 'braced');
  return ship.armor + (braced ? (braced.armor || 0) : 0);
}

// Apply damage to a defender. Returns { hullDamage, absorbed, killed }.
function dealDamage(attacker, defender, raw) {
  let dmg = Math.max(0, raw);
  let absorbed = 0;
  if (defender.shield > 0) {
    absorbed = Math.min(defender.shield, dmg);
    defender.shield -= absorbed;
    dmg -= absorbed;
  }
  let hullDamage = 0;
  if (dmg > 0) {
    hullDamage = Math.max(1, Math.round(dmg - effectiveArmor(defender)));
    defender.hp -= hullDamage;
  }
  return { hullDamage, absorbed, killed: defender.hp <= 0 };
}

function addEffect(ship, effect) {
  const existing = (ship.effects || []).find((e) => e.type === effect.type);
  if (existing) {
    existing.turns = Math.max(existing.turns, effect.turns);
    if (effect.amount) existing.amount = Math.max(existing.amount || 0, effect.amount);
  } else {
    ship.effects.push({ ...effect });
  }
}

// Perform an attack from attacker on target with a given ammo id.
function attack(attacker, target, ammoId, { damageMult = 1, ignoreEvasionPct = 0, splashList = null } = {}) {
  const ammo = DB.ammo[ammoId] || DB.ammo.classic;
  const mods = relicMods();
  const hit = computeHit(attacker, target, { ignoreEvasionPct });
  const log = { attacker: attacker.name || locName(attacker.def), target: target.name || locName(target.def), hit };
  if (!hit) {
    C.log(`${log.attacker} → ${log.target}: ${t('intent')} ✗`);
    flashCard(target, 'miss');
    fxCannon(attacker.iid, target.iid, { ammo: ammoId, hit: false });
    return log;
  }
  const fleetMult = attacker.isEnemy ? 1 : mods.fleetDamageMult;
  const raw = attacker.damage * (ammo.damageMult || 1) * damageMult * fleetMult * moraleFactor(attacker) * (attacker.damageMult || 1);
  const res = dealDamage(attacker, target, raw);
  flashCard(target, 'hit');
  fxCannon(attacker.iid, target.iid, {
    ammo: ammoId, hit: true, damage: res.hullDamage, absorbed: res.absorbed, killed: target.hp <= 0,
  });

  // Ammo side-effects.
  if (ammo.applyFire) addEffect(target, { type: 'fire', amount: ammo.applyFire.amount, turns: ammo.applyFire.turns });
  if (ammo.applySlow) addEffect(target, { type: 'slow', amount: ammo.applySlow.amount, turns: ammo.applySlow.turns });
  if (ammo.applyImmobilize) addEffect(target, { type: 'immobilized', turns: ammo.applyImmobilize.turns });
  // Infernal Shot relic: classic ammo also burns.
  if (ammoId === 'classic' && !attacker.isEnemy && mods.classicAppliesFire) {
    addEffect(target, { type: 'fire', amount: 8, turns: 2 });
  }

  C.log(`${log.attacker} → ${log.target}: −${res.hullDamage} ${t('stat_hp')}${res.absorbed ? ` (−${res.absorbed} 🔰)` : ''}`);

  // Explosive splash to neighbors.
  if (ammo.splash && splashList) {
    for (const nb of splashList) {
      if (nb === target || nb.hp <= 0) continue;
      const sres = dealDamage(attacker, nb, raw * ammo.splash);
      flashCard(nb, 'hit');
      C.log(`  ↳ ${nb.name || locName(nb.def)}: −${sres.hullDamage}`);
      checkDeath(nb);
      fxSplash(nb.iid, sres.hullDamage, nb.hp <= 0);
    }
  }

  checkDeath(target);
  return log;
}

function checkDeath(ship) {
  if (ship.hp <= 0 && !ship._dead) {
    ship._dead = true;
    ship.hp = 0;
    if (ship.isEnemy) {
      state.stats.shipsSunk++;
    } else {
      toastDanger(t('toast_ship_lost', { name: ship.name || locName(ship.def) }), '☠️');
    }
  }
}

// ---- Status effect ticks (start of a ship's turn) ----
function tickStartOfTurn(ship) {
  for (const e of [...(ship.effects || [])]) {
    if (e.type === 'fire') {
      ship.hp -= e.amount || 0;
      C.log(`🔥 ${ship.name || locName(ship.def)}: −${e.amount}`);
      if (ship.isEnemy) {} else toastDanger(t('toast_fire'), '🔥');
      checkDeath(ship);
    }
  }
}

function tickEndOfRound(ship) {
  // Slow: reduce effective speed while active (recomputed each round from base).
  ship.speed = ship.baseSpeed;
  for (const e of [...(ship.effects || [])]) {
    if (e.type === 'slow') ship.speed = Math.max(1, ship.baseSpeed - (e.amount || 0));
    e.turns -= 1;
  }
  ship.effects = (ship.effects || []).filter((e) => e.turns > 0 || e.type === 'braced');
  // Braced only lasts one round.
  ship.effects = ship.effects.filter((e) => !(e.type === 'braced'));
}

// ---- Controller ----
function initCombat(opts) {
  const allies = state.fleet.filter((s) => s.hp > 0);
  allies.forEach((s) => {
    s.effects = [];
    s.shield = s.maxShield;
    s.abilityCd = 0;
    s.speed = s.baseSpeed;
    s._dead = false;
    s.krakenUsed = false;
  });
  const enemies = buildEnemies(opts);
  enemies.forEach((e) => { e._dead = false; });

  C = {
    opts,
    allies,
    enemies,
    round: 0,
    order: [],
    idx: -1,
    active: null,
    phase: 'idle',
    logs: [],
    selectedAmmo: 'classic',
    log(msg) { this.logs.push(msg); if (this.logs.length > 40) this.logs.shift(); },
    livingAllies() { return this.allies.filter((s) => s.hp > 0); },
    livingEnemies() { return this.enemies.filter((s) => s.hp > 0); },
    all() { return [...this.allies, ...this.enemies]; },
    byIid(iid) { return this.all().find((s) => s.iid === iid); },
  };
  startRound();
}

function startRound() {
  C.round++;
  // Reset per-round speed (slow reapplied), decide enemy intents.
  C.enemies.filter((e) => e.hp > 0).forEach(decideIntent);
  // Turn order by current speed, ties broken by allies first.
  const actors = C.all().filter((s) => s.hp > 0);
  actors.sort((a, b) => (b.speed - a.speed) || ((a.isEnemy ? 1 : 0) - (b.isEnemy ? 1 : 0)));
  C.order = actors.map((s) => s.iid);
  C.idx = -1;
  render();
  setTimeout(advance, 500);
}

function advance() {
  if (C.phase === 'done' || C._ended) return;
  if (checkEnd()) return;
  C.idx++;
  if (C.idx >= C.order.length) {
    endRound();
    return;
  }
  const actor = C.byIid(C.order[C.idx]);
  if (!actor || actor.hp <= 0) return advance();

  C.active = actor;
  tickStartOfTurn(actor);
  if (actor.hp <= 0) { render(); return setTimeout(advance, 350); }

  if (isImmobile(actor)) {
    C.log(`${actor.name || locName(actor.def)}: ${t('eff_immobilized')}`);
    render();
    return setTimeout(advance, 500);
  }

  if (actor.isEnemy) {
    C.phase = 'enemy';
    render();
    setTimeout(() => executeEnemy(actor), 650);
  } else {
    C.phase = 'player';
    render();
  }
}

function endRound() {
  C.all().forEach(tickEndOfRound);
  C.allies.forEach((s) => { if (s.abilityCd > 0) s.abilityCd--; });
  if (checkEnd()) return;
  startRound();
}

function checkEnd() {
  if (C.livingEnemies().length === 0) { win(); return true; }
  if (C.livingAllies().length === 0) { lose(); return true; }
  return false;
}

// ---- Enemy AI ----
function decideIntent(enemy) {
  // Boss phase transitions.
  if (enemy.isBoss && enemy.def.phases) {
    const ratio = enemy.hp / enemy.maxHp;
    for (let i = enemy.phaseIdx + 1; i < enemy.def.phases.length; i++) {
      const ph = enemy.def.phases[i];
      if (ratio <= ph.at) {
        enemy.phaseIdx = i;
        if (ph.onEnter) {
          if (ph.onEnter.multiAttack) enemy.multiAttack = ph.onEnter.multiAttack;
          if (ph.onEnter.damageMult) enemy.damageMult = ph.onEnter.damageMult;
        }
        toastInfo(locField(ph, 'name'), '👑');
        C.log(`👑 ${locField(ph, 'name')}`);
        fxScreenShake(16, 0.6);
      }
    }
  }

  const ai = enemy.def.ai || { style: 'aggressive', priority: 'attack_player' };
  const allies = C.livingAllies();
  if (allies.length === 0) { enemy.intent = null; return; }

  // Defensive enemies sometimes brace.
  if (ai.style === 'defensive' && Math.random() < 0.4) {
    enemy.intent = { type: 'defend' };
    return;
  }

  let target;
  switch (ai.priority) {
    case 'attack_flagship':
      target = allies.find((a) => a.flagship) || allies[0];
      break;
    case 'attack_weakest':
      target = [...allies].sort((a, b) => a.hp - b.hp)[0];
      break;
    case 'steal':
      target = allies[Math.floor(Math.random() * allies.length)];
      break;
    default:
      target = allies.find((a) => a.flagship) || allies[Math.floor(Math.random() * allies.length)];
  }
  const hits = enemy.multiAttack || 1;
  const est = Math.round(enemy.damage * moraleFactor(enemy) * (enemy.damageMult || 1)) * hits;
  enemy.intent = { type: ai.style === 'harasser' || ai.priority === 'steal' ? 'steal' : 'attack', target: target.iid, dmg: est, hits };
}

function executeEnemy(enemy) {
  const intent = enemy.intent;
  if (!intent) return setTimeout(advance, 300);
  if (intent.type === 'defend') {
    enemy.shield = enemy.maxShield;
    addEffect(enemy, { type: 'braced', turns: 1, armor: 10 });
    fxBrace(enemy.iid);
    C.log(`${enemy.name}: ${t('intent_defend')}`);
    render();
    return setTimeout(advance, 600);
  }
  let target = C.byIid(intent.target);
  if (!target || target.hp <= 0) target = C.livingAllies()[0];
  if (!target) return setTimeout(advance, 300);

  const hits = intent.hits || 1;
  for (let i = 0; i < hits; i++) {
    if (target.hp <= 0) target = C.livingAllies()[0];
    if (!target) break;
    attack(enemy, target, 'classic', { damageMult: enemy.damageMult || 1 });
    if (intent.type === 'steal' && target && Math.random() < 0.7) {
      const stolen = Math.min(state.resources.gold, 8 + Math.floor(Math.random() * 10));
      if (stolen > 0) { addGold(-stolen); toastDanger(t('toast_gold_loss', { n: stolen }), '💰'); }
    }
  }
  render();
  setTimeout(advance, 820);
}

// ---- Player actions ----
function neighborsOf(ship, arr) {
  const i = arr.indexOf(ship);
  return [arr[i - 1], arr[i + 1]].filter(Boolean);
}

function playerAttack(target) {
  const ammoId = C.selectedAmmo;
  const splashList = neighborsOf(target, C.enemies);
  attack(C.active, target, ammoId, { splashList });
  finishPlayerAction();
}

function playerAbility(target) {
  const ship = C.active;
  const ab = getActiveAbilityId(ship);
  switch (ab) {
    case 'swift_strike':
      attack(ship, target, 'classic', { ignoreEvasionPct: 0.5 });
      break;
    case 'broadside':
      attack(ship, target, 'classic', { damageMult: 1.5, splashList: neighborsOf(target, C.enemies) });
      break;
    case 'reinforce':
      ship.shield = ship.maxShield;
      addEffect(ship, { type: 'braced', turns: 1, armor: 20 });
      C.log(`${ship.name || locName(ship.def)}: ${t('ability_reinforce')}`);
      fxBrace(ship.iid);
      break;
    case 'kraken_shot':
      attack(ship, target, 'classic', { damageMult: 2.0 });
      ship.krakenUsed = true;
      break;
    default:
      break;
  }
  ship.abilityCd = (getAbility(ab)?.cooldown) || 2;
  toastSuccess(`⭐ ${t(getAbility(ab)?.nameKey || 'action_ability')}`, '⭐');
  finishPlayerAction();
}

function getActiveAbilityId(ship) {
  return ship._pendingAbility || ship.ability;
}

function abilityNeedsTarget(abId) {
  return abId === 'swift_strike' || abId === 'broadside' || abId === 'kraken_shot';
}

function playerRepair() {
  const ship = C.active;
  const mods = relicMods();
  const heal = Math.round(30 * mods.repairMult);
  ship.hp = Math.min(ship.maxHp, ship.hp + heal);
  C.log(`🔧 ${ship.name || locName(ship.def)}: +${heal} ${t('stat_hp')}`);
  toastSuccess(`+${heal} ${t('stat_hp')}`, '🔧');
  fxHeal(ship.iid);
  finishPlayerAction();
}

function playerDefend() {
  const ship = C.active;
  ship.shield = ship.maxShield;
  addEffect(ship, { type: 'braced', turns: 1, armor: 8 });
  C.log(`🛡️ ${ship.name || locName(ship.def)}: ${t('action_defend')}`);
  fxBrace(ship.iid);
  finishPlayerAction();
}

function finishPlayerAction() {
  C.active._pendingAbility = null;
  C.targeting = null;
  render();
  setTimeout(advance, 650);
}

function tryFlee() {
  if (C.opts.kind === 'boss') return;
  toastInfo(t('flee'), '🏴');
  go('map');
}

// ---- Rendering ----
function render() {
  const enemyRow = el('div', { class: 'combat-row enemy-row' });
  C.enemies.forEach((e) => {
    const intentNode = e.hp > 0 ? intentBadge(e) : null;
    const card = shipCard(e, {
      isEnemy: true,
      combat: true,
      showIntent: intentNode,
      selectable: C.targeting === 'enemy' && e.hp > 0,
      onClick: C.targeting === 'enemy' ? (ship) => onTargetPicked(ship) : null,
    });
    if (C.active === e) card.classList.add('active-turn');
    enemyRow.appendChild(card);
  });

  const allyRow = el('div', { class: 'combat-row ally-row' });
  C.allies.forEach((s) => {
    const card = shipCard(s, {
      isEnemy: false,
      combat: true,
      selectable: C.targeting === 'ally' && s.hp > 0,
      onClick: C.targeting === 'ally' ? (ship) => onTargetPicked(ship) : null,
    });
    if (C.active === s) card.classList.add('active-turn');
    allyRow.appendChild(card);
  });

  const banner = el('div', { class: 'turn-banner' }, [
    el('span', { class: 'turn-count', text: `${t('turn')} ${C.round}` }),
    el('span', { class: `turn-phase ${C.phase}`, text: C.phase === 'player' ? t('your_turn') : t('enemy_turn') }),
  ]);

  const logBox = el('div', { class: 'combat-log' },
    C.logs.slice(-6).map((l) => el('div', { class: 'log-line', text: l })));

  const root = el('div', { class: 'screen combat-screen' }, [
    renderHud(),
    el('div', { class: 'combat-arena' }, [
      el('div', { class: 'row-label', text: t('enemies') }),
      enemyRow,
      banner,
      el('div', { class: 'row-label', text: t('your_fleet') }),
      allyRow,
    ]),
    logBox,
    renderActionPanel(),
  ]);
  mount(root);
}

function intentBadge(enemy) {
  const it = enemy.intent;
  if (!it) return el('div', { class: 'intent', text: t('waiting') });
  let icon = '⚔️', label = t('intent_attack');
  if (it.type === 'defend') { icon = '🛡️'; label = t('intent_defend'); }
  else if (it.type === 'steal') { icon = '💰'; label = t('intent_steal'); }
  const node = el('div', { class: `intent intent-${it.type}` }, [
    el('span', { class: 'intent-icon', text: icon }),
    it.dmg && it.type !== 'defend' ? el('span', { class: 'intent-dmg', text: `${it.dmg}${it.hits > 1 ? '×' : ''}` }) : null,
  ]);
  attachTooltip(node, () => `<b>${label}</b>${it.dmg && it.type !== 'defend' ? `<br>~${it.dmg} ${t('stat_hp')}` : ''}`);
  return node;
}

function renderActionPanel() {
  const panel = el('div', { class: 'action-panel' });
  if (C.phase !== 'player' || !C.active || C.active.isEnemy) {
    panel.appendChild(el('div', { class: 'action-hint', text: C.phase === 'player' ? '' : t('enemy_turn') }));
    return panel;
  }
  const ship = C.active;

  if (C.targeting) {
    panel.appendChild(el('div', { class: 'action-hint big', text: t('select_target') }));
    panel.appendChild(el('button', { class: 'btn btn-ghost', text: t('no'), on: { click: () => { C.targeting = null; ship._pendingAbility = null; render(); } } }));
    return panel;
  }

  panel.appendChild(el('div', { class: 'active-ship-label', text: `${ship.name || locName(ship.def)} — ${t('select_action')}` }));

  const actions = el('div', { class: 'action-buttons' });

  // Ammo selector.
  const ammoWrap = el('div', { class: 'ammo-selector' });
  ammoWrap.appendChild(el('span', { class: 'ammo-label', text: `${t('action_ammo')}:` }));
  for (const id of ['classic', 'explosive', 'incendiary', 'chain', 'harpoon']) {
    const a = DB.ammo[id];
    const b = el('button', {
      class: `ammo-btn ${C.selectedAmmo === id ? 'active' : ''}`,
      text: a.icon,
      on: { click: () => { C.selectedAmmo = id; render(); } },
    });
    attachTooltip(b, () => `<b>${locName(a)}</b><br>${locField(a, 'desc')}`);
    ammoWrap.appendChild(b);
  }

  actions.appendChild(actionBtn('⚔️', t('action_attack'), () => beginTargeting('attack')));

  // Ability button(s).
  const ab = getAbility(ship.ability);
  if (ab) {
    const ready = ship.abilityCd <= 0;
    const b = actionBtn(ab.icon, t(ab.nameKey), () => useAbility(ship.ability), !ready);
    if (!ready) b.appendChild(el('span', { class: 'cd-badge', text: ship.abilityCd }));
    attachTooltip(b, () => `<b>${t(ab.nameKey)}</b><br>${t(ab.descKey)}<br><i>${t('cooldown')}: ${ab.cooldown}</i>`);
    actions.appendChild(b);
  }
  // Kraken relic grants the flagship a once-per-battle ability.
  if (ship.flagship && hasRelic('kraken_relic') && !ship.krakenUsed) {
    const kb = getAbility('kraken_shot');
    const b = actionBtn(kb.icon, t(kb.nameKey), () => useAbility('kraken_shot'));
    attachTooltip(b, () => `<b>${t(kb.nameKey)}</b><br>${t(kb.descKey)}`);
    actions.appendChild(b);
  }

  actions.appendChild(actionBtn('🔧', t('action_repair'), playerRepair));
  actions.appendChild(actionBtn('🛡️', t('action_defend'), playerDefend));
  actions.appendChild(actionBtn('⏭️', t('end_turn'), finishPlayerAction));
  if (C.opts.kind !== 'boss') actions.appendChild(actionBtn('🏴', t('flee'), tryFlee));

  panel.appendChild(ammoWrap);
  panel.appendChild(actions);
  return panel;
}

function actionBtn(icon, label, onClick, disabled = false) {
  const b = el('button', { class: `btn action-btn ${disabled ? 'disabled' : ''}`, on: { click: () => { if (!disabled) onClick(); } } }, [
    el('span', { class: 'ab-icon', text: icon }),
    el('span', { class: 'ab-label', text: label }),
  ]);
  if (disabled) b.disabled = true;
  return b;
}

function beginTargeting(mode) {
  C.targetingMode = mode;
  C.targeting = 'enemy';
  render();
}

function useAbility(abId) {
  const ship = C.active;
  ship._pendingAbility = abId;
  if (abilityNeedsTarget(abId)) {
    C.targetingMode = 'ability';
    C.targeting = 'enemy';
    render();
  } else {
    playerAbility(null);
  }
}

function onTargetPicked(ship) {
  const mode = C.targetingMode;
  C.targeting = null;
  if (mode === 'ability') playerAbility(ship);
  else playerAttack(ship);
}

function flashCard(ship, kind) {
  // Visual flash handled on next render via transient class; keep it lightweight.
  ship._flash = kind;
  setTimeout(() => { if (ship) ship._flash = null; }, 300);
}

// ---- Resolution ----
function win() {
  if (C._ended) return;
  C._ended = true;
  C.phase = 'done';
  state.stats.battlesWon++;
  const mods = relicMods();
  let gold = 0, xp = 0, rareMats = 0;
  for (const e of C.enemies) {
    const rw = e.def.reward || {};
    gold += rw.gold || 0;
    xp += rw.xp || 0;
    rareMats += rw.rareMaterials || 0;
  }
  gold = Math.round(gold * mods.goldMult);
  addGold(gold);
  if (rareMats) state.resources.rareMaterials += rareMats;

  // Boss relic.
  let relicGained = null;
  const boss = C.enemies.find((e) => e.isBoss);
  if (boss && boss.def.reward && boss.def.reward.relic) relicGained = boss.def.reward.relic;

  // XP + level-ups.
  const leveled = [];
  for (const s of C.livingAllies()) {
    if (grantXp(s, xp)) leveled.push(s);
  }

  showVictory({ gold, rareMats, relicGained, leveled, isBoss: !!boss });
}

function lose() {
  if (C._ended) return;
  C._ended = true;
  C.phase = 'done';
  showDefeat();
}

// ---- Victory / defeat screens ----
function showVictory({ gold, rareMats, relicGained, leveled, isBoss }) {
  const items = el('div', { class: 'reward-list' });
  if (gold) items.appendChild(el('div', { class: 'reward-item', html: `💰 <b>+${gold}</b> ${t('gold')}` }));
  if (rareMats) items.appendChild(el('div', { class: 'reward-item', html: `⭐ <b>+${rareMats}</b> ${t('rare_materials')}` }));

  const proceed = () => {
    // Chain: relic pick -> level-up choices -> map/win.
    if (relicGained) {
      import('./state.js').then((m) => {
        m.addRelic(relicGained);
        const rel = DB.relics[relicGained];
        toastSuccess(t('toast_relic', { name: locName(rel) }), rel.icon || '⭐');
      });
    }
    runLevelUps([...leveled], () => {
      if (isBoss) showRunComplete();
      else go('map');
    });
  };

  const box = el('div', { class: 'result-box victory' }, [
    el('h1', { class: 'result-title', text: t('victory') }),
    el('div', { class: 'result-sub', text: t('victory_rewards') }),
    items,
    relicGained ? el('div', { class: 'reward-relic', html: `${DB.relics[relicGained].icon || '⭐'} <b>${locName(DB.relics[relicGained])}</b>` }) : null,
    el('button', { class: 'btn btn-big', text: t('continue_btn'), on: { click: () => { m1.close(); proceed(); } } }),
  ]);
  const m1 = modal(box, { closable: false, cls: 'result-overlay' });
}

// Present level-up upgrade choices sequentially, then callback.
function runLevelUps(queue, done) {
  if (queue.length === 0) return done();
  const ship = queue.shift();
  toastSuccess(t('toast_ship_leveled', { name: ship.name || locName(ship.def), n: ship.level }), '⬆️');
  const options = pickUpgrades(3);
  const optsWrap = el('div', { class: 'upgrade-options' });
  const { close } = modal(el('div', { class: 'result-box levelup' }, [
    el('h2', { text: `${t('level_up')} — ${ship.name || locName(ship.def)}` }),
    el('div', { class: 'result-sub', text: t('reward_choose_upgrade') }),
    optsWrap,
  ]), { closable: false, cls: 'result-overlay' });

  options.forEach((up) => {
    const card = el('button', { class: 'upgrade-card', on: { click: () => {
      applyUpgrade(ship, up);
      toastSuccess(t('toast_upgrade_done'), up.icon || '⚓');
      close();
      runLevelUps(queue, done);
    } } }, [
      el('div', { class: 'up-icon', text: up.icon || '⚓' }),
      el('div', { class: 'up-name', text: locName(up) }),
      el('div', { class: 'up-desc', text: locField(up, 'desc') }),
    ]);
    optsWrap.appendChild(card);
  });
}

function pickUpgrades(n) {
  const all = Object.values(DB.upgrades);
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function showDefeat() {
  const box = el('div', { class: 'result-box defeat' }, [
    el('h1', { class: 'result-title', text: t('defeat') }),
    el('div', { class: 'result-sub', text: t('defeat_text') }),
    el('div', { class: 'result-stats', html: `⚔️ ${state.stats.battlesWon} · ☠️ ${state.stats.shipsSunk} · 💰 ${state.stats.goldEarned}` }),
    el('button', { class: 'btn btn-big', text: t('return_title'), on: { click: () => { m.close(); endRunToTitle(false); } } }),
  ]);
  const m = modal(box, { closable: false, cls: 'result-overlay' });
}

function showRunComplete() {
  const box = el('div', { class: 'result-box complete' }, [
    el('h1', { class: 'result-title', text: t('run_complete') }),
    el('div', { class: 'result-sub', text: t('run_complete_text') }),
    el('div', { class: 'result-stats', html: `⚔️ ${state.stats.battlesWon} · ☠️ ${state.stats.shipsSunk} · 💰 ${state.stats.goldEarned}` }),
    el('button', { class: 'btn btn-big', text: t('return_title'), on: { click: () => { m.close(); endRunToTitle(true); } } }),
  ]);
  const m = modal(box, { closable: false, cls: 'result-overlay' });
}

function endRunToTitle(victory) {
  import('./state.js').then((m) => {
    if (victory) {
      const meta = m.loadMeta();
      meta.runsCompleted++;
      meta.bossesKilled++;
      m.saveMeta(meta);
    }
    m.clearSave();
    state.inRun = false;
    state.map = null;
    go('title');
  });
}

function render0(opts) {
  initCombat(opts);
}

register('combat', render0);

// ---- Debug hooks ----
export function getCombat() { return C; }
export function debugWinCombat() {
  if (!C || C.phase === 'done') return;
  C.enemies.forEach((e) => { e.hp = 0; e._dead = true; });
  win();
}
export function debugHealFleet() {
  if (!C) return;
  C.allies.forEach((s) => { s.hp = s.maxHp; s.shield = s.maxShield; });
  render();
}
export function debugSpawn(id, isBoss = false) {
  if (!C) return;
  const e = makeEnemy(id, { isBoss });
  e._dead = false;
  C.enemies.push(e);
  discover(isBoss ? 'bosses' : 'enemies', id);
  render();
}

export { attack, dealDamage, computeHit, makeEnemy };
