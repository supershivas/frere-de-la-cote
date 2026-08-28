---
name: nouvelle-regle
description: Ajouter, changer ou RETIRER une règle de jeu — une munition, une figure, un homme de l'état-major, une relique, une intention de prise. Impose le partage donnée/code, le test qui mesure la décision, et la question du retrait avant celle de l'ajout.
---

# Avant d'ajouter, demander ce qu'on retire

Ce jeu est arrivé à **sept systèmes** à tenir en tête devant un écran de 375 px.
Chacun était défendable seul, aucun ne l'était ensemble, et il a fallu en retirer
six. Le biais par défaut est donc le retrait.

**Un système qu'il faut rattraper par une exception est un système à retirer, pas
à corriger.**

## Les trois questions, dans l'ordre

1. **Est-ce que ça a déjà été essayé et jeté ?** Lis le tableau « Ce qui a été
   RETIRÉ » de `CLAUDE.md` §1, la §2 et la §9 de `docs/refonte/brief.md`, et
   `docs/refonte/notes-2025-refonte.md` avant de rouvrir une question de combat.
   Bâbord/tribord, les métiers, l'avant/l'arrière, les mâts, l'encrassement, la
   météo en combat, les règles de prise, la fureur, la panachée : chacun a un
   coût écrit en face. Ne les reconstruis pas.
2. **Est-ce de la donnée ou du code ?** Une munition, une prise, une relique, le
   nom / le titre / le texte / le prix d'un homme → `data/equipage.json` (ou
   `data/simple.json`), **zéro ligne de code**. Le **verbe** d'un homme de
   l'état-major → `src/cartes.js`. C'est la seule chose du jeu qui demande du
   code, et c'est voulu.
3. **Est-ce que ça change une règle ?** Un homme qui n'apporterait qu'un bonus
   chiffré serait une munition de plus. **Un objet qui ne change aucune règle
   n'est qu'un texte.** Quand un objet perd son verbe parce qu'un système est
   retiré, on lui en donne un neuf plutôt que de le supprimer — c'est ainsi que
   les écouvillons donnent une place de plus dans la volée et que la Hune coupe
   la première annonce.

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
  cherche le défaut dans le barème.
  - `P.deck` est la **maîtresse liste**, pas une zone : c'est elle que
    `retirerDeLaPartie` doit trancher aussi, sinon la barrique ne jette que pour
    une rencontre.
  - `P.selection` n'est **pas une zone** : c'est une marque posée sur des cartes
    qui restent en main.
  - La carte **Feu** est la seule exception, et par construction : le brûlot la
    pousse sur la pioche sans la mettre au deck, elle n'appartient pas au paquet
    du joueur, et elle sort en étant jouée. Toute autre exception est un bug.
  - Les suites `cartes — les zones` et `simple — les zones` tiennent tout cela.
    Si tu ajoutes une zone ou un déplacement, étends-les dans le même mouvement.
- **La pioche vide se rebat depuis la défausse**, et le tarissement complet est
  un cas défini, pas un `break` accidentel. Sur le plateau F c'est le cas
  NORMAL : trois cartes par volée et quatre bordées font douze cartes tirées
  d'un paquet de onze.
- **Un ordre impossible rend `false`**, avec son pourquoi (règle 5). Jamais un
  `return` muet : un refus silencieux consomme le geste du joueur.
- **Sa carte touche la MAIN, pas la coque** — nous n'en avons pas. Aucune
  intention ne vise une coque que nous n'avons pas ; un test le tient.
- **Les deux plateaux restent séparés** (§1 bis). Pas de drapeau dans
  `cartes.js` pour simuler `simple.js`.

## Ce qu'il faut écrire, à chaque fois

1. La donnée, ou le verbe.
2. **Le test qui mesure la décision**, pas seulement la clé : ce que la règle est
   censée changer dans le jeu, chiffré. Voir `Skill(equilibrage)`.
3. Le détecteur de clé erronée si tu as ajouté une référence croisée (un homme
   qui nomme un verbe, une prise qui nomme une classe de coque).
4. La section de `CLAUDE.md` qui décrit la règle — **et la raison**, pas seulement
   la règle. Ce document explique pourquoi chaque chose est là ; une entrée sans
   son coût sera défaite dans six semaines.
