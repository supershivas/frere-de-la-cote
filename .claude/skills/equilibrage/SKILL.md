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
   `t.mjs` de test l'a déjà été par accident), qui importe `src/simple.js`
   **directement**. Ce module est pur et déterministes : ils
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
| Choisir compte-t-il ? | `simple.test.js` | appliqué **86**/100 contre maladroit **0**/100 (flûte) |
| L'échelle tient-elle ? | `simple.test.js` | 120 · 132 · 136 · 146 · 150 → 100 / 88 / 78 / 37 / 23 % |
| Le sommet est-il atteignable ? | `simple.test.js` | le vaisseau tombe, mais rarement — ni mur ni formalité |

**Un seuil qui casse est une décision à prendre, pas un test à assouplir.** Si
l'écart entre l'appliqué et le maladroit se referme, le joueur exécute un calcul
au lieu de choisir, et c'est le système qu'il faut jeter — pas le test.

## Le plafond à ne jamais franchir

**IL N'Y A AUCUNE PROGRESSION** — ni état-major, ni relique, ni recrutement.
L'échelle doit tenir ENTIÈRE dans ce qu'on atteint avec onze cartes : la
meilleure volée possible vaut **44**, et quatre bordées plafonnent autour de
**166**. Une résistance au-dessus n'est pas un défi, c'est un mur.

## Trois familles de graines, pas une

Une échelle validée sur une seule famille de graines est une échelle validée sur
un échantillon. Les cinq résistances actuelles ont été relues sur trois familles
(`×7919`, `×104729`, `×31`) dont les résultats s'écartent de **moins d'un
point** — c'est ce qui permet d'écrire « 88 % » plutôt que « à peu près 9 fois
sur 10 ».

## Après la mesure

Écris le chiffre dans `data/simple.json`, le test qui le tient, **et** la ligne de
`CLAUDE.md` qui l'annonce. Les trois doivent dire la même chose : la dérive entre
la donnée et le document est le défaut le plus fréquent de ce dépôt.
