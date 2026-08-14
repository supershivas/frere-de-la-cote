# Frères de la Côte — notes pour Claude Code

Le projet est en cours de refonte complète du combat/équipage/carte. Avant
de toucher au combat, à la carte, à l'équipage ou aux navires, lire :

- `docs/refonte/brief.md` — brief de refonte complet, document de référence.
  Sa section 2 (suppressions) et sa section 9 (pistes écartées) priment sur
  toute intuition de conception : elles évitent de reconstruire des choses
  déjà testées et rejetées.
- `docs/refonte/PLAN.md` — mapping du brief vers les fichiers réels du
  dépôt (les noms de fichiers du brief, ex. `game.html`/`architecture.html`,
  sont obsolètes ; le dépôt utilise `index.html`/`bible.html`/`src/*.js`).
- `docs/refonte/mockups/` — maquettes visuelles jetables (vue de profil des
  navires, rôle d'équipage). Références de présentation, pas du code à
  porter tel quel.

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
référencées dans `src/`. La suite ne teste pas des chemins de code : ce sont
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
```

## Contraintes techniques inchangées

Vanilla JS, ES modules, aucun bundler, aucune dépendance npm. Polices IM
Fell English + Courier Prime. CSS existant (`css/variables.css`,
`css/animations.css`, `css/components.css`, `css/patterns.css`, importés
dans `css/style.css`) : ne pas écraser, ajouter à côté.
