# Frères de la Côte — notes pour Claude Code

Roguelite naval en cartes, sur téléphone. JS vanilla, ES modules, aucun
bundler, aucune dépendance npm dans le jeu, aucun asset image — les navires
sont générés à l'exécution.

---

## 1. Ce qu'on construit maintenant

**Un jeu de cartes façon Balatro.** Une main d'hommes d'équipage, on en joue
de une à cinq, la combinaison porte un nom, le nom donne une **puissance** et
un **multiplicateur**, et le produit tombe dans la coque de la prise. Trois
volées pour l'abattre. Entre deux prises, on recrute et on achète.

C'est la **proposition E**, et elle remplace les trois échelles de combat qui
s'affrontaient avant (un contre un, la rade, la grille tactique). Le débat qui
bloquait le chantier est tranché : cette question-là est fermée.

| | |
|---|---|
| La maquette | `docs/refonte/mockups/e-cartes.html` |
| Les règles | `src/cartes.js` — pures, sans dé |
| Le contenu | `data/equipage.json` — hommes, prises, reliques |
| Les tests | `test/cartes.test.js` |
| Version jouable | `node tools/bundle-mockup.mjs docs/refonte/mockups/e-cartes.html dist/e-cartes.html` |

### La boucle, en une page

1. **La carte** (`src/voyage.js` + `src/caribbean.js`). On part toujours de
   l'Île de la Tortue et on met le cap sur une escale voisine : une prise, un
   port, une épave, une rencontre. Chaque escale **dit ce qu'elle est avant
   qu'on y aille**.
2. **Une prise** (`data/equipage.json → prises`) a une coque, des mâts, une
   riposte, et parfois une **règle** qui casse une habitude.
3. Elle **annonce son coup un tour à l'avance**, écrit en toutes lettres sur
   une carte d'intention. Rien n'est caché, rien n'est tiré au dé.
4. **Une main** de cinq hommes. On en choisit jusqu'à trois, ils tirent
   ensemble. La prise riposte avec le coup qu'elle avait annoncé.
5. Sa coque à zéro → **le partage** : recrues, reliques, officiers,
   promotion. La Tortue à zéro → la chasse est rompue.

Une prise se joue en **cinq à huit tours**. Le théâtre s'ouvre par actes :
l'acte 1 longe Hispaniola, l'acte 2 atteint la Jamaïque et Cuba, l'acte 3 la
Terre-Ferme, où la flotte des Indes passait vraiment.

### Les trois choses qui font la décision

**LE BORD — avec qui.** Chaque homme sert d'un côté : bâbord ou tribord, et la
carte le dit par sa couleur, celle des vrais feux de position — **bâbord
rouge, tribord vert**. Une volée ne mêle pas les deux bords. Et **le bord qui
vient de tirer recharge** : au tour suivant, c'est l'autre qui parle. Il faut
alterner ; c'est le verbe du jeu.

**L'AVANT ET L'ARRIÈRE — sur quoi.** Une volée descend à la coque : ce sont
les dégâts. Elle monte au gréement si **tous** les hommes sont à l'avant **et**
qu'un gabier en est — elle n'entame alors pas la coque, elle abat un mât, et
un mât qui tombe **emporte le coup annoncé**. Il se regrée en deux tours.
C'est le seul échange du jeu : des dégâts contre un répit.

**LA RELÈVE — combien.** Cinq cartes en main, **trois au plus dans une volée**,
et on relève **deux hommes par tour**. Brûler trois hommes maintenant, c'est
tirer à un seul le tour prochain. Sans cette rareté, jouer tout ce qu'on a
était toujours la bonne réponse et il n'y avait rien à décider — c'est mesuré,
§5.

Deux soupapes vont avec le rechargement, et toutes deux viennent d'une main
devenue petite : **un homme qui tire seul n'encrasse pas son bord**, et si
aucun homme du bord libre n'est en main, le bord encrassé reprend le service.
Sans elles, le joueur passait des tours entiers sans un coup à jouer — et un
tour perdu n'est pas une décision.

**LA CARGAISON — combien il en restera.** Chaque point de dégâts à la coque
coûte une part de butin : un boulet troue aussi ce qu'on vient prendre. Le
gréement n'en coûte aucun, et **l'abordage** non plus — deux abordeurs sur une
coque déjà basse sautent à bord, les dégâts portent sans rien gâter, et une
prise abordée rapporte 30 % de plus.

C'est la réponse à « je joue toujours la volée la plus forte » : la plus forte
est aussi la plus chère. Mesuré sur la barque — le capitaine pressé rapporte
7 💰 en 9 tours, le soigneux 11 💰 en 11 tours, et ni l'un ni l'autre ne domine.
Deux monnaies qui ne se convertissent pas l'une dans l'autre, c'est ce qui
fait qu'il y a une décision plutôt qu'un calcul (§5).

**LES OFFICIERS — les jokers.** Trois au plus à l'état-major, engagés au
partage. Ils ne se jouent pas : ils sont là et ils **changent une règle** (le
Bosco pousse chaque canonnier, le Maître voilier abaisse le seuil du gréement,
le Chirurgien allège les blessures…). Leur nom, leur texte et leur prix sont
du contenu ; leur **verbe est du code**, dans `src/cartes.js` — c'est la seule
chose du jeu qui demande une ligne de code pour être ajoutée, et c'est voulu :
un officier qui ne changerait aucune règle ne serait qu'un homme de plus.

**Pas de multiplicateur.** Une volée rend un chiffre, et le détail dit d'où
vient chaque point. Les métiers apportent des effets, pas des coefficients :
le canonnier sa valeur, le gabier règle le tir sur le meilleur canonnier,
l'abordeur compte double sous la moitié, le charpentier **ne répare que s'il
est seul** dans la volée.

Attention aux **seuils écrits en toutes lettres dans les règles de prise** :
« une volée de moins de trois hommes ne l'entame pas » a été écrit quand on
jouait jusqu'à cinq cartes, et annulait presque toutes les volées une fois le
plafond descendu à trois. Un seuil de contenu se relit à chaque fois que la
taille des volées change.

### Un seul ordre, un seul geste

Rien en bas de l'écran, et **pas de largage** : les cartes reposent sur le
râtelier de bois, il n'y a pas d'espace sous elles, et une seconde cible pour
un second ordre demanderait deux zones de dépôt sur la largeur d'un pouce.
Jouer une volée d'un seul homme faible coûte exactement ce que coûtait un
largage — un tour.

| geste | effet |
|---|---|
| toucher un homme | il rejoint la volée, et une bulle dit ce qu'il fait |
| pousser la volée vers le haut | la **zone de dépôt s'ouvre sous La Tortue** ; lâcher dedans, la volée part |
| monter puis redescendre | on renonce, la volée est défaite |

Dès le début du glissement les cartes **se regroupent** en paquet et se
redressent : on voit partir une volée, pas trois cartes en parallèle. Les
flèches du clavier doublent le geste — un geste raccourcit un ordre, il ne
doit pas être le seul chemin.

### Le tutoriel ne prend jamais la main

Sept étapes, un projecteur sur ce qu'il faut regarder, une phrase dite par un
homme de l'équipage. **Aucune touche n'est bloquée, aucune action n'est
forcée** : une étape se termine quand le joueur a fait la chose, pas quand il
a appuyé sur « suivant », et une étape dont la condition est déjà vraie est
sautée. Un tutoriel qui pilote apprend à obéir, pas à jouer. Il se retient
dans `localStorage` ; `?sansTuto` et `?sansOuverture` le coupent, ce dont se
sert `tools/mobile-audit.mjs`.

### Ce que l'écran montre, et où

- **Sa carte d'intention est une carte** : le même gabarit que les nôtres —
  bandeau de tête, nom, grand chiffre, pied — en noir et rouge, posée à plat
  sous son navire. Un rectangle horizontal avec du texte dedans n'est pas une
  carte, c'est une boîte de plus à lire.
- **Tout s'explique à l'appui, jamais au survol** : une bulle ancrée
  au-dessus de ce qu'on touche — un homme, sa carte à elle, la météo, la règle
  de la prise, une relique, un officier. Y compris les hommes qu'on **ne peut
  pas** jouer : ce sont eux dont il faut expliquer le refus.
- **Les cartes arrivent, elles n'apparaissent pas** : la relève vole depuis la
  droite, décalée d'une carte à l'autre. On compte les hommes reçus sans lire
  un chiffre. La marque `neuve` est un ÉVÉNEMENT, pas un état : elle est
  oubliée après le rendu et retirée du DOM à la fin de l'animation — sinon la
  distribution repartait à chaque homme touché.
- **La carte Feu fume**, en boucle : c'est la seule carte qui ne sert à rien,
  il faut le voir de loin.
- **La flottaison est un NIVEAU, pas un trait.** Le navire est peint entier,
  œuvres vives comprises, et posé dans un conteneur `.flot` qui coupe à la
  ligne d'eau. La coupe ne bouge pas — c'est la mer — et c'est la coque qui
  s'y enfonce et en ressort avec la houle : une part du bordé disparaît
  vraiment, puis se découvre. Peinte dans le canvas, la découpe se déplaçait
  avec le navire, ce qu'une flottaison ne fait jamais.
  Deux conséquences mesurées : on coupe **deux rangs au-dessus** de la ligne
  d'eau réelle, sinon les bordés vert-de-gris de l'œuvre vive réapparaissent
  au-dessus des crêtes dès que le navire monte ; et l'amplitude du roulis
  reste **sous la demi-hauteur de la bande de vagues**, pour la même raison.
- **Une seule surface d'eau, d'un bord à l'autre.** Une bande de vagues par
  navire se lisait comme deux rubans posés sur la mer. La mer est continue :
  une bande unique traverse la scène, et les deux coques y entrent sur la
  même ligne.
- **Un boulet est une bille de fonte** : petite, noire, mate. Grosse et dorée,
  elle ressemblait à une bulle de savon. Ce qui la rend visible sur une mer
  sombre, c'est son cerne clair et son sillage, pas sa taille.
- **Un impact n'est pas une explosion.** Un boulet dans un bordé de chêne ne
  fait pas de boule de feu : un choc clair très bref, une masse de poussière
  terreuse, et surtout **du bois qui vole**. C'est le bois qui dit que la
  coque a pris ; la fumée seule dit « quelque chose a explosé ». Et il frappe
  **le bordé**, entre le pont et l'eau — repères relevés à la peinture
  (`dataset.pont`, `dataset.flottaison`), jamais un pourcentage de l'image.
- **Une route de mer contourne la terre.** `routeEntre(a, b)` (dans
  `src/caribbean.js`) rend la courbe la plus courte qui reste sur l'eau. Deux
  précautions, toutes deux payées d'un détour absurde à l'écran : les côtes
  sont **érodées** avant le test, parce qu'un port est sur le trait de côte et
  que sans cela aucune route ne passait ; et l'on garde **le premier** écart
  qui passe, donc le plus petit.
- **Le cap se valide par un bouton.** Toucher une escale vise et dit ce qu'on y
  trouve ; c'est le bouton nommé qui part. « Touche encore pour confirmer »
  n'était écrit nulle part avant d'avoir visé.
- **Les conditions sont UNE cible de 44 px** — météo, règle de la prise,
  reliques — qui les ouvre toutes. Trois puces de 17 px de haut étaient trois
  cibles qu'un pouce rate, et l'audit mobile les relevait.
- **La zone de dépôt est sous le nôtre**, et n'existe que pendant le geste.
  Les deux se répondent : sa carte à elle, notre cible à nous.
- **L'horizon est posé sur les navires** — `startOcean(canvas, { horizon })`,
  calculé au tiers supérieur des coques : du ciel derrière les voiles hautes,
  de l'eau derrière les coques.
- **Les cartes ont une largeur fixe**, calculée pour la main pleine. En
  `flex: 1` elles s'élargissaient à mesure qu'on en jouait : la main changeait
  de forme sous le pouce.
- **Le poste est un DESSIN, pas une abréviation** : une coque vue de dessus,
  proue en haut, coupée en quatre, le quart de l'homme allumé à la couleur de
  son bord. « BÂ · AV » demandait d'apprendre un code avant de pouvoir jouer.
- **Un boulet fait trois choses distinctes, et on doit les distinguer** : la
  bouffée sort du sabord (relevé dans la grille du navire, pas inventé) et part
  vers l'extérieur ; les copeaux volent loin et retombent ; la fumée d'incendie
  monte lentement et **ne s'arrête pas** tant que la coque brûle. Peinte dans
  le canvas, elle ne bougeait qu'à la repeinte — un incendie figé.
- **On ne dit jamais « elle » de l'adversaire.** Un pronom sans antécédent à
  l'écran ne dit pas de quoi on parle : le navire ? la prise ? la cargaison ?
  la mer ? On nomme la chose — « le navire adverse », « la prise », « la
  coque », ou son nom propre.

## 2. Les deux contraintes qui priment sur le reste

### Mobile d'abord

L'écran de référence est **375 × 667 en portrait**. Ce qui n'y tient pas ne
tient pas. Ce n'est pas une passe de mise en page à la fin.

- **Jamais de largeur fixe en pixels.** `#app { overflow-x: hidden }` ampute
  **en silence** : pas d'ascenseur, pas d'erreur, la moitié du jeu absente.
  C'est le pire défaut possible parce que rien ne le signale — mesuré à 51 %
  d'un ancien plateau hors écran, et 47 % des cartes de recrutement du jeu.
- **44 × 44 px minimum** pour tout ce qui se touche.
- **Le survol ne porte aucune information.** Première touche = viser, et
  l'écran dit exactement ce que l'action ferait ; seconde = confirmer.
  Sélectionner une carte n'engage rien.
- **Les ordres sont des gestes, pas des boutons** (voir §1). Seuil 44 px, la
  même mesure que la cible tactile minimale ; le glissement vers le bas
  résiste, parce que larguer coûte une ressource et ne doit pas arriver en
  reposant le pouce. Le clavier double les gestes.
- L'instrument : `node tools/mobile-audit.mjs`, qui **échoue** si un écran
  ampute ou déborde.

### Le contenu est de la donnée, la règle est du code

Ajouter un homme, une prise ou une relique ne doit demander **aucune ligne de
code** : tout est dans `data/equipage.json`. En face, un *verbe* de métier est
une règle, donc il vit dans `src/cartes.js`. Les verbes ne se remplacent pas
entre eux ; les hommes, si.

---

## 3. Où vit quoi

| Module | Rôle |
|---|---|
| **Règles — pures, déterministes, sans DOM ni aléatoire** | |
| `src/cartes.js` | **La chasse-partie en cartes.** Manœuvres, évaluation, prise, partage |
| `src/shipPlans.js` | Plans de pont par classe de coque (encore utilisé par la vue en profil) |
| **Génération — c'est ici que l'aléatoire est permis** | |
| `src/voyage.js` | **La progression sur la carte** : escales, actes, prise trouvée, épaves, rencontres |
| `src/rencontre.js` | Tirage d'ouverture : météo, pavillon, phylactères |
| `src/sprites.js` | Générateur de navires |
| `src/caribbean.js` | La Caraïbe réelle : lieux, côtes, distances (règles pures — `src/voyage.js` s'appuie dessus) |
| **Présentation** | |
| `src/ui.js` | `el`, `mount`, `modal`, `bar` — les briques de tout écran |
| `src/ocean.js` | Ciel et mer animés, en fond de tout écran « en mer » |
| `src/fx.js` | Effets : fumée, éclats, nombres flottants |
| `src/deckView.js` | Rendu en profil : le sprite généré sert de cadre au plan |
| `src/run.js` | État de partie : archétypes, chasse-partie, moral, légitimité |
| **Styles** | |
| `css/deck.css` | Le CSS de la refonte. **§17 = l'écran de cartes, §17.2 = la carte, §17.3 = le tutoriel** |
| `css/components.css` | Composants **partagés** : jauges, boutons `.btn-level-*`, modales |
| `css/style.css` | Ce qui appartient à **un écran**, et rien d'autre |
| **Outils** | |
| `tools/bundle-mockup.mjs` | Fond une maquette en un fichier autonome, à partir des mêmes sources |
| `tools/mobile-audit.mjs` | Amputation, cibles tactiles, débordement — échoue |
| `tools/contrast-audit.mjs` | Contrastes mesurés sur les pixels rendus |
| **Écarté — ne rien construire dessus** | `src/battle.js`, `src/flotte.js`, `src/breche.js`, `src/hex.js`, `src/combat.js`, `src/map.js`, `src/abilities.js`, les anciens `src/screens/*` |

---

## 4. Les treize règles qui ont chacune coûté un bug

**1. Aucune entropie dans la résolution.** `src/cartes.js` ne doit jamais
contenir `Math.random`, `Date.now` ni `crypto` — un test échoue s'ils y
apparaissent, **y compris dans un commentaire**. Le battage et la pioche
prennent un `rng` en argument parce qu'ils relèvent de la *génération* ;
évaluer une volée n'en prend pas. Une même main jouée deux fois donne deux
fois le même chiffre.

**2. Un écran de la refonte s'écrit `.screen.mon-ecran`, jamais
`.mon-ecran`.** `deck.css` est `@importée` **en tête** de `style.css`, donc à
spécificité égale le `.screen { animation: fade }` qui vient plus bas gagne.
Écrites sans le `.screen`, les règles `animation: none` n'ont jamais pris
effet : le fondu était rejoué à chaque clic, pendant des mois, dans une règle
qui avait l'air correcte.

**3. Un composant partagé n'a qu'une définition.** Deux définitions de la même
classe dans deux feuilles est un bug qui ne se voit que le jour où l'une est
chargée sans l'autre.

**4. Un libellé posé sur la mer porte une plaque, pas une ombre.** Le fond est
un canvas animé qui va du bleu nuit au ciel de midi ; un `text-shadow` tient à
1,46:1 sur l'horizon éclairé. Fond opaque obligatoire.

**5. Un ordre impossible se refuse à voix haute.** Une fonction de règles rend
`false` plutôt que de ne rien faire : un refus silencieux consomme le geste du
joueur et ne se remarque qu'en constatant que rien n'a bougé.

**6. Une contrainte sans instrument est un vœu.** « Mobile d'abord »,
« 44 px », « contraste AA » étaient tous écrits, et tous violés. Avant de poser
une règle transversale, écrire ce qui la mesurera.

**7. Une coque générée se dessine avec SA palette.** `drawGrid(cv, grille,
{ color })` accepte une couleur *ou* une palette. Les grilles générées par
`generateShipGrid` utilisent les caractères du générateur (coque, voiles,
livrée, pavillon) : lui passer une couleur unique fait retomber chaque
caractère inconnu sur cette couleur, et le navire sort en **aplat monochrome**,
sans voiles ni pavillon — sans qu'aucune erreur ne soit levée. Toujours
`drawGrid(cv, g.grid, { color: g.palette })`. `drawGrid` avertit maintenant en
console quand des caractères tombent hors palette.

**8. Ne jamais capturer le pointeur avant que le geste soit un glissement.**
`setPointerCapture` dès le `pointerdown` redirige aussi le `click` qui suit
vers la zone capturante, pas vers l'élément touché. Conséquence observée : une
fois un homme sélectionné, plus aucune touche n'en sélectionnait un second, et
rien ne le signalait — la carte s'illuminait bien au premier appui. La capture
se prend au franchissement du seuil (8 px), pas avant.

**9. Ne jamais tirer une valeur STABLE d'une entrée qui BOUGE.** Trois fois le
même bug. Le canvas d'une coque était dimensionné d'après la hauteur de son
parent, laquelle venait du canvas : à chaque repeinte les navires
rétrécissaient d'un cran. Et le paquet de cartes en cours de glissement était
repositionné d'après des `getBoundingClientRect()` relus à chaque
`pointermove`, donc déjà transformés : les cartes tremblaient. Et la forme des
nuages était tirée de leur abscisse, laquelle dérive : les bourgeons se
retiraient au sort soixante fois par seconde et le ciel clignotait. Une forme
vient d'une graine, une mesure se prend une fois — jamais de ce qui change.

**10. On pioche avec `pop()` : la fin du tableau est le DESSUS du paquet.**
La carte Feu du brûlot était posée avec `unshift`, donc au fond de la pioche :
elle n'arrivait jamais en main. L'effet le plus visible de la prise était
invisible, et rien ne le signalait. Un test tire maintenant la carte pour
vérifier qu'elle arrive.

**11. Ce qui vole appartient au DÉCOR, pas à la page.** Les boulets, les
copeaux et la fumée étaient posés sur `document.body` en `position: fixed`.
Mesuré : un boulet dont la transformation disait `translate(96px, 341px)` était
rapporté par le navigateur à y = 1008 — un écran plus bas, donc invisible, à
chaque tir, depuis le premier jour. Le repère d'un élément fixé dépend de ses
ancêtres (`transform`, `filter`, `contain`…) : c'est une hypothèse qu'on ne
contrôle pas. Tout ce qui vole est désormais posé DANS la bande de mer, en
coordonnées relatives à elle.

**12. Une masse translucide se peint EN UNE FOIS.** Six ellipses semi-
transparentes empilées laissent voir tous leurs recouvrements : on lit six
bulles, jamais un nuage ni une bouffée de poudre. Un nuage est un seul chemin
fermé (base plate, bosses en arcs) rempli d'un coup ; une bouffée est un seul
élément dont les lobes sont des dégradés du même `background`. La règle vaut
partout où de la fumée, de la brume ou de l'écume se superpose.

**13. Dans le fichier autonome, tous les modules partagent une portée.** Une
`const scene` dans la maquette et une `let scene` dans `src/ocean.js` donnent
une page blanche et une ligne en console. `tools/bundle-mockup.mjs` échoue
maintenant sur un nom déclaré deux fois plutôt que de livrer ça.

---

## 5. Tests

```bash
node test/run.js          # 172 vérifications, zéro dépendance
```

**Deux natures de tests, et il faut savoir laquelle casse.**

*Les détecteurs de clé erronée* — identifiants qui ne correspondent pas à leur
clé, références pendantes, rôles inconnus. C'est la classe de bug qui a coulé
le prototype précédent et qu'aucune vérification de syntaxe n'attrape.

*Les tests qui mesurent une décision de conception.* Dans `cartes.test.js` :

- **« la promesse du tour »** — ce que la prise fera est annoncé avant qu'on
  joue, et abattre un mât l'empêche vraiment. Si l'annonce ment, le tour
  redevient un pari et tout le reste ne sert à rien.
- **« est-ce que choisir compte ? »** — les mêmes mains, sur les mêmes
  graines, jouées par un capitaine appliqué et par un maladroit. Le maladroit
  doit perdre nettement.
- **« ménager la cargaison paie, et coûte des tours »** — le test le plus
  important du dépôt. Deux façons de chasser la même prise : vite, ou proprement.
  Il échoue si l'une des deux domine l'autre, et c'est bien le point : tant
  qu'une seule ligne de jeu est optimale, le joueur exécute un calcul, il ne
  choisit rien.
- **« ménager la cargaison paie, et coûte des tours »** — le test le plus
  important du dépôt. Deux façons de chasser la même prise : vite, ou proprement.
  Il échoue si l'une des deux domine l'autre, et c'est bien le point : tant
  qu'une seule ligne de jeu est optimale, le joueur exécute un calcul, il ne
  choisit rien.

Dans `voyage.test.js` : on part toujours du même coin, on ne saute pas d'un
bout de la mer à l'autre, et **chaque escale dit ce qu'elle est avant qu'on y
aille**. Le jour où l'un des trois cesse d'être vrai, la carte redevient une
liste de nœuds.

**Un seuil qui casse là est une décision à prendre, pas un test à assouplir.**
C'est ce test qui a écrit la moitié des règles ci-dessus : il a montré qu'avec
une main qui se remplit à ras bord, jouer tout ce qu'on a est toujours la
bonne réponse (d'où la relève) ; qu'un tir au gréement à la majorité partait
par accident une fois sur deux (d'où « tous à l'avant, et un gabier ») ; qu'un
mât perdu définitivement faisait du démâtage la seule tactique du jeu (d'où le
regréement) ; et qu'un charpentier glissé dans chaque volée rendait plus de
coque que la prise n'en enlevait (d'où « il ne répare que seul »).

Pour ce que les tests de données ne voient pas :

```bash
python3 -m http.server 8000 &
npm i playwright-core                 # dev uniquement, le jeu reste sans dépendance
CHROMIUM_PATH=$(which chromium) node tools/mobile-audit.mjs
CHROMIUM_PATH=$(which chromium) node tools/contrast-audit.mjs
```

**L'audit de contraste échantillonne la capture d'écran**, pas les styles
calculés : les fonds sont peints par un canvas, si bien qu'un audit qui remonte
le DOM déclare « 0 échec » sur un écran illisible.

**L'audit mobile** ouvre chaque écran sur trois téléphones et **échoue** si
l'un ampute ou déborde. Sa limite est écrite dans son en-tête : il ne lit que
les `:hover` CSS et raterait un aperçu construit dans un `mouseenter`.

---

## 6. Maquettes

`docs/refonte/mockups/` — maquettes **jouables**, pas des images. Elles portent
une `<base href="../../../">` et chargent `css/style.css` et `src/*.js` : une
maquette **utilise l'interface du jeu**, elle n'en réinvente pas une à côté. Si
un composant manque, l'ajouter à `css/deck.css` et au design system — jamais
dans un `<style>` de maquette.

`e-cartes.html` est la maquette vivante. `b2-combat.html`, `c-rade.html` et
`d-breche.html` sont les trois échelles de combat abandonnées : à lire pour
savoir ce qui a été essayé, à ne pas reprendre. `profil.html` et
`role-equipage-mockup.html` sont antérieures et ne suivent aucune de ces
règles.

Tout ce qui sert au développement — graine, état de la pioche, barème — vit
derrière un bouton **roue crantée**, jamais dans l'écran de jeu.

Pour donner une version à essayer : `tools/bundle-mockup.mjs` produit un
fichier unique, sans serveur, à partir des mêmes sources — il n'y a pas de
seconde version du jeu à maintenir.

---

## 7. Documentation

| Fichier | Contenu |
|---|---|
| `docs/refonte/brief.md` | Le brief d'origine. Sa **section 2** (suppressions) et sa **section 9** (pistes écartées) font toujours foi : elles évitent de reconstruire ce qui a été essayé et rejeté |
| `docs/refonte/PLAN.md` | **Où en est le chantier** : ce qui est fait, ce qui reste, et le tableau de ce que les mesures ont imposé au jeu |
| `docs/refonte/notes-2025-refonte.md` | **L'ancienne version de ce fichier.** Tout l'état du chantier « trois échelles de combat » : ce qui était bloqué, pourquoi, et ce que chaque proposition valait. À lire avant de rouvrir une question de combat |
| `design-system.html` | Interface : palette, composants vivants, contrastes, mobile |
| `histoire.html` | Le monde : contexte 1640-1697, figures historiques |

### Déviations actées par rapport au brief

- **La météo reste en jeu** (`data/weather.json`) et agit vraiment : son
  `damageMult` multiplie chaque volée. Le brief ne la cite pas en §2 ; ne pas
  la supprimer par extrapolation depuis le §9, qui écarte le *vent* — un
  système différent.
- **La réputation à trois factions et le Kraken Mécanique sont supprimés.**
- **La carte macro est la vraie Caraïbe**, départ à l'Île de la Tortue.

---

## 8. Contraintes techniques

Vanilla JS, ES modules, aucun bundler, aucune dépendance npm dans le jeu.
Polices IM Fell English + Courier Prime, chargées depuis Google Fonts. Aucun
asset image. Le CSS existant : ne pas écraser, ajouter à côté.
