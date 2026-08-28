---
name: livrer
description: Produire et publier les DEUX URLs d'un écran — celle du téléphone et celle du banc d'essai de 375 px. À utiliser dès qu'on livre une maquette à essayer, sans attendre qu'on le demande. Couvre bundle-mockup, le retrait du squelette HTML et le piège du dernier </body>.
---

# Livrer un écran : deux adresses, toujours

**Toute livraison d'un écran comporte deux adresses.** Avec une seule, on ouvre
la maquette en 1 400 px de large : tout y tient, donc tout va bien, donc **on ne
voit rien** — et c'est exactement ainsi qu'un écran amputé traverse une
relecture.

| | |
|---|---|
| **L'URL du téléphone** | la page du jeu, à ouvrir SUR un appareil, au doigt |
| **L'URL du banc** | la même page dans une VRAIE fenêtre de 375 px, sur ordinateur |

## 1. Construire

Les deux fichiers sortent du même outil, à la même commande :

```bash
node tools/bundle-mockup.mjs docs/mockups/jeu.html dist/jeu.html
# → dist/jeu.html          le jeu seul, autonome     (téléphone)
# → dist/jeu-desktop.html  le même, dans un châssis   (banc)
```

L'outil lit dans la maquette les modules qu'elle importe et les données qu'elle
charge : il n'y a **pas de seconde version du jeu à maintenir**.

## 2. Vérifier avant de publier

- **Ouvre les deux fichiers.** Un bundle qui se construit n'est pas un bundle qui
  s'ouvre : dans le fichier autonome tous les modules partagent une portée
  (règle 13), et une `const` de maquette qui masque un `let` de module donne une
  page blanche et une ligne en console. `bundle-mockup` échoue maintenant sur un
  nom déclaré deux fois — mais ne lui fais pas confiance sans regarder.
- Le banc porte le jeu dans une **iframe `srcdoc`**, jamais dans un
  `transform: scale()` : une transformée d'échelle ment sur les media queries,
  sur `innerWidth` et sur la taille réelle d'une cible en pixels CSS. Le châssis
  ne rétrécit jamais — sur une fenêtre courte, la page défile. Un banc d'essai
  qui ampute ce qu'il montre ne vaut rien.

## 3. Publier

Pour publier, retirer le squelette du document (`<!DOCTYPE>`, `<html>`, `<head>`,
`<body>`), que l'hébergeur remet lui-même.

**Le corps se prend jusqu'au DERNIER `</body>`.** Le banc porte le jeu entier
dans un attribut, donc une balise `</body>` apparaît au milieu du fichier, dans
une valeur d'attribut. S'y arrêter livre **le jeu à la place du banc, sous le nom
du banc** — et les deux adresses montrent alors la même page, ce qui annule tout
l'intérêt de l'exercice.

```bash
python3 - <<'PY'
import re, pathlib
for src in ('dist/jeu.html', 'dist/jeu-desktop.html'):
    h = pathlib.Path(src).read_text(encoding='utf-8')
    i = h.rfind('</body>')                      # LE DERNIER, jamais le premier
    j = h.find('<body'); j = h.find('>', j) + 1
    pathlib.Path(src.replace('.html', '.frag.html')).write_text(h[j:i], encoding='utf-8')
PY
```

## 4. Rendre

Les deux liens, nommés, dans la réponse — « téléphone » et « banc (375 px) ».
Jamais un seul.
