---
name: audit-ecran
description: Passer les instruments sur les écrans — amputation, cibles tactiles, débordement, contraste mesuré sur les pixels rendus. À lancer après toute modification de DOM ou de CSS, et avant toute livraison. Monte le serveur, chromium et playwright-core, puis lit les rapports.
---

# Passer les instruments

**Une contrainte sans instrument est un vœu** (règle 6). « Mobile d'abord »,
« 44 px » et « contraste AA » étaient tous écrits dans ce dépôt, et tous violés.

## Le montage

```bash
python3 -m http.server 8000 &
npm i playwright-core          # dev uniquement — le jeu reste sans dépendance
CHROMIUM_PATH=$(which chromium) node tools/mobile-audit.mjs
CHROMIUM_PATH=$(which chromium) node tools/contrast-audit.mjs
```

`package.json` et `package-lock.json` sont dans `.gitignore` : ne les commite
pas, le jeu ne prend aucune dépendance.

## Ce que chacun attrape

**`mobile-audit`** ouvre chaque écran sur trois téléphones (375, 390, 412 px) et
**échoue**. Il cherche :

1. **L'AMPUTATION** — un plateau plus large que la fenêtre, coupé en silence par
   `#app { overflow-x: hidden }`. Pas d'ascenseur, pas d'erreur, la moitié du jeu
   absente. Mesuré à 51 % d'un ancien plateau et 47 % des cartes de recrutement.
2. **Les cibles sous 44 × 44 px.**
3. **Le débordement horizontal.**

**`contrast-audit`** échantillonne la **capture d'écran**, pas les styles
calculés. C'est essentiel ici : les fonds sont peints par un canvas, si bien
qu'un audit qui remonte le DOM déclare « 0 échec » sur un écran illisible.

## Leurs angles morts, à couvrir à la main

- `mobile-audit` ne lit que les `:hover` **CSS** : un aperçu construit dans un
  `mouseenter` lui échappe entièrement. `grep -rn "mouseenter\|mouseover" src
  docs/mockups`.
- Sa liste d'écrans, en tête du fichier, contient encore les trois maquettes
  ABANDONNÉES (B2, C, D) et pas nécessairement l'écran que tu viens de toucher.
  **Vérifie que ton écran y est** — un audit qui ne visite pas la page ne dit
  rien sur elle, et il passe au vert quand même.
- Les modales ne sont pas des écrans : aucune règle `.screen.ecran-cartes .carte`
  ne s'y applique (règle 2). Ouvre-les explicitement dans le scénario d'audit.

## Si ça échoue

Ne baisse pas le seuil. Les trois défauts qu'il mesure sont invisibles à l'œil
sur un écran d'ordinateur et fatals sur un téléphone : c'est toute sa raison
d'être.
