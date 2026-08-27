// Audit mobile — mesuré sur le rendu réel, jamais déduit des media queries.
//   python3 -m http.server 8000 &
//   node tools/mobile-audit.mjs
//
// Pourquoi un outil plutôt qu'une relecture : « mobile first » est une
// intention, et une intention ne casse pas un test. Les quatre défauts
// ci-dessous sont invisibles à l'œil sur un écran d'ordinateur et fatals sur un
// téléphone :
//
//   1. AMPUTATION. Un plateau plus large que la fenêtre est coupé en silence
//      par `#app { overflow-x: hidden }` — pas d'ascenseur, pas d'erreur, la
//      moitié du jeu simplement absente. C'est le pire des quatre parce que
//      rien ne le signale.
//   2. CIBLES TROP PETITES. Sous 44 px (design-system §12.2), un pouce rate.
//   3. DÉBORDEMENT. La page défile horizontalement : la mise en page est cassée.
//   4. SURVOL SEUL. Une information qui n'existe qu'au `:hover` n'existe pas
//      au doigt.
//
// L'outil échoue (code de sortie 1) dès qu'un écran ampute ou déborde.
//
// CE QU'IL NE VOIT PAS, et qu'il faut donc vérifier à la main : le point 4 ne
// lit que les règles CSS `:hover`. Un aperçu construit dans un écouteur
// `mouseenter` en JavaScript — c'est le cas de la maquette D — lui échappe
// complètement, alors que c'est exactement le même défaut. Un outil qui rate
// en silence ce qu'il prétend mesurer est pire qu'aucun outil : la limite est
// écrite ici pour qu'on ne s'y fie pas au-delà de ce qu'elle couvre.

import { chromium } from 'playwright-core';

const CIBLE_MIN = 44;                       // px, design-system §12.2
const ECRANS = [
  { nom: 'iPhone SE', w: 375, h: 667 },
  { nom: 'iPhone 14', w: 390, h: 844 },
  { nom: 'Pixel 7', w: 412, h: 915 },
];

const PAGES = [
  { nom: 'B2 — carte', url: 'docs/refonte/mockups/b2-combat.html', pret: '.rc-carte' },
  { nom: 'B2 — combat', url: 'docs/refonte/mockups/b2-combat.html', pret: '.rc-carte',
    apres: async (p) => { await p.click('.rc-carte .btn-level-1'); } },
  { nom: 'C — la rade', url: 'docs/refonte/mockups/c-rade.html', pret: '.fl-rade' },
  { nom: 'D — la rade tactique', url: 'docs/refonte/mockups/d-breche.html', pret: '.hx-scene' },
  { nom: 'E — la carte', url: 'docs/refonte/mockups/e-cartes.html?sansOuverture&sansTuto', pret: '.ecran-cartes .chart' },
  { nom: 'E — la chasse-partie', url: 'docs/refonte/mockups/e-cartes.html?sansOuverture&sansTuto', pret: '.ecran-cartes .chart',
    apres: async (p) => { await capSurUneChasse(p); } },
  { nom: 'E — le partage', url: 'docs/refonte/mockups/e-cartes.html?sansOuverture&sansTuto', pret: '.ecran-cartes .chart',
    apres: async (p) => {
      // Joue la première prise jusqu'au partage : la boutique est un écran à
      // part entière, et c'est là que 47 % des cartes de recrutement du jeu
      // réel sortaient hors de l'écran. L'écran de jeu n'a plus de bouton —
      // on passe par le clavier, qui double les gestes précisément pour que
      // l'écran reste pilotable sans le pouce.
      if (!(await capSurUneChasse(p))) return;
      for (let tour = 0; tour < 16; tour += 1) {
        if (await p.$('.partage')) break;
        for (let k = 0; k < 3; k += 1) {
          const c = await p.$$('.carte:not(.muet):not(.prise-en-main)');
          if (c[0]) await c[0].click().catch(() => {});
        }
        if (!(await p.$('.carte.prise-en-main'))) break;
        await p.$eval('.screen.ecran-cartes', (n) => {
          n.focus();
          n.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        });
        await p.waitForTimeout(2500);
      }
    } },
  { nom: 'jeu — recrutement', url: 'index.html#recrutement', pret: '.screen' },
  { nom: 'jeu — combat', url: 'index.html#bataille', pret: '.screen' },
  // LE BANC D'ESSAI DU GESTE. Il n'a pas de règles à auditer, mais il a la
  // barre de réglages la plus dense du dépôt — dix cibles tactiles sur deux
  // rangées — et c'est exactement ce qu'un écran de 375 px ampute en silence.
  { nom: 'F — le banc du geste', url: 'docs/refonte/mockups/f-gamefeel.html', pret: '.banc .main .carte' }
];

// Depuis la carte, met le cap sur la première escale de chasse : viser puis
// confirmer, comme un joueur. Rend `false` si aucune n'est ouverte.
async function capSurUneChasse(p) {
  const epingles = await p.$$('.epingle.ouverte');
  for (const e of epingles) {
    await e.click().catch(() => {});
    await p.waitForTimeout(220);
    const ou = await p.$eval('.cap .c-ou', (n) => n.textContent).catch(() => '');
    if (/prise/i.test(ou)) {
      await e.click().catch(() => {});
      await p.waitForTimeout(1500);
      return true;
    }
  }
  return false;
}

// Tout est mesuré DANS la page : c'est le seul endroit où l'on connaît la
// géométrie réelle après mise en page.
const MESURE = (min) => {
  const de = document.documentElement;
  const vue = { w: de.clientWidth, h: de.clientHeight };

  // Amputation : un élément dont la boîte sort de la fenêtre alors qu'un
  // ancêtre masque le débordement. On remonte les ancêtres pour ne pas
  // confondre avec un simple défilement légitime.
  const coupeParUnAncetre = (n) => {
    for (let a = n.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX === 'hidden' || s.overflowX === 'clip') return a;
    }
    return null;
  };

  const ampute = [];
  const interessants = document.querySelectorAll('svg, canvas, .hx-scene, .fl-bande, .deck, .screen > *');
  for (const n of interessants) {
    const r = n.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const deborde = r.left < -1 || r.right > vue.w + 1;
    if (!deborde) continue;
    const a = coupeParUnAncetre(n);
    if (!a) continue;
    const perdu = Math.max(0, -r.left) + Math.max(0, r.right - vue.w);
    ampute.push({
      quoi: (n.className || n.tagName).toString().slice(0, 24),
      largeur: Math.round(r.width),
      perduPx: Math.round(perdu),
      perduPct: Math.round((100 * perdu) / r.width),
    });
  }

  // Cibles tactiles : tout ce qui écoute un clic, ou qui en a l'air.
  const cliquables = document.querySelectorAll(
    'button, a, [role="button"], .hx-fiche, .fl-escadre, .rc-trait, .bat-btn, .bat-ammo-btn, .hx-case.atteignable, .hx-case.visable, .rc-poste-btns button');
  const petites = [];
  for (const n of cliquables) {
    const r = n.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (getComputedStyle(n).display === 'none') continue;
    if (r.width >= min && r.height >= min) continue;
    petites.push({
      quoi: (n.className || n.tagName).toString().slice(0, 24),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }

  // Survol seul, versant CSS uniquement (voir la limite en tête de fichier) :
  // une règle :hover qui change l'affichage, la visibilité, l'opacité ou le
  // contenu porte une information que le doigt ne verra jamais.
  let hoverSeul = 0;
  for (const feuille of document.styleSheets) {
    let regles;
    try { regles = feuille.cssRules; } catch { continue; }   // feuille distante
    for (const r of regles || []) {
      if (!r.selectorText || !r.selectorText.includes(':hover')) continue;
      const s = r.style;
      for (const p of s) {
        if (['display', 'visibility', 'opacity', 'content'].includes(p)) hoverSeul++;
      }
    }
  }

  return {
    vue,
    debordeH: de.scrollWidth > de.clientWidth + 1,
    largeurDoc: de.scrollWidth,
    ampute,
    petites,
    nbCliquables: cliquables.length,
    hoverSeul,
  };
};

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let echecs = 0;

for (const ecran of ECRANS) {
  console.log(`\n╭─ ${ecran.nom} — ${ecran.w}×${ecran.h} ─────────────────────`);
  for (const page of PAGES) {
    const ctx = await b.newContext({
      viewport: { width: ecran.w, height: ecran.h },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8000/' + page.url);
    await p.waitForSelector(page.pret, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(1200);
    if (page.apres) { await page.apres(p).catch(() => {}); await p.waitForTimeout(500); }

    const m = await p.evaluate(MESURE, CIBLE_MIN);
    const dur = m.ampute.length || m.debordeH;
    if (dur) echecs++;
    const etat = dur ? '✗' : m.petites.length ? '~' : '✓';
    console.log(`│ ${etat} ${page.nom}`);
    for (const a of m.ampute.slice(0, 2)) {
      console.log(`│     AMPUTÉ : ${a.quoi} — ${a.perduPx} px hors écran sur ${a.largeur} (${a.perduPct} %)`);
    }
    if (m.debordeH) console.log(`│     DÉBORDE : le document fait ${m.largeurDoc} px pour ${m.vue.w}`);
    if (m.petites.length) {
      const pire = m.petites.sort((x, y) => x.w * x.h - y.w * y.h)[0];
      console.log(`│     ${m.petites.length}/${m.nbCliquables} cibles sous ${CIBLE_MIN} px `
        + `(la plus petite : ${pire.quoi} ${pire.w}×${pire.h})`);
    }
    if (m.hoverSeul) console.log(`│     ${m.hoverSeul} règle(s) :hover portant une information — invisible au doigt`);
    await ctx.close();
  }
}

console.log(`\n${echecs ? `${echecs} écran(s) amputé(s) ou débordant(s).` : 'Aucun écran amputé ni débordant.'}`);
await b.close();
process.exit(echecs ? 1 : 0);
