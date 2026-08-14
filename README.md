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

## 🎮 How to play

1. **New Voyage** — start a run with your flagship Frigate + a Sloop.
2. **Sea chart** — a branching map (Slay the Spire / FTL style). Hover a node to
   see its danger and rewards, then click a reachable node to sail there.
3. **Combat** — turn-based. Enemy **intentions** are shown above each ship
   before you act. Each of your ships takes one action per turn:
   - **Attack** with a chosen ammo type (classic / explosive / incendiary /
     chain / harpoon — each with different tactical effects).
   - **Ability** (unique per ship class), **Repair**, **Defend**, **End turn**,
     or **Flee** (not vs bosses).
4. Win to earn **gold**, **XP** (ships level up → pick 1 of 3 upgrades), and
   relics. Visit **ports**, **shipyards**, **treasure** and **mysterious isles**
   between fights. Beat **the Almirante**, flagship of the Indies fleet, to
   complete the run.

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
node tools/playtest.mjs 4    # plays full combats, fails on any console error
```

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

docs/refonte/         Refonte brief, plan and visual mockups — read first
test/                 Zero-dependency data & integrity suite (node test/run.js)
tools/                Dev tooling (headless playtest driver)

src/
  main.js             Bootstrap: load data + locales, wire input, start
  data.js             JSON loader
  i18n.js             Translation (t / locName / locField), live language switch
  state.js            Game state, fleet instances, relics, XP, save/load, meta
  nav.js              Minimal screen router
  ui.js               DOM helpers + reusable components (ship cards, tooltips)
  hud.js              Shared resource/act/relics/pause header
  sprites.js          Procedural pixel-art ship renderer (no image assets)
  ocean.js            Animated pixel ocean background
  fx.js               Combat FX: cannonballs, explosions, shake, damage numbers
  toast.js            Stackable toast notifications (success / danger / info)
  tooltip.js          Cursor-following hover tooltips
  abilities.js        Ability metadata (ids → i18n keys + cooldowns)
  combat.js           Turn-based combat engine (AI intentions, ammo, phases)
  map.js              Procedural branching sea chart
  pause.js            Pause menu (fleet / captain / inventory / encyclopedia…)
  debug.js            Developer mode (console + F-keys + FPS overlay)
  screens/
    title.js  port.js  shipyard.js  treasure.js  event.js  editor.js
```

### Adding content

- **A new ship / enemy / relic** = add one entry to the matching JSON file
  (and its `name_fr` / `name_en`). No code change needed.
- **A new language string** = add the key to `locales/fr.json` and
  `locales/en.json`; reference it with `t('key')`.

---

## ✅ Version 1 scope (implemented)

- [x] Title screen + language toggle
- [x] Procedurally generated branching map
- [x] Turn-based naval combat with a clear battlefield: allies always LEFT,
      enemies always RIGHT, enemy intentions on their inner edge
- [x] Contextual per-ship action menu — the active ship's portrait, name, HP,
      shield and active effects are shown, and its available actions depend on
      its type, capabilities and upgrades (e.g. the Galleon can Protect an ally)
- [x] Localized combat visuals: ships floating on animated water, flying
      cannonballs, impact explosions, ship recoil and struck-ship jolts, smoke
      from damaged hulls and floating damage numbers — no full-screen flash
- [x] 3 allied ship classes (Sloop, Frigate, Galleon) with unique abilities
- [x] 5 base enemies + AI behaviours
- [x] Act boss: the Almirante, Spanish flagship (multi-phase, enrage)
- [x] 5 ammo types, status effects (fire, slow, immobilize, brace)
- [x] Gold economy, ship XP & upgrade choices, relics & synergies
- [x] Ports, shipyards, treasure chests, narrative events
- [x] Toast notifications, hover tooltips, pause menu, encyclopedia
- [x] Developer/debug mode (console + shortcuts)
- [x] FR/EN internationalization (JSON)
- [x] Externalized game data (JSON)
- [x] Internal pixel-art sprite editor (shape library + grid painting + export)

### Roadmap (V2+)

Full 5-ship fleet, more bosses, permanent meta-progression HQ, unlockable
captains, sound/music, and additional acts. See the design document for details.

---

*Prototype built for the **Frères de la Côte** GDD — priority: prove the core
gameplay loop.*
