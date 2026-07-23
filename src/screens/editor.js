// Pixel-art Ship Sprite Editor — a game-design tool (removed for the final game).
// Redraw hull shapes, masts, castles, sails, flags, cannons on a pixel grid,
// starting from a library of base shapes, and export the sprite as JSON.
import { el, mount, modal } from '../ui.js';
import { t } from '../i18n.js';
import { register, go } from '../nav.js';
import { TEMPLATES, PART_LEGEND, swatchColor, drawGrid } from '../sprites.js';
import { toastSuccess } from '../toast.js';

const COLS = 10, ROWS = 10;

// Editor working state.
let grid;          // ROWS x COLS array of chars
let brush = 'H';   // currently selected part
let hull = '#c0554d';
let flag = '#b23b3b';
let isMonster = false;
let painting = false;
let shapeId = 'frigate';

// --- grid helpers ---
function blankGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
}
// Load a base template (array of strings), bottom-aligned into the ROWS x COLS grid.
function loadTemplate(tpl) {
  const g = blankGrid();
  const startRow = ROWS - tpl.length;
  for (let y = 0; y < tpl.length; y++) {
    const row = tpl[y];
    for (let x = 0; x < COLS; x++) {
      g[startRow + y][x] = row[x] || '.';
    }
  }
  return g;
}
function gridToStrings() {
  return grid.map((row) => row.join(''));
}

let previewCanvas, gridWrap;

function render() {
  if (!grid) { grid = loadTemplate(TEMPLATES.frigate); }

  const left = el('div', { class: 'editor-col' }, [
    el('h3', { text: t('editor_shapes') }),
    el('div', { class: 'shape-lib' }, [
      shapeBtn('sloop', t('shape_sloop'), TEMPLATES.sloop),
      shapeBtn('frigate', t('shape_frigate'), TEMPLATES.frigate),
      shapeBtn('galleon', t('shape_galleon'), TEMPLATES.galleon),
      shapeBtn('monster', t('shape_monster'), TEMPLATES.monster),
      shapeBtn('blank', t('shape_blank'), null),
    ]),
    el('h3', { text: t('editor_parts') }),
    el('div', { class: 'parts-palette' }, PART_LEGEND.map(partSwatch)),
  ]);

  previewCanvas = el('canvas', { class: 'editor-preview' });
  previewCanvas.width = 200; previewCanvas.height = 200;

  gridWrap = buildGrid();

  const center = el('div', { class: 'editor-center' }, [
    el('h3', { text: t('editor_grid') }),
    gridWrap,
    el('div', { class: 'editor-tools' }, [
      colorField(t('editor_color'), hull, (v) => { hull = v; repaint(); }),
      colorField(t('editor_flag_color'), flag, (v) => { flag = v; repaint(); }),
      toggleField(t('editor_monster'), isMonster, (v) => { isMonster = v; repaint(); }),
      el('button', { class: 'btn btn-ghost', text: `🧹 ${t('editor_clear')}`, on: { click: () => { grid = blankGrid(); repaint(); } } }),
    ]),
  ]);

  const right = el('div', { class: 'editor-col' }, [
    el('h3', { text: t('editor_preview') }),
    previewCanvas,
    el('div', { class: 'editor-actions' }, [
      el('button', { class: 'btn btn-primary', text: t('editor_export'), on: { click: exportJson } }),
      el('button', { class: 'btn btn-ghost', text: t('editor_back'), on: { click: () => { grid = null; go('title'); } } }),
    ]),
    el('div', { class: 'editor-note', text: t('editor_note') }),
  ]);

  const root = el('div', { class: 'screen editor-screen' }, [
    el('div', { class: 'editor-header', text: `🎨 ${t('editor_title')}` }),
    el('div', { class: 'editor-grid pixel', on: {} }, [left, center, right]),
  ]);
  mount(root);
  repaint();
}

function shapeBtn(id, label, tpl) {
  const preview = el('canvas', { class: 'shape-preview' });
  preview.width = 48; preview.height = 48;
  drawGrid(preview, tpl || TEMPLATES.frigate, { color: '#c9a24b', flag: '#b23b3b', isMonster: id === 'monster' });
  if (!tpl) { const c = preview.getContext('2d'); c.clearRect(0, 0, 48, 48); }
  const b = el('button', { class: `shape-btn ${shapeId === id ? 'active' : ''}`, on: { click: () => {
    shapeId = id;
    grid = tpl ? loadTemplate(tpl) : blankGrid();
    isMonster = id === 'monster';
    render();
  } } }, [preview, el('span', { text: label })]);
  return b;
}

function partSwatch(part) {
  const sw = el('span', { class: 'part-color', style: `background:${part.ch === '.' ? 'transparent' : swatchColor(part.ch, hull, flag, isMonster)}` });
  if (part.ch === '.') sw.classList.add('eraser');
  const b = el('button', {
    class: `part-btn ${brush === part.ch ? 'active' : ''}`,
    on: { click: () => { brush = part.ch; render(); } },
  }, [sw, el('span', { class: 'part-name', text: `${t(part.key)}` })]);
  return b;
}

function buildGrid() {
  const wrap = el('div', { class: 'pixel-grid', style: `grid-template-columns: repeat(${COLS}, 1fr);` });
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c];
      const cell = el('div', { class: `px-cell ${ch === '.' ? 'empty' : ''}`, style: cellStyle(ch) });
      cell.dataset.r = r; cell.dataset.c = c;
      cell.addEventListener('mousedown', (e) => { e.preventDefault(); painting = true; paint(r, c, e.button === 2); });
      cell.addEventListener('mouseenter', (e) => { if (painting) paint(r, c, (e.buttons & 2) === 2); });
      cell.addEventListener('contextmenu', (e) => { e.preventDefault(); paint(r, c, true); });
      wrap.appendChild(cell);
    }
  }
  return wrap;
}

function cellStyle(ch) {
  if (ch === '.') return '';
  return `background:${swatchColor(ch, hull, flag, isMonster)}`;
}

function paint(r, c, erase) {
  const ch = erase ? '.' : brush;
  if (grid[r][c] === ch) return;
  grid[r][c] = ch;
  // Update just this cell + the preview (cheap, avoids full re-render while dragging).
  const idx = r * COLS + c;
  const cell = gridWrap.children[idx];
  if (cell) { cell.className = `px-cell ${ch === '.' ? 'empty' : ''}`; cell.style.cssText = cellStyle(ch); }
  drawPreview();
}

function repaint() {
  // Recolour every cell (after a colour/monster change) and redraw preview.
  if (gridWrap) {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const cell = gridWrap.children[r * COLS + c];
      const ch = grid[r][c];
      if (cell) { cell.className = `px-cell ${ch === '.' ? 'empty' : ''}`; cell.style.cssText = cellStyle(ch); }
    }
  }
  drawPreview();
}

function drawPreview() {
  if (previewCanvas) drawGrid(previewCanvas, gridToStrings(), { color: hull, flag, isMonster });
}

function colorField(label, value, onChange) {
  const input = el('input', { class: 'ed-color', attrs: { type: 'color', value } });
  input.addEventListener('input', () => onChange(input.value));
  return el('label', { class: 'ed-field' }, [el('span', { text: label }), input]);
}

function toggleField(label, value, onChange) {
  const btn = el('button', { class: `toggle ${value ? 'on' : 'off'}`, text: value ? t('options_on') : t('options_off') });
  btn.addEventListener('click', () => { onChange(!btn.classList.contains('on')); btn.className = `toggle ${!value ? 'on' : 'off'}`; });
  return el('label', { class: 'ed-field' }, [el('span', { text: label }), btn]);
}

function exportJson() {
  const data = {
    id: `custom_${Date.now().toString(36)}`,
    color: hull,
    flag,
    isMonster,
    grid: gridToStrings(),
  };
  const json = JSON.stringify(data, null, 2);
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
  toastSuccess(t('editor_copied'), '📋');
}

// Stop painting when the mouse is released anywhere.
window.addEventListener('mouseup', () => { painting = false; });

register('editor', render);
