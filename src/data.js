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
};

const DATA_FILES = [
  ['ships', 'data/ships.json'],
  ['enemies', 'data/enemies.json'],
  ['bosses', 'data/bosses.json'],
  ['upgrades', 'data/upgrades.json'],
  ['relics', 'data/relics.json'],
  ['events', 'data/events.json'],
  ['ammo', 'data/ammo.json'],
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
