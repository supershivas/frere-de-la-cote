// The run: crew, contract, chart — brief §10.
//
// Three screens before the first fight, which is the brief's stated ceiling
// (§10.2): pick a crew, vote the contract, sail. The first combat has to land
// in under two minutes.

import { el, mount } from '../ui.js';
import { register, go } from '../nav.js';
import { state } from '../state.js';
import { ARCHETYPES, CLAUSES, voteOn, newRun, crossNode, portStatus, clauseEffects, isDeposed, takePrize } from '../run.js';
import { places, placeById, reachableFrom, nodeCost, coastlines, START_ID } from '../caribbean.js';

let draft = { archetype: 'artilleurs', clauses: [] };

// --- 1. Recruitment (§10.1) --------------------------------------------------

function renderRecrutement() {
  state.screen = 'recrutement';
  const grid = el('div', { class: 'run-cards' });
  for (const arch of Object.values(ARCHETYPES)) {
    const card = el('div', {
      class: `run-card${draft.archetype === arch.id ? ' on' : ''}`,
      on: { click: () => { draft.archetype = arch.id; renderRecrutement(); } },
    }, [
      el('h3', { text: arch.name }),
      el('p', { class: 'style', text: arch.style }),
      el('ul', {}, arch.crew.map((c) => el('li', { text: `${c.name} — ${c.role}` }))),
    ]);
    grid.appendChild(card);
  }
  mount(el('div', { class: 'screen run-screen' }, [
    el('h1', { text: 'Qui embarque ?' }),
    el('p', { class: 'run-sub', text: 'Cinq hommes nommés. Le reste de l’équipage est sans distinction, inscrit au rôle sous une part chacun.' }),
    grid,
    el('div', { class: 'run-nav' }, [
      el('button', { class: 'btn-level-1', text: 'Rédiger la chasse-partie →', on: { click: () => go('chassepartie') } }),
      el('button', { class: 'btn-level-4', text: '← Menu', on: { click: () => go('title') } }),
    ]),
  ]));
}

// --- 2. The chasse-partie (§8.2) --------------------------------------------
// A contract, voted by the whole crew before the expedition. Rendered as a
// signed document, not a menu: the clauses ARE the run modifiers.

function renderChassePartie() {
  state.screen = 'chassepartie';
  const votes = voteOn(draft.clauses, 55);
  const refused = Object.entries(votes).filter(([, v]) => !v.passed).map(([id]) => id);

  const list = el('div', { class: 'charte-clauses' });
  for (const clause of Object.values(CLAUSES)) {
    const picked = draft.clauses.includes(clause.id);
    const vote = votes[clause.id];
    list.appendChild(el('div', {
      class: `charte-clause${picked ? ' on' : ''}${picked && vote && !vote.passed ? ' refused' : ''}`,
      on: {
        click: () => {
          draft.clauses = picked
            ? draft.clauses.filter((c) => c !== clause.id)
            : draft.clauses.concat(clause.id);
          renderChassePartie();
        },
      },
    }, [
      el('div', { class: 'clause-text', text: clause.text }),
      el('div', { class: 'clause-good', text: `+ ${clause.good}` }),
      el('div', { class: 'clause-bad', text: `− ${clause.bad}` }),
      picked && vote
        ? el('div', { class: `clause-vote${vote.passed ? '' : ' no'}`,
            text: vote.passed ? `voté — ${vote.support} voix pour` : `refusé par l’équipage — ${vote.support} voix` })
        : null,
    ]));
  }

  mount(el('div', { class: 'screen run-screen charte' }, [
    el('h1', { text: 'Chasse-partie' }),
    el('p', { class: 'run-sub', text: 'Le capitaine propose, il n’impose pas. Chaque clause est un avantage payé par une contrainte, et l’équipage vote.' }),
    list,
    refused.length
      ? el('p', { class: 'charte-warn', text: 'Une clause refusée ne sera pas portée au contrat.' })
      : null,
    el('div', { class: 'run-nav' }, [
      el('button', {
        class: 'btn-level-1', text: 'Signer et appareiller →',
        on: {
          click: () => {
            const kept = draft.clauses.filter((id) => votes[id]?.passed);
            state.run = newRun({ archetype: draft.archetype, clauses: kept });
            state.run.node = START_ID;
            go('carte', { fresh: true });
          },
        },
      }),
      el('button', { class: 'btn-level-4', text: '← Équipage', on: { click: () => go('recrutement') } }),
    ]),
  ]));
}

// --- 3. The chart (§10.2, §10.3) --------------------------------------------
// The real Caribbean, always entered from the same corner. Every stop states
// its cost before you sail there.

function renderCarte() {
  state.screen = 'carte';
  const run = state.run;
  if (!run) return go('recrutement');
  if (isDeposed(run)) return renderDeposed();

  const here = placeById(run.node) || placeById(START_ID);
  const reachable = reachableFrom(here.id, run.act);
  const board = el('div', { class: 'carte-board' });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'carte-lanes');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');

  // The land. Without it the chart is dots on a blue field; with it the player
  // can see that Carthagène really is on the Spanish Main and the Tortue really
  // is tucked behind Hispaniola.
  for (const coast of coastlines()) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = coast.points.map((pt, i) => `${i ? 'L' : 'M'}${(pt.x * 100).toFixed(2)},${(pt.y * 100).toFixed(2)}`).join(' ');
    path.setAttribute('d', d + (coast.closed ? ' Z' : ''));
    path.setAttribute('class', `carte-land${coast.closed ? ' island' : ' shore'}`);
    svg.appendChild(path);
  }

  // Sea lanes from where we are.
  for (const p of reachable) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', here.x * 100); line.setAttribute('y1', here.y * 100);
    line.setAttribute('x2', p.x * 100); line.setAttribute('y2', p.y * 100);
    line.setAttribute('class', 'carte-lane');
    svg.appendChild(line);
  }
  board.appendChild(svg);

  for (const place of places()) {
    const open = reachable.some((r) => r.id === place.id);
    const isHere = place.id === here.id;
    const seen = run.visited.includes(place.id);
    const cost = nodeCost(place, run);
    const pin = el('button', {
      class: `carte-pin ${place.type} lbl-${place.label || 's'}${open ? ' open' : ''}${isHere ? ' here' : ''}${seen ? ' seen' : ''}`,
      style: `left:${place.x * 100}%; top:${place.y * 100}%`,
      title: `${place.name} — ${place.note}`,
      on: { click: () => open && sailTo(place) },
    }, [
      el('span', { class: 'pin-dot' }),
      // Naming every port at once turns the chart into a wall of text, so only
      // the places that matter right now carry a label; the rest name
      // themselves on hover.
      (open || isHere || seen) ? el('span', { class: 'pin-label', text: place.name }) : null,
      open ? el('span', { class: 'pin-cost', text: cost.label }) : null,
    ]);
    if (!open && !isHere) pin.disabled = true;
    board.appendChild(pin);
  }

  mount(el('div', { class: 'screen run-screen carte-screen' }, [
    runBar(run),
    board,
    el('p', { class: 'carte-hint', text: `Vous êtes à ${here.name}. ${here.note}` }),
  ]));
}

function runBar(run) {
  const st = portStatus(run);
  const stLabel = { commissioned: 'commission valide', tolerated: 'tolérée', outlaw: 'hors-la-loi' }[st];
  return el('div', { class: 'run-bar' }, [
    el('span', { text: `${run.year}` }),
    el('span', { text: `Acte ${run.act}` }),
    el('span', { text: `💰 ${run.gold}` }),
    el('span', { class: run.morale < 25 ? 'low' : '', text: `Moral ${run.morale}` }),
    el('span', { class: st === 'outlaw' ? 'low' : '', text: `Légitimité ${run.legitimacy} — ${stLabel}` }),
    el('span', { text: `Prises ${run.prizes.length}` }),
  ]);
}

function sailTo(place) {
  const run = state.run;
  run.node = place.id;
  if (!run.visited.includes(place.id)) run.visited.push(place.id);
  if (place.act > run.act) run.act = place.act;

  if (place.type === 'chasse' || place.type === 'boss') {
    go('bataille', { fresh: true, fromRun: true, enemyHull: place.type === 'boss' ? 1 : (place.act >= 3 ? 2 : 3), enemyName: place.type === 'boss' ? 'L’Almirante' : 'Nao espagnole' });
    return;
  }
  // §8.3 "pas de prise, pas de paye": crossing a node without a prize costs
  // morale, so avoiding fights is not a strategy.
  crossNode(run, { tookPrize: false });
  if (place.type === 'port') return renderPort(place);
  return renderEvent(place);
}

function renderPort(place) {
  const run = state.run;
  const st = portStatus(run);
  const repairCost = 40;
  mount(el('div', { class: 'screen run-screen' }, [
    el('h1', { text: place.name }),
    el('p', { class: 'run-sub', text: place.note }),
    el('div', { class: 'run-cards' }, [
      el('div', {
        class: 'run-card', on: { click: () => { if (run.gold >= repairCost) { run.gold -= repairCost; run.morale = Math.min(100, run.morale + 5); } go('carte'); } },
      }, [el('h3', { text: 'Radouber' }), el('p', { class: 'style', text: `${repairCost} 💰 · le navire et les hommes se refont` })]),
      el('div', {
        class: 'run-card', on: { click: () => { run.hands += 12; run.gold = Math.max(0, run.gold - 30); go('carte'); } },
      }, [el('h3', { text: 'Recruter' }), el('p', { class: 'style', text: `30 💰 · douze bras de plus à l’abordage` })]),
      el('div', {
        class: 'run-card', on: { click: () => { run.legitimacy = Math.min(100, run.legitimacy + 15); run.gold = Math.max(0, run.gold - 60); go('carte'); } },
      }, [el('h3', { text: 'Faire viser la commission' }), el('p', { class: 'style', text: `60 💰 · ${st === 'outlaw' ? 'le gouverneur hésitera' : 'formalité'}` })]),
    ]),
    el('div', { class: 'run-nav' }, [el('button', { class: 'btn-level-4', text: 'Reprendre la mer', on: { click: () => go('carte') } })]),
  ]));
}

function renderEvent(place) {
  const run = state.run;
  mount(el('div', { class: 'screen run-screen' }, [
    el('h1', { text: place.name }),
    el('p', { class: 'run-sub', text: place.note }),
    el('div', { class: 'run-cards' }, [
      el('div', { class: 'run-card', on: { click: () => { run.gold += 45; run.legitimacy = Math.max(0, run.legitimacy - 10); go('carte'); } } },
        [el('h3', { text: 'Piller le mouillage' }), el('p', { class: 'style', text: '+45 💰 · −10 légitimité' })]),
      el('div', { class: 'run-card', on: { click: () => { run.morale = Math.min(100, run.morale + 10); go('carte'); } } },
        [el('h3', { text: 'Laisser les hommes à terre' }), el('p', { class: 'style', text: '+10 moral · rien dans les cales' })]),
    ]),
  ]));
}

// §8.5: a run can end without a death. The council puts the captain ashore;
// the officers and the reputation carry over.
function renderDeposed() {
  mount(el('div', { class: 'screen run-screen' }, [
    el('h1', { text: 'Le conseil vous dépose' }),
    el('p', { class: 'run-sub', text: 'Vous n’êtes pas mort. Vous êtes débarqué. L’équipage élit un autre capitaine, et vous regardez partir votre navire depuis le quai.' }),
    el('div', { class: 'run-nav' }, [
      el('button', { class: 'btn-level-1', text: 'Recommencer', on: { click: () => { state.run = null; go('recrutement'); } } }),
      el('button', { class: 'btn-level-4', text: '← Menu', on: { click: () => go('title') } }),
    ]),
  ]));
}

// Called by the battle screen when a fight resolves.
export function battleResolved(outcome, gain, enemy) {
  const run = state.run;
  if (!run) return;
  if (outcome === 'prize') {
    takePrize(run, { name: enemy?.name || 'Prise', gold: gain.gold, hullClass: enemy?.hullClass, at: run.node });
    crossNode(run, { tookPrize: true });
  } else if (outcome === 'sunk') {
    run.gold += gain.gold;
    crossNode(run, { tookPrize: false });
  } else {
    run.morale = Math.max(0, run.morale - 25);
  }
}

register('recrutement', renderRecrutement);
register('chassepartie', renderChassePartie);
register('carte', renderCarte);
