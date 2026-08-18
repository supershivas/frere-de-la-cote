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

1. **Une prise** (`data/equipage.json → prises`) a un objectif, un nombre de
   volées, et parfois une **règle** qui casse une habitude : « les cartes de
   tribord ne comptent pas », « chaque volée met un Feu dans ta pioche ».
2. **Une main** de sept hommes. On en sélectionne jusqu'à cinq. Le tableau
   affiche le compte exact **avant** de tirer.
3. **Deux ordres seulement** : *Bordée* (tire, consomme une volée) et
   *Largage* (jette la sélection, repioche, consomme un largage).
4. Objectif atteint → **le partage** : deux recrues, deux reliques, une
   promotion. Ce qui n'est pas acheté est perdu.
5. Plus de volées → la chasse est rompue.

### Les deux axes qui font la combinatoire

- **Le métier** est le *verbe* : canonnier (puissance brute), gabier (+1 au
  multiplicateur), abordeur (double si la prise est basse), charpentier (ne
  frappe pas ; rend un largage et jette un Feu).
- **Le quart** est la *couleur* : bâbord avant, bâbord arrière, tribord avant,
  tribord arrière. L'équipage de départ est déséquilibré exprès (5/4/3/2) :
  concentrer un quart pour débloquer les grosses manœuvres, c'est le crochet
  du recrutement.

Quatre métiers **et** quatre quarts : sans les deux, une main tirée au hasard
forme presque toujours une bonne manœuvre, et choisir ne veut plus rien dire.
C'est mesuré, pas supposé — voir §4.

---

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
- **Deux gestes, et pas plus.** On touche pour viser, on **glisse pour
  ordonner** : vers le haut la bordée part, vers le bas la sélection est
  larguée (seuil : 44 px, la même mesure que la cible tactile minimale). Le
  glissement vers le bas résiste — larguer coûte une ressource et ne doit pas
  arriver en reposant le pouce. Les deux boutons restent : un geste raccourcit
  un ordre nommé, il ne le remplace pas.
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
| `src/rencontre.js` | Tirage d'ouverture : météo, pavillon, phylactères |
| `src/sprites.js` | Générateur de navires |
| `src/caribbean.js` | La Caraïbe réelle : lieux, côtes, distances |
| **Présentation** | |
| `src/ui.js` | `el`, `mount`, `modal`, `bar` — les briques de tout écran |
| `src/ocean.js` | Ciel et mer animés, en fond de tout écran « en mer » |
| `src/fx.js` | Effets : fumée, éclats, nombres flottants |
| `src/deckView.js` | Rendu en profil : le sprite généré sert de cadre au plan |
| `src/run.js` | État de partie : archétypes, chasse-partie, moral, légitimité |
| **Styles** | |
| `css/deck.css` | Le CSS de la refonte. **§17 = l'écran de cartes** |
| `css/components.css` | Composants **partagés** : jauges, boutons `.btn-level-*`, modales |
| `css/style.css` | Ce qui appartient à **un écran**, et rien d'autre |
| **Outils** | |
| `tools/bundle-mockup.mjs` | Fond une maquette en un fichier autonome, à partir des mêmes sources |
| `tools/mobile-audit.mjs` | Amputation, cibles tactiles, débordement — échoue |
| `tools/contrast-audit.mjs` | Contrastes mesurés sur les pixels rendus |
| **Écarté — ne rien construire dessus** | `src/battle.js`, `src/flotte.js`, `src/breche.js`, `src/hex.js`, `src/combat.js`, `src/map.js`, `src/abilities.js`, les anciens `src/screens/*` |

---

## 4. Les huit règles qui ont chacune coûté un bug

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

---

## 5. Tests

```bash
node test/run.js          # 152 vérifications, zéro dépendance
```

**Deux natures de tests, et il faut savoir laquelle casse.**

*Les détecteurs de clé erronée* — identifiants qui ne correspondent pas à leur
clé, références pendantes, rôles inconnus. C'est la classe de bug qui a coulé
le prototype précédent et qu'aucune vérification de syntaxe n'attrape.

*Les tests qui mesurent une décision de conception.* Dans
`cartes.test.js`, la suite **« est-ce que choisir compte ? »** fait jouer les
mêmes mains, sur les mêmes graines, à un capitaine appliqué (sa meilleure
volée) et à un maladroit (les cinq premières cartes). Le maladroit doit perdre
nettement. **Un seuil qui casse là est une décision à prendre, pas un test à
assouplir** : c'est ce test qui a forcé le passage de deux bords à quatre
quarts, parce qu'à deux bords le maladroit gagnait 60 fois sur 60.

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
| `docs/refonte/PLAN.md` | Avancement, décisions, bugs trouvés |
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
