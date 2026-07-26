// Data loader — externalized JSON (ships, enemies, bosses, upgrades, relics, events, ammo).
// Separates data from logic so content can be balanced/added without touching code.

export const DB = {
  ships: {},
  enemies: {},
  bosses: {},
  upgrades: {},
  relics: {},
  events: {},
  ammo: {},
  weather: {},
};

const DATA_FILES = [
  ['ships', 'data/ships.json'],
  ['enemies', 'data/enemies.json'],
  ['bosses', 'data/bosses.json'],
  ['upgrades', 'data/upgrades.json'],
  ['relics', 'data/relics.json'],
  ['events', 'data/events.json'],
  ['ammo', 'data/ammo.json'],
  ['weather', 'data/weather.json'],
];

export async function loadData() {
  await Promise.all(
    DATA_FILES.map(async ([key, path]) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
      DB[key] = await res.json();
    })
  );
  return DB;
}

// Runtime-registered custom ships (from the ship editor).
export function registerShip(def) {
  DB.ships[def.id] = def;
}

// Dev persistence for ships authored in the Ship Editor — kept in
// localStorage so they survive a reload and can be tested in-game right away.
const CUSTOM_SHIPS_KEY = 'fdlc_custom_ships';

export function saveCustomShip(def) {
  registerShip(def);
  let all = {};
  try { all = JSON.parse(localStorage.getItem(CUSTOM_SHIPS_KEY) || '{}'); } catch {}
  all[def.id] = def;
  localStorage.setItem(CUSTOM_SHIPS_KEY, JSON.stringify(all));
}

export function loadCustomShips() {
  try {
    const all = JSON.parse(localStorage.getItem(CUSTOM_SHIPS_KEY) || '{}');
    Object.values(all).forEach(registerShip);
  } catch {}
}
