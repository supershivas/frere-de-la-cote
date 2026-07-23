// Procedurally generated branching sea chart (Slay the Spire / FTL style).
import { el, mount } from './ui.js';
import { t } from './i18n.js';
import { register, go } from './nav.js';
import { state, saveGame, relicMods } from './state.js';
import { renderHud } from './hud.js';
import { attachTooltip } from './tooltip.js';
import { toastInfo } from './toast.js';

const ROWS = 8;

// Weighted node-type table for the interior of the map.
const TYPE_WEIGHTS = [
  ['combat', 34],
  ['elite', 12],
  ['port', 15],
  ['shipyard', 12],
  ['treasure', 12],
  ['mystery', 15],
];

const NODE_META = {
  start: { icon: '⚓', key: 'node_start', danger: 0 },
  combat: { icon: '⚔️', key: 'node_combat', danger: 1 },
  elite: { icon: '☠️', key: 'node_elite', danger: 2 },
  boss: { icon: '👑', key: 'node_boss', danger: 3 },
  port: { icon: '🏝️', key: 'node_port', danger: 0 },
  shipyard: { icon: '🔨', key: 'node_shipyard', danger: 0 },
  treasure: { icon: '💰', key: 'node_treasure', danger: 0 },
  mystery: { icon: '🌫️', key: 'node_mystery', danger: 1 },
};

function pickWeighted(table) {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [val, w] of table) {
    r -= w;
    if (r <= 0) return val;
  }
  return table[0][0];
}

export function generateMap(act = 1) {
  const rows = [];
  let idCounter = 0;
  for (let row = 0; row < ROWS; row++) {
    let count;
    if (row === 0 || row === ROWS - 1) count = 1;
    else count = 2 + Math.floor(Math.random() * 3); // 2-4
    const nodes = [];
    for (let c = 0; c < count; c++) {
      let type;
      if (row === 0) type = 'start';
      else if (row === ROWS - 1) type = 'boss';
      else if (row === 1) type = Math.random() < 0.7 ? 'combat' : 'mystery';
      else if (row === ROWS - 2) type = c === 0 ? 'port' : pickWeighted(TYPE_WEIGHTS);
      else type = pickWeighted(TYPE_WEIGHTS);
      nodes.push(makeNode(idCounter++, row, c, count, type, act));
    }
    rows.push(nodes);
  }

  // Connect adjacent rows.
  for (let row = 0; row < ROWS - 1; row++) {
    const cur = rows[row];
    const nxt = rows[row + 1];
    for (const node of cur) {
      const targets = nearestTargets(node, cur.length, nxt);
      node.next = targets.map((n) => n.id);
    }
    // Ensure every next-row node has an incoming edge.
    for (const nn of nxt) {
      const hasIncoming = cur.some((n) => n.next.includes(nn.id));
      if (!hasIncoming) {
        const src = nearestNode(nn, cur);
        if (!src.next.includes(nn.id)) src.next.push(nn.id);
      }
    }
  }

  const flat = rows.flat();
  const byId = {};
  flat.forEach((n) => (byId[n.id] = n));
  const start = rows[0][0];
  return { act, rows, byId, startId: start.id, bossId: rows[ROWS - 1][0].id };
}

function makeNode(id, row, col, rowCount, type, act) {
  const meta = NODE_META[type];
  const baseDanger = meta.danger;
  const danger = Math.min(3, baseDanger + (act - 1) + (type === 'boss' ? 0 : 0));
  return {
    id, row, col, rowCount, type,
    x: (col + 0.5) / rowCount,
    y: row / (ROWS - 1),
    next: [],
    visited: false,
    danger,
    reward: rewardFor(type),
  };
}

function rewardFor(type) {
  switch (type) {
    case 'combat': return { gold: 30, label: '💰⚙️' };
    case 'elite': return { gold: 60, label: '💰⭐' };
    case 'boss': return { gold: 250, label: '👑⭐' };
    case 'treasure': return { gold: 0, label: '💰?' };
    case 'mystery': return { gold: 0, label: '🌫️?' };
    default: return { gold: 0, label: '' };
  }
}

function nearestTargets(node, curCount, nextRow) {
  // Connect to 1-2 nodes whose normalized column is closest.
  const sorted = [...nextRow].sort(
    (a, b) => Math.abs(a.x - node.x) - Math.abs(b.x - node.x)
  );
  const n = 1 + (Math.random() < 0.5 ? 1 : 0);
  return sorted.slice(0, Math.min(n, sorted.length));
}

function nearestNode(node, row) {
  return [...row].sort((a, b) => Math.abs(a.x - node.x) - Math.abs(b.x - node.x))[0];
}

// --- Rendering ---

function render(opts = {}) {
  state.screen = 'map';
  if (opts.fresh || !state.map) {
    state.map = generateMap(state.act);
    state.currentNodeId = state.map.startId;
    state.map.byId[state.currentNodeId].visited = true;
  }
  const map = state.map;
  const reveal = relicMods().revealMap;

  const board = el('div', { class: 'map-board' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'map-edges');
  svg.setAttribute('preserveAspectRatio', 'none');
  board.appendChild(svg);

  const current = map.byId[state.currentNodeId];
  const available = new Set(current.visited ? current.next : []);

  // Draw edges.
  for (const node of Object.values(map.byId)) {
    for (const nid of node.next) {
      const to = map.byId[nid];
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', `${node.x * 100}%`);
      line.setAttribute('y1', `${node.y * 100}%`);
      line.setAttribute('x2', `${to.x * 100}%`);
      line.setAttribute('y2', `${to.y * 100}%`);
      const active = node.id === current.id && available.has(nid);
      line.setAttribute('class', `edge ${active ? 'edge-active' : ''} ${node.visited && to.visited ? 'edge-done' : ''}`);
      svg.appendChild(line);
    }
  }

  // Draw nodes.
  for (const node of Object.values(map.byId)) {
    const meta = NODE_META[node.type];
    const isAvailable = available.has(node.id);
    const isCurrent = node.id === current.id;
    const btn = el('button', {
      class: `map-node ${node.type} ${isAvailable ? 'available' : ''} ${node.visited ? 'visited' : ''} ${isCurrent ? 'current' : ''}`,
      style: `left:${node.x * 100}%; top:${node.y * 100}%`,
      text: meta.icon,
    });
    if (isAvailable) {
      btn.addEventListener('click', () => visitNode(node));
    } else {
      btn.disabled = true;
    }
    attachTooltip(btn, () => nodeTooltip(node, reveal || node.visited || isAvailable));
    board.appendChild(btn);
  }

  const root = el('div', { class: 'screen map-screen' }, [
    renderHud(),
    el('div', { class: 'map-title-bar' }, [
      el('h2', { text: t('map_title') }),
      el('div', { class: 'map-hint', text: t('choose_route') }),
    ]),
    board,
  ]);
  mount(root);
  saveGame();
}

function nodeTooltip(node, revealed) {
  const meta = NODE_META[node.type];
  if (!revealed) return `<div class="tt-title">${t('locked_node')}</div>`;
  const dangerLabels = ['—', t('danger_low'), t('danger_medium'), t('danger_high')];
  let html = `<div class="tt-title">${meta.icon} ${t(meta.key)}</div>`;
  if (node.type !== 'start' && node.type !== 'boss') {
    html += `<div class="tt-sub">${t('danger')}: ${dangerLabels[node.danger] || '—'}</div>`;
  }
  if (node.reward && node.reward.label) {
    html += `<div class="tt-desc">${t('reward')}: ${node.reward.label}</div>`;
  }
  return html;
}

function visitNode(node) {
  state.currentNodeId = node.id;
  node.visited = true;
  routeToNode(node);
}

// Dispatch to the correct screen/flow for a node type.
function routeToNode(node) {
  switch (node.type) {
    case 'combat':
      go('combat', { kind: 'combat', danger: node.danger });
      break;
    case 'elite':
      go('combat', { kind: 'elite', danger: node.danger });
      break;
    case 'boss':
      toastInfo(t('toast_boss'), '👑');
      go('combat', { kind: 'boss', bossId: 'mechanical_kraken' });
      break;
    case 'port':
      go('port');
      break;
    case 'shipyard':
      go('shipyard');
      break;
    case 'treasure':
      go('treasure');
      break;
    case 'mystery':
      go('event');
      break;
    default:
      go('map');
  }
}

// Called after a node's flow resolves to return to the chart.
export function returnToMap() {
  // If the just-completed node was the boss, the run is won (handled in combat).
  go('map');
}

register('map', render);
