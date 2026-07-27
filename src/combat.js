// Turn-based naval combat engine. Readable, deterministic damage; enemy
// intentions shown before the player acts (Into the Breach style).
import { el, mount, shipCard, bar, effectChips } from './ui.js';
import { shipThumb, HULL_CLASSES } from './sprites.js';
import { t, locName, locField } from './i18n.js';
import { register, go } from './nav.js';
import { DB } from './data.js';
import {
  state, relicMods, addGold, grantXp, discover, applyUpgrade, hasRelic, buildSpriteSpec,
} from './state.js';
import { renderHud } from './hud.js';
import { toast, toastSuccess, toastDanger, toastInfo } from './toast.js';
import { getAbility } from './abilities.js';
import { attachTooltip } from './tooltip.js';
import { modal } from './ui.js';
import { fxCannon, fxSplash, fxHeal, fxBrace, fxImpactBump } from './fx.js';
import { randomOceanScene } from './ocean.js';

let C = null; // active combat controller

// ---- Enemy instance ----
let enemyIid = 1;

// Random-but-plausible hull for an enemy's tier — small ships get a single
// mast (class 5-6), medium ships get two (class 3-4). Bosses/monsters never
// go through here (they keep their hand-drawn 'monster' template).
function enemyHullSpec(def) {
  const hullClass = def.tier === 'medium' ? 3 + Math.floor(Math.random() * 2) : 5 + Math.floor(Math.random() * 2);
  const c = HULL_CLASSES[hullClass];
  return {
    hullClass,
    hullShape: 'auto',
    sailsPerMast: 1 + Math.floor(Math.random() * c.sailsMax),
    jibs: Math.floor(Math.random() * (c.jibsMax + 1)),
    wear: Math.random() < 0.3 ? 1 : 0,
  };
}

// An enemy's visual identity is its own lore faction (def.faction) — unless
// that happens to be the player's own chosen faction, in which case another
// faction is picked so the two sides never look alike in combat.
function enemyFactionId(def) {
  let fid = def.faction;
  if (!DB.factions[fid] || fid === state.run.faction) {
    const pool = Object.keys(DB.factions).filter((id) => id !== state.run.faction);
    fid = pool[Math.floor(Math.random() * pool.length)] || fid;
  }
  return fid;
}

function makeEnemy(defId, { isBoss = false, scale = 1 } = {}) {
  const def = isBoss ? DB.bosses[defId] : DB.enemies[defId];
  const s = def.stats;
  const inst = {
    iid: `e${enemyIid++}`,
    defId, def, isBoss,
    name: locName(def),
    maxHp: Math.round(s.hp * scale),
    hp: Math.round(s.hp * scale),
    shownHp: Math.round(s.hp * scale),
    armor: s.armor,
    maxShield: s.shield || 0,
    shield: s.shield || 0,
    shownShield: s.shield || 0,
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
  if (!isBoss && def.type !== 'naval_monster') {
    const seed = (Math.random() * 1e9) | 0;
    inst.spriteSpec = buildSpriteSpec(enemyHullSpec(def), enemyFactionId(def), seed);
  }
  return inst;
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
// Everything is integer-rounded so no fractional values ever reach the UI.
function dealDamage(attacker, defender, raw) {
  let dmg = Math.max(0, Math.round(raw));
  let absorbed = 0;
  if (defender.shield > 0) {
    absorbed = Math.min(defender.shield, dmg);
    defender.shield = Math.max(0, defender.shield - absorbed);
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

  // Ammo side-effects.
  if (ammo.applyFire) addEffect(target, { type: 'fire', amount: ammo.applyFire.amount, turns: ammo.applyFire.turns });
  if (ammo.applySlow) addEffect(target, { type: 'slow', amount: ammo.applySlow.amount, turns: ammo.applySlow.turns });
  if (ammo.applyImmobilize) addEffect(target, { type: 'immobilized', turns: ammo.applyImmobilize.turns });
  // Infernal Shot relic: classic ammo also burns.
  if (ammoId === 'classic' && !attacker.isEnemy && mods.classicAppliesFire) {
    addEffect(target, { type: 'fire', amount: 8, turns: 2 });
  }

  C.log(`${log.attacker} → ${log.target}: −${res.hullDamage} ${t('stat_hp')}${res.absorbed ? ` (−${res.absorbed} 🔰)` : ''}`);

  // Explosive splash to neighbors — damage applied now, shown/animated on impact.
  const splashHits = [];
  if (ammo.splash && splashList) {
    for (const nb of splashList) {
      if (nb === target || nb.hp <= 0) continue;
      const sres = dealDamage(attacker, nb, raw * ammo.splash);
      C.log(`  ↳ ${nb.name || locName(nb.def)}: −${sres.hullDamage}`);
      checkDeath(nb);
      splashHits.push({ nb, dmg: sres.hullDamage });
    }
  }

  checkDeath(target);

  // The HP/shield bars drop when the cannonball lands (onHit), not when fired.
  fxCannon(attacker.iid, target.iid, {
    ammo: ammoId, hit: true, damage: res.hullDamage, absorbed: res.absorbed, killed: target.hp <= 0,
    onHit: () => {
      syncShown(target);
      for (const { nb, dmg } of splashHits) { fxSplash(nb.iid, dmg, nb.hp <= 0); syncShown(nb); }
    },
  });
  return log;
}

// The bars render from shownHp/shownShield, which lag behind the real values
// until the shot visually lands (see syncShown). This keeps the HP bar from
// dropping before the cannonball arrives.
function commitShown(ship) {
  ship.shownHp = ship.hp;
  ship.shownShield = ship.shield;
}

// Called at projectile impact: commit the shown values and animate the bar
// of that ship in place (so it slides down exactly when the hit connects).
function syncShown(ship) {
  commitShown(ship);
  const card = document.querySelector(`.ship-card[data-iid="${CSS.escape(String(ship.iid))}"]`);
  if (!card) return;
  const setBar = (sel, cur, max) => {
    const b = card.querySelector(sel);
    if (!b) return;
    const fill = b.querySelector('.bar-fill');
    const num = b.querySelector('.bar-num');
    const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
    if (fill) fill.style.width = `${pct}%`;
    if (num) num.textContent = `${Math.max(0, Math.round(cur))} / ${Math.round(max)}`;
  };
  setBar('.bar-hp', ship.shownHp, ship.maxHp);
  if (ship.maxShield > 0) setBar('.bar-shield', ship.shownShield, ship.maxShield);
  if (ship.shownHp <= 0) card.classList.add('dead');
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
      commitShown(ship);
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
  state.screen = 'combat';
  randomOceanScene(); // fresh weather + decor for this battle
  const allies = state.fleet.filter((s) => s.hp > 0);
  allies.forEach((s) => {
    s.effects = [];
    s.shield = s.maxShield;
    s.shownShield = s.maxShield;
    s.shownHp = s.hp;
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
    menuOpen: false,
    log(msg) { this.logs.push(msg); if (this.logs.length > 40) this.logs.shift(); },
    livingAllies() { return this.allies.filter((s) => s.hp > 0); },
    livingEnemies() { return this.enemies.filter((s) => s.hp > 0); },
    all() { return [...this.allies, ...this.enemies]; },
    byIid(iid) { return this.all().find((s) => s.iid === iid); },
  };
  startRound();
}

// Round structure: PLAYER PHASE first — the player activates each of their
// ships once, in whatever order they choose — then the ENEMY PHASE.
function startRound() {
  C.round++;
  // Fire damage ticks once at the start of the round.
  C.all().filter((s) => s.hp > 0).forEach(tickStartOfTurn);
  if (checkEnd()) return;
  // Enemies reveal their intentions for the coming round.
  C.enemies.filter((e) => e.hp > 0).forEach(decideIntent);
  // Reset who has acted; immobilized allies auto-skip their action.
  C.allies.forEach((s) => { s.acted = s.hp <= 0; });
  C.livingAllies().forEach((s) => {
    if (isImmobile(s)) { s.acted = true; C.log(`${s.name || locName(s.def)}: ${t('eff_immobilized')}`); }
  });
  C.phase = 'player';
  C.active = null;
  C.menuOpen = false;
  render();
  if (allAlliesActed()) setTimeout(beginEnemyPhase, 400);
}

function allAlliesActed() {
  return C.livingAllies().every((s) => s.acted);
}

// Player clicks one of their un-acted ships to make it act.
function selectAlly(ship) {
  if (C.phase !== 'player' || C.targeting) return;
  if (!ship || ship.hp <= 0 || ship.acted) return;
  C.active = ship;
  C.menuOpen = true;
  render();
}

function beginEnemyPhase() {
  if (C.phase === 'done' || C._ended) return;
  if (checkEnd()) return;
  C.phase = 'enemy';
  C.active = null;
  C.menuOpen = false;
  C.targeting = null;
  C._enemyQueue = C.livingEnemies().sort((a, b) => b.speed - a.speed).map((e) => e.iid);
  render();
  setTimeout(nextEnemy, 500);
}

function nextEnemy() {
  if (C.phase === 'done' || C._ended || checkEnd()) return;
  const iid = C._enemyQueue.shift();
  if (iid === undefined) { endRound(); return; }
  const enemy = C.byIid(iid);
  if (!enemy || enemy.hp <= 0) return nextEnemy();
  C.active = enemy;
  if (isImmobile(enemy)) {
    C.log(`${enemy.name}: ${t('eff_immobilized')}`);
    render();
    return setTimeout(nextEnemy, 450);
  }
  render();
  setTimeout(() => executeEnemy(enemy), 500);
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
        fxImpactBump(enemy.iid);
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
  if (!intent) return setTimeout(nextEnemy, 300);
  if (intent.type === 'defend') {
    enemy.shield = enemy.maxShield;
    commitShown(enemy);
    addEffect(enemy, { type: 'braced', turns: 1, armor: 10 });
    fxBrace(enemy.iid);
    C.log(`${enemy.name}: ${t('intent_defend')}`);
    render();
    return setTimeout(nextEnemy, 600);
  }
  let target = C.byIid(intent.target);
  if (!target || target.hp <= 0) target = C.livingAllies()[0];
  if (!target) return setTimeout(nextEnemy, 300);

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
  setTimeout(nextEnemy, 820);
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
      commitShown(ship);
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
  commitShown(ship);
  C.log(`🔧 ${ship.name || locName(ship.def)}: +${heal} ${t('stat_hp')}`);
  toastSuccess(`+${heal} ${t('stat_hp')}`, '🔧');
  fxHeal(ship.iid);
  finishPlayerAction();
}

function playerDefend() {
  const ship = C.active;
  ship.shield = ship.maxShield;
  commitShown(ship);
  addEffect(ship, { type: 'braced', turns: 1, armor: 8 });
  C.log(`🛡️ ${ship.name || locName(ship.def)}: ${t('action_defend')}`);
  fxBrace(ship.iid);
  finishPlayerAction();
}

function finishPlayerAction() {
  const ship = C.active;
  if (ship) { ship._pendingAbility = null; ship.acted = true; }
  C.active = null;
  C.targeting = null;
  C.menuOpen = false; // close the popover after acting
  render();
  // The action may have destroyed the last enemy — end the battle immediately.
  if (checkEnd()) return;
  // Once every living ally has acted, the enemy phase begins.
  if (allAlliesActed()) setTimeout(beginEnemyPhase, 500);
}

function tryFlee() {
  if (C.opts.kind === 'boss') return;
  toastInfo(t('flee'), '🏴');
  go('map');
}

// ---- Rendering ----
function render() {
  // Allied fleet — always on the LEFT, facing right. During the player phase the
  // player clicks any un-acted ship (in any order) to make it act.
  const allyCol = el('div', { class: 'side-ships' });
  C.allies.forEach((s) => {
    const isSelected = C.active === s && C.phase === 'player';
    const canAct = C.phase === 'player' && !C.targeting && s.hp > 0 && !s.acted;
    const card = shipCard(s, {
      isEnemy: false,
      combat: true,
      selectable: C.targeting === 'ally' && s.hp > 0,
      onClick: (C.targeting === 'ally' && s.hp > 0)
        ? (ship) => onTargetPicked(ship)
        : (canAct
          ? () => { if (C.active === s) { C.active = null; C.menuOpen = false; render(); } else selectAlly(s); }
          : null),
    });
    if (isSelected) card.classList.add('is-selected');
    if (s.acted && s.hp > 0) card.classList.add('acted');
    // Prompt the player to click an un-acted ship to make it act.
    if (canAct && !isSelected) {
      card.classList.add('clickable-active', 'awaiting');
      card.appendChild(el('div', { class: 'act-hint', text: `👆 ${t('click_to_act')}` }));
    }
    allyCol.appendChild(card);
  });

  // Enemy fleet — always on the RIGHT, facing left.
  const enemyCol = el('div', { class: 'side-ships' });
  C.enemies.forEach((e) => {
    const intentNode = e.hp > 0 ? intentBadge(e) : null;
    const card = shipCard(e, {
      isEnemy: true,
      combat: true,
      showIntent: intentNode,
      selectable: C.targeting === 'enemy' && e.hp > 0,
      onClick: C.targeting === 'enemy' ? (ship) => onTargetPicked(ship) : null,
    });
    if (C.active === e && C.phase === 'enemy') card.classList.add('active-turn');
    enemyCol.appendChild(card);
  });

  const banner = el('div', { class: 'turn-banner' }, [
    el('span', { class: 'turn-count', text: `${t('turn')} ${C.round}` }),
    el('span', { class: `turn-phase ${C.phase}`, text: C.phase === 'player' ? t('your_turn') : t('enemy_turn') }),
    el('div', { class: 'battle-vs', text: '⚔️' }),
  ]);

  const field = el('div', { class: 'combat-field' }, [
    el('div', { class: 'side ally-side' }, [
      el('div', { class: 'side-label ally', text: `⚓ ${t('your_fleet')}` }),
      allyCol,
    ]),
    el('div', { class: 'battle-center' }, [banner]),
    el('div', { class: 'side enemy-side' }, [
      el('div', { class: 'side-label enemy', text: `☠️ ${t('enemies')}` }),
      enemyCol,
    ]),
  ]);

  const logBox = el('div', { class: 'combat-log' },
    C.logs.slice(-5).map((l) => el('div', { class: 'log-line', text: l })));

  const arena = el('div', { class: 'combat-arena' }, [field]);
  // Clicking empty arena space closes an open contextual menu.
  arena.addEventListener('click', (e) => {
    if (e.target === arena && C.menuOpen && !C.targeting) { C.menuOpen = false; render(); }
  });

  const root = el('div', { class: 'screen combat-screen' }, [
    renderHud(),
    arena,
    logBox,
  ]);

  // Contextual action popover — appears next to the selected ship only.
  const popover = renderActionPopover();
  if (popover) root.appendChild(popover);

  mount(root);
  if (popover) requestAnimationFrame(positionActionPopover);
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

// Which actions a ship can take, driven by its type, capabilities and upgrades.
function shipActionSet(ship) {
  const type = ship.def?.type || 'frigate';
  const set = ['attack'];
  if (getAbility(ship.ability)) set.push('ability');
  const byType = {
    sloop: ['defend'],
    frigate: ['repair', 'defend'],
    galleon: ['protect', 'repair'],
    brigantine: ['repair', 'defend'],
    monster: [],
  };
  set.push(...(byType[type] || ['repair', 'defend']));
  // Upgrades unlock extra actions: heavy plating lets a ship escort/protect an ally.
  const defensive = ['iron_plating', 'reinforced_shield', 'reinforced_hull'];
  if (!set.includes('protect') && (ship.upgrades || []).some((u) => defensive.includes(u))) set.push('protect');
  set.push('end');
  return set;
}

// Active-ship info header: portrait, name, level, HP/shield, active effects.
function activeShipInfo(ship) {
  const portrait = shipThumb({ type: ship.def.type, color: ship.color, facing: 1, spriteSpec: ship.spriteSpec }, 58);
  portrait.classList.add('active-portrait');
  const bars = el('div', { class: 'active-ship-bars' }, [bar(ship.shownHp ?? ship.hp, ship.maxHp, 'hp', '❤️')]);
  if (ship.maxShield > 0) bars.appendChild(bar(ship.shownShield ?? ship.shield, ship.maxShield, 'shield', '🛡️'));
  return el('div', { class: 'active-ship-info' }, [
    portrait,
    el('div', { class: 'active-ship-meta' }, [
      el('div', { class: 'active-ship-name' }, [
        el('span', { class: 'sel-marker', text: '▶' }),
        el('span', { text: (ship.name || locName(ship.def)) + (ship.flagship ? ' ★' : '') }),
        el('span', { class: 'active-ship-lvl', text: `Lv.${ship.level}` }),
      ]),
      bars,
      effectChips(ship),
    ]),
  ]);
}

// True when it is this ally's turn and the player may act with it.
function isActivePlayerShip(s) {
  return C.phase === 'player' && C.active === s && !C.active.isEnemy;
}

// Compact mechanical summary of an ammo type (damage %, effects, duration).
function ammoDetail(a) {
  const parts = [`💥 ${Math.round((a.damageMult || 1) * 100)}%`];
  if (a.splash) parts.push(`🎯 ${t('eff_splash')} ${Math.round(a.splash * 100)}%`);
  if (a.applyFire) parts.push(`🔥 ${a.applyFire.amount}/${t('turn')} ×${a.applyFire.turns}`);
  if (a.applySlow) parts.push(`⛓️ -${a.applySlow.amount} ${t('stat_speed')} ×${a.applySlow.turns}`);
  if (a.applyImmobilize) parts.push(`🪝 ${t('eff_immobilized')} ×${a.applyImmobilize.turns}`);
  return parts.join(' · ');
}

// The contextual action popover — rendered ONLY for the selected (active) ship,
// and positioned next to that ship (see positionActionPopover). Returns null
// when nothing should be shown (enemy phase, or menu not opened yet).
function renderActionPopover() {
  if (C.phase !== 'player' || !C.active || C.active.isEnemy) return null;
  const ship = C.active;

  // While picking a target, show a compact hint bubble by the ship.
  if (C.targeting) {
    const hint = C.targetingMode === 'protect' ? t('select_ally') : t('select_target');
    return el('div', { class: 'action-popover targeting' }, [
      el('div', { class: 'action-hint big', text: hint }),
      el('button', { class: 'btn-level-4 cancel-target', text: `✖ ${t('no')}`, on: { click: () => { C.targeting = null; ship._pendingAbility = null; render(); } } }),
    ]);
  }

  // Menu only appears once the player selects (clicks) the active ship.
  if (!C.menuOpen) return null;

  const panel = el('div', { class: 'action-popover' });
  const set = shipActionSet(ship);
  const actions = el('div', { class: 'action-buttons' });

  // Ammo selector — only when this ship can attack — with an info line
  // describing the currently selected special cannonball.
  let ammoWrap = null;
  if (set.includes('attack')) {
    const row = el('div', { class: 'ammo-selector' });
    row.appendChild(el('span', { class: 'ammo-label', text: `${t('action_ammo')}:` }));
    for (const id of ['classic', 'explosive', 'incendiary', 'chain', 'harpoon']) {
      const a = DB.ammo[id];
      const b = el('button', { class: `ammo-btn ${C.selectedAmmo === id ? 'active' : ''}`, text: a.icon, on: { click: () => { C.selectedAmmo = id; render(); } } });
      attachTooltip(b, () => `<b>${a.icon} ${locName(a)}</b><br>${locField(a, 'desc')}<br><i>${ammoDetail(a)}</i>`);
      row.appendChild(b);
    }
    const sel = DB.ammo[C.selectedAmmo] || DB.ammo.classic;
    const info = el('div', { class: 'ammo-info' }, [
      el('div', { class: 'ammo-info-top', html: `${sel.icon} <b>${locName(sel)}</b> · <span class="ammo-info-detail">${ammoDetail(sel)}</span>` }),
      el('div', { class: 'ammo-info-desc', text: locField(sel, 'desc') }),
    ]);
    ammoWrap = el('div', { class: 'ammo-block' }, [row, info]);
  }

  for (const act of set) {
    if (act === 'attack') {
      actions.appendChild(actionBtn('⚔️', t('action_attack'), () => beginTargeting('attack', 'enemy')));
    } else if (act === 'ability') {
      const ab = getAbility(ship.ability);
      const ready = ship.abilityCd <= 0;
      const b = actionBtn(ab.icon, t(ab.nameKey), () => useAbility(ship.ability), !ready);
      if (!ready) b.appendChild(el('span', { class: 'cd-badge', text: ship.abilityCd }));
      attachTooltip(b, () => `<b>${t(ab.nameKey)}</b><br>${t(ab.descKey)}<br><i>${t('cooldown')}: ${ab.cooldown}</i>`);
      actions.appendChild(b);
    } else if (act === 'repair') {
      actions.appendChild(withTip(actionBtn('🔧', t('action_repair'), playerRepair), `<b>${t('action_repair')}</b>`));
    } else if (act === 'defend') {
      actions.appendChild(withTip(actionBtn('🛡️', t('action_defend'), playerDefend), `<b>${t('action_defend')}</b>`));
    } else if (act === 'protect') {
      actions.appendChild(withTip(actionBtn('🤝', t('action_protect'), () => beginTargeting('protect', 'ally')), `<b>${t('action_protect')}</b><br>${t('action_protect_desc')}`));
    } else if (act === 'end') {
      actions.appendChild(actionBtn('⏭️', t('end_turn'), finishPlayerAction));
    }
  }

  // Kraken relic grants the flagship a once-per-battle ability.
  if (ship.flagship && hasRelic('kraken_relic') && !ship.krakenUsed) {
    const kb = getAbility('kraken_shot');
    const b = actionBtn(kb.icon, t(kb.nameKey), () => useAbility('kraken_shot'));
    attachTooltip(b, () => `<b>${t(kb.nameKey)}</b><br>${t(kb.descKey)}`);
    actions.appendChild(b);
  }
  if (C.opts.kind !== 'boss') actions.appendChild(actionBtn('🏴', t('flee'), tryFlee));

  panel.appendChild(activeShipInfo(ship));
  if (ammoWrap) panel.appendChild(ammoWrap);
  panel.appendChild(actions);
  return panel;
}

function withTip(node, html) { attachTooltip(node, () => html); return node; }

// Place the contextual popover next to the selected ship card.
function positionActionPopover() {
  const pop = document.querySelector('.action-popover');
  const card = document.querySelector('.ship-card.is-selected');
  if (!pop || !card) return;
  const cr = card.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  const gap = 14;
  let left = cr.right + gap; // prefer to the right of the ship (allies are on the left)
  if (left + pr.width > window.innerWidth - 8) left = cr.left - gap - pr.width; // else to its left
  if (left < 8) left = Math.min(Math.max(8, cr.left + cr.width / 2 - pr.width / 2), window.innerWidth - pr.width - 8);
  let top = cr.top + cr.height / 2 - pr.height / 2;
  top = Math.min(Math.max(60, top), window.innerHeight - pr.height - 8);
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
  pop.classList.add('placed');
}

function actionBtn(icon, label, onClick, disabled = false) {
  const b = el('button', { class: `btn-level-3 action-btn ${disabled ? 'disabled' : ''}`, on: { click: () => { if (!disabled) onClick(); } } }, [
    el('span', { class: 'ab-icon', text: icon }),
    el('span', { class: 'ab-label', text: label }),
  ]);
  if (disabled) b.disabled = true;
  return b;
}

function beginTargeting(mode, side = 'enemy') {
  C.targetingMode = mode;
  C.targeting = side;
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
  else if (mode === 'protect') playerProtect(ship);
  else playerAttack(ship);
}

// Protect: escort an ally, refilling its shield and bracing it for the round.
function playerProtect(target) {
  const ship = C.active;
  if (target.maxShield > 0) target.shield = target.maxShield;
  commitShown(target);
  addEffect(target, { type: 'braced', turns: 1, armor: 14 });
  C.log(`🤝 ${ship.name || locName(ship.def)} → ${target.name || locName(target.def)}: ${t('action_protect')}`);
  toastSuccess(t('action_protect'), '🤝');
  fxBrace(target.iid);
  finishPlayerAction();
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
    el('button', { class: 'btn-level-1', text: t('continue_btn'), on: { click: () => { m1.close(); proceed(); } } }),
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
    el('button', { class: 'btn-level-1', text: t('return_title'), on: { click: () => { m.close(); endRunToTitle(false); } } }),
  ]);
  const m = modal(box, { closable: false, cls: 'result-overlay' });
}

function showRunComplete() {
  const box = el('div', { class: 'result-box complete' }, [
    el('h1', { class: 'result-title', text: t('run_complete') }),
    el('div', { class: 'result-sub', text: t('run_complete_text') }),
    el('div', { class: 'result-stats', html: `⚔️ ${state.stats.battlesWon} · ☠️ ${state.stats.shipsSunk} · 💰 ${state.stats.goldEarned}` }),
    el('button', { class: 'btn-level-1', text: t('return_title'), on: { click: () => { m.close(); endRunToTitle(true); } } }),
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
  C.allies.forEach((s) => { s.hp = s.maxHp; s.shield = s.maxShield; commitShown(s); });
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
