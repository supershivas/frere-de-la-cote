// Profile deck view — brief §5.1, §5.3, §6.3.
//
// The generated sprite IS the frame of the deck plan: the hull the editor draws
// is the box the rooms are laid into, so the asset pipeline finally serves the
// combat instead of decorating it. The ship is drawn as a cutaway — the whole
// hull, keel included — with the waterline as a line across it, because the
// player must see every room to play the fight.
//
// This module renders and animates; it owns no rules. Room structure, fire and
// crew positions are passed in and mutated by the caller.

import { el } from './ui.js';
import { t } from './i18n.js';
import { getGeneratedShip, drawShip } from './sprites.js';
import { planFor, adjacent, route, SYSTEMS } from './shipPlans.js';

// How far above the main deck line the plan reaches, as a fraction of hull
// depth. The upper-deck rooms (helm, mast, quarterdeck) sit in the upperworks
// above the deck; everything else is inside the hull proper.
const UPPER_BAND = 0.62;

// Vertical slice of the sprite the deck view actually shows. The rigging is
// most of the sprite's height and none of its gameplay, so the view crops to
// the hull plus a little mast: the ship stays recognisable, and the rooms get
// the space the brief asks for ("on doit pouvoir voir toutes les salles").
function viewport(gen) {
  const { yDeck, yBot } = gen.hull;
  const hullDepth = yBot - yDeck;
  const planTop = yDeck - UPPER_BAND * hullDepth;
  const top = Math.max(0, planTop - hullDepth * 0.75); // a little rigging above
  const bottom = Math.min(gen.H, yBot + 2);
  return { top, bottom, height: bottom - top, planTop };
}

// Maps a room's plan coordinates (percentages of the plan box) onto the cropped
// view, so rooms land inside the drawn hull whatever the hull class.
//
// Mirroring matters: an enemy ship is drawn facing left, which flips the whole
// grid, so the plan has to flip with it. Otherwise the helm is painted on the
// bow — the plan and the hull would disagree about which end is the stern.
function projector(gen, facing) {
  const { x0, x1, yBot } = gen.hull;
  const view = viewport(gen);
  const boxW = x1 - x0;
  const boxH = yBot - view.planTop;
  return (room) => {
    const left = ((x0 + (room.x / 100) * boxW) / gen.W) * 100;
    const width = ((room.w / 100) * boxW / gen.W) * 100;
    return {
      left: facing === -1 ? 100 - left - width : left,
      top: ((view.planTop + (room.y / 100) * boxH - view.top) / view.height) * 100,
      width,
      height: ((room.h / 100) * boxH / view.height) * 100,
    };
  };
}

// Waterline position as a percentage of the cropped view's height.
function waterlinePct(gen) {
  const view = viewport(gen);
  return ((gen.waterY - view.top) / view.height) * 100;
}

/**
 * Render one ship's deck plan into `host`.
 *
 * ship: { spriteSpec, hullClass, structure, fire, crew, facing, mine }
 *   structure  room key → remaining structure
 *   fire       room key → fire intensity (0-3), absent means no fire
 *   crew       [{ id, name, at, ... }]
 * opts: { selectedId, onPickMan, onPickRoom, scale }
 */
export function renderDeck(host, ship, opts = {}) {
  const plan = planFor(ship.hullClass);
  const gen = getGeneratedShip(ship.spriteSpec);
  const facing = ship.facing ?? 1;
  const project = projector(gen, facing);
  const view = viewport(gen);

  host.innerHTML = '';
  host.classList.add('deck');

  // The sprite, drawn as a cutaway — the keel below the waterline stays visible
  // — then slid up inside a clipping frame so only the hull band shows.
  //
  // Everything below is expressed as a ratio rather than in pixels, so the
  // whole view (hull, rooms, crew) scales together when CSS shrinks it to fit
  // a column or a phone. `scale` only sets the rendering resolution.
  const scale = opts.scale || 6;
  const canvas = el('canvas', { class: 'deck-hull' });
  canvas.width = gen.W * scale;
  canvas.height = gen.H * scale;
  drawShip(canvas, { spriteSpec: ship.spriteSpec, facing, waterline: false });
  // drawShip re-picks its own integer scale; read back what it actually used.
  const usedScale = canvas.width / gen.W;
  canvas.style.width = '100%';
  canvas.style.height = `${(gen.H / view.height) * 100}%`;
  canvas.style.top = `${(-view.top / view.height) * 100}%`;
  host.style.width = `${canvas.width}px`;
  host.style.aspectRatio = `${gen.W * usedScale} / ${view.height * usedScale}`;
  host.appendChild(canvas);

  // Sea line across the hull — the ship sits in water, and it moves a little.
  host.appendChild(el('div', { class: 'deck-waterline', style: `top:${waterlinePct(gen)}%` }));

  const selected = opts.selectedId != null
    ? ship.crew.find((c) => c.id === opts.selectedId)
    : null;
  const reachable = selected ? new Set(Object.keys(plan.rooms)) : null;

  // Passages, drawn between the rooms they join so "not everything connects"
  // is visible rather than something the player discovers by being refused.
  for (const [a, b] of plan.doors) {
    const A = project(plan.rooms[a]);
    const B = project(plan.rooms[b]);
    const ax = A.left + A.width / 2;
    const ay = A.top + A.height / 2;
    const bx = B.left + B.width / 2;
    const by = B.top + B.height / 2;
    const sameDeck = Math.abs(ay - by) < Math.max(A.height, B.height) / 2;
    const door = el('div', { class: `deck-door ${sameDeck ? 'hatchway' : 'ladder'}` });
    door.style.left = `${Math.min(ax, bx)}%`;
    door.style.top = `${Math.min(ay, by)}%`;
    door.style.width = `${Math.max(Math.abs(bx - ax), 0.8)}%`;
    door.style.height = `${Math.max(Math.abs(by - ay), 0.8)}%`;
    host.appendChild(door);
  }

  // Rooms.
  for (const [key, room] of Object.entries(plan.rooms)) {
    const box = project(room);
    const hp = ship.structure[key] ?? room.hp;
    const burning = ship.fire?.[key] || 0;
    const classes = ['deck-room'];
    if (burning) classes.push('burning');
    else if (hp <= 0) classes.push('wrecked');
    else if (hp < room.hp) classes.push('damaged');
    if (reachable?.has(key)) classes.push('reachable');
    if (selected?.at === key) classes.push('here');

    const div = el('div', { class: classes.join(' ') });
    div.style.left = `${box.left}%`;
    div.style.top = `${box.top}%`;
    div.style.width = `${box.width}%`;
    div.style.height = `${box.height}%`;
    div.dataset.room = key;

    const pips = el('div', { class: 'deck-pips' });
    for (let i = 0; i < room.hp; i++) {
      pips.appendChild(el('i', { class: i < hp ? '' : 'out' }));
    }
    div.appendChild(el('div', { class: 'deck-room-name', text: t(room.name) }));
    div.appendChild(pips);
    if (burning) div.appendChild(el('div', { class: 'deck-flame', text: '🔥' }));

    if (opts.onPickRoom) div.addEventListener('click', () => opts.onPickRoom(key, ship));
    host.appendChild(div);
  }

  // Crew tokens. Several men in one room fan out so none is hidden.
  const byRoom = {};
  for (const man of ship.crew) (byRoom[man.at] ||= []).push(man);
  for (const [key, men] of Object.entries(byRoom)) {
    const room = plan.rooms[key];
    if (!room) continue; // a man in a room this hull does not have: caller's bug
    const box = project(room);
    men.forEach((man, i) => {
      const token = el('div', {
        class: `deck-man${selected?.id === man.id ? ' selected' : ''}${ship.mine ? '' : ' enemy'}`,
        text: ship.mine ? man.name[0] : '',
      });
      const spread = (i - (men.length - 1) / 2) * (box.width / Math.max(2, men.length + 1));
      token.style.left = `${box.left + box.width / 2 + spread}%`;
      token.style.top = `${box.top + box.height / 2}%`;
      token.title = ship.mine ? `${man.name} — ${t(`spec_${man.specialty}`)}` : '';
      if (ship.mine && opts.onPickMan) {
        token.addEventListener('click', (e) => { e.stopPropagation(); opts.onPickMan(man); });
      }
      host.appendChild(token);
    });
  }

  return { plan, gen };
}

/**
 * Walk a man to `to`, one room at a time, so the trip is visibly a trip.
 * Returns the route taken. `onStep(roomKey, index)` fires as he enters each
 * room — that is where the caller charges a turn and applies burns.
 */
export function walk(ship, man, to, { onStep, onArrive, stepMs = 320 } = {}) {
  const plan = planFor(ship.hullClass);
  const path = route(plan, man.at, to);
  if (!path || path.length === 1) {
    onArrive?.(path || [man.at]);
    return path;
  }
  let i = 1;
  const step = () => {
    man.at = path[i];
    onStep?.(path[i], i);
    i++;
    if (i < path.length) setTimeout(step, stepMs);
    else onArrive?.(path);
  };
  setTimeout(step, stepMs);
  return path;
}

// Rooms a man can reach at all, and what each costs in steps.
export function reachFrom(ship, man) {
  const plan = planFor(ship.hullClass);
  const out = {};
  for (const key of Object.keys(plan.rooms)) {
    const path = route(plan, man.at, key);
    if (path) out[key] = path.length - 1;
  }
  return out;
}

export { adjacent, SYSTEMS };
