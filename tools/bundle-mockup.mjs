// Assemble une maquette en UN SEUL fichier autonome.
//
//   node tools/bundle-mockup.mjs docs/refonte/mockups/e-cartes.html dist/e-cartes.html
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
// `f-simple.html`) et n'ont pas les mêmes règles : une liste figée aurait
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

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">
<title>${(page.match(/<!--\s*titre:\s*([^-]+?)\s*-->/) || [, 'La chasse-partie'])[1]}</title>
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

mkdirSync(resolve(racine, dirname(sortie)), { recursive: true });
writeFileSync(resolve(racine, sortie), html);
console.log(`${sortie} — ${(html.length / 1024).toFixed(0)} Ko, autonome`);
