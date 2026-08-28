// Assemble une maquette en UN SEUL fichier autonome.
//
//   node tools/bundle-mockup.mjs docs/mockups/jeu.html dist/jeu.html
//
// Pourquoi : la maquette du dépôt charge les vrais modules et les vraies
// feuilles par HTTP — c'est ce qui garantit qu'elle ne réinvente pas
// l'interface à côté. Mais pour la faire ESSAYER à quelqu'un, il faut une page
// qui tienne toute seule, sans serveur. Ce script produit cette page à partir
// des mêmes sources : il n'y a pas de seconde version du jeu à maintenir.
//
// Le procédé tient parce que les modules embarqués (cartes, sprites, ocean,
// fx) n'importent RIEN : il suffit de retirer le mot-clé `export` et de les
// coller bout à bout. Si un jour l'un d'eux importe quoi que ce soit, ce
// script doit échouer plutôt que produire un fichier muet — d'où le contrôle
// ci-dessous.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [entree, sortie = 'dist/bundle.html'] = process.argv.slice(2);
if (!entree) { console.error('usage: node tools/bundle-mockup.mjs <maquette.html> [sortie.html]'); process.exit(1); }

const racine = resolve(dirname(new URL(import.meta.url).pathname), '..');
const lire = (p) => readFileSync(resolve(racine, p), 'utf8');

// DANS L'ORDRE DE DÉPENDANCE : les modules sont collés bout à bout dans une
// seule portée, donc celui qui en utilise un autre doit venir après. Cet ordre
// est écrit une fois pour toutes ; CE QUI CHANGE D'UNE MAQUETTE À L'AUTRE, ce
// sont les modules qu'elle importe, et ils se LISENT dans la maquette plutôt
// que de se redéclarer ici. Deux plateaux coexistent (`e-cartes.html` et
// `jeu.html`) et n'ont pas les mêmes règles : une liste figée aurait
// embarqué les deux dans chacun, ou — bien pire, parce que rien ne le signale —
// livré une page muette pour celui qui n'était pas dans la liste.
const ORDRE = ['src/caribbean.js', 'src/voyage.js', 'src/cartes.js', 'src/simple.js',
  'src/sprites.js', 'src/ocean.js', 'src/fx.js'];

// --- CSS : style.css et tout ce qu'elle @importe, dans l'ordre ---
function css(fichier) {
  const src = lire(fichier);
  // `@import "variables.css";` comme `@import url('variables.css');`
  return src.replace(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?\s*;?/g,
    (_, ref) => `\n/* ${ref} */\n${css('css/' + ref.replace(/^\.\//, ''))}\n`);
}

// --- CE QUE LA MAQUETTE IMPORTE, et ce que ces modules importent à leur tour.
// On part de la maquette et l'on suit les arêtes : un module qu'aucune maquette
// n'importe n'a rien à faire dans son fichier autonome. L'ordre reste celui
// d'`ORDRE` — la découverte dit QUOI embarquer, jamais DANS QUEL ORDRE.
const importsDe = (src) => [...src.matchAll(/^\s*import[^;]*?from\s+['"]([^'"]+)['"];?\s*$/gm)]
  .map((m) => m[1].replace(/^\.\//, '').replace(/^src\//, ''));
const pageSrc = lire(entree);
const atteints = new Set();
const suivre = (src) => {
  for (const f of importsDe(src)) {
    if (atteints.has(f) || !ORDRE.includes(`src/${f}`)) continue;
    atteints.add(f);
    suivre(lire(`src/${f}`));
  }
};
suivre(pageSrc);
const MODULES = ORDRE.filter((m) => atteints.has(m.replace(/^src\//, '')));
if (!MODULES.length) throw new Error(`${entree} n'importe aucun module de ORDRE — rien à embarquer`);

// --- JS : les modules, désexportés et mis à plat ---
//
// Un import interne au bundle n'a plus lieu d'être : les modules partagent une
// portée. On le retire — mais on VÉRIFIE d'abord qu'il pointe vers un module
// embarqué, sinon le fichier autonome serait muet à l'exécution.
const embarques = new Set(MODULES.map((m) => m.replace(/^src\//, '')));
const js = MODULES.map((m) => {
  let src = lire(m);
  for (const [ligne, cible] of [...src.matchAll(/^\s*import[^;]*?from\s+['"]([^'"]+)['"];?\s*$/gm)].map((x) => [x[0], x[1]])) {
    const fichier = cible.replace(/^\.\//, '');
    if (!embarques.has(fichier)) throw new Error(`${m} importe ${cible}, qui n'est pas dans MODULES`);
    src = src.replace(ligne, '');
  }
  return `/* ===== ${m} ===== */\n${src
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '')          // ré-exports : sans objet à plat
    .replace(/^export\s+(?=(const|let|var|function|class|async))/gm, '')}`;
}).join('\n\n');

// --- le script de la maquette, privé de ses imports et de ses fetch ---
const page = pageSrc;
const bloc = page.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!bloc) throw new Error('pas de <script type="module"> dans la maquette');
// Les préfixes de namespace (`import * as C from …` → `C.jouer`) n'ont plus
// de sens une fois tout à plat : on les retire, quel que soit leur nom. C'est
// ce qui manquait le jour où un second module a été importé de cette façon —
// la page devenait blanche sur un « Voy is not defined ».
const alias = [...bloc[1].matchAll(/^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/gm)].map((m) => m[1]);
let corps = bloc[1].replace(/^import[\s\S]*?;\s*$/gm, '');

// LES DONNÉES SE LISENT DANS LA MAQUETTE, elles ne sont pas redéclarées ici.
// Une table `{ CONTENU: 'data/equipage.json', … }` dans cet outil était une
// SECONDE déclaration de ce que la maquette charge : la maquette qui chargeait
// un autre fichier obtenait un `undefined` silencieux, et le fichier autonome
// une page blanche. Deux formes sont reconnues, celles qu'écrivent les deux
// maquettes vivantes — un `Promise.all` de plusieurs fichiers, ou un `fetch`
// isolé.
const donneesLues = [];
corps = corps.replace(
  /const \[([^\]]+)\] = await Promise\.all\(\[([\s\S]*?)\]\);/,
  (tout, noms, dedans) => {
    const fichiers = [...dedans.matchAll(/['"]([^'"]+\.json)['"]/g)].map((m) => m[1]);
    const cles = noms.split(',').map((s) => s.trim());
    if (cles.length !== fichiers.length) throw new Error(`${entree} : ${cles.length} noms pour ${fichiers.length} fichiers de données`);
    cles.forEach((c, i) => donneesLues.push([c, fichiers[i]]));
    return '';
  },
);
corps = corps.replace(
  /const ([A-Za-z_$][\w$]*) = await \(await fetch\(['"]([^'"]+\.json)['"]\)\)\.json\(\);/g,
  (tout, nom, fichier) => { donneesLues.push([nom, fichier]); return ''; },
);
corps = corps.replace(/const jget[^\n]*\n/, '');
if (!donneesLues.length) throw new Error(`${entree} ne charge aucun fichier de données par une forme reconnue — le fichier autonome serait muet`);
for (const a of alias) corps = corps.replace(new RegExp(`\\b${a}\\.([A-Za-z_$][\\w$]*)`, 'g'), '$1');

// Les modules sont collés dans UNE portée : deux déclarations de même nom
// produisent une page blanche et une seule ligne d'erreur en console. On
// échoue ici plutôt que de livrer ça — c'est arrivé avec `scene`, déclaré à la
// fois par src/ocean.js et par la maquette.
// `export ` en tête est FACULTATIF, et c'est tout le sujet : sans lui dans le
// motif, aucun nom EXPORTÉ n'était vu — ni par le contrôle des doublons, ni par
// celui des masquages. Les deux ne surveillaient que les déclarations privées
// des modules, c'est-à-dire la moitié la moins dangereuse.
const nomsDe = (src) => [...src.matchAll(/^(?:export\s+)?(?:const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
const vus = new Map();
for (const [nom, src] of [...MODULES.map((m) => [m, lire(m)]), [entree, corps]]) {
  for (const n of nomsDe(src)) {
    if (vus.has(n)) throw new Error(`nom déclaré deux fois : \`${n}\` dans ${vus.get(n)} et ${nom} — le fichier autonome partage une seule portée`);
    vus.set(n, nom);
  }
}

// ET LE MÊME PIÈGE, UN CRAN PLUS BAS : une variable LOCALE de la maquette qui
// porte le nom d'une déclaration de module. En modules, `const aVenir =
// C.aVenir(P)` est un masquage parfaitement légal. À plat, le préfixe de
// namespace disparaît et la ligne devient `const aVenir = aVenir(P)` — une
// référence à soi-même dans la zone morte temporelle, donc une PAGE BLANCHE et
// une seule ligne en console.
//
// Le contrôle du dessus ne le voyait pas : il n'ancre qu'en début de ligne,
// donc il ne lit que les déclarations de premier niveau. Celui-ci lit les
// déclarations INDENTÉES de la maquette et les confronte aux noms des modules.
// C'est la deuxième fois que la règle 11 coûte un écran noir ; une contrainte
// sans instrument est un vœu (règle 6).
const nomsDeModule = new Set();
for (const m of MODULES) for (const n of nomsDe(lire(m))) nomsDeModule.add(n);
const masques = [...new Set([...corps.matchAll(/^[ \t]+(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)]
  .map((m) => m[1]).filter((n) => nomsDeModule.has(n)))];
if (masques.length) {
  throw new Error(`${entree} déclare localement ${masques.map((n) => `\`${n}\``).join(', ')}, qui porte(nt) `
    + 'déjà ce nom dans un module embarqué. À plat, le masquage transforme un appel `X.nom(…)` '
    + 'en référence à soi-même : la page est blanche. Renomme la variable locale.');
}

const donnees = donneesLues
  .map(([nom, f]) => `const ${nom} = ${lire(f)};`).join('\n');

// UN FAVICON EN LIGNE, ET AUCUN FICHIER. Le dépôt n'a AUCUN asset image
// (CLAUDE.md §8) : un `favicon.ico` posé à côté serait le premier, et il
// faudrait alors le servir, le versionner et le retrouver. Un SVG en data-URI
// vit dans la page, part avec elle, et le fichier autonome le reste.
//
// Sans lui, le navigateur demande `/favicon.ico` à chaque ouverture et
// l'hébergeur répond 404 — une erreur dans la console d'une page qui n'a rien
// à se reprocher, et c'est exactement le bruit qui fait qu'on cesse de lire les
// consoles. Un boulet de fonte sur le crème du carton : la carte du jeu, en
// seize pixels.
const FAVICON = '<link rel="icon" href="data:image/svg+xml,'
  + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    + '<rect width="32" height="32" rx="5" fill="%23f2ead6"/>'
    + '<circle cx="16" cy="17" r="8.5" fill="%232b2723"/>'
    + '<path d="M16 6.5 L16 3 M9 5 L11 8.2 M23 5 L21 8.2" stroke="%23b3261d" stroke-width="2.4" stroke-linecap="round" fill="none"/>'
    + '</svg>').replace(/'/g, '%27')
  + '">';

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">
<title>${(page.match(/<!--\s*titre:\s*([^-]+?)\s*-->/) || [, 'La chasse-partie'])[1]}</title>
${FAVICON}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
<style>
${css('css/style.css')}
html, body { height: 100%; margin: 0; }
</style>
</head>
<body data-bg="sea">
<canvas id="ocean"></canvas>
<div id="parchment"></div>
<main id="app"></main>
<script type="module">
${donnees}

${js}

/* ===== ${entree} ===== */
${corps}
<\/script>
</body>
</html>
`;

// ============================================================
// LE BANC D'ESSAI POUR ORDINATEUR.
//
// DEUX FICHIERS SORTENT, TOUJOURS, et c'est une règle de livraison : celui
// qu'on ouvre SUR un téléphone, et celui qui MONTRE un téléphone sur un
// ordinateur. Le second n'est pas un confort — c'est le seul moyen de regarder
// l'écran de référence (375 × 667) quand on n'a pas l'appareil sous la main, et
// « mobile d'abord » n'est une contrainte que si on peut la vérifier tout de
// suite. Une seule sortie, et l'on ouvrait la maquette en 1 400 px de large :
// tout y tient, donc tout va bien, donc on ne voit rien.
//
// LE JEU EST DANS UNE IFRAME `srcdoc`, pas mis à l'échelle par une transformée.
// Un `transform: scale()` sur une page large ment sur tout ce qui compte : les
// media queries, `innerWidth`, `innerHeight`, la taille réelle d'une cible
// tactile en pixels CSS. L'iframe donne au document une VRAIE fenêtre de 375 px
// — c'est le même mensonge en moins, et c'est ce que mesure `mobile-audit`.
// `srcdoc` et non un fichier voisin : le banc reste UN fichier autonome, qui
// s'ouvre depuis un `file://` ou s'héberge tel quel.
const APPAREILS = [
  { nom: 'iPhone SE', w: 375, h: 667, note: "l'écran de référence" },
  { nom: 'iPhone 14', w: 390, h: 844 },
  { nom: 'Pixel 7', w: 412, h: 915 },
];
const titre = (page.match(/<!--\s*titre:\s*([^-]+?)\s*-->/) || [, 'La chasse-partie'])[1];
// Un attribut HTML : les guillemets doubles et les esperluettes, et rien de
// plus. Échapper au-delà casserait le JavaScript embarqué.
const pourAttribut = (t) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const banc = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${titre} — aperçu téléphone</title>
${FAVICON}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IM+Fell+English+SC&family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
<style>
  /* LE BANC EMPRUNTE LA PALETTE ET LES POLICES DU JEU — chêne, or, encre
     crème, IM Fell et Courier Prime (css/variables.css). Un banc en gris
     système à côté d'un jeu de 1660 aurait été un second vocabulaire à lire
     pour regarder le premier. Il s'assume SOMBRE et ne suit pas le thème du
     visiteur : un châssis de téléphone se regarde sur un fond neutre, et une
     version claire aurait changé la couleur perçue de l'écran qu'il montre. */
  :root {
    --nuit: #100c08; --chene: #2a1f14; --bord: #4a3a26;
    --or: #e8c877; --or-sourd: #a5844c; --encre: #cbb08a; --encre-sourde: #7a6650;
    --titre: 'IM Fell English SC', Georgia, serif;
    --corps: 'Courier Prime', 'Courier New', monospace;
    color-scheme: dark;
  }
  html, body { min-height: 100%; margin: 0; }
  /* LA PAGE DÉFILE PLUTÔT QUE DE ROGNER LE TÉLÉPHONE. Le châssis était un
     élément flex comme les autres : sur une fenêtre courte il RÉTRÉCISSAIT, et
     comme il masque son débordement, il coupait le bas de l'écran montré — sans
     ascenseur et sans rien qui le signale. C'est exactement l'amputation que
     tools/mobile-audit.mjs traque dans le jeu ; un banc d'essai qui la commet
     lui-même ne vaut rien. */
  body {
    background: var(--nuit); color: var(--encre); font-family: var(--corps); font-size: 13px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; padding: 20px; box-sizing: border-box;
  }
  .barre { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .nom {
    font-family: var(--titre); font-size: 19px; color: var(--or);
    letter-spacing: .5px; margin-right: 4px;
  }
  button {
    font-family: var(--titre); font-size: 13px; letter-spacing: .4px;
    color: var(--encre); cursor: pointer;
    background: var(--chene); border: 1px solid var(--bord); border-radius: 5px;
    padding: 8px 12px; min-height: 36px;
    transition: background .15s ease, color .15s ease, border-color .15s ease;
  }
  button:hover { border-color: var(--or-sourd); }
  button:focus-visible { outline: 2px solid var(--or); outline-offset: 2px; }
  button[aria-pressed="true"] { background: var(--bord); color: var(--or); border-color: var(--or-sourd); }
  button .px { font-family: var(--corps); font-size: 11px; font-variant-numeric: tabular-nums; color: var(--encre-sourde); margin-left: 5px; }
  button[aria-pressed="true"] .px { color: var(--or-sourd); }
  /* LE CHÂSSIS EST UNE MESURE, PAS UN DESSIN : sa boîte intérieure fait
     exactement la taille annoncée, sinon le banc mentirait sur ce qu'il montre. */
  .chassis {
    border: 10px solid var(--chene); border-radius: 26px; background: #000;
    box-shadow: 0 18px 50px rgba(0,0,0,.7), 0 0 0 1px var(--bord);
    overflow: hidden; max-width: 100%;
    flex: 0 0 auto;   /* il ne rétrécit JAMAIS : voir la note sur le défilement */
  }
  iframe { display: block; border: 0; background: #000; }
  .pied { font-size: 11.5px; line-height: 1.6; color: var(--encre-sourde); text-align: center; max-width: 52ch; margin: 0; }
  .pied code { color: var(--or-sourd); }
</style>
</head>
<body>
<div class="barre">
  <span class="nom">${titre}</span>
  ${APPAREILS.map((a, i) => `<button type="button" data-w="${a.w}" data-h="${a.h}" aria-pressed="${i === 0}">${a.nom}<span class="px">${a.w}×${a.h}</span></button>`).join('\n  ')}
  <button type="button" id="recharger">Recharger</button>
</div>
<div class="chassis"><iframe id="tel" title="${titre}" width="${APPAREILS[0].w}" height="${APPAREILS[0].h}"
  srcdoc="${pourAttribut(html)}"></iframe></div>
<p class="pied">Une <b>vraie fenêtre</b> de ${APPAREILS[0].w} px, pas une mise à l'échelle :
les media queries, <code>innerWidth</code> et les cibles tactiles y valent ce qu'elles
vaudront sur l'appareil. Pour l'essayer au doigt, ouvre l'autre fichier sur un téléphone.</p>
<script>
  const tel = document.getElementById('tel');
  const source = tel.getAttribute('srcdoc');
  // ON REPART DE ZÉRO à chaque changement de taille. La maquette calibre la
  // largeur des cartes UNE fois au premier rendu — elles ne doivent pas changer
  // de forme sous le pouce — donc un simple redimensionnement montrerait la
  // mise en page de l'appareil précédent. On recharge, et l'on voit la mise en
  // page que l'appareil aurait vraiment.
  // RÉ-ÉCRIRE l'attribut suffit à recharger le document. Le retirer d'abord
  // envoie l'iframe sur une page vide, et la remise dans la même tâche est
  // coalescée : le châssis restait noir, sans une erreur.
  const recharger = () => { tel.setAttribute('srcdoc', source); };
  for (const b of document.querySelectorAll('.barre button[data-w]')) {
    b.addEventListener('click', () => {
      for (const a of document.querySelectorAll('.barre button[data-w]')) a.setAttribute('aria-pressed', String(a === b));
      tel.width = b.dataset.w; tel.height = b.dataset.h;
      // La taille s'applique à la mise en page AVANT le rechargement : sans ce
      // saut d'une image, le document repart dans l'ancienne fenêtre et se
      // calibre pour l'appareil qu'on vient de quitter.
      requestAnimationFrame(() => requestAnimationFrame(recharger));
    });
  }
  document.getElementById('recharger').addEventListener('click', recharger);

  // UN CHÂSSIS NOIR NE DIT PAS POURQUOI. Une politique de sécurité peut refuser
  // le document embarqué (certains hébergeurs interdisent les cadres) : sans ce
  // contrôle, le banc montrerait un rectangle vide, et l'on chercherait le
  // défaut dans le jeu. Le cadre est de même origine que la page, donc on peut
  // simplement regarder s'il a rendu quelque chose.
  setTimeout(() => {
    let vivant = false;
    try { vivant = !!(tel.contentDocument && tel.contentDocument.querySelector('.screen')); } catch (e) { vivant = false; }
    if (vivant) return;
    const dit = document.createElement('p');
    dit.className = 'pied';
    dit.innerHTML = '<b>Le cadre est bloqué ici.</b> Cet hébergeur refuse les documents embarqués : '
      + 'le banc ne peut pas montrer le téléphone. Ouvre le fichier de jeu directement — '
      + 'il fonctionne seul, sur un téléphone comme sur un ordinateur.';
    document.querySelector('.chassis').replaceWith(dit);
  }, 4000);
<\/script>
</body>
</html>
`;

// « APERÇU TÉLÉPHONE », ET NON « BANC » NI « DESKTOP ». Les deux fichiers ne se
// distinguent pas par la machine qui les ouvre — le jeu s'ouvre très bien sur un
// ordinateur — mais par ce qu'ils MONTRENT : l'un est le jeu, l'autre montre le
// jeu à la taille d'un téléphone. « desktop » nommait le contenant et laissait
// deviner le contenu ; le nom dit maintenant ce qu'on va voir.
const sortieBanc = sortie.replace(/(\.html)?$/, '') + '-apercu-telephone.html';
mkdirSync(resolve(racine, dirname(sortie)), { recursive: true });
writeFileSync(resolve(racine, sortie), html);
writeFileSync(resolve(racine, sortieBanc), banc);
console.log(`${sortie} — ${(html.length / 1024).toFixed(0)} Ko, autonome (à ouvrir SUR un téléphone)`);
console.log(`${sortieBanc} — ${(banc.length / 1024).toFixed(0)} Ko, autonome (le même à la taille d'un téléphone, à regarder sur un ordinateur)`);
