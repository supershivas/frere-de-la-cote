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

// LES MODULES SONT CEUX QUE LA MAQUETTE IMPORTE, ET RIEN QU'EUX — relevés
// dans son `<script>`, puis suivis de proche en proche.
//
// La liste était FIXE, la même pour toutes les maquettes. Le jour où deux
// modules ont porté le même nom de fonction — `attendre`, `secousse`, `onde`,
// des primitives que tout le monde réécrit — le contrôle de doublon ci-dessous
// a fait échouer TOUTES les maquettes, y compris celles qui n'importaient ni
// l'un ni l'autre. Une seule portée ne pardonne pas les homonymes (règle 13),
// mais elle n'a à contenir que ce dont la page se sert.
//
// L'ORDRE VIENT DES DÉPENDANCES, il n'est plus écrit à la main : à plat, celui
// qui en utilise un autre doit venir après, et une liste tenue à la main finit
// toujours par mentir.
const importesPar = (src) => [...src.matchAll(/^\s*import[^;]*?from\s+['"]([^'"]+)['"];?\s*$/gm)]
  .map((m) => m[1]).filter((r) => /^\.{0,2}\/?src\/|^\.\//.test(r))
  .map((r) => 'src/' + r.replace(/^.*\//, ''));

function modulesDe(racineSrc) {
  const ordre = [], vu = new Set(), enCours = new Set();
  const visiter = (m) => {
    if (vu.has(m)) return;
    if (enCours.has(m)) throw new Error(`cycle d'imports sur ${m}`);
    enCours.add(m);
    for (const d of importesPar(lire(m))) visiter(d);
    enCours.delete(m); vu.add(m); ordre.push(m);   // les dépendances d'abord
  };
  for (const m of importesPar(racineSrc)) visiter(m);
  return ordre;
}

const DONNEES = { CONTENU: 'data/equipage.json', METEO: 'data/weather.json', PHY: 'data/phylacteres.json' };

// --- CSS : style.css et tout ce qu'elle @importe, dans l'ordre ---
function css(fichier) {
  const src = lire(fichier);
  // `@import "variables.css";` comme `@import url('variables.css');`
  return src.replace(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?\s*;?/g,
    (_, ref) => `\n/* ${ref} */\n${css('css/' + ref.replace(/^\.\//, ''))}\n`);
}

// --- la maquette d'abord : c'est elle qui dit quels modules embarquer ---
const page = lire(entree);
const bloc = page.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!bloc) throw new Error('pas de <script type="module"> dans la maquette');
const MODULES = modulesDe(bloc[1]);

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
    // UN MODULE NE PEUT PAS IMPORTER EN NAMESPACE. Les préfixes ne sont défaits
    // que dans le corps de la maquette ; laissé dans un MODULE, un `C.estFeu(…)`
    // survit à la mise à plat et le fichier autonome s'ouvre sur
    // « C is not defined » : page blanche, une ligne en console, aucun autre
    // signal. C'est exactement le défaut que la règle 13 décrit, et il est
    // arrivé le jour où `src/carteVue.js` a été extrait de la maquette. On
    // échoue ici plutôt que de livrer ça.
    if (/^\s*import\s+\*\s+as\s/.test(ligne)) {
      throw new Error(`${m} importe ${cible} en namespace (\`import * as …\`). `
        + 'À plat, le préfixe reste et la page est blanche. Passe aux imports nommés.');
    }
    src = src.replace(ligne, '');
  }
  return `/* ===== ${m} ===== */\n${src
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '')          // ré-exports : sans objet à plat
    .replace(/^export\s+(?=(const|let|var|function|class|async))/gm, '')}`;
}).join('\n\n');

// --- le script de la maquette, privé de ses imports et de ses fetch ---
// Les préfixes de namespace (`import * as C from …` → `C.jouer`) n'ont plus
// de sens une fois tout à plat : on les retire, quel que soit leur nom. C'est
// ce qui manquait le jour où un second module a été importé de cette façon —
// la page devenait blanche sur un « Voy is not defined ».
const alias = [...bloc[1].matchAll(/^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/gm)].map((m) => m[1]);
let corps = bloc[1]
  .replace(/^import[\s\S]*?;\s*$/gm, '')
  // Le `await Promise.all([...])` qui charge les JSON saute, quels que soient
  // les noms qu'il destructure : une maquette qui n'a besoin que du contenu
  // n'a pas à réclamer la météo pour que ce script la reconnaisse.
  .replace(/const \[[^\]]*\]\s*=\s*await Promise\.all\(\[[\s\S]*?\]\);/, '')
  .replace(/const jget[^\n]*\n/, '');
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

// Seules les données CITÉES par la maquette sont embarquées : une constante
// inutilisée, c'est un fichier autonome plus lourd pour rien.
const donnees = Object.entries(DONNEES)
  .filter(([nom]) => new RegExp(`\\b${nom}\\b`).test(corps))
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
