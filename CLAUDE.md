# Frères de la Côte — notes pour Claude Code

Roguelite naval en cartes, sur téléphone. JS vanilla, ES modules, aucun
bundler, aucune dépendance npm dans le jeu, aucun asset image — les navires
sont générés à l'exécution.

**CE DOCUMENT NE DÉCRIT QUE LE JEU ACTUEL.** Tout ce qui a été essayé puis
écarté vit dans `docs/archives/`, avec la raison de son retrait. C'est une
règle de tenue du document autant qu'une règle de conception : un document qui
décrit trois jeux dont deux sont morts ne dit plus lequel il faut construire.

---

## 1. Le jeu : LA VOLÉE NUE

**Onze cartes, cinq types, un seul ordre.** On touche une à trois cartes, on
pousse vers le haut, la volée part. La puissance vient du TYPE des cartes et de
ce que la MAIN assortit — une paire, une triplette. Il n'y a pas de troisième
chose à savoir.

| | |
|---|---|
| La maquette | `docs/mockups/jeu.html` |
| Les règles | `src/simple.js` — pures, sans dé |
| Le contenu | `data/simple.json` — les cinq types, le paquet, les cinq prises |
| Les tests | `test/simple.test.js` — `node test/run.js` |
| Le CSS | `css/deck.css` §17.4 — le reste vient de §17, tel quel |
| Version jouable | `node tools/bundle-mockup.mjs docs/mockups/jeu.html dist/jeu.html` |

### La boucle, en une page

1. **Une prise annonce sa RÉSISTANCE** : la pression qu'il faut lui mettre pour
   qu'elle amène son pavillon. C'est l'ante du jeu, et elle est écrite en
   toutes lettres avant qu'on joue.
2. **Une main de cinq cartes.** On en joue une à trois, prises comme on veut.
3. **Quatre bordées**, pas une de plus. La main se remplit **à ras** après
   chacune.
4. **DEUX FINS.** Résistance atteinte → **la prise**, butin plein. Plus une
   bordée → **elle s'échappe**, et l'on n'a rien. Il n'y a pas de troisième
   sortie : on ne peut pas couler, et l'on ne perd qu'en manquant le seuil.
5. Les cinq prises s'enchaînent, et c'est tout.

### ONZE CARTES, CINQ TYPES, TROIS RARETÉS

| Rareté | Exemplaires | Types | Ce que ça décide |
|---|---|---|---|
| **Commune** | 3 chacune | Mitraille (4), Boulet ramé (6) | **Les seules qui puissent former une triplette** |
| **Peu commune** | 2 chacune | Boulet à chaîne (8), Boulet rouge (10) | Une paire, jamais une triplette |
| **Rare** | 1 | Carcasse (16) | **Ne s'assortit avec rien** — elle ne vaut que sa poudre |

Onze en tout : 2×3 + 2×2 + 1.

**LA RARETÉ EST UNE FRÉQUENCE, PAS UN POUVOIR.** Elle ne dit que le nombre
d'exemplaires au paquet. Le jour où une rareté accorde en plus un bonus, elle
devient une seconde chose à lire sur chaque carte — exactement ce que ce plateau
a été monté pour ne pas avoir. Toute sa conséquence tient dans la colonne de
droite du tableau, et cette conséquence est l'équilibre entier du paquet.

**UN PAQUET QU'ON COMPTE SUR LES DOIGTS.** Au troisième tour, un joueur SAIT ce
qui reste, parce qu'il l'a vu passer : c'est la seule connaissance que ce
plateau demande, et la seule qu'il récompense. D'où la ligne **« au paquet »**
posée sur le bois — cacher le compte ne ferait pas du suspense, seulement une
comptabilité à tenir sur un coin de table.

### LA PUISSANCE VIENT DE DEUX CHOSES

Le TYPE de chaque carte, et ce que la MAIN assortit : **paire +8**,
**triplette +24**. Tout s'additionne. Il n'y a pas de troisième chose à savoir —
ni fureur, ni multiplicateur, ni bord, ni effet de carte, ni riposte, ni
rechargement, ni coque. La **panachée** elle-même est retirée : trois types
différents ne valent rien, parce qu'une seconde condition, en sens inverse de la
première, est une règle de plus à vérifier.

**Une triplette de la plus faible bat la rare toute seule** — 36 contre 16.
C'est tout le plateau en une ligne : si la carte la plus chère gagnait toujours,
il n'y aurait rien à assortir et la main ne dirait rien. Un test le tient, et il
va chercher la plus faible et la rare dans la donnée plutôt que de les nommer.

**LA MULTIPLICATION EST BANNIE, ET LE PRODUIT AVEC ELLE.** « 17 × 2,5 »
demandait au joueur un produit de tête avant de savoir ce que sa volée valait ;
à trois cartes près du seuil, c'est exactement le calcul qu'il ne faut pas avoir
à faire. Les figures valent des POINTS.

### LES RÉSISTANCES SONT MESURÉES, jamais choisies à l'œil

**120 · 132 · 136 · 146 · 150.** Sur 3 000 rencontres jouées à la meilleure
volée, sur **trois familles de graines** dont les résultats s'écartent de moins
d'un point, elles donnent des prises à **100 %, 88 %, 78 %, 37 % et 23 %**.

**Elles ne veulent rien dire hors du paquet qui les a produites.** Le jour où le
paquet change — un type, un exemplaire, une poudre — elles se relisent toutes
les cinq. C'est arrivé à chaque changement de paquet de ce dépôt, sans
exception, et c'est le test `l'échelle est mesurée` qui le dira.

**IL N'Y A AUCUNE PROGRESSION** — ni état-major, ni relique, ni recrutement.
L'échelle doit donc tenir ENTIÈRE dans ce qu'un joueur atteint avec onze cartes :
la meilleure volée possible vaut 44, et une résistance qu'aucune main ne peut
couvrir ne serait pas un défi, seulement un mur.

**Le choix compte, et beaucoup.** Mêmes graines, mêmes mains : un capitaine qui
lit sa main prend la flûte **86 fois sur 100**, un capitaine qui pose les trois
premières cartes venues **0 fois**. Si cet écart se referme, la volée nue n'est
plus qu'une addition qu'on exécute — et c'est le plateau qu'il faut jeter, pas
le test.

### LE SCORE SE JOUE EN SÉQUENCE, jamais d'un coup

Un chiffre qui tombe tout fait ne se relie à rien. Joué carte par carte, le
joueur **voit d'où vient chacun de ses points**, dans l'ordre où il les a
construits, et il apprend le barème sans qu'on le lui explique.

**180 ms d'écart**, et l'ordre est celui du récit et non celui du calcul :

1. **chaque carte** à son tour — elle bondit (scale 1,18), un `+8` jaillit
   d'elle vers le haut, le compteur roule ;
2. **le nom de la figure**, en grand au centre : « TRIPLETTE ». Le seul moment
   où l'écran dit un mot plutôt qu'un chiffre, et ce qui fait qu'une figure se
   retient ;
3. **le total roule**, et **seulement là les canons tirent**.

Une volée pleine dure ~1,6 s. Au-delà, on attend son tour au lieu de le
savourer.

- **La séquence tourne AVANT `jouer()`**, sur les cartes encore en main :
  `jouer()` les retire et `rendre()` les efface, donc jouée après elle aurait
  fait bondir des cartes qui n'existent plus.
- **Chaque ligne de `evaluer()` dit d'où elle vient** (`source`, `uid`/`id`).
  Ça ne change rien au compte : sans cette provenance, l'interface aurait dû
  deviner en relisant les noms — et un nom est du contenu qui change.
- **La projection s'efface pendant la résolution.** La bulle annonce le total
  avant qu'on lâche — c'est sa raison d'être, rien n'est caché — mais laissée en
  place elle affichait la réponse à côté du compteur qui la construit.
- **Le compteur roule depuis une valeur tenue dans l'animation**, jamais relue
  dans le DOM : relire pour repartir, c'est tirer une valeur stable d'une entrée
  qui bouge (règle 9), et deux roulements qui se chevauchent partaient chacun
  d'un nombre à demi écrit.
- **`prefers-reduced-motion` saute tout** : le total est posé, on tire.

### Un seul ordre, un seul geste

Rien en bas de l'écran, et **pas de largage** : les cartes reposent sur le
râtelier de bois, il n'y a pas d'espace sous elles, et une seconde cible pour
un second ordre demanderait deux zones de dépôt sur la largeur d'un pouce.

| geste | effet |
|---|---|
| poser le doigt sur une carte | l'écran dit ce qu'elle fait, tant qu'on la tient |
| toucher une carte | elle rejoint la volée |
| pousser une carte non choisie | elle **rejoint la volée** et part avec elle |
| pousser la volée vers le haut | la **zone de dépôt s'ouvre sous La Tortue** ; lâcher dedans, la volée part |
| monter puis redescendre | on renonce, la volée est défaite |

**PAS DE GESTE DESCENDANT.** Le rechargement n'existe pas ici, donc le râtelier
n'est la cible de rien et il n'y a qu'une seule zone de dépôt.

**ON NE CHOISIT PAS CE QU'ON POUSSE.** Un glissement qui part d'une carte non
choisie l'ajoute à la volée — la première comme la troisième — et la volée part
avec elle. C'est le cas le plus courant du jeu, et il coûtait deux gestes :
toucher, puis pousser. L'ajout se fait **au franchissement du seuil**, jamais à
l'appui — avant le seuil rien n'est décidé, le geste reste un appui, donc un
`click`, donc la sélection ordinaire. Volée pleine, la carte poussée est refusée
à voix haute (secousse + ligne rouge) et le geste emmène la volée déjà composée.
La bulle se refait **en place** pendant le geste — un `rendre()` en plein
glissement jetterait les cartes qu'on tient et le râtelier qui a capturé le
pointeur.

Dès le début du glissement les cartes **se regroupent** en paquet et se
redressent : on voit partir une volée, pas trois cartes en parallèle. **Les
flèches du clavier doublent le geste** — un geste raccourcit un ordre, il ne
doit pas être le seul chemin.

### Ce que l'écran montre, et où

L'écran n'a que ce dont il a besoin : la jauge de pression, le compteur de
bordées, les deux coques, la ligne du paquet, la main. Pas d'état-major, pas de
pastilles de conditions, pas de carte d'intention, pas de phylactère, pas de
tutoriel, pas de carte des Caraïbes, pas de boutique.

- **LE COMPTE EST UNE BULLE POSÉE SUR LES CARTES**, en absolu au-dessus du
  bois — pas une barre en travers de l'écran. La barre vivait loin de ce qu'elle
  décrivait, occupait une bande entière même vide, et **changeait de hauteur
  avec son contenu : les navires MONTAIENT** quand on composait une volée,
  puisque la mer prend la place qui reste. `.mer` garde maintenant sa part, et
  la bulle ne prend rien.
- **La jauge de PRESSION est la barre qu'on regarde** : elle se REMPLIT vers la
  résistance annoncée, avec le chiffre en toutes lettres. Sa classe CSS est
  `.jauge.bordage` et non `.jauge.coque` : `.coque` est DÉJÀ la boîte d'un
  navire dans la bande de mer, et la jauge qui en portait le nom héritait de sa
  marge haute de 22 px — une barre de 4 px haute de 26, sans une erreur levée.
- **Le compteur de bordées est sur le ruban** — `⚔ 4` — à gauche du butin.
  C'est la ressource du jeu : elle ne se lit pas dans un sous-menu.
- **LA LIGNE « AU PAQUET » dit la COMPOSITION, jamais l'ordre** : ce qui reste,
  par type. Ce qu'un joueur a le droit de savoir, c'est ce qui lui reste, pas ce
  qui vient. Un test vérifie qu'elle ne ment jamais, tour après tour.
- **Tout s'explique à l'appui, jamais au survol.** Il n'y a pas d'infobulle
  flottante : à 375 px de large, elle recouvrait la mer ou la main, où qu'on
  l'ancre. **RIEN NE SE SUPERPOSE JAMAIS À LA MER NI À LA MAIN.** Un refus
  s'écrit au même endroit, en rouge, et lui seul : la carte s'annonce comme les
  autres, c'est le coup qui est impossible, pas elle.
- **LES CARTES SORTENT DE LA PIOCHE**, elles n'apparaissent pas — la relève vole
  du dos posé au bout du listeau jusqu'à sa place, décalée d'une carte à l'autre.
  L'écart est **mesuré carte par carte** et passé au keyframe en `--dx`/`--dy` :
  il dépend de la largeur de l'écran et du rang dans la main, et aucune valeur
  écrite en dur ne peut le suivre. Il se prend en `offsetLeft`/`offsetTop` **en
  remontant la chaîne des `offsetParent` jusqu'au râtelier** — la carte porte
  déjà l'animation quand on la mesure, donc sa boîte est transformée (règle 9),
  et les deux éléments n'ont pas le même repère. Lire les deux crûment donnait un
  écart faux de 7 px, assez peu pour passer inaperçu et assez pour que la carte
  ne sorte pas du paquet. La marque `neuve` est un ÉVÉNEMENT, pas un état : elle
  est oubliée après le rendu et retirée du DOM à la fin de l'animation — sinon la
  distribution repartait à chaque carte touchée.
- **LA CARTE EST CRÈME, ET SON CADRE DIT LE TYPE.** Le carton reprend sa couleur
  de carton (`#f2ead6`), et le cadre — **5 px, pas un liséré** — porte tout. À
  1 px il se lisait comme une ombre.
- **TROIS PORTEURS POUR UNE SEULE INFORMATION : le cadre, le glyphe et LA
  VALEUR**, tous trois dans la couleur du type. Le chiffre était en encre
  sombre : la chose la plus grande de la carte ne disait rien de ce qu'on
  assortit, l'œil allait au chiffre et la couleur restait sur la tranche.
- **CINQ TYPES, CINQ COULEURS**, et c'est la répétition qui rend les figures
  lisibles : deux cadres de la même couleur côte à côte SONT une paire, et on la
  voit sans lire un mot. Une figure qu'il faut lire pour la voir n'est pas une
  figure. Mitraille acier `#2f6f8f` · ramé fonte `#6f6553` · chaîne violet
  `#6f5d99` · rouge `#b3261d` · **Carcasse charbon `#2b2723`**.
- **DEUX GRIS NE FONT PAS DEUX COULEURS.** Le ramé et la mitraille ont été deux
  gris à **1,26:1 l'un de l'autre**, sans hue ni écart de clarté : la même
  couleur à 5 px de cadre — et ce sont les deux types les plus nombreux du
  paquet, ceux qu'il faut justement assortir.
- **LA RARE SE DIT PAR LA CLARTÉ, pas par une cinquième teinte.** Quatre hues se
  partagent déjà le cercle ; en ajouter une pour la Carcasse l'aurait posée à
  11,8° du ramé, soit le défaut ci-dessus sous un autre nom. Le charbon est à
  15 % de clarté quand les quatre autres tiennent entre 37 et 48 % : il se sépare
  de chacune par au moins 2,27:1, et la seule carte unique du paquet est aussi
  la seule qui soit sombre.
- **ET L'INSTRUMENT À NE PAS UTILISER POUR CELA EST LE RAPPORT DE CONTRASTE.**
  Deux couleurs de même clarté donnent ~1:1 même quand tout les sépare — le
  rouge contre l'acier sortent à 1,18:1, et ils ne se confondent jamais. Ce qui
  a fait le défaut des deux gris, ce n'était pas le 1,26:1 : c'était **0° de
  teinte ET 0 point de saturation**. Le contraste mesure la lisibilité d'un
  texte sur son fond, pas la distinction de deux teintes entre elles.
- **La valeur est la chose la plus lisible de la carte.** Elle fait 36 px en
  gras, et les cinq teintes sont toutes au-dessus du seuil du PETIT texte sur le
  crème : acier 4,6:1 · fonte 4,8:1 · chaîne 4,7:1 · rouge 5,5:1 · charbon
  12,4:1.
- **Le glyphe est un SVG, jamais un emoji** : un emoji change de forme et de
  couleur d'un téléphone à l'autre. Il monte en haut de la carte et se
  dimensionne sur la HAUTEUR de ce champ ; mesuré sur la largeur de la carte, il
  poussait le nom dehors. **Le dessin dit aussi la rareté** : les deux communes
  sont les deux formes les plus simples, et la Carcasse est la seule qui soit
  percée et fumante — la seule du paquet à être unique.
- **La carte est au rapport 1 pour 1,45**, la proportion d'une carte à jouer.
  À 1 pour 2,5 elle était une lame, et le centre restait vide entre le haut et
  le pied. La valeur occupe ce centre et fait 40 % de la hauteur ; le nom passe
  en pied, petit — c'est de la saveur, pas une décision.
- **Les cartes ont une largeur fixe**, calculée pour la main pleine. En
  `flex: 1` elles s'élargissaient à mesure qu'on en jouait : la main changeait
  de forme sous le pouce.
- **Pas de trame sur le carton.** Deux quadrillages en
  `repeating-linear-gradient` donnaient du grain à l'arrêt et vibraient dès que
  la carte bougeait sous le doigt. Un seul dégradé en `multiply`, et rien
  d'autre.
- **Les cartes se rangent derrière CELLE QU'ON TIENT**, pas derrière la dernière
  du DOM ni derrière la dernière choisie. `querySelectorAll` rend les cartes de
  gauche à droite, si bien qu'en sélectionnant de droite à gauche le tas se
  formait à l'autre bout de la main. La carte du `pointerdown` passe en fin
  d'ordre.
- **On lâche la volée N'IMPORTE OÙ au-dessus du bois.** La zone de dépôt faisait
  la taille d'une carte : il fallait viser, et un geste qui demande de viser est
  un bouton déguisé.
- **La flottaison ne se montre pas, la HOULE si.** `drawGrid` coupe la coque à
  la ligne d'eau ; le bas de la boîte `.coque` EST cette ligne, et il est en
  `overflow: hidden`. Les navires s'y **enfoncent et remontent** — jamais
  au-dessus, sinon leurs mâts sortaient de la bande de mer et se faisaient
  couper. Le pilonnement et le tangage sont en **quadrature**, un quart de
  période d'écart : en phase, les deux se confondaient en un balancement de
  métronome. L'amplitude se compte en rangs de coque (3 px le rang), plafonnée à
  cinq. Trois tentatives pour rendre la houle plus visible ont été essayées et
  retirées — un bord mangé en creux et en bosses, une frange d'écume, puis un
  train d'ondes traversant toute la scène. Les trois se remarquaient plus que la
  mer elle-même. **Ne pas les reconstruire.**
- **L'horizon est posé sur les navires** — `startOcean(canvas, { horizon })`,
  calculé au tiers supérieur des coques : du ciel derrière les voiles hautes, de
  l'eau derrière les coques.
- **Un boulet est une bille de fonte** : petite, noire, mate. Grosse et dorée,
  elle ressemblait à une bulle de savon. Ce qui la rend visible sur une mer
  sombre, c'est son cerne clair et son sillage, pas sa taille.
- **Un impact n'est pas une explosion.** Un boulet dans un bordé de chêne ne
  fait pas de boule de feu : un choc clair très bref, une masse de poussière
  terreuse, et surtout **du bois qui vole**. C'est le bois qui dit que la coque
  a pris ; la fumée seule dit « quelque chose a explosé ». Et il frappe **le
  bordé**, entre le pont et l'eau — repères relevés à la peinture
  (`dataset.pont`, `dataset.flottaison`), jamais un pourcentage de l'image.
- **Un boulet fait trois choses distinctes, et on doit les distinguer** : la
  bouffée sort du sabord (relevé dans la grille du navire, pas inventé) et part
  vers l'extérieur ; les copeaux volent loin et retombent ; la fumée d'incendie
  monte lentement et **ne s'arrête pas** tant que la coque brûle.
- **On ne dit jamais « elle » de l'adversaire.** Un pronom sans antécédent à
  l'écran ne dit pas de quoi on parle : le navire ? la prise ? la cargaison ? la
  mer ? On nomme la chose — « le navire adverse », « la prise », « la coque », ou
  son nom propre.

### CE QUI A ÉTÉ RETIRÉ, et qu'il ne faut pas reconstruire

Le jeu a compté jusqu'à **sept systèmes** à tenir en tête devant un écran de
375 px. Chacun était défendable seul, aucun ne l'était ensemble. Le détail de
chaque retrait, avec ses mesures, est dans `docs/archives/`.

| Retiré | Ce qu'il coûtait |
|---|---|
| **TOUT LE PLATEAU E** — `src/cartes.js`, `docs/archives/mockups/e-cartes.html` : l'état-major, les reliques, la carte annoncée, les rechargements, la coulée, le tutoriel, la carte des Caraïbes, la boutique | Monté À CÔTÉ de celui-ci pour éprouver une question : que reste-t-il quand on retire tout ? La réponse a tenu. Neuf systèmes de plus, pour un jeu que la volée nue rend en trois règles |
| **Bâbord et tribord** | Une main sur deux était à moitié injouable, et la moitié des tours devenait une attente. Ce qui décide, ce sont les FIGURES : assortir, et non trier |
| **Les métiers, les quarts, les valeurs individuelles** | Un deck d'hommes tous différents ne peut pas former de figures : chaque carte était unique, aucune main ne ressemblait à une autre, et « la volée la plus forte » se lisait d'un coup d'œil |
| **L'avant et l'arrière**, **les mâts et le démâtage**, **l'encrassement** | Un compteur, un seuil et un décompte de repousse, pour un seul effet chacun |
| **La météo en combat** | Une même main valait deux chiffres selon le ciel, qu'il fallait lire avant de compter. Elle reste le **décor** : ciel, houle, pluie |
| **La fureur et le multiplicateur** | « 17 × 2,5 » demandait un produit de tête avant de savoir ce que la volée valait |
| **Le rechargement** | Une seconde monnaie qui ne se convertit pas dans la première — juste, mais c'est une ressource de plus à suivre, et un second geste à apprendre |
| **La coque et la coulée** | Une seconde façon de gagner qui rendait moins était une exception de plus. On perd en **manquant le seuil**, et c'est la seule façon |
| **La panachée** (trois types différents) | Une seconde condition, en sens inverse de la première, est une règle de plus à vérifier |

**Un système qu'il faut rattraper par une exception est un système à retirer,
pas à corriger.**

---

## 2. Les deux contraintes qui priment sur le reste

### Mobile d'abord

L'écran de référence est **375 × 667 en portrait**. Ce qui n'y tient pas ne
tient pas. Ce n'est pas une passe de mise en page à la fin.

- **Jamais de largeur fixe en pixels.** `#app { overflow-x: hidden }` ampute
  **en silence** : pas d'ascenseur, pas d'erreur, la moitié du jeu absente.
  C'est le pire défaut possible parce que rien ne le signale — mesuré à 51 %
  d'un ancien plateau hors écran.
- **44 × 44 px minimum** pour tout ce qui se touche.
- **Le survol ne porte aucune information.** Première touche = viser, et
  l'écran dit exactement ce que l'action ferait ; seconde = confirmer.
- **Les ordres sont des gestes, pas des boutons** (voir §1). Seuil 44 px, la
  même mesure que la cible tactile minimale. Le clavier double les gestes.
- L'instrument : `node tools/mobile-audit.mjs`, qui **échoue** si un écran
  ampute ou déborde.

### ON LIVRE DEUX URLS, TOUJOURS, ET SANS QU'ON AIT À LE DEMANDER

**Toute livraison d'un écran comporte DEUX adresses :**

| | |
|---|---|
| **L'URL du téléphone** | la page du jeu, à ouvrir SUR un appareil, au doigt |
| **L'URL du banc** | la même page dans une VRAIE fenêtre de 375 px, à regarder sur un ordinateur |

C'est la contrainte « mobile d'abord » rendue vérifiable en un clic. Avec une
seule adresse, on ouvre la maquette en 1 400 px de large : tout y tient, donc
tout va bien, donc **on ne voit rien** — et c'est exactement ainsi qu'un écran
amputé traverse une relecture.

```bash
node tools/bundle-mockup.mjs docs/mockups/jeu.html dist/jeu.html
# → dist/jeu.html          le jeu seul, autonome     (l'URL du téléphone)
# → dist/jeu-desktop.html  le même, dans un châssis  (l'URL du banc)
```

Le banc porte le jeu dans une **iframe `srcdoc`**, jamais dans une transformée
d'échelle : un `transform: scale()` ment sur tout ce qui compte — les media
queries, `innerWidth`, la taille réelle d'une cible en pixels CSS. Le châssis
**ne rétrécit jamais** : sur une fenêtre courte, la page défile.

Pour publier, il faut retirer le squelette du document (`<!DOCTYPE>`, `<html>`,
`<head>`, `<body>`), que l'hébergeur remet lui-même. **Le corps se prend jusqu'au
DERNIER `</body>`** : le banc porte le jeu entier dans un attribut, donc une
balise `</body>` apparaît au milieu du fichier, dans une valeur d'attribut — s'y
arrêter livre le jeu à la place du banc, sous le nom du banc, et les deux
adresses montrent alors la même page.

### Le contenu est de la donnée, la règle est du code

Ajouter un type de carte, changer le paquet, ajouter une prise ne doit demander
**aucune ligne de code** : tout est dans `data/simple.json`, y compris la
composition du paquet et les raretés. `src/simple.js` ne connaît ni les noms ni
les nombres — il ne connaît que les figures.

---

## 3. Où vit quoi

| Module | Rôle |
|---|---|
| **Règles — pures, déterministes, sans DOM ni aléatoire** | |
| `src/simple.js` | **Le jeu.** Types, figures, évaluation, zones, la rencontre |
| **Génération — c'est ici que l'aléatoire est permis** | |
| `src/sprites.js` | Générateur de navires |
| **Présentation** | |
| `src/ui.js` | `el`, `mount`, `modal`, `bar` — les briques de tout écran |
| `src/ocean.js` | Ciel et mer animés, en fond de tout écran « en mer » |
| `src/fx.js` | Effets : fumée, éclats, nombres flottants |
| **Styles** | |
| `css/deck.css` | **§17 = l'écran de cartes, §17.2 = la carte, §17.4 = la volée nue** |
| `css/components.css` | Composants **partagés** : jauges, boutons `.btn-level-*`, modales |
| `css/style.css` | Ce qui appartient à **un écran**, et rien d'autre |
| **Outils** | |
| `tools/bundle-mockup.mjs` | Fond la maquette en deux fichiers autonomes, à partir des mêmes sources |
| `tools/mobile-audit.mjs` | Amputation, cibles tactiles, débordement — échoue |
| `tools/contrast-audit.mjs` | Contrastes mesurés sur les pixels rendus |
| **ÉCARTÉ — ne rien construire dessus** | `src/cartes.js`, `src/voyage.js`, `src/caribbean.js`, `src/rencontre.js`, `src/deckView.js`, `src/shipPlans.js`, `src/run.js`, `src/battle.js`, `src/flotte.js`, `src/breche.js`, `src/hex.js`, `src/combat.js`, `src/map.js`, `src/abilities.js`, les anciens `src/screens/*` |

Les modules écartés restent sur le disque : ils disent ce qui a été essayé, et
c'est la seule chose qui empêche de le reconstruire. Leurs tests tournent par
`node test/archives.js`, jamais par `node test/run.js`.

---

## 4. Les treize règles qui ont chacune coûté un bug

Elles valent toutes pour le code vivant, même quand l'exemple qui les a écrites
vient d'un plateau depuis écarté — c'est le bug qui compte, pas le décor.

**1. Aucune entropie dans la résolution.** `src/simple.js` ne doit jamais
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
`drawGrid(cv, g.grid, { color: g.palette })`.

**8. Ne jamais capturer le pointeur avant que le geste soit un glissement.**
`setPointerCapture` dès le `pointerdown` redirige aussi le `click` qui suit
vers la zone capturante, pas vers l'élément touché. Conséquence observée : une
fois une carte sélectionnée, plus aucune touche n'en sélectionnait une seconde,
et rien ne le signalait — la carte s'illuminait bien au premier appui. La
capture se prend au franchissement du seuil (8 px), pas avant.

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
Une carte posée avec `unshift` part au FOND de la pioche et n'arrive jamais en
main. C'est arrivé à la carte la plus visible d'un plateau depuis écarté :
l'effet principal d'une prise était invisible, et rien ne le signalait.

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
fermé (base plate, bosses en arcs) rempli d'un coup.

**13. Dans le fichier autonome, tous les modules partagent une portée.** Une
`const scene` dans la maquette et une `let scene` dans `src/ocean.js` donnent
une page blanche et une ligne en console. `tools/bundle-mockup.mjs` échoue
maintenant sur un nom déclaré deux fois plutôt que de livrer ça.

---

## 5. Tests

```bash
node test/run.js          # LE JEU — 21 vérifications, zéro dépendance
node test/archives.js     # les modules écartés — 182 vérifications
```

**LA SUITE DU JEU NE COURT QUE SUR CE QUI EST VIVANT.** Elle a longtemps tenu
onze douzièmes de ses vérifications ailleurs : 2 287 lignes gardaient des
modules écartés, contre 244 pour le plateau qu'on joue. Un total vert qui ne dit
rien du jeu en cours est pire qu'un total rouge.

**Deux natures de tests, et il faut savoir laquelle casse.**

*Les détecteurs de clé erronée* — identifiants qui ne correspondent pas à leur
clé, références pendantes, raretés inconnues. C'est la classe de bug qui a coulé
le prototype précédent et qu'aucune vérification de syntaxe n'attrape.

*Les tests qui mesurent une décision de conception* :

- **« est-ce que choisir compte ? »** — les mêmes mains, sur les mêmes graines,
  jouées par un capitaine appliqué et par un maladroit. Mesuré sur la flûte :
  86 prises sur 100 contre 0. Si cet écart se referme, le joueur exécute une
  addition, il ne choisit rien.
- **« l'échelle est mesurée »** — les cinq prises forment une vraie échelle, du
  certain au presque impossible, et chaque barreau se distingue du précédent.
  Si deux barreaux se rejoignent, il y a deux prises qui font le même jeu.
- **« une triplette de la plus faible bat la rare toute seule »** — le plateau
  en une ligne. Il va chercher la plus faible et la rare dans la donnée plutôt
  que de les nommer, donc il suit le paquet quand le paquet change.
- **« LA RARETÉ EST UNE FRÉQUENCE, PAS UN POUVOIR »** — chaque rareté dit un
  nombre d'exemplaires, et rien d'autre.
- **« les deux fins »** — résistance atteinte, quatre bordées tirées. Il n'y en
  a pas de troisième.
- **« les zones »** — une carte est dans exactement une zone, du premier tour au
  dernier. C'est l'invariant d'un jeu de cartes qui ne se voit JAMAIS quand il
  casse : une carte dupliquée n'est qu'une main un peu chanceuse, une carte
  perdue qu'un paquet un peu court. `P.selection` est une marque, pas un tas.
  Déplacer, c'est retirer d'un tas ET poser dans l'autre.
- **« au paquet dit la vérité »** — la seule connaissance que ce plateau
  récompense, c'est de savoir ce qui reste. Si la ligne s'écarte du contenu réel
  de la pioche, mieux valait cacher le compte que le donner faux.

**Un seuil qui casse là est une décision à prendre, pas un test à assouplir.**

**Chaque test de cette suite doit MORDRE.** Deux d'entre eux ont été écrits
faux et passaient quand même : l'un bouclait sur `meilleureVolee(P).length`,
qui vaut `undefined` puisque la fonction rend un objet — la boucle sortait au
premier tour et le test ne jouait jamais. Un test qui ne joue pas passe.
Éprouve-les par MUTATION : casse l'invariant exprès et vérifie qu'une suite, et
une seule, tombe.

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
les `:hover` CSS et raterait un aperçu construit dans un `mouseenter`. Les deux
audits ne visitent QUE le jeu : mesurer un écran que personne n'ouvre ne dit
rien de celui qu'on joue.

---

## 6. Maquettes

`docs/mockups/jeu.html` — **la maquette EST le jeu**, jouable, pas une image.
Elle porte une `<base href="../../">` et charge `css/style.css` et `src/*.js` :
elle **utilise l'interface du jeu**, elle n'en réinvente pas une à côté. Si un
composant manque, l'ajouter à `css/deck.css` et au design system — jamais dans
un `<style>` de maquette.

Tout ce qui sert au développement — graine, état de la pioche, barème — vit
derrière un bouton **roue crantée**, jamais dans l'écran de jeu.

`docs/archives/mockups/` — les maquettes abandonnées : `e-cartes.html` (la
chasse-partie complète, dont la volée nue est la réponse), `b2-combat.html`,
`c-rade.html` et `d-breche.html` (les trois échelles de combat), `profil.html`
et `role-equipage-mockup.html` (antérieures, elles ne suivent aucune de ces
règles). **À lire pour savoir ce qui a été essayé, à ne pas reprendre.**

---

## 7. Documentation

| Fichier | Contenu |
|---|---|
| `CLAUDE.md` | **Ce fichier : le jeu actuel, et rien d'autre** |
| `docs/audit-2026-08.md` | L'audit des branches, la bascule sur la volée nue, et ce qu'il reste à faire |
| `design-system.html` | Interface : palette, composants vivants, contrastes, mobile |
| `histoire.html` | Le monde : contexte 1640-1697, figures historiques |
| **Archives — à lire, jamais à reprendre** | |
| `docs/archives/brief.md` | Le brief d'origine. Sa **section 2** (suppressions) et sa **section 9** (pistes écartées) restent le meilleur relevé de ce qui a été rejeté et pourquoi |
| `docs/archives/PLAN.md` | L'ordre de marche du chantier « grille tactique », tranché et fermé |
| `docs/archives/notes-2025-refonte.md` | L'état du chantier « trois échelles de combat » |

**RÈGLE DE TENUE.** Quand une décision est prise, ce qu'elle remplace descend
dans `docs/archives/` avec sa raison — il ne reste jamais deux versions d'une
règle dans ce document. C'est l'audit d'août 2026 qui a imposé cette règle : on
y trouvait **trois échelles de résistances contradictoires**, dont aucune n'était
celle de la donnée.

---

## 8. Contraintes techniques

Vanilla JS, ES modules, aucun bundler, aucune dépendance npm dans le jeu.
Polices IM Fell English + Courier Prime, chargées depuis Google Fonts. Aucun
asset image. Le CSS existant : ne pas écraser, ajouter à côté.
