// Run state — brief §10 (boucle de partie) and §8 (la couche historique).
//
// A run is: a crew you chose, a contract your crew voted, a chart across the
// real Caribbean, and a calendar that is running out. Nothing here is random
// except what the chart generates; the rules themselves stay deterministic.

// --- §10.1 Recruitment: readable archetypes, never points on a blank screen ---
// Asking a first-time player to spend points before they know what "réparation
// 8" buys was tried and discarded (§9). Three pre-composed crews instead, then
// three free points once you have seen what the numbers do.

export const ARCHETYPES = {
  artilleurs: {
    id: 'artilleurs',
    name: 'Les Artilleurs',
    style: 'Tenir la distance et démâter.',
    crew: [
      { name: 'Etcheverry', role: 'canonnier', specialty: 'canonnage' },
      { name: 'Sorhaindo', role: 'second canonnier', specialty: 'canonnage' },
      { name: 'Toussaint', role: 'charpentier', specialty: 'reparation' },
      { name: 'Gohier', role: 'matelot', specialty: 'melee' },
      { name: 'Quéméner', role: 'matelot', specialty: 'manoeuvre' },
    ],
  },
  ecumeurs: {
    id: 'ecumeurs',
    name: 'Les Écumeurs',
    style: 'Foncer et aborder.',
    crew: [
      { name: 'Etcheverry', role: 'canonnier', specialty: 'canonnage' },
      { name: 'Fer-de-Lance', role: 'chef d’abordage', specialty: 'melee' },
      { name: 'Kirke', role: 'abordeur', specialty: 'melee' },
      { name: 'Nolet', role: 'abordeur', specialty: 'melee' },
      { name: 'Coudray', role: "maître d'équipage", specialty: 'manoeuvre' },
    ],
  },
  prudents: {
    id: 'prudents',
    name: 'Les Prudents',
    style: 'Encaisser, durer, réparer.',
    crew: [
      { name: 'Ozanne', role: 'chirurgien', specialty: 'soins' },
      { name: 'Toussaint', role: 'charpentier', specialty: 'reparation' },
      { name: 'Etcheverry', role: 'canonnier', specialty: 'canonnage' },
      { name: 'Trégoat', role: 'matelot', specialty: 'manoeuvre' },
      { name: 'Hoorn', role: 'matelot', specialty: 'reparation' },
    ],
  },
};

// --- §8.2 The chasse-partie: the run modifier, as a signed document ----------
// Every clause is a pair: an advantage and a constraint. The crew votes — the
// captain proposes, he does not impose. This is the roguelite's character
// choice, entirely diegetic.

export const CLAUSES = {
  part_capitaine: {
    id: 'part_capitaine',
    text: 'Grande part au capitaine',
    good: "Plus d'or capitalisé entre les parties",
    bad: 'Le moral s’effrite',
    appeal: -2,                       // how the crew feels about it
    effects: { goldMult: 1.25, moralePerNode: -1 },
  },
  part_equipage: {
    id: 'part_equipage',
    text: 'Grande part à l’équipage',
    good: 'Moral haut, recrutement facile',
    bad: 'Peu de butin capitalisé',
    appeal: +3,
    effects: { goldMult: 0.8, morale: +15 },
  },
  indemnites: {
    id: 'indemnites',
    text: 'Indemnités généreuses',
    good: 'Les hommes se battent sans se ménager',
    bad: 'Chaque blessé coûte cher',
    appeal: +2,
    effects: { boardingBonus: 8, woundCost: 2 },
  },
  discipline: {
    id: 'discipline',
    text: 'Discipline stricte',
    good: 'Fatigue réduite, pas de désertion',
    bad: 'Recrues rares et chères',
    appeal: -1,
    effects: { recruitCostMult: 1.5, noDesertion: true },
  },
  pas_de_quartier: {
    id: 'pas_de_quartier',
    text: 'Pas de quartier',
    good: 'Bonus d’abordage',
    bad: 'Réputation effondrée, aucune reddition ennemie',
    appeal: +1,
    effects: { boardingBonus: 15, legitimacy: -20, noSurrender: true },
  },
  espagnols_seuls: {
    id: 'espagnols_seuls',
    text: 'Cible imposée : Espagnols seuls',
    good: 'Prime de faction',
    bad: 'Impossible d’attaquer les autres pavillons',
    appeal: 0,
    effects: { spanishBounty: 1.3, spanishOnly: true },
  },
};

// The crew refuses what it dislikes: a proposal only passes if the men are
// willing. The captain is elected, and his authority is full in combat only
// (§8.5) — outside it, the council votes.
export function voteOn(clauseIds, morale = 50) {
  const votes = {};
  for (const id of clauseIds) {
    const clause = CLAUSES[id];
    const support = 50 + clause.appeal * 10 + (morale - 50) / 2;
    votes[id] = { passed: support >= 45, support: Math.round(support) };
  }
  return votes;
}

// ---------------------------------------------------------------------------

export function newRun({ archetype = 'artilleurs', clauses = [], extraPoints = {} } = {}) {
  const arch = ARCHETYPES[archetype] || ARCHETYPES.artilleurs;
  return {
    archetype: arch.id,
    // §6.1: the player commands, he is not aboard. No avatar, no captain sheet.
    crew: arch.crew.map((c, i) => ({
      id: i + 1,
      name: c.name,
      role: c.role,
      specialty: c.specialty,
      at: null,          // assigned when a fight starts
      hurt: 0,
      voyages: 0,
    })),
    hands: 55,
    clauses: clauses.slice(),
    ship: { name: 'La Trompeuse', hullClass: 3 },
    gold: 120,
    // §8.6: one legible gauge instead of three faction bars. The line between
    // privateer and pirate, and the single question it keeps asking: do I honour
    // my commission, or do I take that ship?
    legitimacy: 60,
    morale: 55,
    // §8.7: the calendar is the meta-progression, and it has a dated end.
    year: 1640 + Math.floor(Math.random() * 12),
    act: 1,
    node: null,
    visited: [],
    prizes: [],        // §10.4 the registre des prises: the trophy of the game
    ...extraPoints,
  };
}

// --- §8.3 "Pas de prise, pas de paye" ---------------------------------------
// Morale falls at every node crossed without a prize. Avoiding fights becomes
// impossible in the long run, without an artificial wall: the game pushes you
// to be aggressive because the men are not being paid.
export function crossNode(run, { tookPrize = false } = {}) {
  const mods = clauseEffects(run);
  if (tookPrize) run.morale = Math.min(100, run.morale + 8);
  else run.morale = Math.max(0, run.morale - 4 + (mods.moralePerNode || 0));
  return run.morale;
}

export function clauseEffects(run) {
  const out = {};
  for (const id of run.clauses) {
    for (const [k, v] of Object.entries(CLAUSES[id]?.effects || {})) {
      if (typeof v === 'number' && typeof out[k] === 'number') out[k] += v;
      else out[k] = v;
    }
  }
  return out;
}

// §8.5: at rock-bottom morale the council deposes the captain. That is the end
// of the run — but it is NOT a death. He is put ashore; officers and reputation
// survive into the next one.
export function isDeposed(run) {
  return run.morale <= 0;
}

// §8.6: legitimacy decides what a port will do with you.
export function portStatus(run) {
  if (run.legitimacy >= 50) return 'commissioned';   // full price, repairs, welcome
  if (run.legitimacy >= 20) return 'tolerated';      // fences only, poor prices
  return 'outlaw';                                   // no port at all, hunted
}

export function takePrize(run, prize) {
  run.prizes.push(prize);
  run.gold += Math.round(prize.gold * (clauseEffects(run).goldMult ?? 1));
  return run;
}
