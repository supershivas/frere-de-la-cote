// Internal Ship Editor: create & balance ships without touching code.
// Left: sprite/color. Center: live preview. Right: editable stats.
import { el, mount, modal } from '../ui.js';
import { t, locName } from '../i18n.js';
import { register, go } from '../nav.js';
import { DB, registerShip } from '../data.js';
import { state, startNewRun } from '../state.js';
import { drawShip, templateFor } from '../sprites.js';
import { getAbility, ABILITIES } from '../abilities.js';
import { toastSuccess } from '../toast.js';

const TYPES = ['sloop', 'frigate', 'galleon', 'brigantine', 'monster'];
const RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'cursed'];
const FACTIONS = ['free_pirates', 'royal_corsairs', 'black_indies', 'cursed_pirates'];

let draft;

function defaultDraft() {
  return {
    id: 'custom_' + Date.now().toString(36),
    name_fr: 'Mon Navire', name_en: 'My Ship',
    type: 'frigate', rarity: 'rare', faction: 'free_pirates',
    ability: 'broadside', color: '#c0554d',
    stats: { hp: 180, armor: 14, shield: 20, damage: 40, accuracy: 0.85, speed: 12, evasion: 0.15, morale: 70, crew_capacity: 8 },
  };
}

function render() {
  state.screen = 'editor';
  if (!draft) draft = defaultDraft();

  // Center preview.
  const preview = el('canvas', { class: 'editor-preview' });
  preview.width = 260; preview.height = 220;
  const refreshPreview = () => drawShip(preview, { type: draft.type, color: draft.color, facing: 1 });

  // Left column: identity + appearance.
  const left = el('div', { class: 'editor-col' }, [
    el('h3', { text: t('editor_identity') }),
    textField(t('editor_name_fr'), draft.name_fr, (v) => (draft.name_fr = v)),
    textField(t('editor_name_en'), draft.name_en, (v) => (draft.name_en = v)),
    selectField(t('editor_category'), TYPES, draft.type, (v) => { draft.type = v; refreshPreview(); }),
    selectField(t('editor_rarity'), RARITIES, draft.rarity, (v) => (draft.rarity = v)),
    selectField(t('editor_faction'), FACTIONS, draft.faction, (v) => (draft.faction = v)),
    selectField(t('editor_ability'), Object.keys(ABILITIES), draft.ability, (v) => (draft.ability = v), (id) => t(getAbility(id).nameKey)),
    colorField(t('editor_color'), draft.color, (v) => { draft.color = v; refreshPreview(); }),
  ]);

  // Right column: stats.
  const statDefs = [
    ['hp', 'stat_hp', 10, 600, 5],
    ['armor', 'stat_armor', 0, 60, 1],
    ['shield', 'stat_shield', 0, 120, 5],
    ['damage', 'stat_damage', 5, 150, 1],
    ['accuracy', 'stat_accuracy', 0.3, 1, 0.01],
    ['speed', 'stat_speed', 1, 30, 1],
    ['evasion', 'stat_evasion', 0, 0.6, 0.01],
    ['morale', 'stat_morale', 0, 100, 5],
    ['crew_capacity', 'stat_crew', 0, 20, 1],
  ];
  const right = el('div', { class: 'editor-col' }, [
    el('h3', { text: t('editor_stats') }),
    ...statDefs.map(([key, labelKey, min, max, step]) => sliderField(t(labelKey), draft.stats[key], min, max, step, (v) => (draft.stats[key] = v))),
  ]);

  const center = el('div', { class: 'editor-center' }, [
    el('h3', { text: t('editor_preview') }),
    preview,
    el('div', { class: 'editor-actions' }, [
      el('button', { class: 'btn btn-primary', text: t('editor_test'), on: { click: () => runTest() } }),
      el('button', { class: 'btn', text: t('editor_add_fleet'), on: { click: addToFleet } }),
      el('button', { class: 'btn', text: t('editor_export'), on: { click: exportJson } }),
      el('button', { class: 'btn btn-ghost', text: t('editor_back'), on: { click: () => { draft = null; go('title'); } } }),
    ]),
  ]);

  const root = el('div', { class: 'screen editor-screen' }, [
    el('div', { class: 'editor-header', text: `🔨 ${t('editor_title')}` }),
    el('div', { class: 'editor-grid' }, [left, center, right]),
  ]);
  mount(root);
  refreshPreview();
}

function textField(label, value, onChange) {
  const input = el('input', { class: 'ed-input', attrs: { value } });
  input.addEventListener('input', () => onChange(input.value));
  return el('label', { class: 'ed-field' }, [el('span', { text: label }), input]);
}

function selectField(label, options, value, onChange, labelFn) {
  const sel = el('select', { class: 'ed-input' });
  options.forEach((o) => {
    const opt = el('option', { text: labelFn ? labelFn(o) : o, attrs: { value: o } });
    if (o === value) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => onChange(sel.value));
  return el('label', { class: 'ed-field' }, [el('span', { text: label }), sel]);
}

function colorField(label, value, onChange) {
  const input = el('input', { class: 'ed-color', attrs: { type: 'color', value } });
  input.addEventListener('input', () => onChange(input.value));
  return el('label', { class: 'ed-field' }, [el('span', { text: label }), input]);
}

function sliderField(label, value, min, max, step, onChange) {
  const out = el('b', { text: fmt(value) });
  const range = el('input', { class: 'ed-range', attrs: { type: 'range', min, max, step, value } });
  range.addEventListener('input', () => {
    const v = step < 1 ? parseFloat(range.value) : parseInt(range.value);
    out.textContent = fmt(v);
    onChange(v);
  });
  return el('label', { class: 'ed-field ed-slider' }, [
    el('span', { text: label }), range, out,
  ]);
}

function fmt(v) { return v < 1 && v > 0 ? `${Math.round(v * 100)}%` : `${v}`; }

function buildDef() {
  return {
    id: draft.id,
    name_fr: draft.name_fr, name_en: draft.name_en,
    type: draft.type, role: 'custom', faction: draft.faction, rarity: draft.rarity,
    desc_fr: 'Navire personnalisé.', desc_en: 'Custom-built ship.',
    stats: { ...draft.stats },
    ability: draft.ability,
    color: draft.color,
  };
}

function addToFleet() {
  const def = buildDef();
  registerShip(def);
  startNewRun(def.id);
  toastSuccess(t('toast_new_ship'), '⚓');
  draft = null;
  go('map', { fresh: true });
}

function exportJson() {
  const def = buildDef();
  const json = JSON.stringify({ [def.id]: def }, null, 2);
  navigator.clipboard?.writeText(json).catch(() => {});
  const ta = el('textarea', { class: 'export-area' });
  ta.value = json;
  const box = el('div', { class: 'result-box' }, [
    el('h3', { text: t('editor_export') }),
    el('div', { class: 'result-sub', text: t('editor_copied') }),
    ta,
    el('button', { class: 'btn', text: t('close'), on: { click: () => close() } }),
  ]);
  const { close } = modal(box, { cls: 'result-overlay' });
  ta.select();
}

// Automated test battle: simulate the custom ship vs a standard enemy and log.
function runTest() {
  const def = buildDef();
  const you = simShip(def, 'You');
  const foe = simShip(DB.enemies.royal_frigate, DB.enemies.royal_frigate.name_en);
  foe.color = DB.enemies.royal_frigate.color;
  const logs = [];
  let round = 0;
  while (you.hp > 0 && foe.hp > 0 && round < 30) {
    round++;
    // Faster ship acts first.
    const order = you.speed >= foe.speed ? [you, foe] : [foe, you];
    for (const atk of order) {
      const def2 = atk === you ? foe : you;
      if (atk.hp <= 0 || def2.hp <= 0) continue;
      const hit = Math.random() < Math.max(0.1, Math.min(0.98, atk.accuracy - def2.evasion));
      if (!hit) { logs.push(`T${round} ${atk.tag} ✗ miss`); continue; }
      let dmg = atk.damage;
      if (def2.shield > 0) { const a = Math.min(def2.shield, dmg); def2.shield -= a; dmg -= a; }
      const hull = Math.max(1, Math.round(dmg - def2.armor));
      def2.hp -= hull;
      logs.push(`T${round} ${atk.tag} → ${def2.tag}: −${hull} (${Math.max(0, Math.round(def2.hp))} HP)`);
    }
  }
  const result = you.hp > 0 ? t('victory') : t('defeat');
  showTestResult(def, result, logs, round);
}

function simShip(d, tag) {
  const s = d.stats;
  return { tag, hp: s.hp, maxHp: s.hp, armor: s.armor, shield: s.shield || 0, damage: s.damage, accuracy: s.accuracy, speed: s.speed, evasion: s.evasion || 0 };
}

function showTestResult(def, result, logs, rounds) {
  const logBox = el('div', { class: 'sim-log' }, logs.map((l) => el('div', { class: 'log-line', text: l })));
  const box = el('div', { class: 'result-box' }, [
    el('h3', { text: `${locName(def)} — ${result}` }),
    el('div', { class: 'result-sub', text: `${t('turn')}: ${rounds} · HP ${def.stats.hp} · 💥 ${def.stats.damage} · 🎯 ${Math.round(def.stats.accuracy * 100)}%` }),
    logBox,
    el('button', { class: 'btn', text: t('close'), on: { click: () => close() } }),
  ]);
  const { close } = modal(box, { cls: 'result-overlay' });
}

register('editor', render);
