// Audit du geste — mesuré sur le rendu réel, jamais déduit de la configuration.
//   python3 -m http.server 8000 &
//   node tools/geste-audit.mjs
//
// POURQUOI CET OUTIL EXISTE, en une phrase : le premier banc d'essai a livré
// cinq variantes dont quatre étaient indistinguables, et tous ses tests
// passaient.
//
// Ils vérifiaient que les cinq FONCTIONNENT — la volée part, la main se refait,
// rien en console. Aucun ne vérifiait qu'elles se DISTINGUENT. Mesuré après
// coup sur le rendu, avec le même glissement pour toutes : 29, 34, 32 et 32 px
// de retard derrière le doigt, 0° de rotation partout, la même échelle à trois
// décimales. L'échelle vivait dans le code et nulle part sur l'écran.
//
// C'est la règle 6 du dépôt : une contrainte sans instrument est un vœu.
// `test/gestes.test.js` regarde la CONFIGURATION — aucun caractère ne doit
// être un clone d'un autre. Celui-ci regarde le RENDU, et les deux sont
// nécessaires : une configuration distincte peut se peindre à l'identique, et
// deux rendus distincts peuvent l'être par accident.
//
// LE GLISSEMENT EST CELUI QU'ON FAIT VRAIMENT : une poussée DROITE vers le
// haut. C'est le second défaut du premier banc — ses différenciateurs étaient
// branchés sur une vitesse horizontale, une vitesse haute ou le tirage vers le
// bas, dont une montée au pouce ne produit aucun.
//
// L'outil échoue (code de sortie 1) dès que deux caractères se ressemblent.

import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://localhost:8000';
const PAGE = `${BASE}/docs/refonte/mockups/f-gamefeel.html`;
const CHEMIN = process.env.CHROMIUM_PATH || undefined;

// LES SEUILS DE SÉPARATION. Ils ne sont pas choisis à l'œil : 15 px, c'est
// l'écart en deçà duquel deux retards ne se distinguent pas sur un écran de
// téléphone tenu à bout de bras — les quatre variantes indistinguables du
// premier banc tenaient dans 5.
const ECART_RETARD = 15;   // px
const ECART_ANGLE = 5;     // degrés

const DECORS = ['gf-mote', 'gf-grain', 'gf-trainee', 'gf-empreinte', 'gf-braise'];

async function empreinteDe(page, i) {
  await page.click(`.bc-barre .bc-rangee:nth-child(1) .bc-chip:nth-child(${i + 2})`);
  const uids = await page.$$eval('.carte', (ns) => ns.map((n) => n.dataset.uid));
  for (let k = 0; k < 3; k++) await page.click(`.carte[data-uid="${uids[k]}"]`);
  const sel = `.carte[data-uid="${uids[2]}"]`;
  const depart = await page.$eval(sel, (n) => {
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  await page.mouse.move(depart.x, depart.y);
  await page.mouse.down();
  const releves = [];
  for (let k = 1; k <= 16; k++) {
    await page.mouse.move(depart.x, depart.y - k * 22, { steps: 1 });
    await page.waitForTimeout(16);
    releves.push(await page.evaluate(({ sel: s, decors }) => {
      const n = document.querySelector(s);
      const m = new DOMMatrix(getComputedStyle(n).transform);
      const compte = {};
      for (const d of decors) compte[d] = document.querySelectorAll(`.${d}`).length;
      compte['gf-amarres'] = document.querySelectorAll('.gf-amarres path[d]:not([d=""])').length;
      compte['gf-visee'] = document.querySelectorAll('.gf-visee path[d]:not([d=""])').length;
      return {
        y: m.m42,
        // `rotateX` n'apparaît pas dans une matrice 2D : on le lit sur la
        // composante m33 de la matrice 3D, qui vaut cos(angle).
        cabre: Math.round(Math.acos(Math.max(-1, Math.min(1, m.m33))) * 180 / Math.PI),
        rot: Math.atan2(m.m12, m.m11) * 180 / Math.PI,
        decor: compte,
      };
    }, { sel, decors: DECORS }));
  }
  await page.mouse.up();
  // ON LAISSE LE RETOUR SE TERMINER. Les ressorts ramènent les cartes en
  // ~260 ms, puis l'écran se refait ; couper au milieu mesure un DOM détaché,
  // et la variante suivante clique sur des cartes qui bougent encore.
  await page.waitForFunction(() => !document.querySelector('.carte.prise-en-main'), null, { timeout: 4000 });
  await page.waitForTimeout(120);

  const doigt = -16 * 22;
  const fin = releves[releves.length - 1];
  const decor = {};
  for (const cle of [...DECORS, 'gf-amarres', 'gf-visee']) {
    decor[cle] = Math.max(...releves.map((r) => r.decor[cle] || 0));
  }
  return {
    retard: Math.round(fin.y - doigt),
    cabre: Math.max(...releves.map((r) => Math.abs(r.cabre))),
    rot: Math.round(Math.max(...releves.map((r) => Math.abs(r.rot)))),
    decor,
  };
}

const nav = await chromium.launch({ executablePath: CHEMIN });
const page = await nav.newPage({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const plaintes = [];
page.on('pageerror', (e) => plaintes.push(`erreur JS : ${e.message}`));

await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.banc .main .carte');
await page.waitForTimeout(600);
// Le fantôme est éteint pour la mesure : il ajoute des nœuds au décor et
// masquerait ce qui vient du caractère lui-même.
await page.click('.bc-chip.bc-fantome');

const noms = await page.$$eval('.bc-barre .bc-rangee:nth-child(1) .bc-chip:not(.bc-fantome) .bc-nom',
  (ns) => ns.map((n) => n.textContent));

const empreintes = [];
for (let i = 0; i < noms.length; i++) empreintes.push(await empreinteDe(page, i));

console.log('\n╭─ le geste — cinq caractères, même glissement ─────────────');
console.log('│ caractère    retard  cabrage  rotation  décor');
empreintes.forEach((e, i) => {
  const decor = Object.entries(e.decor).filter(([, n]) => n > 0)
    .map(([c, n]) => `${c.replace('gf-', '')}×${n}`).join(' ') || '—';
  console.log(`│ ${noms[i].padEnd(12)} ${String(e.retard).padStart(5)}px ${String(e.cabre).padStart(7)}° ${String(e.rot).padStart(8)}°  ${decor}`);
});

// DEUX CARACTÈRES SE DISTINGUENT SI AU MOINS UNE CHOSE LES SÉPARE. On n'exige
// pas qu'ils diffèrent partout — un caractère a UNE signature, c'est le
// principe — mais qu'aucune paire ne soit jumelle.
for (let a = 0; a < empreintes.length; a++) {
  for (let b = a + 1; b < empreintes.length; b++) {
    const A = empreintes[a], B = empreintes[b];
    const raisons = [];
    if (Math.abs(A.retard - B.retard) >= ECART_RETARD) raisons.push('retard');
    if (Math.abs(A.cabre - B.cabre) >= ECART_ANGLE) raisons.push('cabrage');
    if (Math.abs(A.rot - B.rot) >= ECART_ANGLE) raisons.push('rotation');
    for (const cle of Object.keys(A.decor)) {
      if ((A.decor[cle] > 0) !== (B.decor[cle] > 0)) { raisons.push(cle.replace('gf-', '')); }
    }
    if (!raisons.length) {
      plaintes.push(`${noms[a]} et ${noms[b]} se ressemblent : `
        + `retard ${A.retard}/${B.retard} px, cabrage ${A.cabre}/${B.cabre}°, `
        + `rotation ${A.rot}/${B.rot}°, même décor`);
    }
  }
}

console.log('╰───────────────────────────────────────────────────────────');
if (plaintes.length) {
  console.log(`\n✗ ${plaintes.length} problème(s) :`);
  for (const p of plaintes) console.log(`   ${p}`);
} else {
  console.log('\n✓ les cinq caractères se distinguent deux à deux.');
}
await nav.close();
process.exit(plaintes.length ? 1 : 0);
