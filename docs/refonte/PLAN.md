# Plan de refonte — mapping brief → dépôt actuel

Document de travail, succinct par nature. Le brief complet fait foi :
`docs/refonte/brief.md`. Les deux maquettes (`docs/refonte/mockups/`) sont
des références visuelles jetables, pas du code à porter tel quel.

## Où en est réellement le dépôt (vs ce que décrit le brief)

Le brief décrit `game.html` / `architecture.html` / `assets.html`. Ces
fichiers n'existent plus : le dépôt actuel utilise `index.html` +
`bible.html` (charte graphique) + `src/*.js` en modules ES. Le diagnostic du
brief (combat plat, munitions interchangeables, éditeur de navires sous-
exploité) reste juste sur le fond, mais le code sous-jacent a bougé :

- Combat actuel : `src/combat.js` (1149 lignes) — barre de PV unique, menu
  d'actions plat, précision/esquive aléatoires. À remplacer, pas à corriger.
- Carte actuelle : `src/map.js` — grille abstraite en lignes/colonnes façon
  Slay the Spire, sans géographie. **À remplacer par une carte des Caraïbes
  réelle, point de départ fixe (même coin à chaque partie)** — précision
  donnée hors brief, à traiter à l'étape 5.
- Éditeur de sprites : `src/sprites.js` (pipeline `drawGrid`) + écran
  `src/screens/editor.js` — solide, conforme au brief, à conserver et
  brancher sur le plan de pont (§5.1 du brief).
- `data/factions.json` : ne porte pas de réputation par faction — c'est une
  table de livrées/emblèmes visuelles utilisée pour générer l'identité des
  navires ennemis (`buildSpriteSpec`). Rien à supprimer ici ; sert de socle
  pour les pavillons/nations de la légitimité (§8.6).
- Réputation : un seul scalaire `state.resources.reputation` existe déjà
  (pas trois jauges de faction séparées) — se refactore directement en
  `legitimacy` (§8.6) sans démontage préalable.
- Boss unique actuel : Kraken Mécanique (`data/bosses.json`, référencé dans
  `map.js`, `combat.js`, `debug.js`) — à retirer.
- Le bug §13 (`s.rooms["coque"]` etc.) est dans l'actuel `combat.js` : sans
  objet puisque ce fichier est remplacé, pas patché.

## Décisions actées pour cette refonte (déviations validées)

- **Météo conservée.** Le brief ne demande pas explicitement sa suppression
  au §2 mais un système avait été essayé/écarté au §9 concernant le
  *vent* (allures, zone morte) — distinct de la météo actuelle
  (`data/weather.json`, tirée par nœud). Décision : la météo actuelle reste
  en jeu, comme modificateur de contexte, pas comme système de manœuvre.
- **Réputation à 3 factions et Kraken Mécanique : à supprimer**, conforme au
  brief §2. Le Kraken s'en va dès que le combat de boss est reconstruit
  (étape 4/5) ; pas de jauge de faction à défaire puisqu'aucune n'existe
  (voir ci-dessus), seul le rebaptisage `reputation` → `legitimacy`
  s'applique (étape 6/§8.6).
- **Carte macro = Caraïbes réelles**, point de départ fixe. Remplace la
  grille procédurale abstraite de `map.js` à l'étape 5, pas avant (le combat
  passe en premier, cf. ordre de chantier).

## Ordre de chantier — mapping fichiers

| # | Étape (brief §12) | Traduction dépôt |
|---|---|---|
| 0 | ✅ **Fait** — repartir propre | Le bug §13 n'existait pas ici (autre prototype) : quatre combats complets pilotés au navigateur passent sans une seule erreur, condition de sortie remplie d'emblée. La substance de l'étape est donc la *leçon* du §13 — valider les données — plus la sortie du Kraken. Voir ci-dessous. |
| 1 | ✅ **Fait** — structures de données | `src/shipPlans.js` + `test/shipPlans.test.js`. Voir ci-dessous. |
| 2 | Rendu profil | Le sprite de l'éditeur (`sprites.js`) sert de cadre ; salles positionnées en overlay (divs/SVG) par-dessus, sur le modèle de `docs/refonte/mockups/profil.html`. Ligne de flottaison animée légère. Navires bien plus grands qu'aujourd'hui (toutes les salles visibles). |
| 3 | Déplacement d'équipage | Pathfinding sur le graphe de passages (BFS, comme la maquette), déplacement animé salle par salle, coût en tours, traversée du feu = blessure. |
| 4 | Combat 1 v 1 | Bandes de distance, dégâts localisés par salle, feu déterministe et télégraphié, 5 munitions différenciées, abordage. Porte visible = batterie engagée. **Gate de validation du brief : 5 combats joués, sensation « je tente la prise ou je coule ? » avant de continuer.** |
| 5 | Boucle de partie | Archétypes de recrutement (3 préconçus + 3 points libres), chasse-partie (contrat voté, style `role-equipage-mockup.html`), **carte des Caraïbes réelle, départ fixe**, 3 actes, coût visible par nœud. |
| 6 | Méta-progression | Officiers persistants, registre des prises (galerie des navires capturés via le générateur existant), port d'attache, `reputation` → `legitimacy` (§8.6), calendrier 1640–1697 (§8.7). |
| 7 | Interface | Différé — polish une fois le combat et la boucle figés. |
| 8 | Contenu | Différé — élargissement de contenu en dernier. |

## Étape 0 — ce qui a été fait

**Le bug §13 n'existait pas dans ce dépôt.** Quatre combats complets joués
au navigateur, de bout en bout, sans une seule erreur console : la condition
de sortie du brief était déjà remplie. Le §13 décrit un autre prototype.

Ce qui restait de l'étape 0 était donc sa *leçon* — « il faut valider les
données, pas seulement le code » — et la sortie du contenu abandonné.

**Harnais de tests (`test/`, `node test/run.js`).** Zéro dépendance, tourne
sur `node` nu. Dix-sept vérifications qui sont toutes des détecteurs de clé
erronée : identité clé/`id`, résolution des références croisées (faction,
munition, relique, capacité), drapeaux d'effet qu'aucun système ne lit,
types de dénouement d'événement non gérés, types de nœuds sans route,
divergence de clés entre `fr.json` et `en.json`, `t('…')` absent des
locales. Deux gardes de refonte : le Kraken ne peut pas revenir par
copier-coller, et aucune nouvelle source d'aléatoire ne peut apparaître
hors génération (§4.1).

**Trois vrais défauts trouvés, invisibles à la lecture :**

1. `pirate_longboat` et `armed_merchant` déclaraient `weakness: "damage"` —
   une statistique, pas une munition. L'infobulle conseillait donc
   « Exploitez sa faiblesse : Puissance canon », conseil inactionnable.
   Corrigé en `explosive` et `classic` : les cinq munitions sont désormais
   toutes représentées dans le bestiaire, ce qui amorce le §5.6.
2. Le boss s'affichait en **silhouette de monstre** : `makeEnemy` refusait
   un sprite à tout boss (`!isBoss && …`), ce qui était juste tant que le
   seul boss était un Kraken. Le test branche désormais sur le *type*, pas
   sur `isBoss`.
3. `enemyHullSpec` ignorait toute classe de coque déclarée et la dérivait du
   `tier`, que les boss n'ont pas — l'amiral serait sorti en coque de sloop.

**Pilote de playtest (`tools/playtest.mjs`).** Joue des combats entiers dans
Chromium et échoue à la moindre erreur d'exécution. C'est le filet de
sécurité des étapes 1 à 6, qui éventrent le moteur de combat : un plantage
qui n'apparaît qu'au troisième tour échappe par construction aux tests
unitaires. Dépendance de développement uniquement (`npm i playwright-core`),
le jeu lui-même reste sans dépendance.

**Sortie du Kraken (brief §2).** `mechanical_kraken` devient `el_almirante`,
vaisseau amiral espagnol à trois ponts — un boss qu'on peut vouloir prendre
plutôt que couler, ce qui pointe vers le §3. La relique `kraken_relic`
devient `canon_almirante`, la capacité `kraken_shot` devient `heavy_shot`,
et l'événement « Présage du Kraken » est réécrit en superstition d'équipage
conforme au §8.8 : un noyé qui dérive contre la coque, un équipage qui
croit le navire marqué, aucun surnaturel affirmé par le jeu.

## Étape 1 — ce qui a été fait

**`src/shipPlans.js`.** Trois plans de pont, branchés sur les classes de coque
1–6 que l'éditeur de sprites utilise déjà — aucune nouvelle taxonomie à
maintenir :

| Plan | Classes | Salles | Effectif |
|---|---|---|---|
| petit (barque, sloop) | 5–6 | 4 | 12 / 45 |
| moyen (brigantin, frégate) | 3–4 | 6 | 30 / 80 |
| grand (galion, vaisseau) | 1–2 | 9 | 45 / 150 |

Les distances sortent conformes au brief sans les avoir forcées : sur le
galion, de l'infirmerie à la sainte-barbe il y a quatre pas — les « trois
tours de marche » du §5.3 ; sur le sloop, trois pas d'un bout à l'autre —
« tout est à trois pas ».

**Le piège du §13 est fermé par construction.** Les clés de salle et les noms
de système forment deux vocabulaires disjoints (`proue` la salle contre
`coque` le système, `poudriere` contre `munitions`), et un test échoue si les
deux se recroisent jamais.

**`test/shipPlans.test.js` — 21 tests, condition de sortie de l'étape.** Les
six invariants du §14 sont couverts, plus trois ajouts : le magasin à poudre
est toujours la salle la plus profonde et la plus à l'arrière, aucune salle
ne sort de la coque, et les libellés de salle sont traduits dans les deux
langues (ils sont stockés comme chaînes, donc invisibles au grep `t()` de la
suite de données).

**Les tests ont été vérifiés par injection de fautes**, parce qu'une suite qui
passe du premier coup ne prouve rien. Chevauchement géométrique, clé de salle
portant un nom de système, passage vers une salle inexistante, salle isolée,
effectif minimal supérieur à l'effectif complet : les cinq sont bien détectés.

Le §14.6 (déterminisme de la résolution d'un tour) ne peut pas encore être
écrit — il n'y a pas de résolveur avant l'étape 4. Ce qui est verrouillé dès
maintenant, c'est ce sur quoi il reposera : un même trajet demandé deux fois
rend le même trajet, un trajet est une vraie marche par des passages
existants, et lire un plan ne le mute jamais.

## Ce qui reste à faire

Les suppressions restantes (`reputation` → `legitimacy`, §8.6) s'exécutent à
l'étape 6, quand la mécanique qui les porte existe — renommer une jauge sans
le système derrière ne serait que du churn.
