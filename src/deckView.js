// Profile deck view — brief §5.1, §5.3, §6.3.
//
// The generated sprite IS the frame of the deck plan: the hull the editor draws
// is the box the rooms are laid into, so the asset pipeline finally serves the
// combat instead of decorating it. The whole ship is shown — rigging included —
// as a cutaway, with the waterline crossing it, because the player has to read
// the ship as a ship and not as a diagram.
//
// Two ships are laid out so their waterlines coincide: they float on the same
// sea. The enemy is drawn smaller, FTL-style, to leave the player's own ship
// the room it deserves.
//
// This module renders and animates; it owns no rules. Room structure, fire and
// crew positions are passed in and mutated by the caller.

import { el } from './ui.js';
import { t } from './i18n.js';
import { getGeneratedShip, drawShip } from './sprites.js';
import { planFor, adjacent, route, routeCost, isLadder, stepCost, SYSTEMS } from './shipPlans.js';

// How far above the main deck line the plan reaches, as a fraction of hull
// depth. The weather-deck spaces (helm, mast, bow) sit in the upperworks above
// the deck line; everything else is inside the hull proper.
const UPPER_BAND = 0.62;

// Maps a room's plan coordinates (percentages of the plan box) onto the sprite,
// so rooms land inside the drawn hull whatever the hull class.
//
// Mirroring matters: an enemy ship is drawn facing left, which flips the whole
// grid, so the plan has to flip with it. Otherwise the helm is painted on the
// bow — the plan and the hull would disagree about which end is the stern.
function projector(gen, facing) {
  const { x0, x1, yDeck, yBot } = gen.hull;
  const planTop = yDeck - UPPER_BAND * (yBot - yDeck);
  const boxW = x1 - x0;
  const boxH = yBot - planTop;
  return (room) => {
    const left = ((x0 + (room.x / 100) * boxW) / gen.W) * 100;
    const width = ((room.w / 100) * boxW / gen.W) * 100;
    return {
      left: facing === -1 ? 100 - left - width : left,
      top: ((planTop + (room.y / 100) * boxH) / gen.H) * 100,
      width,
      height: ((room.h / 100) * boxH / gen.H) * 100,
    };
  };
}

// Where a man's token sits inside his room, as percentages of the sprite box.
function tokenSpot(box, index, count) {
  const spread = (index - (count - 1) / 2) * (box.width / Math.max(2, count + 1));
  return {
    left: box.left + box.width / 2 + spread,
    top: box.top + box.height / 2,
  };
}

/**
 * Render one ship into `host`.
 *
 * ship: { spriteSpec, hullClass, structure, fire, crew, facing, mine }
 * opts: { selectedId, onPickMan, onPickRoom, scale }
 *
 * Returns { gen, waterlinePct } so the caller can align several ships on one sea.
 */
export function renderDeck(host, ship, opts = {}) {
  const plan = planFor(ship.hullClass);
  const gen = getGeneratedShip(ship.spriteSpec);
  const facing = ship.facing ?? 1;
  const project = projector(gen, facing);

  host.innerHTML = '';
  host.classList.add('deck');

  // The whole ship, drawn as a cutaway: the keel below the waterline stays
  // visible, and nothing is cropped away.
  const scale = opts.scale || 6;
  const canvas = el('canvas', { class: 'deck-hull' });
  canvas.width = gen.W * scale;
  canvas.height = gen.H * scale;
  drawShip(canvas, { spriteSpec: ship.spriteSpec, facing, waterline: false });
  const usedScale = canvas.width / gen.W;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  host.style.width = `${gen.W * usedScale}px`;
  host.style.aspectRatio = `${gen.W} / ${gen.H}`;
  host.appendChild(canvas);

  const selected = opts.selectedId != null
    ? ship.crew.find((c) => c.id === opts.selectedId)
    : null;

  // Passages, so "not everything connects" is readable rather than something
  // the player discovers by being refused. Ladders are drawn as ladders.
  for (const [a, b] of plan.doors) {
    const A = project(plan.rooms[a]);
    const B = project(plan.rooms[b]);
    const ax = A.left + A.width / 2;
    const ay = A.top + A.height / 2;
    const bx = B.left + B.width / 2;
    const by = B.top + B.height / 2;
    const ladder = isLadder(plan, a, b);
    const door = el('div', { class: `deck-door ${ladder ? 'ladder' : 'hatchway'}` });
    door.style.left = `${Math.min(ax, bx)}%`;
    door.style.top = `${Math.min(ay, by)}%`;
    door.style.width = `${Math.max(Math.abs(bx - ax), 0.6)}%`;
    door.style.height = `${Math.max(Math.abs(by - ay), 0.6)}%`;
    host.appendChild(door);
  }

  // Rooms. Weather-deck spaces are not compartments — they are open deck, so
  // they get no box, only a name and a deck line under the men standing there.
  for (const [key, room] of Object.entries(plan.rooms)) {
    const box = project(room);
    const hp = ship.structure[key] ?? room.hp;
    const burning = ship.fire?.[key] || 0;
    const classes = ['deck-room'];
    if (room.open) classes.push('open');
    if (burning) classes.push('burning');
    else if (hp <= 0) classes.push('wrecked');
    else if (hp < room.hp) classes.push('damaged');
    if (selected) classes.push(selected.at === key ? 'here' : 'reachable');

    const div = el('div', { class: classes.join(' ') });
    div.style.left = `${box.left}%`;
    div.style.top = `${box.top}%`;
    div.style.width = `${box.width}%`;
    div.style.height = `${box.height}%`;
    div.dataset.room = key;

    const pips = el('div', { class: 'deck-pips' });
    for (let i = 0; i < room.hp; i++) pips.appendChild(el('i', { class: i < hp ? '' : 'out' }));
    div.appendChild(el('div', { class: 'deck-room-name', text: t(room.name) }));
    div.appendChild(pips);
    if (burning) div.appendChild(el('div', { class: 'deck-flame', text: '🔥' }));

    if (opts.onPickRoom) div.addEventListener('click', () => opts.onPickRoom(key, ship));
    host.appendChild(div);
  }

  // Crew tokens, keyed by man id so they can later be moved instead of rebuilt
  // — rebuilding them would kill the CSS transition, and the walk is the point.
  const byRoom = {};
  for (const man of ship.crew) (byRoom[man.at] ||= []).push(man);
  for (const [key, men] of Object.entries(byRoom)) {
    const room = plan.rooms[key];
    if (!room) continue; // a man in a room this hull does not have: caller's bug
    const box = project(room);
    men.forEach((man, i) => {
      const token = el('div', {
        class: `deck-man${selected?.id === man.id ? ' selected' : ''}${ship.mine ? '' : ' enemy'}${man.hurt ? ' hurt' : ''}`,
        text: ship.mine ? man.name[0] : '',
      });
      const spot = tokenSpot(box, i, men.length);
      token.style.left = `${spot.left}%`;
      token.style.top = `${spot.top}%`;
      token.dataset.man = man.id;
      token.title = ship.mine ? `${man.name} — ${t(`spec_${man.specialty}`)}` : '';
      if (ship.mine && opts.onPickMan) {
        token.addEventListener('click', (e) => { e.stopPropagation(); opts.onPickMan(man); });
      }
      host.appendChild(token);
    });
  }

  return { gen, plan, waterlinePct: (gen.waterY / gen.H) * 100 };
}

/**
 * Walk a man to `to`, one room at a time, moving his existing token so the CSS
 * transition actually plays — the trip has to be visible, not teleported.
 *
 * A ladder takes longer than walking a deck, in seconds as well as in turns,
 * so the player feels the difference rather than reading it in a rule.
 *
 * `onStep(roomKey, cost)` fires as he enters each room: that is where the
 * caller charges turns and applies burns.
 */
export function walk(host, ship, man, to, { onStep, onArrive, stepMs = 340 } = {}) {
  const plan = planFor(ship.hullClass);
  const path = route(plan, man.at, to);
  if (!path || path.length === 1) {
    onArrive?.(path || [man.at], 0);
    return path;
  }

  const token = host.querySelector(`[data-man="${man.id}"]`);
  const project = projector(getGeneratedShip(ship.spriteSpec), ship.facing ?? 1);
  let i = 1;

  const step = () => {
    const from = man.at;
    const next = path[i];
    const cost = stepCost(plan, from, next);
    man.at = next;

    if (token) {
      // Re-spread everyone in the destination room so tokens never stack.
      const men = ship.crew.filter((c) => c.at === next);
      const box = project(plan.rooms[next]);
      const spot = tokenSpot(box, men.indexOf(man), men.length);
      token.style.transitionDuration = `${(cost * stepMs) / 1000}s`;
      token.classList.toggle('climbing', isLadder(plan, from, next));
      token.style.left = `${spot.left}%`;
      token.style.top = `${spot.top}%`;
    }

    onStep?.(next, cost);
    i++;
    if (i < path.length) setTimeout(step, cost * stepMs);
    else setTimeout(() => {
      token?.classList.remove('climbing');
      onArrive?.(path, routeCost(plan, path));
    }, cost * stepMs);
  };

  setTimeout(step, 60);
  return path;
}

// Rooms a man can reach, and what each costs in turns.
export function reachFrom(ship, man) {
  const plan = planFor(ship.hullClass);
  const out = {};
  for (const key of Object.keys(plan.rooms)) {
    const path = route(plan, man.at, key);
    if (path) out[key] = routeCost(plan, path);
  }
  return out;
}

export { adjacent, SYSTEMS };
