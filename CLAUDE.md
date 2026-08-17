# Frères de la Côte — notes pour Claude Code

Le projet est en cours de refonte complète du combat/équipage/carte. Avant
de toucher au combat, à la carte, à l'équipage ou aux navires, lire :

- `docs/refonte/brief.md` — brief de refonte complet, document de référence.
  Sa section 2 (suppressions) et sa section 9 (pistes écartées) priment sur
  toute intuition de conception : elles évitent de reconstruire des choses
  déjà testées et rejetées.
- `docs/refonte/PLAN.md` — mapping du brief vers les fichiers réels du
  dépôt (les noms de fichiers du brief, ex. `game.html`/`architecture.html`,
  sont obsolètes ; le dépôt utilise `index.html`/`design-system.html`/`histoire.html`/`src/*.js`).
- `docs/refonte/mockups/` — maquettes jouables. Elles portent une
  `<base href="../../../">` et chargent `css/style.css` et `src/*.js` : une
  maquette **utilise l'interface du jeu**, elle n'en réinvente pas une à côté.
  Si un composant manque, l'ajouter à `css/deck.css` et au §16 du
  `design-system.html`, jamais dans un `<style>` de maquette.

## Déviations actées par rapport au brief

- **La météo (`data/weather.json`, tirée par nœud) reste en jeu.** Le brief
  ne la cite pas explicitement en §2 ; ne pas la supprimer par extrapolation
  à partir du §9 (qui écarte le *vent*, un système différent).
- **La réputation à trois factions et le Kraken Mécanique sont à
  supprimer**, conformément au brief. Le dépôt actuel n'a en réalité qu'un
  scalaire `reputation` (pas trois jauges) : il se refactore directement en
  `legitimacy` (§8.6) à l'étape 6, pas de démontage de système inexistant.
- **La carte macro devient une carte géographique des Caraïbes réelle**,
  avec un point de départ toujours identique — remplace la grille
  procédurale abstraite actuelle de `src/map.js`, à traiter à l'étape 5
  (boucle de partie), pas avant.

## Où vit quoi (après les étapes 0 à 5)

Le code de la refonte et celui de la V1 coexistent. Ne rien construire de neuf
sur le second.

| Module | Rôle |
|---|---|
| `src/shipPlans.js` | Plans de pont par classe de coque : salles, passages, spécialités, coûts de trajet |
| `src/deckView.js` | Rendu en profil : le sprite généré sert de cadre au plan ; déplacement animé |
| `src/battle.js` | **Règles de combat pures** — aucun DOM, aucun minuteur, **aucun aléatoire** |
| `src/flotte.js` | Règles de la rade (proposition C) : une escadre, trois bandes, un ordre par tour. Mêmes contraintes de pureté |
| `src/rencontre.js` | Tirage d'ouverture de combat + choix des phylactères. L'entropie entre ici, jamais dans la résolution |
| `src/run.js` | État de partie : archétypes, clauses de chasse-partie, moral, légitimité |
| `src/caribbean.js` | La Caraïbe réelle : lieux, côtes, distances |
| `src/screens/pont.js` | Harnais de plan de pont (étapes 2-3), pas l'écran de combat |
| `src/screens/bataille.js` | L'écran de combat (étape 4) |
| `src/screens/traversee.js` | Recrutement, chasse-partie, carte (étape 5) |
| `css/deck.css` | Tout le CSS de la refonte, à côté de l'existant |
| **V1, à remplacer** | `src/combat.js`, `src/map.js`, `src/abilities.js`, les anciens `src/screens/*` |

`src/battle.js` ne doit jamais acquérir de source d'entropie : un test échoue si
`Math.random`, `Date.now` ou `crypto` y apparaissent. L'aléatoire reste permis
dans la *génération* (carte, ennemis, butin), jamais dans la *résolution* (§4.1).

## Documentation

| Fichier | Contenu |
|---|---|
| `docs/refonte/brief.md` | Le brief, fait foi |
| `docs/refonte/PLAN.md` | Avancement par étape et décisions prises |
| `design-system.html` | Interface : palette, composants, contrastes mesurés |
| `histoire.html` | Le monde : contexte 1640-1697, figures historiques |
| `README.md` | Vue d'ensemble, comment lancer, arborescence |

Les démonstrations de composants du `design-system.html` §16 chargent
`css/deck.css`, la feuille réelle du jeu : modifier un composant met la
documentation à jour toute seule, mais **ajouter** un composant demande de
l'ajouter au §16.

## Ordre de chantier — ne pas sauter d'étape

Le brief impose un ordre de chantier en 8 étapes avec conditions de sortie
explicites (`brief.md` §12). Ne pas commencer une étape sans avoir validé
la précédente — c'est le seul garde-fou contre des semaines de travail sur
une boucle qui ne mord pas. `PLAN.md` détaille le mapping fichiers par
étape.

## Tests

```bash
node test/run.js          # données + intégrité, zéro dépendance
```

À lancer après toute modification de `data/`, `locales/` ou des clés
référencées dans `src/`. `test/rencontre.test.js` va plus loin que l'intégrité :
il **mesure** ce que le tirage produit (nombre d'éléments affichés, fréquence
des raretés, taille de l'espace des ouvertures, parties avant répétition d'une
réplique). Un seuil qui casse est presque toujours une décision de conception à
prendre, pas un test à assouplir. La suite ne teste pas des chemins de code : ce sont
des détecteurs de clé erronée, parce que c'est la classe de bug qui a coulé
le prototype précédent (brief §13) et qu'aucune vérification de syntaxe ne
l'attrape. Étape 1 y ajoutera `test/shipPlans.test.js` pour les invariants
de plan de pont du §14.

Pour les régressions d'exécution que les tests de données ne peuvent pas
voir (plantage au troisième tour d'un combat) :

```bash
python3 -m http.server 8000 &
npm i playwright-core                 # dev uniquement, le jeu reste sans dépendance
node tools/playtest.mjs 4
node tools/contrast-audit.mjs         # contrastes mesurés sur pixels rendus
```

L'audit de contraste échantillonne la **capture d'écran**, pas les styles
calculés : les fonds du jeu sont peints par un canvas et par un calque fixe
derrière l'application, si bien qu'un audit qui remonte le DOM ne les voit pas
et déclare « 0 échec » sur un écran illisible. Voir `design-system.html` §15.

## Contraintes techniques inchangées

Vanilla JS, ES modules, aucun bundler, aucune dépendance npm. Polices IM
Fell English + Courier Prime. CSS existant (`css/variables.css`,
`css/animations.css`, `css/components.css`, `css/patterns.css`, importés
dans `css/style.css`) : ne pas écraser, ajouter à côté.

Un écran de la refonte qui neutralise le fondu d'entrée doit s'écrire
`.screen.mon-ecran { animation: none }` et **jamais** `.mon-ecran` : `deck.css`
est `@importée` en tête de `style.css`, donc à spécificité égale le
`.screen { animation: fade }` qui vient plus bas gagne. Écrites sans le
`.screen`, ces règles n'avaient jamais pris effet et le flash à chaque clic —
proscrit au §9 — était toujours là.

Les composants **partagés** (jauges `.bar`, boutons, badges, modales) vivent
dans `css/components.css` ; `css/style.css` ne garde que ce qui appartient à
un écran. Deux définitions d'une même classe dans deux feuilles est un bug
qui ne se voit que le jour où l'une est chargée sans l'autre — c'est ce qui
est arrivé à `.bar-hp`.
