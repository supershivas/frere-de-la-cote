# Plan de refonte — mapping brief → dépôt actuel

Document de travail, succinct par nature. Le brief complet fait foi :
`docs/refonte/brief.md`. Les deux maquettes (`docs/refonte/mockups/`) sont
des références visuelles jetables, pas du code à porter tel quel.

## Où en est réellement le dépôt (vs ce que décrit le brief)

Le brief décrit `game.html` / `architecture.html` / `assets.html`. Ces
fichiers n'existent plus : le dépôt actuel utilise `index.html` +
`design-system.html` (interface) + `histoire.html` (contexte et
figures) + `src/*.js` en modules ES. Le diagnostic du
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
| 2 | ✅ **Fait** — rendu profil | `src/deckView.js` + `css/deck.css`. Voir ci-dessous. |
| 3 | ✅ **Fait** — déplacement d'équipage | `src/deckView.js` (`walk`, `reachFrom`) + écran d'essai `src/screens/pont.js`. Voir ci-dessous. |
| 4 | ✅ **Fait** — combat 1 v 1 | `src/battle.js` (règles) + `src/screens/bataille.js` (écran) + `test/battle.test.js`. Voir ci-dessous. |
| 5 | ✅ **Fait** — boucle de partie | `src/run.js`, `src/caribbean.js`, `src/screens/traversee.js`. Voir ci-dessous. |
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

## Étapes 2 et 3 — ce qui a été fait

**Le sprite est devenu le cadre du plan de pont (§5.1).** `generateShipGrid`
expose désormais les bornes de la coque (`hull: {x0, x1, yDeck, yBot}`), et
`deckView.js` y projette les salles. Le navire est dessiné **en écorché** —
quille comprise — et la vue est recadrée sur la bande de coque : le gréement
occupe l'essentiel du sprite et rien du gameplay. La ligne de flottaison
traverse l'écorché avec une légère respiration.

**Un bug que seule une capture d'écran pouvait montrer.** Le navire ennemi est
dessiné retourné (`facing: -1`), ce qui inverse toute la grille — mais le plan
ne l'était pas. La barre était donc peinte sur la proue : la coque et le plan
se contredisaient sur l'emplacement de la poupe. La projection applique
maintenant le miroir.

**Tout est proportionnel, pas en pixels.** Coque, salles et hommes partagent le
même repère en pourcentages, si bien que le CSS peut réduire l'ensemble pour
tenir dans une colonne ou sur un téléphone sans rien désaligner.

**Le déplacement (§6.3) est mécaniquement réel, pas cosmétique.** Un homme
sélectionné éclaire ses salles atteignables ; cliquer une destination le fait
traverser les salles intermédiaires une par une, en suivant les passages.
Vérifié en pilotant le navigateur :

- Ozanne, chirurgien en Proue → Poudrière : `Proue → Batterie → Cale →
  Poudrière`, trois salles traversées, **trois tours consommés**.
- Gohier, de la Barre à la Cale en passant par une batterie en feu : il arrive
  **blessé** — « brûlé en passant par Batterie ». Traverser le feu coûte.

**Écran d'essai `#pont`.** `src/screens/pont.js` est un harnais, pas l'écran de
combat : il existe pour que les conditions de sortie des étapes 2 et 3 soient
jugeables. L'étape 4 construira le combat sur `deckView.js`, l'étape 7 fera la
passe d'interface — rien de cet habillage n'est censé survivre.

Le panneau de détail est fixe, jamais une infobulle flottante : le survol seul
a été essayé et écarté parce qu'il ne fonctionne pas au doigt (§9).

### Passe de corrections sur retour visuel

Six défauts relevés sur capture d'écran, tous corrigés :

1. **Le navire doit se voir en entier.** Le recadrage sur la bande de coque
   était une erreur : il fallait montrer tout le navire, gréement compris. Les
   deux navires sont désormais dimensionnés par la largeur **et** par la
   hauteur — un mât qui sort de l'écran n'est pas lisible. Les panneaux du bas
   ont été resserrés : le navire est l'écran.
2. **Les espaces extérieurs ne sont pas des salles.** Barre, grand mât et proue
   sont du pont découvert : plus de rectangle, seulement le nom et la ligne de
   pont sous les hommes qui s'y tiennent (`open: true` dans le plan).
3. **Le flash à chaque clic** venait de `.screen { animation: fade }` rejouée à
   chaque reconstruction de l'écran — `.combat-screen` la neutralisait déjà
   pour cette raison exacte. Neutralisée aussi ici.
4. **Le ciel** : l'écran passe sur le fond marin animé déjà existant plutôt que
   sur le motif de bois.
5. **Une seule mer.** Chaque navire est décalé vers le bas de la part de sa
   coque située sous sa propre ligne de flottaison, si bien que les deux
   flottaisons tombent sur la même ligne quelles que soient les deux échelles.
   L'ennemi est plus petit, proportions FTL, pour laisser la place au joueur.
6. **Le déplacement s'anime vraiment.** Il ne s'animait pas parce que chaque pas
   reconstruisait le DOM, ce qui tuait la transition CSS : le jeton est
   maintenant déplacé, pas recréé.

**Et une conséquence mécanique, pas seulement visuelle.** « Changer de niveau
est plus long qu'un déplacement horizontal » n'est pas un réglage d'animation :
une échelle coûte **deux tours** contre un pour un déplacement sur le même
pont. Le routage est donc devenu un plus-court-chemin pondéré et non plus un
parcours en largeur — un homme fera le tour d'un pont plutôt que de grimper
deux fois si c'est plus rapide. C'est exactement la « contrainte de logistique
interne » du §5.3, et trois tests la verrouillent, dont un qui compare la route
retenue à **tous** les chemins simples possibles pour vérifier qu'aucun moins
cher n'existait.

## Étape 4 — le combat

Les règles vivent dans `src/battle.js` : des fonctions pures sur un objet
d'état, sans DOM ni minuteur. L'écran affiche ce qu'elles renvoient.

**Le §14.6 est enfin écrit.** Le brief le réclamait nommément — « deux
résolutions du même tour avec le même état donnent un résultat identique » — et
il était impossible avant l'étape 4 faute de résolveur. Un second test interdit
toute source d'entropie dans le moteur (`Math.random`, `Date.now`, `crypto`),
parce qu'un résolveur qui lirait l'horloge passerait le premier test tout en
restant non déterministe d'une session à l'autre.

**Deux vrais défauts de conception trouvés par la simulation**, tous deux
opposés à la tension du §3 :

1. **Couler était impossible.** Une brèche ajoutait 1 à la voie d'eau et un seul
   charpentier aux pompes en retirait 1 : l'équilibre exact, indéfiniment. Une
   brèche noie désormais à 2 et chaque paire de bras aux pompes retient 1, si
   bien qu'un charpentier seul ralentit un naufrage sans l'empêcher — sauver un
   navire troué demande d'arracher un second homme à son poste.
2. **Un navire vidé de son équipage ne concluait rien** : on pouvait saigner
   indéfiniment sur un abordage perdu d'avance. Un navire sans bras amène son
   pavillon.

**La tension du §3 est mesurable**, brigantin contre brigantin :

| Stratégie | Issue | Tours | Butin | Pertes |
|---|---|---|---|---|
| Couler (boulet dans la proue) | coulé | 7 | 27 | aucune |
| Prendre (chaîne, approcher, aborder) | **prise** | 5 | **180 + le navire** | 22 hommes |
| Aborder trop tôt | on est pris | 7 | 0 | tout l'équipage |
| Attendre trop longtemps bord à bord | on est pris | 7 | 0 | 40 hommes |

Le dernier cas est le plus parlant : se coller pour prendre, c'est s'exposer à
être abordé soi-même. La décision du §3 existe à chaque tour.

**Le gate du §12 n'est pas franchi par moi.** Le brief demande de jouer cinq
combats et de vérifier qu'on ressent « je tente la prise ou je la coule ? ».
J'ai vérifié que le choix existe mécaniquement et qu'il est chiffré ; le
ressenti reste à valider par un humain.

## Étape 5 — la boucle de partie

Trois écrans avant le premier combat, le plafond fixé au §10.2 — et mesuré à
**18 secondes** de l'écran d'équipage au premier tour de combat, là où le brief
demandait moins de deux minutes.

**Recrutement (§10.1)** : trois équipages préconçus lisibles, jamais une
répartition de points sur écran vide — cette dernière a été essayée et écartée
(§9) parce qu'on demande au joueur de choisir avant qu'il sache ce que vaut
« réparation 8 ».

**Chasse-partie (§8.2)** : six clauses, chacune un avantage payé par une
contrainte, et **l'équipage vote**. Le capitaine propose, il n'impose pas : une
clause impopulaire est refusée et n'entre pas au contrat.

**La carte est la vraie Caraïbe.** Dix-sept lieux où ces hommes sont réellement
allés, placés à leur longitude et latitude réelles, avec les côtes de Cuba,
d'Hispaniola, de la Jamaïque, du Yucatán, de l'Amérique centrale et de la
Terre-Ferme tracées par-dessus. **Le départ est toujours le même** : l'Île de
la Tortue, le refuge où les boucaniers se sont repliés quand les Espagnols les
ont chassés d'Hispaniola. Partir toujours du même coin est ce qui rend ces eaux
apprenables. L'accessibilité est géographique — une distance en degrés — et non
un index de ligne.

Chaque escale annonce son coût avant qu'on y aille (§10.3), et le moral tombe à
chaque nœud traversé sans prise (§8.3, « pas de prise, pas de paye ») : éviter
les combats cesse d'être une stratégie sans qu'aucun mur artificiel soit posé.
À moral nul, le conseil dépose le capitaine (§8.5) — une fin de partie qui
n'est pas une mort : il est débarqué.

## Ce qui reste à faire

Les suppressions restantes (`reputation` → `legitimacy`, §8.6) s'exécutent à
l'étape 6, quand la mécanique qui les porte existe — renommer une jauge sans
le système derrière ne serait que du churn.

## Refonte B2 — la rencontre : cinq combats, cinq situations

La maquette B2 posait la question du tour (« répartir cinq hommes est-il une
décision ? ») mais tous les combats commençaient pareil. Le tirage de rencontre
répond à la seconde moitié de la question.

**Deux couches, deux usages.** Le *socle* — quatorze axes en quatre catégories
(environnement, elle, nous, la rencontre) — est tiré en entier à chaque combat
et sert de matière au dialogue. Les *épices* — quarante traits rares, tirés
contre un budget de deux points — servent à l'interface et au souvenir.
L'entropie entre au tirage et nulle part ailleurs : la résolution reste sans
aléatoire (§4.1).

**Le réglage qui compte est `frequence_depart`.** Tiré uniformément, un axe à
six réglages s'écarte de l'ordinaire cinq fois sur six ; quatorze axes ainsi et
chaque combat est un monstre où plus rien ne se remarque. Le réglage ordinaire
pèse donc autant que tous ses rivaux réunis, calibré pour qu'un axe s'écarte
**une fois sur cinq et demie** (0.18). Mesuré : **4,1 éléments notables par
rencontre**, jamais plus de six affichés, ~4 400 ouvertures distinctes — soit
0,2 % de risque de rejouer la même ouverture dans une partie de cinq combats.

**Le plafond d'affichage est un garde-fou, pas une habitude.** `notableOf()`
classe par saillance (épice exceptionnelle > rare > fréquente > réglage qui
change les règles > couleur pure) et coupe à six. Il ne mord que dans 9 % des
tirages, et un test vérifie qu'il ne coupe jamais une épice : ce qui change le
jeu atteint toujours l'écran.

**Les phylactères.** 164 répliques, cinq voix, trois moments (ouverture,
bascule, dénouement), sélectionnées par spécificité décroissante et filtrées
par une mémoire `localStorage` des répliques déjà vues — environ **onze parties
avant qu'une réplique revienne**. Une répétition étant pire qu'une banalité, le
sélecteur redescend d'un cran de spécificité plutôt que de se répéter.

**Ce que la maquette applique vraiment.** Une cinquantaine de tags sont câblés
sur des modificateurs réels (postes disponibles, hommes exigés à la manœuvre,
rupture interdite, avarie à l'approche, portée de ses canons, tours de silence,
butin). Les autres colorent la rencontre et nourrissent le dialogue sans
toucher aux règles — et la maquette le dit : **les traits encadrés d'or
agissent, les autres non.**

L'audit de contraste couvre maintenant la maquette B2 elle-même, et il a
attrapé quatre vraies fautes : boutons désactivés à l'opacité 0,3 (1,93:1),
effet de trait à 3,55:1, ligne de graine à 2,79:1, règle de bas de page à
4,25:1. L'audit lui-même avait un défaut symétrique — il lisait les pixels
d'un calque posé par-dessus et inventait des échecs sur du texte que personne
ne voit ; il teste désormais l'occultation avant d'échantillonner.

**Le gate reste le même et il n'est pas franchi par moi** : cinq combats joués
par un humain, et trois réponses — avez-vous touché aux postes plus d'une fois
par combat ? avez-vous hésité entre couler et prendre ? était-ce lisible ?

## B2 rebâtie sur l'interface du jeu

Retour de test : « d'une grande laideur, illisible… pourquoi toujours le même
pavillon ? pourquoi ne pas réutiliser les modales et autres éléments UI déjà
utilisés avant ? ». Les trois reproches étaient fondés et se ramenaient à un
seul : **la maquette avait réinventé une interface à côté de celle qui
existe**, avec son propre `<style>`, ses propres boutons, sa propre mer.

La maquette charge désormais `css/style.css` — donc toutes les feuilles du jeu
— grâce à une `<base href="../../../">` qui fait résoudre `css/`, `src/`,
`data/` et `locales/` exactement comme depuis `index.html`. Elle n'a plus une
seule ligne de CSS à elle.

| Ce qui était refait | Ce qui est réutilisé |
|---|---|
| Un dégradé bleu figé | `src/ocean.js` — mer animée, ciel, pluie, décor |
| Deux `<div>` empilées | `.ship-stage.in-combat` + `.ship-waterline-clip` : les navires tanguent, la flottaison ne bouge pas |
| Des barres maison | `.bar` de `components.css`, via `bar()` de `src/ui.js` |
| Une `.over` en position fixe | `modal()` de `src/ui.js` et `.bat-outcome` |
| Des boutons maison | `.bat-btn`, `.bat-ammo-btn`, `.btn-level-1/-4` |
| Aucun effet | `src/fx.js` — impacts, éclats, nombres flottants |
| Aucune météo | `data/weather.json`, dont les modificateurs entrent dans la règle |

**La météo est branchée aux deux bouts.** `weatherFor()` traduit le tirage en
un temps de `data/weather.json` (six temps rencontrés en test), et
`oceanSceneFor()` en un ciel (les six existent aussi). L'heure prime sur le
temps pour la nuit : ne pas la voir est une règle de ce combat-là, et le ciel
est l'indice. Les `mods` du temps entrent dans la puissance de bordée — la
météo n'est pas un décor.

**Le pavillon.** L'axe existait dans les données mais le sprite ennemi était
peint en dur aux couleurs espagnoles. `flagFor()` rend la faction montrée et la
faction réelle, et `buildSpriteSpec()` — la fonction du jeu — peint le
pavillon. Sous faux pavillon les deux diffèrent, et le nom sur le tableau
arrière suit la nationalité **réelle** : c'est la seule chose à bord qu'on ne
repeint pas en une nuit.

Deux réglages de tirage ont suivi la mesure :

- `pavillon` reçoit sa propre `frequence_depart` (0.55). À la fréquence commune,
  l'espagnol sortait dans 81 % des combats — c'est précisément la plainte. Il
  en fait 47 %, les trois marines ~15 % chacune, et la drisse nue 10 %.
- Compter ces pavillons a révélé un bug que l'intégrité ne voyait pas :
  `PAVILLONS[pav] ?? 'espagnole'` confondait « aucun pavillon » (`null`,
  voulu) avec « réglage inconnu », et repeignait des couleurs espagnoles sur
  une drisse nue. Un test l'interdit désormais.

**Tout ce qui sert au développement vit derrière une roue crantée** : graine,
tags tirés, règles effectives, quels tags sont câblés. L'écran de jeu ne montre
plus que ce que le joueur doit lire.

**Une collision de CSS réconciliée.** Documenter les nouveaux composants dans
`design-system.html` §16.10-16.14 a demandé d'y charger `components.css`, ce
qui a fait sortir la jauge noire et vide : la feuille portait un second
`.bar-hp`, propre à la documentation, utilisé par rien, qui masquait celui du
jeu. Les règles `.bar` réelles vivent maintenant dans `components.css` — c'est
un composant partagé, pas un détail de `style.css` — et il n'en existe plus
qu'une définition.

L'audit de contraste couvre les trois états de la maquette et a trouvé six
fautes de plus, dont deux dans des classes du **jeu** et non de la maquette :
sur la mer animée, claire en plein jour, `.bat-turn` mesurait 3,80:1 et
`.bat-range-step` 4,24:1. Corrigées pour les deux. Tout passe.

## Deux bugs de fond, et une proposition C

### Le flash à chaque tir n'avait jamais été corrigé

Le §9 proscrit les flashs depuis le premier prototype, et `css/deck.css`
portait bien `\.bat-screen { animation: none }`. **Cette règle n'a jamais pris
effet.** `deck.css` est `@importée` en tête de `style.css` ; le
`.screen { animation: fade 0.35s }` qui vient plus bas, à spécificité égale,
gagnait. Chaque reconstruction d'écran — c'est-à-dire chaque clic — rejouait
donc un fondu de tout l'écran.

C'est l'audit de contraste qui l'a prouvé, par accident : sa capture de la
maquette C sortait délavée et il annonçait 21 échecs sur 22 textes. L'écran
était parfaitement lisible ; c'était le fondu, saisi en vol. Les quatre écrans
concernés (`bat`, `pont`, `run`, `fl`) sont passés en `.screen.X`, et le §9
tient enfin.

Le reste du flash venait de `src/fx.js` : `fxExplosion` peignait un anneau
lumineux et douze étincelles orange à chaque coup au but. Un coup au but est de
la **fumée** et du bois arraché — c'est ce que montre la peinture de référence.
Ne restent qu'une bouffée de poudre et des éclats couleur de coque, la
gueule du canon fume au lieu d'étinceler, et la fabrique `flash()` a été
supprimée : une fabrique qui traîne finit par resservir.

### Le cadre transparent autour des coques

`drawGrid` assombrissait les navires abîmés avec un `fillRect` sur **toute la
toile**, pas sur les pixels du navire. Sur une mer transparente, cela peignait
un rectangle gris translucide — le « cadre » qu'on voyait apparaître autour des
coques touchées, et seulement autour de celles-là. Un
`globalCompositeOperation = 'source-atop'` suffit.

### Proposition C — la rade

Direction demandée : l'échelle d'une peinture de bataille navale — beaucoup de
coques, bien plus petites, un jeu plus nerveux.

`src/flotte.js` (règles pures, testées) : on ne commande plus **un navire**
mais **une escadre de cinq**, et un tour est **un ordre**, pas un formulaire.
Trois bandes de profondeur, une vingtaine de coques ennemies en cinq escadres.
Le butin est au fond de la rade, sous la batterie de côte, et **il ne compte que
ramené au large** — c'est ce qui fait du dernier tour une décision.

Trois canaux de lisibilité, sans recouvrement : **la taille dit la distance**,
le pavillon dit la nationalité, la couleur du libellé dit le rôle. Le premier
essai faisait porter la taille par la classe de coque et les caraques du fond
sortaient plus grosses que les vaisseaux du milieu.

Le réglage a été **mesuré, pas deviné** : trois politiques jouées sur 300 rades
chacune. Le prudent sort dans 77 % des cas avec ~800 or en 9,4 ordres ; l'avide
en 6,2 ordres mais ne sort que 44 % du temps. Deux façons de piller, deux
profils de risque, six à dix ordres par rade. Les tests mesurent cette forme et
pas seulement les invariants : désarmer la batterie fait passer l'avide à 97 %
de survie, et un test échoue en disant que le fond de la rade n'est plus un
pari.

Une sonde a aussi révélé un trou de règle : une escadre qui avait vidé la rade
ne pouvait plus rentrer sans deux tours vides. `Sortir` se donne désormais
depuis n'importe quelle bande, et chaque bande franchie coûte un dernier coup
au but — sortir de sous une batterie intacte peut tuer.

Les libellés de la rade se posent à même la mer et le ciel. Un `text-shadow` n'y
suffit pas (mesuré 1,46:1 sur l'horizon éclairé) : ils portent une plaque
opaque, comme la bande de distance de B2, corrigée pour la même raison.

## Proposition D — la rade tactique, façon Into the Breach

Direction demandée : vue isométrique, grille hexagonale, récifs sur certaines
cases, coques plus petites, jeu plus nerveux.

**Deux modules, deux responsabilités.** `src/hex.js` ne fait que de la
géométrie — axial (q, r), hexagones à sommet plat, six directions dont l'ordre
est un contrat. `src/breche.js` ne fait que des règles. Aucun des deux ne
touche au DOM, aucun ne contient d'aléatoire hors de `genererRade`.

La géométrie est testée par **propriétés** plutôt que par valeurs choisies :
la distance est une vraie métrique (symétrie, inégalité triangulaire), le
voisinage est réciproque, le disque de rayon *n* contient bien 3n(n+1)+1 cases,
la projection est injective, et l'écrasement isométrique aplatit réellement le
plateau. Ce sont les propriétés que le reste du code suppose sans les vérifier.

**Ce que D emprunte à Into the Breach.**

- *Information parfaite.* Chaque tir ennemi est écrit sur la case qu'il
  frappera, une flèche tiretée depuis le tireur. Le tour est un problème résolu.
- *La poussée est le verbe central.* Une bordée fait 1 dégât **et repousse d'une
  case**. On annule un tir en bousculant le tireur, pas en le tuant — et sortir
  de son axe suffit aussi, puisqu'on ne tire que le long des six directions.
- *On ne gagne pas en tuant tout.* La rade se réveille en cinq tours. Ce qu'on
  emporte est ce qu'on a **abordé**, et une proie ne s'aborde qu'entamée.

**Ce que D garde de la rade.** Le butin est la seule mesure. Une bordée qui
pousse une proie sur un récif la détruit — et détruit sa valeur : c'est
« couler ou prendre » devenu une question de position. Trois bâtiments, trois
verbes qui ne se remplacent pas : la canonnière pousse, le harponneur tire à
soi, l'abordeur seul encaisse.

**Trois canaux de lisibilité, sans recouvrement** : la couleur de la case dit
ce qu'on peut y faire, la couleur du socle dit à qui appartient la coque, la
flèche dit ce qui va arriver. Les socles ne sont pas une décoration : à trente
pixels, deux coques qui se font face ne se distinguent pas.

**Réglé en mesurant.** Deux politiques sur 200 plateaux : l'appliquée — qui
regarde les intentions et évite de pousser une proie sur un récif — rapporte
~200 💰 et 1,7 prise ; la maladroite ~48 💰 et 0,4. **Un facteur quatre**, et
c'est la mesure de « la position compte ». Deux tests le gardent : l'un vérifie
que bien jouer paie, l'autre que le plateau reste serré — jamais la rade
entière (< 2,6 prises sur 3), jamais bredouille la moitié du temps.

Deux bugs trouvés par les tests et non par l'œil : deux de nos coques posées sur
la même case quand la colonne d'entrée était courte, et une intention qui
retenait la case visée mais pas la position du tireur — donc impossible de
savoir qu'il avait été poussé. Un troisième était dans le test lui-même : (1,1)
*est* sur un axe de (2,0), contrairement à ce que j'avais écrit.
