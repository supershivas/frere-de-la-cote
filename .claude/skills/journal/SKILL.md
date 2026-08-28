---
name: journal
description: Écrire le message de commit et la mise à jour de CLAUDE.md dans la langue du dépôt — une phrase qui dit ce qui a changé ET ce que ça coûtait avant. À utiliser à chaque commit d'une décision, et pour rattraper la dérive entre le document et la donnée.
---

# Écrire ce qui a changé, et pourquoi ça a changé

Ce dépôt tient sa mémoire dans deux endroits : les messages de commit et
`CLAUDE.md`. Les deux sont écrits **en français**, au présent, et disent une
décision — jamais une opération.

## Le message de commit

Une ligne, la décision vue du jeu, pas du code :

> Les deux paquets reviennent sur le bois, et les cartes sortent vraiment de la pioche
> La valeur prend la couleur du type, et deux gris deviennent deux couleurs
> Bâbord et tribord disparaissent, les cartes deviennent des cartes
> Écran noir dans le fichier autonome : une variable locale masquait un module
> Six systèmes retirés : il ne reste que le bord, la valeur et le seuil

Ce qu'on n'écrit pas : « refactor », « fix », « update CSS », un préfixe de type,
un numéro de ticket. Ce qu'on écrit : ce que le joueur verra, ou ce qui ne se
verra plus.

**Aucun identifiant de modèle** — ni dans le message, ni dans le corps, ni dans un
commentaire de code.

## La mise à jour de `CLAUDE.md`

Le document n'énumère pas des règles : il porte **le coût de chacune**. C'est ce
qui empêche qu'on les défasse dans six semaines. Une entrée complète a trois
parties :

1. **La règle**, en majuscules quand elle commande les autres.
2. **Ce qu'elle a coûté** : le bug, la mesure, ou le nombre de choses à tenir en
   tête. « L'infobulle recouvrait la mer, où qu'on l'ancre. » « Mesuré à 51 % du
   plateau hors écran. » « 13 prises d'écart sur 60. »
3. Ce qu'on ne reconstruit pas, s'il s'agit d'un retrait — dans le tableau
   « Ce qui a été RETIRÉ », avec ce que ça coûtait.

## Rattraper la dérive

**Le défaut le plus fréquent de ce dépôt est l'écart entre le document et la
donnée.** Les chiffres cités dans `CLAUDE.md` ont été réétalonnés plusieurs fois
et le texte ne suit pas toujours : on y trouve des échelles de résistances qui ne
sont plus celles de `data/equipage.json`.

À chaque passage, vérifie et corrige les trois qui doivent coïncider :

```bash
python3 -c "import json;print([(p['id'],p['resistance'],p['pv']) for p in json.load(open('data/equipage.json'))['prises']])"
grep -n "résistance\|resistance\|barque [0-9]" CLAUDE.md docs/refonte/PLAN.md
```

Et laisse une seule valeur citée à chaque endroit. Deux échelles écrites dans le
même document sont pires qu'aucune : on ne sait plus laquelle est le jeu.

`docs/refonte/PLAN.md` demande la même vigilance — il décrit encore un chantier
de grille tactique que §1 de `CLAUDE.md` déclare tranché et fermé.
