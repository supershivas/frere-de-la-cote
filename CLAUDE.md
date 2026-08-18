# Frères de la Côte — notes pour Claude Code

Roguelite naval au tour par tour, en JS vanilla sans dépendance ni bundler.
Le projet est **en refonte** : une partie du dépôt est la V1 à remplacer,
une autre est la refonte, et une troisième est faite de maquettes qui
explorent la direction à prendre. Savoir dans laquelle on est avant de
toucher à quoi que ce soit.

## Où en est le projet

Les étapes 0 à 5 du brief sont faites (plans de pont, rendu en profil,
déplacement d'équipage, combat 1 contre 1, boucle de partie). Puis le combat
a été jugé **illisible** à l'usage, et le chantier s'est arrêté pour
reprendre la question de fond : quelle est la bonne échelle d'un combat.

Deux propositions sont sur la table, jouables, **et la décision appartient à
l'utilisateur** :

| | `b2-combat.html` | `c-rade.html` | `d-breche.html` |
|---|---|---|---|
| Échelle | un navire contre un navire | une escadre contre une rade | **une grille hexagonale isométrique** |
| Le tour | répartir cinq hommes sur trois postes | **un ordre** | déplacer et agir, trois bâtiments |
| Le verbe | la répartition | le pari sur la profondeur | **la poussée** (façon Into the Breach) |
| Durée | 8 à 15 tours | 6 à 10 ordres | 5 tours, plafond dur |
| Règles | `src/battle.js`, `src/rencontre.js` | `src/flotte.js` | `src/hex.js` + `src/breche.js` |

Ne pas commencer l'étape 6 tant que ce choix n'est pas tranché : construire
la méta-progression sur un combat qui va changer d'échelle est exactement le
travail perdu que l'ordre de chantier du brief (§12) sert à éviter.

## Lire avant de toucher au combat, à la carte, à l'équipage ou aux navires

- `docs/refonte/brief.md` — le brief, fait foi. Sa **section 2**
  (suppressions) et sa **section 9** (pistes écartées) priment sur toute
  intuition de conception : elles évitent de reconstruire ce qui a déjà été
  essayé et rejeté.
- `docs/refonte/PLAN.md` — l'avancement réel, étape par étape, avec les
  décisions prises et les bugs trouvés. Les noms de fichiers du brief
  (`game.html`, `architecture.html`) sont obsolètes ; le dépôt utilise
  `index.html`, `design-system.html`, `histoire.html`, `src/*.js`.
- `design-system.html` — l'interface : palette, composants **vivants**,
  contrastes mesurés.

## Déviations actées par rapport au brief

- **La météo reste en jeu** (`data/weather.json`). Le brief ne la cite pas en
  §2 ; ne pas la supprimer par extrapolation depuis le §9, qui écarte le
  *vent* — un système différent.
- **La réputation à trois factions et le Kraken Mécanique sont supprimés.**
  Le dépôt n'avait en réalité qu'un scalaire `reputation` : il se refactore
  en `legitimacy` (§8.6) à l'étape 6, il n'y a pas de système à démonter.
- **La carte macro est la vraie Caraïbe**, avec un départ toujours identique
  (l'Île de la Tortue), à la place de la grille procédurale de `src/map.js`.

## Où vit quoi

Le code de la refonte et celui de la V1 coexistent. **Ne rien construire de
neuf sur le second.**

| Module | Rôle |
|---|---|
| `src/battle.js` | Règles du combat 1 contre 1 — pures |
| `src/flotte.js` | Règles de la rade (proposition C) : une escadre, trois bandes, un ordre par tour — pures |
| `src/hex.js` | Géométrie hexagonale : axial, voisinage, distance, axes, projection isométrique. **Aucune règle de jeu** |
| `src/breche.js` | Règles de la rade tactique (proposition D) : grille, récifs, poussée, intentions annoncées — pures |
| `src/rencontre.js` | Tirage d'ouverture de combat, météo, pavillon, phylactères. **L'entropie entre ici** |
| `src/shipPlans.js` | Plans de pont par classe de coque : salles, passages, spécialités, coûts de trajet |
| `src/deckView.js` | Rendu en profil : le sprite généré sert de cadre au plan |
| `src/run.js` | État de partie : archétypes, clauses de chasse-partie, moral, légitimité |
| `src/caribbean.js` | La Caraïbe réelle : lieux, côtes, distances |
| `src/sprites.js` | Générateur de navires — aucun asset image dans le jeu |
| `src/ocean.js` | Ciel et mer animés, en fond de tout écran « en mer » |
| `src/fx.js` | Effets de combat : fumée, éclats, nombres flottants |
| `src/ui.js` | `el`, `mount`, `modal`, `bar` — les briques de tout écran |
| `css/deck.css` | Tout le CSS de la refonte, à côté de l'existant |
| `css/components.css` | Composants **partagés** : jauges `.bar`, boutons, badges |
| **V1, à remplacer** | `src/combat.js`, `src/map.js`, `src/abilities.js`, les anciens `src/screens/*` |

## Les cinq règles qui ont chacune coûté un bug

**1. Aucune entropie dans la résolution.** `src/battle.js`, `src/flotte.js` et
`src/breche.js` ne doivent jamais contenir `Math.random`, `Date.now` ni
`crypto` — un test échoue s'ils y apparaissent. L'aléatoire est permis dans
la *génération* (rade, rencontre, butin), jamais dans la *résolution*
(brief §4.1). C'est ce qui fait qu'un tour est un problème fermé et non un
pari.

**2. Un écran de la refonte s'écrit `.screen.mon-ecran`, jamais `.mon-ecran`.**
`deck.css` est `@importée` **en tête** de `style.css`, donc à spécificité
égale le `.screen { animation: fade }` qui vient plus bas gagne. Écrites sans
le `.screen`, les règles `animation: none` n'avaient jamais pris effet : le
fondu était rejoué à chaque reconstruction d'écran, c'est-à-dire à chaque
clic, et le flash proscrit au §9 était toujours là — pendant des mois, dans
une règle qui avait l'air correcte.

**3. Un composant partagé n'a qu'une définition.** Les jauges `.bar`, les
boutons, les badges et les modales vivent dans `css/components.css` ;
`css/style.css` ne garde que ce qui appartient à un écran. Deux définitions
d'une même classe dans deux feuilles est un bug qui ne se voit que le jour où
l'une est chargée sans l'autre — c'est arrivé à `.bar-hp`, qui sortait noire
et vide dans la documentation.

**4. Un libellé posé sur la mer porte une plaque, pas une ombre.** Le fond
est un canvas animé qui va du bleu nuit au ciel de midi ; un `text-shadow`
tient à 1,46:1 sur l'horizon éclairé. Fond opaque obligatoire.

**5. Un ordre impossible se refuse à voix haute.** Une fonction de règles
rend `false` plutôt que de ne rien faire : un refus silencieux consomme le
clic du joueur et ne se remarque qu'en constatant que rien n'a bougé.

## Maquettes

`docs/refonte/mockups/` — maquettes **jouables**, pas des images. Elles
portent une `<base href="../../../">` et chargent `css/style.css` et
`src/*.js` : une maquette **utilise l'interface du jeu**, elle n'en réinvente
pas une à côté. Si un composant manque, l'ajouter à `css/deck.css` et au §16
du `design-system.html` — jamais dans un `<style>` de maquette.

Tout ce qui sert au développement (graine de tirage, tags, règles effectives)
vit derrière un bouton roue crantée, jamais dans l'écran de jeu.

## Tests

```bash
node test/run.js          # données + règles + formes mesurées, zéro dépendance
```

Deux natures de tests, et il faut savoir laquelle casse.

**Les détecteurs de clé erronée** (`data.test.js`, une partie des autres) :
identifiants qui ne correspondent pas à leur clé, références pendantes,
clés de langue présentes d'un côté et absentes de l'autre. C'est la classe
de bug qui a coulé le prototype précédent (brief §13) et qu'aucune
vérification de syntaxe n'attrape.

**Les tests qui mesurent une décision de conception.**
`test/rencontre.test.js` mesure ce que le tirage produit : nombre d'éléments
affichés, fréquence des raretés, taille de l'espace des ouvertures, parties
avant qu'une réplique revienne. `test/flotte.test.js` mesure la *forme du
pari* : deux façons de piller jouées sur 300 rades chacune, et il échoue si
foncer devient sûr — auquel cas le fond de la rade n'est plus un pari mais
une étape. `test/breche.test.js` mesure si **la position compte** : un joueur
appliqué doit gagner nettement plus qu'un maladroit, sinon la grille ne sert à
rien. `test/hex.test.js` teste des *propriétés* (métrique, réciprocité,
injectivité) et non des valeurs choisies à la main. **Un seuil qui casse dans ces fichiers est presque toujours une
décision à prendre, pas un test à assouplir.**

Pour ce que les tests de données ne peuvent pas voir :

```bash
python3 -m http.server 8000 &
npm i playwright-core                 # dev uniquement, le jeu reste sans dépendance
node tools/playtest.mjs 4             # joue des combats, échoue sur toute erreur console
node tools/contrast-audit.mjs         # contrastes mesurés sur pixels rendus
```

L'audit de contraste échantillonne la **capture d'écran**, pas les styles
calculés : les fonds sont peints par un canvas et par un calque fixe derrière
l'application, si bien qu'un audit qui remonte le DOM ne les voit pas et
déclare « 0 échec » sur un écran illisible. Il vérifie aussi qu'un élément
n'est pas recouvert avant de l'échantillonner. C'est cet audit qui a
découvert le bug du fondu (règle 2), par accident : sa capture sortait
délavée.

## Documentation

| Fichier | Contenu |
|---|---|
| `docs/refonte/brief.md` | Le brief, fait foi |
| `docs/refonte/PLAN.md` | Avancement, décisions prises, bugs trouvés |
| `design-system.html` | Interface : palette, composants vivants, contrastes mesurés |
| `histoire.html` | Le monde : contexte 1640-1697, figures historiques |
| `README.md` | Vue d'ensemble, comment lancer, arborescence |

Les démonstrations du `design-system.html` §16 chargent `css/deck.css` et
`css/components.css`, les feuilles réelles : modifier un composant met la
documentation à jour toute seule, mais **ajouter** un composant demande de
l'ajouter au §16.

## Contraintes techniques

Vanilla JS, ES modules, aucun bundler, aucune dépendance npm dans le jeu.
Polices IM Fell English + Courier Prime. Aucun asset image : tous les navires
sont générés par `src/sprites.js`. Le CSS existant (`variables.css`,
`animations.css`, `components.css`, `pattern.css`, `deck.css`, importés par
`style.css`) : ne pas écraser, ajouter à côté.
