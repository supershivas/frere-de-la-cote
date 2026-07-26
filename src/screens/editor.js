// Generative Ship Editor — a game-design tool (removed for the final game).
// Composes a spriteSpec (hull class, rigging, colours, flag) and renders it
// live through the SAME generateShipGrid()/drawGrid() pipeline the game uses,
// so what you see here is exactly what combat/port/shipyard will render.
// A stats panel lets you author the full ships.json def (stats + ability +
// rarity/role/faction) and copy it out, ready to paste.
import { el, mount } from '../ui.js';
import { t } from '../i18n.js';
import { register, go } from '../nav.js';
import { HULL_CLASSES, FLAG_KEYS, generateShipGrid, generatedShipPalette, drawGrid } from '../sprites.js';
import { DB, saveCustomShip } from '../data.js';
import { ABILITIES } from '../abilities.js';
import { state, makeShip } from '../state.js';
import { toastSuccess } from '../toast.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'cursed'];
const SCALE = 5; // fixed px-per-cell so all hull classes render at the same absolute scale

let spec, meta, statsState;
let previewCanvas, readoutEl;

function defaultSpec() {
  return {
    hullClass: 3,
    sailsPerMast: 2,
    jibs: 1,
    seed: (Math.random() * 1e9) | 0,
    flag: { motif: 'Crâne', bg: '#161616', sym: '#e6d9bd' },
    colors: { hull: '#5a3d25', sail: '#e6d9bd', faction: '#8a1f1f' },
  };
}
function defaultMeta() {
  return { name: 'Le Corsaire', role: 'versatile', rarity: 'common', faction: 'free_pirates' };
}
function defaultStats() {
  return { hp: 160, armor: 12, shield: 20, damage: 34, accuracy: 0.85, speed: 12, evasion: 0.15, morale: 70, crew_capacity: 8, ability: 'broadside' };
}

function jibRange() {
  const c = HULL_CLASSES[spec.hullClass];
  return c.masts === 1 ? [1, c.jibsMax] : [0, c.jibsMax];
}

// Keep sails/jibs valid whenever the hull class changes.
function clampToClass() {
  const c = HULL_CLASSES[spec.hullClass];
  spec.sailsPerMast = Math.max(1, Math.min(spec.sailsPerMast, c.sailsMax));
  const [jMin, jMax] = jibRange();
  spec.jibs = Math.max(jMin, Math.min(spec.jibs, jMax));
}

function render() {
  if (!spec) { spec = defaultSpec(); meta = defaultMeta(); statsState = defaultStats(); }
  clampToClass();

  const root = el('div', { class: 'screen editor-screen' }, [
    el('div', { class: 'editor-header', text: `⚓ ${t('editor_title')}` }),
    el('div', { class: 'editor-grid' }, [leftCol(), centerCol(), rightCol()]),
  ]);
  mount(root);
  drawPreview();
}

// ---------------- helpers ----------------

function seg(values, current, onPick, label) {
  const wrap = el('div', { class: 'seg' });
  values.forEach((v) => {
    const b = el('button', {
      text: label ? label(v) : String(v),
      attrs: { 'aria-pressed': String(v === current) },
      on: { click: () => onPick(v) },
    });
    wrap.appendChild(b);
  });
  return wrap;
}

function colorField(label, value, onChange) {
  const input = el('input', { class: 'ed-color', attrs: { type: 'color', value } });
  input.addEventListener('input', () => onChange(input.value));
  return el('label', { class: 'ed-field' }, [el('span', { text: label }), input]);
}

function textField(label, value, onChange) {
  const input = el('input', { class: 'ed-input', attrs: { type: 'text', value, maxlength: 28 } });
  input.addEventListener('input', () => onChange(input.value));
  return el('label', { class: 'ed-field' }, [el('span', { text: label }), input]);
}

function sliderField(label, value, min, max, step, onChange, fmt) {
  const out = el('b', { text: fmt ? fmt(value) : String(value) });
  const input = el('input', { class: 'ed-range', attrs: { type: 'range', min, max, step, value } });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    out.textContent = fmt ? fmt(v) : String(v);
    onChange(v);
  });
  return el('div', { class: 'ed-field ed-slider' }, [el('span', { text: label }), input, out]);
}

// ---------------- left column: hull, rig, colours, flag ----------------

function leftCol() {
  const c = HULL_CLASSES[spec.hullClass];
  const [jMin, jMax] = jibRange();
  const sailsVals = []; for (let s = 1; s <= c.sailsMax; s++) sailsVals.push(s);
  const jibVals = []; for (let j = jMin; j <= jMax; j++) jibVals.push(j);

  return el('div', { class: 'editor-col' }, [
    el('h3', { text: t('editor_hull_class') }),
    seg([1, 2, 3, 4, 5, 6], spec.hullClass, (v) => { spec.hullClass = v; render(); }, (v) => ROMAN[v - 1]),
    el('div', { class: 'hint', text: t('editor_hull_class_hint', { masts: c.masts, ports: c.rows * c.ports }) }),

    el('h3', { text: t('editor_sails_per_mast') }),
    seg(sailsVals, spec.sailsPerMast, (v) => { spec.sailsPerMast = v; render(); }),

    el('h3', { text: t('editor_jibs') }),
    seg(jibVals, spec.jibs, (v) => { spec.jibs = v; render(); }),
    el('div', { class: 'hint', text: c.masts === 1 ? t('editor_jibs_hint_solo') : t('editor_jibs_hint') }),

    el('div', { class: 'divider' }),

    el('h3', { text: t('editor_colors') }),
    el('div', { class: 'colors' }, [
      colorField(t('editor_hull_color'), spec.colors.hull, (v) => { spec.colors.hull = v; drawPreview(); }),
      colorField(t('editor_sail_color'), spec.colors.sail, (v) => { spec.colors.sail = v; drawPreview(); }),
      colorField(t('editor_faction_color'), spec.colors.faction, (v) => { spec.colors.faction = v; drawPreview(); }),
    ]),

    el('h3', { text: t('editor_flag') }),
    seg(FLAG_KEYS, spec.flag.motif, (v) => { spec.flag.motif = v; render(); }),
    el('div', { class: 'colors', style: 'margin-top:8px' }, [
      colorField(t('editor_flag_bg'), spec.flag.bg, (v) => { spec.flag.bg = v; drawPreview(); }),
      colorField(t('editor_flag_sym'), spec.flag.sym, (v) => { spec.flag.sym = v; drawPreview(); }),
    ]),
  ]);
}

// ---------------- center column: live preview ----------------

function centerCol() {
  previewCanvas = el('canvas', { class: 'editor-preview' });
  readoutEl = el('div', { class: 'hint', style: 'margin-top:8px' });

  const stage = el('div', { class: 'ship-preview-stage' }, [previewCanvas]);

  return el('div', { class: 'editor-center' }, [
    el('h3', { text: t('editor_preview') }),
    stage,
    readoutEl,
    textField(t('editor_ship_name'), meta.name, (v) => { meta.name = v || 'Sans nom'; updateReadout(); }),
    el('button', { class: 'btn-level-2', text: `🎲 ${t('editor_reroll')}`, on: { click: () => { spec.seed = (Math.random() * 1e9) | 0; drawPreview(); } } }),
    el('div', { class: 'editor-actions' }, [
      el('button', { class: 'btn-level-1', text: `📋 ${t('editor_copy_def')}`, on: { click: copyDef } }),
      el('button', { class: 'btn-level-3', text: `🧪 ${t('editor_test_fleet')}`, on: { click: testInFleet } }),
      el('button', { class: 'btn-level-3', text: `🖼️ ${t('editor_export_png')}`, on: { click: exportPng } }),
      el('button', { class: 'btn-level-3', text: `🧾 ${t('editor_export_svg')}`, on: { click: exportSvg } }),
      el('button', { class: 'btn-level-4', text: t('editor_back'), on: { click: () => { spec = null; go('title'); } } }),
    ]),
    el('div', { class: 'editor-note', text: t('editor_note') }),
  ]);
}

function updateReadout() {
  if (!readoutEl) return;
  const c = HULL_CLASSES[spec.hullClass];
  readoutEl.innerHTML = `<b>${meta.name}</b> — ` + t('editor_readout', {
    masts: c.masts, sails: spec.sailsPerMast, ports: c.rows * c.ports, jibs: spec.jibs,
  });
}

function drawPreview() {
  clampToClass();
  const gen = generateShipGrid(spec);
  const palette = generatedShipPalette(spec);
  previewCanvas.width = gen.W * SCALE;
  previewCanvas.height = gen.H * SCALE;
  drawGrid(previewCanvas, gen.grid, { color: palette, flag: '', facing: 1 });
  updateReadout();
}

// ---------------- right column: stats panel (game design) ----------------

const STAT_ROWS = [
  ['hp', 40, 400, 5],
  ['armor', 0, 40, 1],
  ['shield', 0, 60, 1],
  ['damage', 5, 70, 1],
  ['accuracy', 0.5, 1, 0.01],
  ['speed', 2, 24, 1],
  ['evasion', 0, 0.6, 0.01],
  ['morale', 20, 100, 1],
  ['crew_capacity', 1, 16, 1],
];
const PCT_STATS = new Set(['accuracy', 'evasion']);

function rosterStats(key) {
  const vals = Object.values(DB.ships).map((d) => d.stats?.[key]).filter((v) => typeof v === 'number');
  if (!vals.length) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { min, max, avg };
}

function fmtStat(key, v) {
  return PCT_STATS.has(key) ? `${Math.round(v * 100)}%` : Math.round(v * 10) / 10;
}

function rightCol() {
  const sliders = STAT_ROWS.map(([key, min, max, step]) => {
    const row = sliderField(t(`stat_${key === 'crew_capacity' ? 'crew' : key}`), statsState[key], min, max, step,
      (v) => { statsState[key] = v; renderCompare(key); }, (v) => fmtStat(key, v));
    row.dataset.statKey = key;
    const cmp = el('div', { class: 'stat-compare', attrs: { 'data-key': key } });
    fillCompare(cmp, key);
    return el('div', { class: 'stat-row-block' }, [row, cmp]);
  });

  const abilitySel = el('select', { class: 'ed-input' });
  Object.values(ABILITIES).forEach((a) => {
    const opt = el('option', { text: t(a.nameKey), attrs: { value: a.id } });
    if (a.id === statsState.ability) opt.selected = true;
    abilitySel.appendChild(opt);
  });
  abilitySel.addEventListener('change', () => { statsState.ability = abilitySel.value; });

  return el('div', { class: 'editor-col' }, [
    el('h3', { text: t('editor_stats_panel') }),
    ...sliders,
    el('div', { class: 'divider' }),
    el('label', { class: 'ed-field' }, [el('span', { text: t('editor_ability') }), abilitySel]),
    el('label', { class: 'ed-field' }, [el('span', { text: t('editor_rarity') })]),
    seg(RARITIES, meta.rarity, (v) => { meta.rarity = v; render(); }, (v) => t(`rarity_${v}`) || v),
    textField(t('editor_role'), meta.role, (v) => { meta.role = v; }),
    textField(t('editor_faction'), meta.faction, (v) => { meta.faction = v; }),
  ]);
}

function fillCompare(node, key) {
  const rs = rosterStats(key);
  if (!rs) { node.textContent = ''; return; }
  node.innerHTML = `${t('editor_min')} <b>${fmtStat(key, rs.min)}</b> · ${t('editor_avg')} <b>${fmtStat(key, rs.avg)}</b> · ${t('editor_max')} <b>${fmtStat(key, rs.max)}</b>`;
}
function renderCompare(key) {
  const node = document.querySelector(`.stat-compare[data-key="${key}"]`);
  if (node) fillCompare(node, key);
}

// ---------------- canonical def export ----------------

function slug(name) {
  return (name || 'bateau').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'bateau';
}

function typeForClass() {
  const masts = HULL_CLASSES[spec.hullClass].masts;
  if (masts === 1) return 'sloop';
  if (masts === 2) return 'frigate';
  return 'galleon';
}

function buildDef() {
  const id = `custom_${slug(meta.name)}`;
  const rounded = {};
  for (const [key] of STAT_ROWS) rounded[key] = PCT_STATS.has(key) ? Math.round(statsState[key] * 100) / 100 : Math.round(statsState[key]);
  return {
    id,
    name_fr: meta.name,
    name_en: meta.name,
    type: typeForClass(),
    role: meta.role || 'versatile',
    faction: meta.faction || 'free_pirates',
    rarity: meta.rarity || 'common',
    desc_fr: `Navire de classe ${ROMAN[spec.hullClass - 1]}, conçu dans l'éditeur de bateau.`,
    desc_en: `Class ${ROMAN[spec.hullClass - 1]} ship, designed in the Ship Editor.`,
    stats: rounded,
    ability: statsState.ability,
    color: spec.colors.hull,
    spriteSpec: JSON.parse(JSON.stringify(spec)),
  };
}

function copyDef() {
  const def = buildDef();
  const json = JSON.stringify(def, null, 2);
  navigator.clipboard?.writeText(json).catch(() => {});
  toastSuccess(t('editor_copied'), '📋');
}

function testInFleet() {
  const def = buildDef();
  saveCustomShip(def);
  if (state.fleet.length < 5) state.fleet.push(makeShip(def.id));
  toastSuccess(`${t('editor_saved')} — ${def.name_fr}`, '🧪');
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function exportPng() {
  const gen = generateShipGrid(spec);
  const palette = generatedShipPalette(spec);
  const cv = document.createElement('canvas');
  cv.width = gen.W * 8; cv.height = gen.H * 8;
  drawGrid(cv, gen.grid, { color: palette, flag: '', facing: 1 });
  cv.toBlob((b) => download(b, `${slug(meta.name)}.png`));
}

function exportSvg() {
  const gen = generateShipGrid(spec);
  const palette = generatedShipPalette(spec);
  const scale = 8;
  let rects = '';
  for (let y = 0; y < gen.H; y++) {
    let x = 0;
    while (x < gen.W) {
      const ch = gen.grid[y][x];
      if (ch === '.') { x++; continue; }
      let x2 = x;
      while (x2 < gen.W && gen.grid[y][x2] === ch) x2++;
      rects += `<rect x="${x * scale}" y="${y * scale}" width="${(x2 - x) * scale}" height="${scale}" fill="${palette[ch] || '#000'}"/>`;
      x = x2;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${gen.W * scale}" height="${gen.H * scale}" viewBox="0 0 ${gen.W * scale} ${gen.H * scale}" shape-rendering="crispEdges">${rects}</svg>`;
  download(new Blob([svg], { type: 'image/svg+xml' }), `${slug(meta.name)}.svg`);
}

register('editor', render);
