---
name: nouvelle-regle
description: Ajouter, changer ou RETIRER une règle de jeu — un type de carte, une rareté, la composition du paquet, une figure, une prise. Impose le partage donnée/code, le test qui mesure la décision, et la question du retrait avant celle de l'ajout.
---

# Avant d'ajouter, demander ce qu'on retire

Ce jeu est arrivé à **sept systèmes** à tenir en tête devant un écran de 375 px.
Chacun était défendable seul, aucun ne l'était ensemble, et il a fallu en retirer
six. Le biais par défaut est donc le retrait.

**Un système qu'il faut rattraper par une exception est un système à retirer, pas
à corriger.**

## Les trois questions, dans l'ordre

1. **Est-ce que ça a déjà été essayé et jeté ?** Lis le tableau « Ce qui a été
   RETIRÉ » de `CLAUDE.md` §1, la §2 et la §9 de `docs/archives/brief.md`, et
   `docs/archives/notes-2025-refonte.md` avant de rouvrir une question de combat.
   Bâbord/tribord, les métiers, l'avant/l'arrière, les mâts, l'encrassement, la
   météo en combat, les règles de prise, la fureur, la panachée : chacun a un
   coût écrit en face. Ne les reconstruis pas.
2. **Est-ce de la donnée ou du code ?** Un type de carte, sa poudre, sa rareté,
   la composition du paquet, une prise et sa résistance, le barème d'une
   figure → `data/simple.json`, **zéro ligne de code**. `src/simple.js` ne
   connaît ni les noms ni les nombres — il ne connaît que les figures. Si ton
   changement demande du code, ce n'est pas du contenu : dis-le, et justifie la
   règle.
3. **La rareté est-elle restée une FRÉQUENCE ?** Elle dit un nombre
   d'exemplaires, et rien d'autre. Une rareté qui accorderait en plus un bonus
   serait une seconde chose à lire sur chaque carte — précisément ce que ce
   plateau a été monté pour ne pas avoir. Sa seule conséquence, et c'est
   l'équilibre entier du paquet : **seules les communes (3 exemplaires) peuvent
   former une triplette, et la rare (1) ne s'assortit avec rien.**

## Les contraintes qui ne se négocient pas

- **Aucune entropie dans la résolution** (règle 1) : ni `Math.random`, ni
  `Date.now`, ni `crypto` dans `src/cartes.js` ni `src/simple.js`, **commentaire
  compris** — un test échoue. Une même main jouée deux fois donne deux fois le
  même chiffre. Le battage et la pioche prennent un `rng` en argument, parce
  qu'ils relèvent de la génération.
- **On pioche avec `pop()`** : la fin du tableau est le DESSUS du paquet
  (règle 10). Une carte posée avec `unshift` part au fond et n'arrive jamais en
  main — c'est arrivé à la carte Feu du brûlot, l'effet le plus visible de la
  prise, invisible, sans que rien ne le signale.
- **Une carte est dans exactement UNE zone.** `pioche`, `main`, `defausse` se
  partagent les mêmes objets — jamais des copies. Déplacer, c'est retirer d'un
  tas ET poser dans l'autre : une carte retirée sans être posée disparaît en
  silence, et une carte posée sans être retirée se duplique. Ni l'une ni l'autre
  ne lève d'erreur ; on perd une partie sur une main légèrement fausse et l'on
  cherche le défaut dans le barème. `P.selection` n'est **pas une zone** : c'est
  une marque posée sur des cartes qui restent en main. La suite
  `simple — les zones` tient tout cela ; si tu ajoutes une zone ou un
  déplacement, étends-la dans le même mouvement.
- **La pioche vide se rebat depuis la défausse**, et le tarissement complet est
  un cas défini, pas un `break` accidentel. Ici c'est le cas NORMAL : trois
  cartes par volée et quatre bordées font douze cartes tirées d'un paquet de
  onze.
- **LES RÉSISTANCES SE RELISENT À CHAQUE FOIS QUE LE PAQUET CHANGE.** Un type,
  un exemplaire, une poudre : les cinq se remesurent (`Skill(equilibrage)`).
  Sans exception — c'est arrivé à chaque changement de paquet de ce dépôt.
- **Un ordre impossible rend `false`**, avec son pourquoi (règle 5). Jamais un
  `return` muet : un refus silencieux consomme le geste du joueur.
- **DEUX FINS, PAS TROIS.** Résistance atteinte, ou quatre bordées tirées. La
  coque et la coulée sont parties avec le plateau E : une seconde façon de
  gagner qui rendait moins était une exception de plus.
- **Le plateau E ne se rouvre pas.** `src/cartes.js` et
  `docs/archives/mockups/e-cartes.html` sont écartés. Ne rapatrie pas un de
  leurs systèmes « juste celui-là ».

## Ce qu'il faut écrire, à chaque fois

1. La donnée, ou le verbe.
2. **Le test qui mesure la décision**, pas seulement la clé : ce que la règle est
   censée changer dans le jeu, chiffré. Voir `Skill(equilibrage)`.
3. Le détecteur de clé erronée si tu as ajouté une référence croisée (un homme
   qui nomme un verbe, une prise qui nomme une classe de coque).
4. La section de `CLAUDE.md` qui décrit la règle — **et la raison**, pas seulement
   la règle. Ce document explique pourquoi chaque chose est là ; une entrée sans
   son coût sera défaite dans six semaines.
