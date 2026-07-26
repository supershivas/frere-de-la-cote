// Global game state: resources, fleet, run progress, relics, meta stats, persistence.
import { DB } from './data.js';
import { getAbility } from './abilities.js';

const SAVE_KEY = 'fdlc_save';
const META_KEY = 'fdlc_meta';

export const state = {
  screen: 'title',
  resources: { gold: 120, wood: 20, rareMaterials: 0, reputation: 0 },
  fleet: [], // array of ship instances
  relics: [], // array of relic ids
  act: 1,
  map: null, // generated map
  currentNodeId: null,
  pendingCombat: null,
  discovered: { ships: {}, enemies: {}, bosses: {} },
  stats: { battlesWon: 0, shipsSunk: 0, goldEarned: 0 },
  options: { sound: true, music: true },
  inRun: false,
};

let nextInstanceId = 1;

// Create a live ship instance from a data definition.
export function makeShip(defId, { flagship = false } = {}) {
  const def = DB.ships[defId];
  if (!def) throw new Error(`Unknown ship: ${defId}`);
  const s = def.stats;
  const inst = {
    iid: nextInstanceId++,
    defId,
    def,
    flagship,
    name: null, // custom instance name (optional)
    level: 1,
    xp: 0,
    maxHp: s.hp,
    hp: s.hp,
    armor: s.armor,
    baseArmor: s.armor,
    maxShield: s.shield || 0,
    shield: s.shield || 0,
    damage: s.damage,
    accuracy: s.accuracy,
    speed: s.speed,
    baseSpeed: s.speed,
    evasion: s.evasion || 0,
    morale: s.morale || 50,
    crew: s.crew_capacity || 0,
    ability: def.ability,
    abilityCd: 0,
    upgrades: [],
    effects: [], // combat status effects (reset each battle)
    color: def.color || '#c9a24b',
  };
  if (flagship) {
    inst.maxHp += 40;
    inst.hp = inst.maxHp;
    inst.damage += 6;
  }
  return inst;
}

// Apply a permanent upgrade to a ship instance.
export function applyUpgrade(ship, upgrade) {
  const e = upgrade.effect || {};
  if (e.stat === 'hp') { ship.maxHp += e.add; ship.hp += e.add; }
  else if (e.stat === 'damage') { ship.damage = Math.round(ship.damage * (e.mult || 1) + (e.add || 0)); }
  else if (e.stat === 'armor') { ship.armor += e.add; ship.baseArmor += e.add; }
  else if (e.stat === 'accuracy') { ship.accuracy = Math.min(1, ship.accuracy + (e.add || 0)); }
  else if (e.stat === 'speed') { ship.speed += e.add; ship.baseSpeed += e.add; ship.evasion += (e.evasion || 0); }
  else if (e.stat === 'shield') { ship.maxShield += e.add; ship.shield += e.add; }
  if (e.morale) ship.morale += e.morale;
  ship.upgrades.push(upgrade.id);
}

export function hasRelic(id) {
  return state.relics.includes(id);
}

export function addRelic(id) {
  if (!state.relics.includes(id)) {
    state.relics.push(id);
    applyRelicPassive(id);
  }
}

// Relics with permanent fleet-wide passive effects apply immediately on pickup.
function applyRelicPassive(id) {
  const r = DB.relics[id];
  if (!r) return;
  const fx = r.effects || {};
  if (fx.fleetHpAdd) {
    const per = Math.floor(fx.fleetHpAdd / Math.max(1, state.fleet.length));
    state.fleet.forEach((s) => { s.maxHp += per; s.hp += per; });
  }
}

// Aggregate relic multipliers used across systems.
export function relicMods() {
  const m = { fleetDamageMult: 1, repairCostMult: 1, repairMult: 1, goldMult: 1,
    classicAppliesFire: false, revealMap: false, dangerUp: false, flagshipKrakenShot: false };
  for (const id of state.relics) {
    const fx = (DB.relics[id] || {}).effects || {};
    if (fx.fleetDamageMult) m.fleetDamageMult *= fx.fleetDamageMult;
    if (fx.repairCostMult) m.repairCostMult *= fx.repairCostMult;
    if (fx.repairMult) m.repairMult *= fx.repairMult;
    if (fx.goldMult) m.goldMult *= fx.goldMult;
    if (fx.classicAppliesFire) m.classicAppliesFire = true;
    if (fx.revealMap) m.revealMap = true;
    if (fx.dangerUp) m.dangerUp = true;
    if (fx.flagshipKrakenShot) m.flagshipKrakenShot = true;
  }
  return m;
}

// The weather def rolled for the node currently being played, if any.
function currentWeatherDef() {
  const map = state.map;
  const node = map && map.byId[state.currentNodeId];
  const w = node && node.weather;
  return (w && DB.weather[w]) || null;
}

export function currentWeather() {
  return currentWeatherDef();
}

// Weather modifiers for the node currently being played — same shape/spirit
// as relicMods(), read fresh each time so it always reflects the current node.
export function weatherMods() {
  const w = currentWeatherDef();
  const m = w && w.mods;
  return {
    accuracyDelta: m?.accuracyDelta || 0,
    evasionDelta: m?.evasionDelta || 0,
    damageMult: m?.damageMult ?? 1,
    speedMult: m?.speedMult ?? 1,
  };
}

// Combat-facing mods: relics + weather merged (multipliers multiplied,
// deltas summed). Use this instead of relicMods() wherever combat reads mods.
export function combatMods() {
  const r = relicMods();
  const w = weatherMods();
  return {
    ...r,
    accuracyDelta: w.accuracyDelta,
    evasionDelta: w.evasionDelta,
    weatherDamageMult: w.damageMult,
    speedMult: w.speedMult,
  };
}

export function addGold(n) {
  state.resources.gold = Math.max(0, state.resources.gold + n);
  if (n > 0) state.stats.goldEarned += n;
}

export function discover(kind, id) {
  if (state.discovered[kind]) state.discovered[kind][id] = true;
}

// XP / leveling. Returns true if the ship leveled up.
export function grantXp(ship, amount) {
  ship.xp += amount;
  let leveled = false;
  while (ship.xp >= xpForLevel(ship.level)) {
    ship.xp -= xpForLevel(ship.level);
    ship.level++;
    leveled = true;
  }
  return leveled;
}

export function xpForLevel(level) {
  return 40 + level * 20;
}

export function abilityMeta(ship) {
  return getAbility(ship.ability);
}

// --- New run ---
export function startNewRun(flagshipId = 'frigate') {
  const meta = loadMeta();
  state.resources = {
    gold: Math.round(120 * (meta.goldStartMult || 1)),
    wood: 20,
    rareMaterials: 0,
    reputation: 0,
  };
  state.relics = [];
  state.fleet = [makeShip(flagshipId, { flagship: true }), makeShip('sloop')];
  state.act = 1;
  state.inRun = true;
  state.stats = { battlesWon: 0, shipsSunk: 0, goldEarned: 0 };
  nextInstanceId = 100;
}

// --- Persistence ---
export function saveGame() {
  const snapshot = {
    resources: state.resources,
    act: state.act,
    relics: state.relics,
    stats: state.stats,
    options: state.options,
    currentNodeId: state.currentNodeId,
    inRun: state.inRun,
    map: state.map,
    fleet: state.fleet.map(serializeShip),
    discovered: state.discovered,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
}

export function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}

export function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    state.resources = s.resources;
    state.act = s.act;
    state.relics = s.relics || [];
    state.stats = s.stats || { battlesWon: 0, shipsSunk: 0, goldEarned: 0 };
    state.options = s.options || state.options;
    state.currentNodeId = s.currentNodeId;
    state.inRun = s.inRun;
    state.map = s.map;
    state.discovered = s.discovered || { ships: {}, enemies: {}, bosses: {} };
    state.fleet = (s.fleet || []).map(deserializeShip);
    nextInstanceId = Math.max(100, ...state.fleet.map((f) => f.iid + 1));
    return true;
  } catch (e) {
    console.error('Load failed', e);
    return false;
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

function serializeShip(s) {
  return {
    iid: s.iid, defId: s.defId, flagship: s.flagship, name: s.name,
    level: s.level, xp: s.xp, maxHp: s.maxHp, hp: s.hp, armor: s.armor,
    baseArmor: s.baseArmor, maxShield: s.maxShield, shield: s.shield,
    damage: s.damage, accuracy: s.accuracy, speed: s.speed, baseSpeed: s.baseSpeed,
    evasion: s.evasion, morale: s.morale, crew: s.crew, upgrades: s.upgrades,
  };
}

function deserializeShip(o) {
  const def = DB.ships[o.defId] || {};
  return {
    ...o,
    def,
    ability: def.ability,
    abilityCd: 0,
    effects: [],
    color: def.color || '#c9a24b',
  };
}

// --- Meta progression (persists across runs) ---
export function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY)) || defaultMeta();
  } catch {
    return defaultMeta();
  }
}

function defaultMeta() {
  return { goldStartMult: 1, runsCompleted: 0, bossesKilled: 0, totalGold: 0 };
}

export function saveMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}
