---
name: regles-ecran
description: La relecture d'un changement de DOM, de CSS ou de geste dans les maquettes — les treize règles, les conventions de feuilles de style, les pannes silencieuses. À passer avant de committer toute modification d'interface, et à utiliser en revue.
---

# Relire un changement d'écran

Les treize règles de `CLAUDE.md` §4 ont chacune coûté un bug, et **six décrivent
des pannes silencieuses** : rien dans la console, rien à l'écran, le défaut passe
la relecture. Cette liste est la relecture qui les attrape.

## Les feuilles de style

- [ ] Un écran de la refonte s'écrit **`.screen.mon-ecran`**, jamais
      `.mon-ecran` (règle 2). `deck.css` est `@importée` en tête de `style.css` :
      à spécificité égale, le `.screen { animation: fade }` qui vient plus bas
      gagne. Des `animation: none` écrites sans le `.screen` n'ont jamais pris
      effet — pendant des mois, dans une règle d'apparence correcte.
- [ ] **Un composant partagé n'a qu'une définition** (règle 3). Le dépôt en
      compte déjà neuf en double entre `deck.css`, `components.css` et
      `style.css` : `.modal`, `.screen`, `.toast`, `.tooltip`, `.ship-card`,
      `.ship-name`, `.btn-level-1`, `.fx-float`, `.reward-list`. N'en ajoute pas
      un dixième ; si tu touches l'un des neuf, profites-en pour le fondre.
- [ ] Le bon fichier : `deck.css` §17 l'écran de cartes, §17.2 la carte, §17.3 le
      tutoriel, §17.4 la volée nue ; `components.css` le partagé ; `style.css` ce
      qui appartient à un seul écran. **Jamais un `<style>` dans une maquette.**
- [ ] Aucune largeur fixe en pixels. `#app { overflow-x: hidden }` ampute en
      silence.
- [ ] Une classe réutilisée pour deux choses différentes : `.jauge.coque` a
      hérité de la marge de 22 px de `.coque`, la boîte d'un navire — une barre
      de 4 px haute de 26, sans une erreur levée. D'où `.jauge.bordage`.

## Les gestes

- [ ] Pas de `setPointerCapture` avant le franchissement du seuil de 8 px
      (règle 8) : au `pointerdown`, la capture détourne aussi le `click` qui suit
      vers la zone capturante. Observé : une carte sélectionnée, et plus aucune
      touche n'en sélectionnait une seconde — sans rien pour le signaler.
- [ ] Seuil de 44 px pour un ordre ; le glissement descendant **résiste**.
- [ ] **Le clavier double le geste.**
- [ ] Pendant un glissement, on rafraîchit **en place** : un `rendre()` complet
      jetterait les cartes qu'on tient et le râtelier qui a capturé le pointeur.

## Les mesures et les animations

- [ ] **Jamais une valeur stable tirée d'une entrée qui bouge** (règle 9). Une
      forme vient d'une graine ; une mesure se prend une fois. Le canvas
      dimensionné sur son parent rétrécissait à chaque repeinte ; les
      `getBoundingClientRect()` relus à chaque `pointermove` faisaient trembler
      les cartes ; la forme des nuages tirée de leur abscisse faisait clignoter
      le ciel.
- [ ] Un écart mesuré entre deux éléments se prend en
      `offsetLeft`/`offsetTop` **en remontant la chaîne des `offsetParent`** :
      lire crûment deux repères différents donnait 7 px de faux — assez peu pour
      passer inaperçu, assez pour que la carte ne sorte pas du paquet.
- [ ] Ce qui vole est posé **dans la bande de mer**, jamais sur `document.body`
      en `position: fixed` (règle 11) : un boulet à `translate(96px, 341px)` était
      rapporté à y = 1008, un écran plus bas, donc invisible, à chaque tir,
      depuis le premier jour.
- [ ] Une masse translucide se peint **en une fois** (règle 12) : six ellipses
      empilées se lisent comme six bulles, jamais comme un nuage.
- [ ] Une marque d'animation est un **événement**, pas un état : oubliée après le
      rendu, retirée du DOM à la fin — sinon la distribution repart à chaque
      carte touchée.
- [ ] Une échéance d'affichage est portée par **l'état**, pas par un minuteur :
      `rendre()` refait tout le DOM, et un minuteur relancé à chaque rendu garde
      la réplique à l'écran pendant toute la composition d'une volée.
- [ ] `prefers-reduced-motion` saute la séquence et pose le total.

## Le rendu des navires

- [ ] `drawGrid(cv, g.grid, { color: g.palette })` — **jamais une couleur unique**
      sur une grille générée (règle 7) : chaque caractère inconnu retombe dessus
      et le navire sort en aplat monochrome, sans voiles ni pavillon, sans
      qu'aucune erreur ne soit levée.

## Avant de committer

- [ ] `node test/run.js` vert.
- [ ] `Skill(audit-ecran)`.
- [ ] Le fichier autonome se construit **et s'ouvre** (règle 13).
