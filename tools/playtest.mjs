// Headless playtest driver — plays complete combats and fails on any runtime error.
//
// This is the safety net for the refonte: steps 1-6 of the chantier gut and
// rebuild the combat engine, and a crash that only appears three turns into a
// fight is exactly what unit tests do not catch. Run this after any change to
// combat, the chart or the crew.
//
//   python3 -m http.server 8000 &
//   npm i playwright-core          # dev-only; the game itself ships no deps
//   node tools/playtest.mjs 3
//
// Chromium comes from PLAYWRIGHT_BROWSERS_PATH or CHROMIUM_PATH.
import { chromium } from 'playwright-core';

const N = Number(process.argv[2] || 3);
const EXEC = process.env.CHROMIUM_PATH || undefined;
const errs = [];
const browser = await chromium.launch({ executablePath: EXEC });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errs.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 6).join('\n')));

const scr = () => page.evaluate(() => window.__state && window.__state.screen);
const wait = (ms) => page.waitForTimeout(ms);

// Title → new voyage → faction picker → chart. Also used to restart whenever a
// run ends (defeat or victory drop the player back on the title screen).
async function startRun() {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Nouvelle Travers|New Voyage/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await wait(700);
  const picked = await page.evaluate(() => {
    const c = document.querySelector('.faction-card');
    if (c) { c.click(); return true; }
    return false;
  });
  if (!picked) throw new Error('faction picker never appeared — cannot start a run');
  await wait(1300);
}

await page.goto('http://localhost:8000/index.html');
await wait(1200);
await startRun();

let fought = 0;
let runs = 1;
for (let step = 0; step < 80 && fought < N; step++) {
  if (errs.length) break;
  const s = await scr();

  // Back on the title screen means the run ended — start another one, so a
  // short run does not silently stop the playtest before N combats.
  if (s === 'title') {
    runs++;
    console.log(`run ended, starting run #${runs}`);
    await startRun();
    continue;
  }

  if (s === 'map') {
    const ok = await page.evaluate(() => {
      const n = document.querySelector('.map-node.available:not([disabled])');
      if (n) { n.click(); return true; } return false;
    });
    if (!ok) { console.log('map: no available node'); break; }
    await wait(1500);
    continue;
  }

  if (s === 'combat') {
    const res = await playCombat();
    console.log(`combat #${fought + 1}: ${res}`);
    fought++;
    await wait(1200);
    continue;
  }

  // Any other screen (port / shipyard / treasure / event): take the first
  // enabled button until we are back on the chart. Result modals live in an
  // overlay appended to <body>, so they sit *after* the screen in DOM order —
  // dismiss them first, or we would keep re-clicking the card underneath.
  const clicked = await page.evaluate(() => {
    const overlayBtn = document.querySelector('.overlay .modal button:not([disabled])');
    if (overlayBtn) { overlayBtn.click(); return 'modal: ' + (overlayBtn.textContent || '').trim().slice(0, 24); }
    const bs = [...document.querySelectorAll('button:not([disabled]), .choice, .event-choice')]
      .filter((b) => !b.classList.contains('hud-pause'));
    if (!bs.length) return null;
    bs[0].click();
    return (bs[0].textContent || '').trim().slice(0, 30);
  });
  console.log(`screen ${s}: clicked ${clicked}`);
  await wait(1100);
}

async function playCombat() {
  for (let i = 0; i < 220; i++) {
    if (errs.length) return 'ERROR';
    const s = await scr();
    if (s !== 'combat') return 'left -> ' + s;

    const did = await page.evaluate(() => {
      const q = (sel) => document.querySelector(sel);
      const txt = (b) => (b.textContent || '').trim();

      // Victory / defeat / level-up modal: confirm through it.
      const modal = q('.overlay .modal');
      if (modal) {
        const b = [...modal.querySelectorAll('button:not([disabled])')][0];
        if (b) { b.click(); return 'modal:' + txt(b).slice(0, 20); }
      }
      // Turn intro banner blocking input.
      const intro = q('.turn-intro, .round-intro');
      if (intro) { intro.click(); return 'intro'; }

      // Targeting: pick an enemy ship.
      if (q('.action-popover.targeting')) {
        const en = q('.ship-card.enemy:not(.dead)');
        if (en) { en.click(); return 'target'; }
        const cancel = q('.cancel-target');
        if (cancel) { cancel.click(); return 'cancel-target'; }
      }
      // Popover open: fire.
      const pop = q('.action-popover');
      if (pop) {
        const fire = [...pop.querySelectorAll('button:not([disabled])')]
          .find((b) => /Tirer|Attaqu/i.test(txt(b)));
        if (fire) { fire.click(); return 'fire'; }
        const end = [...pop.querySelectorAll('button:not([disabled])')]
          .find((b) => /Fin de tour|Passer/i.test(txt(b)));
        if (end) { end.click(); return 'end-turn'; }
      }
      // Otherwise select an actionable ally ship.
      const card = q('.ship-card.ally.clickable-active');
      if (card) { card.click(); return 'select'; }
      return 'wait';
    });

    await wait(did === 'wait' ? 500 : 850);
  }
  return 'timeout (still in combat)';
}

console.log(`\ncombats played: ${fought}/${N} across ${runs} run(s)`);
console.log('=== ERRORS ===');
console.log(errs.length ? errs.join('\n---\n') : 'none');
await browser.close();
// Failing when fewer combats were played than asked keeps a driver that quietly
// stops making progress from passing as a green run.
process.exit(errs.length || fought < N ? 1 : 0);
