# Frères de la Côte — Brothers of the Coast

> *La Dernière Traversée / The Last Voyage*

A turn-based **naval roguelite** in pixel art. You play a forgotten pirate captain
rebuilding a legendary fleet across procedurally-generated seas — fighting
corsairs and the Spanish Indies fleet in readable, tactical combat.

> **⚠️ Refonte in progress.** The game is being rebuilt around a new hook —
> *you do not sink ships, you take them*. Read `docs/refonte/brief.md` and
> `docs/refonte/PLAN.md` before touching combat, the chart or the crew; the
> sections below describe the V1 prototype, which is being replaced step by
> step (`brief.md` §12).

This repository is the **Version 1 playable prototype** described in the game
design document, built as a dependency-free browser game (vanilla JS + ES
modules + HTML5 Canvas). All game content lives in external JSON and the whole
UI is bilingual (🇫🇷 FR / 🇬🇧 EN).

---

## ▶️ Run it

The game loads its data with `fetch`, so it must be served over HTTP (not opened
as a `file://`). Any static server works:

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000
```

or

```bash
npx serve .
```

No build step, no `npm install`, no external assets — everything is procedural.

---

## 🎮 How to play — the refonte

**You do not sink ships, you take them.** Sinking is quick and safe and pays
almost nothing; taking a ship means dismasting her precisely, thinning her crew,
closing alongside — and exposing yourself to be boarded in turn.

| Screen | URL | What it is |
|---|---|---|
| Full run | `index.html#recrutement` | Crew → charter → chart → fights |
| One fight | `index.html#bataille` | A single 1-v-1 battle |
| Deck plan | `index.html#pont` | Deck plans and crew movement, standalone |

1. **Crew** — three readable archetypes (Artilleurs, Écumeurs, Prudents). Never
   points on a blank screen: you cannot yet know what "réparation 8" buys.
2. **Chasse-partie** — the real contract these crews wrote and voted. Each
   clause is an advantage paid for by a constraint, and **the crew votes**: the
   captain proposes, he does not impose.
3. **Chart** — the real Caribbean, seventeen places at their true coordinates,
   always entered from l'Île de la Tortue. Every stop states its cost first.
4. **Combat** — one ship against one ship, in profile, on a shared waterline.
   Each turn: **move your men as much as you like, then ONE manoeuvre and ONE
   broadside, in any order — both optional.** Nothing is rolled: enemy intent is
   announced a full turn ahead, so a turn resolves like a puzzle, not a gamble.
   - **Damage is localized per room.** A wrecked mast means she can no longer
     change range; a wrecked magazine means not one more shot.
   - **Five munitions, five jobs.** Chain bites rigging only and cannot sink
     your prize; grape wounds men and spares the hull; the fire carcass is the
     only source of fire in the game, and usually destroys what you wanted.
   - **Men who fight a fire stop working.** Putting out the battery fire means
     not firing this turn.
   - A ladder costs two turns, a walk along a deck one: on a galleon, sending
     the surgeon to the magazine is a real journey.

### Legacy V1 (still shipped)

"Nouvelle Traversée" still runs the original fleet combat and its procedural
grid map. It is being replaced step by step and nothing new should be built on
it — see `docs/refonte/PLAN.md`.

### Keyboard

| Key | Action |
|-----|--------|
| `Esc` / `P` | Pause menu (Fleet, Captain, Inventory, Encyclopedia, Options…) |
| `M` | Jump to the sea chart during a run |
| `Enter` / click | Confirm |

### Developer / debug mode

Toggle with **`Ctrl + Shift + D`**. Opens a console + FPS overlay.

- Console commands: `gold 1000`, `heal fleet`, `win combat`, `unlock all`,
  `level ship 10`, `spawn enemy pirate_sloop`, `spawn boss kraken`.
- Shortcuts: `F1` menu · `F2` +gold · `F3` heal · `F4` level up · `F5` win ·
  `F6` spawn enemy · `F7` spawn boss · `F8` ship editor.
  (`F6`/`F7` add a foe to a fight already under way.)

## ✅ Tests

```bash
node test/run.js     # data + integrity checks, no install required
```

Zero dependencies — plain `node`. The suite validates **data**, not code
paths: ids that disagree with their key, dangling cross-references, effect
flags no system reads, locale keys present in one language and missing from
the other. That is the bug class a syntax check cannot catch, and the one
that broke the previous prototype.

For runtime regressions the data tests cannot see:

```bash
python3 -m http.server 8000 &
npm i playwright-core        # dev-only; the game itself still ships no deps
node tools/playtest.mjs 4       # plays full combats, fails on any console error
node tools/contrast-audit.mjs   # WCAG ratios, measured on rendered pixels
```

The contrast audit samples the **screenshot**, not computed styles: the
backgrounds are painted by a canvas and by a fixed layer behind the app, so a
DOM-walking audit sees none of them and reports "0 failures" on an unreadable
screen. That is not hypothetical — it is how a real bug hid. See
`design-system.html` §15.

### Sprite Editor (game-design tool)

From the title screen → **Sprite Editor**. A pure **pixel-art editor** for ship
sprites: start from a **library of base shapes** (Sloop, Frigate, Galleon,
Monster, or blank), then redraw the hull, masts, castles, sails, flags and
cannons on a 10×10 grid (left-click paints the selected part, right-click
erases). Pick hull/flag colours, see a live preview, and **export the sprite as
JSON**. This is an internal design tool and is meant to be removed from the
final game.

---

## 🗂️ Architecture

Data and logic are strictly separated so content can be balanced or added
without touching code.

```
index.html            Entry point (loads src/main.js as an ES module)
css/style.css         Pixel-art pirate UI (deep ocean / wood / gold palette)

data/                 All game content (externalized JSON)
  ships.json          Player ship classes (Sloop, Frigate, Galleon)
  enemies.json        5 base enemies
  bosses.json         The Almirante — Spanish flagship (multi-phase)
  ammo.json           Cannonball / ammunition types
  upgrades.json       Ship level-up upgrades
  relics.json         Run-modifying relics & synergies
  events.json         Narrative choices (Mysterious Isle)

locales/              Internationalization — no text hardcoded in logic
  fr.json  en.json

design-system.html    Interface reference: palette, components, contrast checks
histoire.html         The world: 1640-1697 context and historical figures
docs/refonte/         Refonte brief, plan and visual mockups — read first
test/                 Zero-dependency suite (node test/run.js) — 68 checks
tools/                Dev tooling: headless playtest driver, contrast audit

src/
  === refonte ===
  shipPlans.js        Deck plans per hull class: rooms, passages, specialties
  deckView.js         Profile rendering: the sprite frames the deck plan
  battle.js           Combat rules — pure, deterministic, no DOM, no randomness
  run.js              Run state: archetypes, charter clauses, morale, legitimacy
  caribbean.js        The real Caribbean: places, coastlines, sea legs
  screens/pont.js         Deck-plan harness (steps 2-3)
  screens/bataille.js     The fight (step 4)
  screens/traversee.js    Crew, charter and chart (step 5)

  === shared ===
  main.js             Bootstrap: load data + locales, deep links, start
  data.js             JSON loader
  i18n.js             Translation (t / locName / locField), live language switch
  state.js            Game state, save/load, sprite spec building
  nav.js              Minimal screen router
  ui.js               DOM helpers, modal, background selection per screen
  sprites.js          Procedural ship renderer + hull metadata (no image assets)
  ocean.js            Animated sky and ocean background
  toast.js  tooltip.js  hud.js  fx.js
  debug.js            Developer mode (console + F-keys + FPS overlay)

  === legacy V1, being replaced ===
  combat.js           Fleet combat engine
  map.js              Procedural branching sea chart
  abilities.js  pause.js
  screens/            title.js port.js shipyard.js treasure.js event.js editor.js
```

### Adding content

- **A new ship / enemy / relic** = add one entry to the matching JSON file
  (and its `name_fr` / `name_en`). No code change needed.
- **A new language string** = add the key to `locales/fr.json` and
  `locales/en.json`; reference it with `t('key')`.

---

## 📐 Refonte progress

The rebuild follows the eight gated steps of `docs/refonte/brief.md` §12. No
step starts before the previous one's exit condition is met.

| # | Step | State |
|---|---|---|
| 0 | Clean slate: data validation, drop the Kraken | ✅ |
| 1 | Deck plans, rooms, passages, specialties | ✅ |
| 2 | Profile rendering — the sprite frames the plan | ✅ |
| 3 | Crew movement — real routes, turn cost, fire | ✅ |
| 4 | Combat 1-v-1 — range, localized damage, fire, boarding | ✅ *(design gate unjudged, see below)* |
| 5 | Run loop — archetypes, charter, Caribbean chart | ✅ |
| 6 | Meta-progression — officers, prize register, calendar | — |
| 7 | Interface pass — only once the mechanics are frozen | — |
| 8 | Content — last | — |

**The step-4 gate is not cleared by the author.** The brief asks for five
combats played and the feeling "do I take her or sink her?" to be confirmed by a
human. What is verified is that the choice exists and is priced:

| Strategy | Outcome | Turns | Gold | Losses |
|---|---|---|---|---|
| Sink | wreck | 7 | 27 | none |
| Take | **prize** | 5 | **180 + the ship** | 22 men |
| Board too early | *you* are taken | 7 | 0 | the whole crew |
| Linger alongside | *you* are taken | 7 | 0 | 40 men |

---

*Rebuilt against the refonte brief. Priority: make the core loop bite before
adding anything to it.*
