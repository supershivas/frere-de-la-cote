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
| 0 | Repartir propre sur le combat | Nouveau module `src/combat/` (ship-plan, rooms, boarding, crew) en remplacement de `src/combat.js`. Pas de patch du bug §13 : le fichier est remplacé. |
| 1 | Structures de données | `src/shipPlans.js` : plans de pont par classe de coque (salles, passages, structure, système), dérivés des classes de coque déjà définies dans `sprites.js`/`ships.json`. Tests en scripts Node autonomes (pas de framework de test dans le projet) validant §14 : cohérence des clés, connexité du graphe, non-chevauchement géométrique, effectifs min < max, déterminisme. |
| 2 | Rendu profil | Le sprite de l'éditeur (`sprites.js`) sert de cadre ; salles positionnées en overlay (divs/SVG) par-dessus, sur le modèle de `docs/refonte/mockups/profil.html`. Ligne de flottaison animée légère. Navires bien plus grands qu'aujourd'hui (toutes les salles visibles). |
| 3 | Déplacement d'équipage | Pathfinding sur le graphe de passages (BFS, comme la maquette), déplacement animé salle par salle, coût en tours, traversée du feu = blessure. |
| 4 | Combat 1 v 1 | Bandes de distance, dégâts localisés par salle, feu déterministe et télégraphié, 5 munitions différenciées, abordage. Porte visible = batterie engagée. **Gate de validation du brief : 5 combats joués, sensation « je tente la prise ou je coule ? » avant de continuer.** |
| 5 | Boucle de partie | Archétypes de recrutement (3 préconçus + 3 points libres), chasse-partie (contrat voté, style `role-equipage-mockup.html`), **carte des Caraïbes réelle, départ fixe**, 3 actes, coût visible par nœud. |
| 6 | Méta-progression | Officiers persistants, registre des prises (galerie des navires capturés via le générateur existant), port d'attache, `reputation` → `legitimacy` (§8.6), calendrier 1640–1697 (§8.7). |
| 7 | Interface | Différé — polish une fois le combat et la boucle figés. |
| 8 | Contenu | Différé — élargissement de contenu en dernier. |

## Ce qui ne bouge pas tout de suite

Rien n'est supprimé ou codé dans cette session : c'est un plan de cadrage.
Les suppressions actées (3 factions inexistantes à formaliser en
`legitimacy`, Kraken) s'exécutent au fil des étapes ci-dessus, pas d'un
coup en étape 0.
