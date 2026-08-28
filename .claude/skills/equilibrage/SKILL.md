---
name: equilibrage
description: Mesurer une décision d'équilibrage avant de la prendre — résistances, poudres, prix, taux de prise, écart entre un capitaine appliqué et un maladroit. À utiliser DÈS qu'un chiffre du jeu doit bouger, et avant d'écrire ce chiffre où que ce soit.
---

# Un chiffre se mesure, il ne se choisit pas

Toute l'échelle de ce jeu a été écrite par des mesures, et chaque fois qu'on a
tranché à l'œil, il a fallu la refaire. Le paquet de munitions frappe environ
**deux fois plus fort** que l'ancien paquet d'hommes, et les résistances ont dû
être réétalonnées d'autant — sans quoi l'acte 1 se gagnait 60 fois sur 60 et le
rechargement ne décidait plus de rien. Le retrait de bâbord/tribord a multiplié
par **2,8** la pression médiane, et a redemandé le même travail.

**Les résistances se relisent à chaque fois que le paquet change.** C'est la
règle ; ce n'en est pas une de plus.

## Le protocole

1. **Décris la question en une phrase**, sous la forme d'un écart à mesurer :
   « combien de prises sur 60 en plus, avec / sans ? », jamais « est-ce que c'est
   trop fort ? ».
2. **Écris un simulateur jetable** dans le scratchpad (jamais commité — un
   `t.mjs` de test l'a déjà été par accident), qui importe `src/cartes.js` ou
   `src/simple.js` **directement**. Ces modules sont purs et déterministes : ils
   n'ont ni DOM ni aléatoire, et le battage prend un `rng` en argument. C'est
   précisément ce qui rend la mesure possible.
3. **Mêmes graines des deux côtés.** Un écart mesuré sur des graines différentes
   ne mesure rien. 60 rencontres pour une comparaison de politique de jeu,
   2 000 pour une distribution de pression.
4. **Rends la distribution, pas la moyenne** : p25, médiane, p75, et le taux de
   prise par navire. Une moyenne cache exactement ce qu'on cherche.

## Les seuils que le dépôt tient déjà

| Ce qu'on mesure | Où c'est tenu | Valeur de référence |
|---|---|---|
| Le rechargement décide-t-il ? | `test/cartes.test.js` | 13 prises d'écart sur 60 (barque), **18** (flûte) |
| Choisir compte-t-il ? | `cartes.test.js`, `simple.test.js` | appliqué 89/100 contre maladroit 2/100 (flûte, plateau F) |
| L'échelle est-elle jouable ? | les deux | rien au-dessus de ~380 (plateau E équipé), ~175 (plateau F) |

**Un seuil qui casse est une décision à prendre, pas un test à assouplir.** Si
l'écart entre l'appliqué et le maladroit se referme, le joueur exécute un calcul
au lieu de choisir, et c'est le système qu'il faut jeter — pas le test.

## Deux plafonds à ne jamais franchir

- **Plateau E** : la progression ne vient plus que de l'état-major et des
  reliques, soit environ **+55 %** de pression. Une résistance au-dessus de ~380
  n'est atteignable par personne.
- **Plateau F** : il n'y a **aucune** progression. L'échelle doit tenir entière
  dans ce qu'on atteint avec onze cartes.

## Après la mesure

Écris le chiffre dans `data/*.json`, le test qui le tient, **et** la ligne de
`CLAUDE.md` qui l'annonce. Les trois doivent dire la même chose : la dérive entre
la donnée et le document est le défaut le plus fréquent de ce dépôt.
