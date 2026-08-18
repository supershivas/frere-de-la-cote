# Frères de la Côte — notes pour Claude Code

Roguelite naval au tour par tour. JS vanilla, ES modules, aucun bundler,
aucune dépendance npm dans le jeu, aucun asset image — tous les navires sont
générés à l'exécution.

**Le dépôt contient trois choses à la fois** : la V1 qu'on remplace, la
refonte, et des maquettes qui explorent la direction à prendre. Savoir dans
laquelle on est avant de toucher à quoi que ce soit.

---

## 1. Où en est le projet, et ce qui est bloqué

Les étapes 0 à 5 du brief sont faites : plans de pont, rendu en profil,
déplacement d'équipage, combat 1 contre 1, boucle de partie. Puis le combat a
été jugé **illisible à l'usage**, et le chantier s'est arrêté pour reprendre la
question de fond : *quelle est la bonne échelle d'un combat ?*

**Trois propositions sont jouables. La décision appartient à l'utilisateur et
n'est pas prise.**

| | `b2-combat.html` | `c-rade.html` | `d-breche.html` |
|---|---|---|---|
| Échelle | un navire contre un navire | une escadre contre une rade | une grille hexagonale isométrique |
| Le tour | répartir cinq hommes sur trois postes | **un ordre** | déplacer et agir, trois bâtiments |
| Le verbe | la répartition | le pari sur la profondeur | **la poussée** (façon *Into the Breach*) |
| Durée | 8 à 15 tours | 6 à 10 ordres | 5 tours, plafond dur |
| Règles | `src/battle.js`, `src/rencontre.js` | `src/flotte.js` | `src/hex.js` + `src/breche.js` |

### Questions ouvertes, posées et sans réponse

Ne pas y répondre à la place de l'utilisateur, et ne pas construire dessus :

1. **Quelle proposition est retenue ?** Réparer le mobile sur les trois serait
   du travail perdu sur deux d'entre elles.
2. **Le plateau devient-il un couloir ?** (voir §2) C'est structurant : cela
   change la fiction autant que la mise en page.
3. **Choisit-on trois bâtiments avant la rade, ou l'escadre est-elle fixe ?**
   Le choix crée le crochet de la méta-progression, mais ajoute un écran — et
   le brief §10.2 plafonne à trois écrans avant le premier combat.

**Ne pas commencer l'étape 6.** Construire la méta-progression sur un combat
qui va changer d'échelle est exactement le travail perdu que l'ordre de
chantier du brief (§12) sert à éviter.

---

## 2. Les deux contraintes qui priment sur le reste

### Mobile d'abord

L'écran de référence est **375 × 667 en portrait**. Ce qui n'y tient pas ne
tient pas. Ce n'est pas une passe de mise en page à la fin, c'est une
contrainte de conception.

- **Le plateau se met à l'échelle de la fenêtre.** Jamais de largeur fixe en
  pixels. `#app { overflow-x: hidden }` ampute **en silence** : pas
  d'ascenseur, pas d'erreur, la moitié du jeu absente. C'est le défaut le plus
  grave parce que rien ne le signale — mesuré à 51 % du plateau de D hors
  écran, et 47 % des cartes de recrutement du **jeu réel**.
- **44 × 44 px minimum** pour tout ce qui se touche, case de plateau comprise.
  La règle était écrite dans le design system depuis la V1 et violée partout.
- **Le survol ne porte aucune information.** Sur un plateau tactique :
  première touche = viser et montrer ce que l'action ferait, seconde touche =
  confirmer. Cela remplace le survol *et* supprime la faute de frappe
  irréversible, qui coûte plus au pouce qu'à la souris.
- **La forme du plateau suit l'écran.** La vue isométrique écrase chaque case
  de moitié (`hauteur = taille × √3 × 0,56`), donc c'est la *hauteur* d'un
  hexagone qui décide si le pouce touche juste. Le disque actuel donne des
  cases de 33 px de haut sur un téléphone et gaspille 290 px de hauteur.
  Un couloir garde le même nombre de cases, double la taille tactile et
  remplit l'écran — et une rade se pénètre par une passe, donc c'est un
  couloir. Détail chiffré : `docs/refonte/PLAN.md`, design-system §13.4.

### Plusieurs types de bâtiments

Un type = **une silhouette** (la classe de coque de `src/sprites.js`) + **un
verbe**, et les verbes ne se remplacent pas.

**État réel : pas encore fait.** Aujourd'hui `NOTRES` et `EUX` sont des objets
littéraux au milieu des règles, dans `src/breche.js`. La cible proposée est
`data/batiments.json` : le **type** devient du contenu, le **verbe** reste du
code parce que c'est une règle. Ajouter un brigantin plus lourd ne doit pas
demander de toucher au moteur. Six types nôtres et trois ennemis sont proposés
dans `PLAN.md` — proposés, pas décidés.

---

## 3. Lire avant de toucher au combat, à la carte, à l'équipage ou aux navires

- `docs/refonte/brief.md` — **fait foi.** Sa section 2 (suppressions) et sa
  section 9 (pistes écartées) priment sur toute intuition de conception :
  elles évitent de reconstruire ce qui a déjà été essayé et rejeté.
- `docs/refonte/PLAN.md` — l'avancement réel, les décisions prises, les bugs
  trouvés, et les brainstorms non tranchés. Les noms de fichiers du brief
  (`game.html`, `architecture.html`) sont obsolètes ; le dépôt utilise
  `index.html`, `design-system.html`, `histoire.html`, `src/*.js`.
- `design-system.html` — l'interface : palette, composants **vivants**,
  contrastes mesurés, règles mobiles.

### Déviations actées par rapport au brief

- **La météo reste en jeu** (`data/weather.json`). Le brief ne la cite pas en
  §2 ; ne pas la supprimer par extrapolation depuis le §9, qui écarte le
  *vent* — un système différent.
- **La réputation à trois factions et le Kraken Mécanique sont supprimés.** Le
  dépôt n'avait en réalité qu'un scalaire `reputation` : il se refactore en
  `legitimacy` (§8.6) à l'étape 6, il n'y a pas de système à démonter.
- **La carte macro est la vraie Caraïbe**, départ toujours à l'Île de la
  Tortue, à la place de la grille procédurale de `src/map.js`.

---

## 4. Où vit quoi

Le code de la refonte et celui de la V1 coexistent. **Ne rien construire de
neuf sur le second.**

| Module | Rôle |
|---|---|
| **Règles — pures, déterministes, sans DOM ni aléatoire** | |
| `src/battle.js` | Combat 1 contre 1 |
| `src/flotte.js` | La rade (proposition C) : une escadre, trois bandes, un ordre par tour |
| `src/breche.js` | La rade tactique (proposition D) : grille, récifs, poussée, intentions annoncées |
| `src/shipPlans.js` | Plans de pont par classe de coque : salles, passages, spécialités |
| **Génération — c'est ici que l'aléatoire est permis** | |
| `src/rencontre.js` | Tirage d'ouverture : météo, pavillon, phylactères |
| `src/hex.js` | Géométrie hexagonale : axial, voisinage, distance, axes, projection. **Aucune règle de jeu** |
| `src/sprites.js` | Générateur de navires |
| `src/caribbean.js` | La Caraïbe réelle : lieux, côtes, distances |
| **Présentation** | |
| `src/ui.js` | `el`, `mount`, `modal`, `bar` — les briques de tout écran |
| `src/ocean.js` | Ciel et mer animés, en fond de tout écran « en mer » |
| `src/fx.js` | Effets de combat : fumée, éclats, nombres flottants |
| `src/deckView.js` | Rendu en profil : le sprite généré sert de cadre au plan |
| `src/run.js` | État de partie : archétypes, chasse-partie, moral, légitimité |
| **Styles** | |
| `css/components.css` | Composants **partagés** : jauges `.bar`, boutons, badges, modales |
| `css/deck.css` | Tout le CSS de la refonte, à côté de l'existant |
| `css/style.css` | Ce qui appartient à **un écran**, et rien d'autre |
| **V1, à remplacer** | `src/combat.js`, `src/map.js`, `src/abilities.js`, les anciens `src/screens/*` |

---

## 5. Les six règles qui ont chacune coûté un bug

**1. Aucune entropie dans la résolution.** `src/battle.js`, `src/flotte.js` et
`src/breche.js` ne doivent jamais contenir `Math.random`, `Date.now` ni
`crypto` — un test échoue s'ils y apparaissent. L'aléatoire est permis dans la
*génération* (rade, rencontre, butin), jamais dans la *résolution* (brief
§4.1). C'est ce qui fait qu'un tour est un problème fermé et non un pari.

**2. Un écran de la refonte s'écrit `.screen.mon-ecran`, jamais
`.mon-ecran`.** `deck.css` est `@importée` **en tête** de `style.css`, donc à
spécificité égale le `.screen { animation: fade }` qui vient plus bas gagne.
Écrites sans le `.screen`, les règles `animation: none` n'ont jamais pris
effet : le fondu était rejoué à chaque reconstruction d'écran — c'est-à-dire à
chaque clic — et le flash proscrit au §9 était toujours là, pendant des mois,
dans une règle qui avait l'air correcte.

**3. Un composant partagé n'a qu'une définition.** Deux définitions d'une même
classe dans deux feuilles est un bug qui ne se voit que le jour où l'une est
chargée sans l'autre. C'est arrivé à `.bar-hp`, qui sortait noire et vide dans
la documentation.

**4. Un libellé posé sur la mer porte une plaque, pas une ombre.** Le fond est
un canvas animé qui va du bleu nuit au ciel de midi ; un `text-shadow` tient à
1,46:1 sur l'horizon éclairé. Fond opaque obligatoire.

**5. Un ordre impossible se refuse à voix haute.** Une fonction de règles rend
`false` plutôt que de ne rien faire : un refus silencieux consomme le clic du
joueur et ne se remarque qu'en constatant que rien n'a bougé.

**6. Une contrainte sans instrument est un vœu.** « Mobile d'abord », « 44 px »,
« contraste AA » étaient tous écrits dans la documentation, et tous violés.
Ce qui les a rendus réels, c'est un outil qui échoue. Avant de poser une
nouvelle règle transversale, écrire ce qui la mesurera.

---

## 6. Maquettes

`docs/refonte/mockups/` — maquettes **jouables**, pas des images. Elles portent
une `<base href="../../../">` et chargent `css/style.css` et `src/*.js` : une
maquette **utilise l'interface du jeu**, elle n'en réinvente pas une à côté. Si
un composant manque, l'ajouter à `css/deck.css` et au §16 du
`design-system.html` — jamais dans un `<style>` de maquette.

Tout ce qui sert au développement — graine de tirage, tags, règles effectives,
positions — vit derrière un bouton **roue crantée**, jamais dans l'écran de jeu.

`profil.html` et `role-equipage-mockup.html` sont antérieures et ne suivent pas
ces règles : ne pas s'en inspirer.

---

## 7. Tests et instruments

```bash
node test/run.js          # 141 vérifications, zéro dépendance
```

**Deux natures de tests, et il faut savoir laquelle casse.**

*Les détecteurs de clé erronée* — identifiants qui ne correspondent pas à leur
clé, références pendantes, clés de langue présentes d'un côté et absentes de
l'autre. C'est la classe de bug qui a coulé le prototype précédent (brief §13)
et qu'aucune vérification de syntaxe n'attrape.

*Les tests qui mesurent une décision de conception.* `rencontre.test.js` mesure
ce que le tirage produit (éléments affichés, fréquence des raretés, parties
avant qu'une réplique revienne). `flotte.test.js` mesure la forme du pari et
échoue si foncer devient sûr. `breche.test.js` mesure si **la position
compte** : un joueur appliqué doit gagner nettement plus qu'un maladroit,
sinon la grille ne sert à rien. `hex.test.js` teste des *propriétés* — métrique,
réciprocité, injectivité — et non des valeurs choisies à la main.
**Un seuil qui casse dans ces fichiers-là est presque toujours une décision à
prendre, pas un test à assouplir.**

Pour ce que les tests de données ne peuvent pas voir :

```bash
python3 -m http.server 8000 &
npm i playwright-core                 # dev uniquement, le jeu reste sans dépendance
node tools/playtest.mjs 4             # joue des combats, échoue sur toute erreur console
node tools/contrast-audit.mjs         # contrastes mesurés sur pixels rendus
node tools/mobile-audit.mjs           # amputation, cibles tactiles, débordement
```

**L'audit de contraste échantillonne la capture d'écran**, pas les styles
calculés : les fonds sont peints par un canvas et par un calque fixe derrière
l'application, si bien qu'un audit qui remonte le DOM ne les voit pas et
déclare « 0 échec » sur un écran illisible. Il teste aussi l'occultation avant
d'échantillonner. C'est lui qui a découvert le bug du fondu (règle 2), par
accident : ses captures sortaient délavées.

**L'audit mobile** ouvre chaque écran sur trois téléphones et **échoue** si
l'un ampute ou déborde. Sa limite est écrite dans son en-tête : il ne lit que
les `:hover` CSS et rate un aperçu construit dans un `mouseenter` JavaScript —
c'est justement le cas de la maquette D. Un outil qui rate en silence ce qu'il
prétend mesurer est pire qu'aucun outil.

---

## 8. Documentation

| Fichier | Contenu |
|---|---|
| `docs/refonte/brief.md` | Le brief, fait foi |
| `docs/refonte/PLAN.md` | Avancement, décisions prises, bugs trouvés, brainstorms |
| `design-system.html` | Interface : palette, composants vivants, contrastes, mobile |
| `histoire.html` | Le monde : contexte 1640-1697, figures historiques |
| `README.md` | Vue d'ensemble, comment lancer, arborescence |

Les démonstrations du `design-system.html` §16 chargent `css/deck.css` et
`css/components.css`, les feuilles réelles : modifier un composant met la
documentation à jour toute seule, mais **ajouter** un composant demande de
l'ajouter au §16. Le §16.16 va plus loin — sa grille est construite par
`src/hex.js` lui-même, pas recopiée.

---

## 9. Contraintes techniques

Vanilla JS, ES modules, aucun bundler, aucune dépendance npm dans le jeu.
Polices IM Fell English + Courier Prime, chargées depuis Google Fonts. Aucun
asset image. Le CSS existant (`variables.css`, `animations.css`,
`components.css`, `pattern.css`, `deck.css`, importés par `style.css`) : ne pas
écraser, ajouter à côté.
