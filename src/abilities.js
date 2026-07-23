// Ability definitions. Mechanics live in combat.js (referenced by id); this maps
// ability ids to their i18n keys and cooldowns so the UI stays data-driven.

export const ABILITIES = {
  swift_strike: { id: 'swift_strike', nameKey: 'ability_swift_strike', descKey: 'ability_swift_strike_desc', cooldown: 2, icon: '⚡' },
  broadside: { id: 'broadside', nameKey: 'ability_broadside', descKey: 'ability_broadside_desc', cooldown: 3, icon: '💥' },
  reinforce: { id: 'reinforce', nameKey: 'ability_reinforce', descKey: 'ability_reinforce_desc', cooldown: 3, icon: '🛡️' },
  kraken_shot: { id: 'kraken_shot', nameKey: 'ability_kraken_shot', descKey: 'ability_kraken_shot_desc', cooldown: 99, icon: '🐙' },
};

export function getAbility(id) {
  return ABILITIES[id] || null;
}
