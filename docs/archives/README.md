# Archives

Ce qui a été essayé, puis écarté. **On le garde, on ne le supprime pas, et on ne
construit rien dessus.**

La raison est écrite dans `CLAUDE.md` §1 : ce qui empêche de reconstruire un
système, ce n'est pas de l'avoir effacé — c'est de savoir ce qu'il coûtait. Un
dépôt qui supprime ses impasses les repropose tous les six mois.

La raison inverse est écrite ici : ce qui n'est plus le jeu ne doit pas rester à
côté du jeu. `CLAUDE.md` a décrit jusqu'à trois plateaux à la fois, dont deux
morts, et l'audit d'août 2026 y a relevé **trois échelles de résistances
contradictoires** dont aucune n'était celle de la donnée. Un document qui décrit
plusieurs jeux ne dit plus lequel il faut construire.

## Ce qu'il y a ici

| | |
|---|---|
| `mockups/e-cartes.html` | **La chasse-partie en cartes** — le plateau E. Cinq munitions, un état-major de cinq hommes nommés, des reliques, une carte annoncée un tour à l'avance, trois rechargements, une coque et une coulée, un tutoriel en sept étapes, la carte des Caraïbes, une boutique. Il a été monté À CÔTÉ de la volée nue, pas à sa place, pour éprouver une question : que reste-t-il quand on retire tout ? **La volée nue est la réponse**, et c'est elle qui est restée. Ses règles vivent encore dans `src/cartes.js`, ses tests dans `test/cartes.test.js` (`node test/archives.js`) |
| `mockups/b2-combat.html` | Proposition B2 — le combat un contre un, à deux jauges |
| `mockups/c-rade.html` | Proposition C — la rade, en escadres |
| `mockups/d-breche.html` | Proposition D — la rade tactique, sur une grille hexagonale |
| `mockups/profil.html`, `mockups/role-equipage-mockup.html` | Antérieures à la refonte. Elles ne suivent aucune des règles en vigueur |
| `brief.md` | Le brief d'origine. Sa **section 2** (suppressions) et sa **section 9** (pistes écartées) restent le meilleur relevé de ce qui a été rejeté, et pourquoi |
| `PLAN.md` | L'ordre de marche du chantier « grille tactique » — plateau en couloir, `data/batiments.json`, trois types ennemis. Tranché et fermé : voir `CLAUDE.md` §1 |
| `notes-2025-refonte.md` | L'état complet du chantier « trois échelles de combat » : ce qui bloquait, pourquoi, et ce que chaque proposition valait |

## Les maquettes archivées s'ouvrent encore

Elles portent une `<base href="../../../">` et `docs/archives/mockups/` est à la
même profondeur que l'ancien `docs/refonte/mockups/` : le déplacement ne les a
pas cassées. Elles chargent les modules écartés, qui sont toujours sur le
disque.

## Les tests des archives

```bash
node test/archives.js     # 182 vérifications sur les modules écartés
```

Ils ne gardent aucun code que le jeu exécute. **Si l'un casse parce qu'un module
vivant a changé sous lui, c'est le signal qu'un lien traînait encore — à couper,
pas à réparer.**
