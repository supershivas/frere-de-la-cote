# Frères de la Côte — Brothers of the Coast

> *La Dernière Traversée / The Last Voyage*

A turn-based **naval roguelite** in pixel art, set in the Caribbean of the
buccaneers, 1640–1697. Vanilla JS, ES modules, HTML5 canvas — no build step, no
dependencies, no image assets: every ship on screen is generated at runtime.

**You do not sink ships, you take them.** Sinking is quick, safe and pays almost
nothing. Taking a ship means dismasting her precisely, thinning her crew and
closing alongside — which exposes you to being boarded in turn. That tension is
the whole game.

---

## ⚠️ State of the rebuild

The game is being rebuilt against `docs/refonte/brief.md`. Steps 0 to 5 are
done. Then the fight was judged **unreadable in play**, and the work stopped to
reopen the question underneath it: *what is the right scale for a fight?*

**Three proposals are playable, and the choice is not made.** Try them:

| | [B2 — one ship](docs/refonte/mockups/b2-combat.html) | [C — the roadstead](docs/refonte/mockups/c-rade.html) | [D — the tactical raid](docs/refonte/mockups/d-breche.html) |
|---|---|---|---|
| Scale | one ship against one ship | a squadron against an anchorage | **an isometric hex board** |
| A turn is | spread five men over three posts | **one order** | move and act, three ships |
| The verb | the allocation | the bet on depth | **the push** (Into the Breach) |
| Length | 8–15 turns | 6–10 orders | 5 turns, hard cap |
| Rules | `src/battle.js`, `src/rencontre.js` | `src/flotte.js` | `src/hex.js` + `src/breche.js` |
| The gamble | sink her fast, or take her slow and richer | how deep before you run | shoot her, or grapple her close enough to board |

**D is the newest and the most different.** Everything the anchorage will do
next turn is written on the board before you play: a dashed arrow from each
gunner to the cell it will hit. You cancel a shot by *shoving the gunner*, not by
killing it — and stepping off its axis works too. Reefs are not scenery: a
broadside that pushes a prize onto one destroys her, and her cargo with her. A
prize is only ever collected by boarding, so the whole fight is a positioning
problem about getting the boarder alongside something already softened.

Both mockups load the **real** stylesheets and modules of the game, so they show
the actual interface rather than a mock-up of one. Everything a developer needs
and a player does not — draw seed, drawn tags, effective rules — lives behind
the ⚙ button.

**Do not start step 6 before that choice is made.** Building meta-progression on
a fight that is about to change scale is exactly the wasted work the brief's
gated order (§12) exists to prevent.

---

## ▶️ Run it

The game loads its data with `fetch`, so it must be served over HTTP, not opened
as a `file://`:

```bash
python3 -m http.server 8000     # from the repo root
# then open http://localhost:8000
```

No build step, no `npm install`, no external assets.

| Screen | URL |
|---|---|
| Full run — crew, charter, chart, fights | `index.html#recrutement` |
| One fight | `index.html#bataille` |
| Deck plans and crew movement | `index.html#pont` |
| Design system — palette, live components, measured contrast | `design-system.html` |
| The world — 1640-1697, historical figures | `histoire.html` |

---

## 🎮 What a fight is

Nothing is rolled once a fight has started. **The dice are thrown before the
first turn** — the weather, the enemy's flag, her cargo, her captain's temper —
and then the fight resolves as a closed problem. Enemy intent is announced a
full turn ahead. A turn is a puzzle, not a gamble.

**Each fight opens differently.** Fourteen axes are drawn every time (the hour,
the sea, the wind, her flag, her cargo, her crew, your own state, the opening
distance…), plus rare "spices" against a small budget: a squall, a reef bar, a
mutiny aboard her, a ship of note. The interface shows only what departs from
the ordinary — about four things — and the rest feeds the crew's dialogue.

**The crew talks.** 164 lines across five voices and three moments (the sighting,
the turn of the fight, the outcome), chosen by specificity and filtered by a
persistent memory of what you have already heard: roughly eleven runs before a
line comes back.

**The weather is real.** It is drawn from `data/weather.json`, it changes the sky
and the sea behind the fight, and its modifiers enter the broadside — it is not
decoration.

### Legacy V1 (still shipped)

"Nouvelle Traversée" still runs the original fleet combat and its procedural
grid map. It is being replaced and nothing new should be built on it.

### Keyboard

| Key | Action |
|-----|--------|
| `Esc` / `P` | Pause menu |
| `M` | Jump to the sea chart during a run |
| `Enter` / click | Confirm |

Developer mode: **`Ctrl + Shift + D`** — console (`gold 1000`, `heal fleet`,
`win combat`, `spawn enemy pirate_sloop`…), FPS overlay, and `F1`–`F8`
shortcuts. `F8` opens the sprite editor, an internal design tool meant to be
removed from the final game.

---

## ✅ Tests

```bash
node test/run.js     # 141 checks, plain node, no install
```

Two different kinds of test live here, and it matters which one breaks.

**Wrong-key detectors.** Ids that disagree with their key, dangling
cross-references, effect flags no system reads, locale keys present in one
language and missing from the other. That is the bug class a syntax check cannot
catch, and the one that broke the previous prototype.

**Measurements of a design decision.** `test/rencontre.test.js` measures what the
encounter draw actually produces — how many things the opening card shows, how
often a rare trait comes up, how many distinct openings exist, how many runs
before a line of dialogue repeats. `test/flotte.test.js` measures the *shape of
the gamble*: two ways of raiding, played over 300 roadsteads each, and it fails
if charging in ever becomes safe — because then the bottom of the roadstead is
no longer a bet, it is a corridor. `test/breche.test.js` measures whether
*position matters at all*: a careful player must out-earn a careless one by a
wide margin, or the board is decoration. And `test/hex.test.js` tests
*properties* — distance is a real metric, neighbourhood is reciprocal,
projection is injective — rather than hand-picked values. **A threshold that breaks in those files is
almost always a decision to make, not a test to loosen.**

For what data tests cannot see:

```bash
python3 -m http.server 8000 &
npm i playwright-core           # dev-only; the game itself ships no deps
node tools/playtest.mjs 4       # plays full combats, fails on any console error
node tools/contrast-audit.mjs   # WCAG ratios, measured on rendered pixels
```

The contrast audit samples the **screenshot**, not computed styles: the
backgrounds are painted by a canvas and by a fixed layer behind the app, so a
DOM-walking audit sees none of them and reports "0 failures" on an unreadable
screen. That is not hypothetical — it is how a real bug hid, and how a second
one (a screen fade replayed on every click) was later caught by accident.

---

## 🗂️ Architecture

Data and logic are strictly separated so content can be balanced or added
without touching code.

```
index.html            Entry point (loads src/main.js as an ES module)
design-system.html    Interface reference: palette, live components, contrast
histoire.html         The world: 1640-1697 context and historical figures

css/
  style.css           Screen layout; imports everything below
  variables.css       Canonical design tokens
  components.css      SHARED components: .bar gauges, buttons, badges, modals
  animations.css      Keyframes
  pattern.css         Textures
  deck.css            All refonte CSS, alongside the existing sheets

data/                 All game content, externalized
  weather.json        Six weathers with real combat modifiers
  rencontres.json     Encounter draw: 14 axes, 40 spices, exclusions
  phylacteres.json    164 crew lines, 5 voices, 3 moments
  factions.json       Liveries and flags — what a ship flies
  ships.json  enemies.json  bosses.json  ammo.json  upgrades.json
  relics.json  events.json

locales/              fr.json · en.json — no text hardcoded in logic

docs/refonte/
  brief.md            The brief. Authoritative
  PLAN.md             Progress, decisions taken, bugs found
  mockups/            PLAYABLE mockups — they load the real game UI

test/                 Zero-dependency suite (node test/run.js)
tools/                playtest.mjs · contrast-audit.mjs

src/
  === rules: pure, deterministic, no DOM, no randomness ===
  battle.js           One ship against one ship
  flotte.js           The roadstead (proposal C): a squadron, three bands
  breche.js           The tactical raid (proposal D): hex board, reefs, pushes
  hex.js              Hex geometry only — axial coords, axes, isometric projection
  shipPlans.js        Deck plans per hull class: rooms, passages, specialties

  === generation: this is where entropy is allowed ===
  rencontre.js        Encounter draw, weather, flag, dialogue selection
  sprites.js          Procedural ship renderer + hull metadata
  caribbean.js        The real Caribbean: places, coastlines, sea legs

  === presentation ===
  ui.js               el / mount / modal / bar — the bricks of every screen
  deckView.js         Profile rendering: the sprite frames the deck plan
  ocean.js            Animated sky and sea behind every screen at sea
  fx.js               Smoke, splinters, floating numbers
  toast.js  tooltip.js  hud.js
  screens/pont.js  screens/bataille.js  screens/traversee.js

  === shared ===
  main.js  data.js  i18n.js  state.js  nav.js  run.js  debug.js

  === legacy V1, being replaced ===
  combat.js  map.js  abilities.js  pause.js
  screens/  title.js port.js shipyard.js treasure.js event.js editor.js
```

### Adding content

- **A ship, an enemy, a relic** = one entry in the matching JSON, with its
  `name_fr` / `name_en`. No code change.
- **A string** = add the key to `locales/fr.json` *and* `locales/en.json`, then
  use `t('key')`. A test fails if one language has it and the other does not.
- **A UI component** = add it to `css/deck.css` *and* demo it in
  `design-system.html` §16. A component that exists but is not demoed is one
  nobody will find.

---

## 📐 Progress

| # | Step | State |
|---|---|---|
| 0 | Clean slate: data validation, drop the Kraken | ✅ |
| 1 | Deck plans, rooms, passages, specialties | ✅ |
| 2 | Profile rendering — the sprite frames the plan | ✅ |
| 3 | Crew movement — real routes, turn cost, fire | ✅ |
| 4 | Combat 1-v-1 — range, localized damage, boarding | ✅ then **reopened** |
| — | **Scale of the fight — B2 vs C vs D, awaiting a decision** | ⏳ |
| 5 | Run loop — archetypes, charter, Caribbean chart | ✅ |
| 6 | Meta-progression — officers, prize register, calendar | — |
| 7 | Interface pass — only once the mechanics are frozen | — |
| 8 | Content — last | — |

Step 4 shipped and was measured — sinking pays 27, a prize pays 180 and the
ship, boarding too early loses you your own deck — but in play the screen was
unreadable, which no measurement had caught. That is why the scale is back on
the table before anything is built on top.

---

*Priority: make the core loop bite before adding anything to it.*
