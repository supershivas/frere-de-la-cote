# Brief de refonte — Frères de la Côte

**Document autonome.** Il ne suppose aucun contexte préalable. Il décrit l'état actuel du projet, la direction retenue, ce qu'il faut supprimer, ce qui a déjà été essayé et écarté, et l'ordre de chantier.

À lire en entier avant d'écrire du code. La section 2 (ce qu'on abandonne) et la section 9 (pistes déjà écartées) sont aussi importantes que les sections de conception : elles évitent de reconstruire des choses qui ont été testées et rejetées.

---

## 1. Le projet

Roguelite naval en HTML/JavaScript vanilla, ES modules, sans build tools ni dépendances externes, hébergé sur GitHub Pages (dépôt `supershivas/frere-de-la-cote`).

**Contraintes techniques à respecter :**
- Vanilla JS, ES modules, aucun bundler, aucune dépendance npm
- Polices Google Fonts : IM Fell English + Courier Prime
- Architecture CSS existante : `css/variables.css`, `css/animations.css`, `css/components.css`, `css/patterns.css`, importés dans `css/style.css` — **ne pas écraser les fichiers existants, ajouter à côté**
- Fichiers connus : `sprites.js` (pipeline `drawGrid`), `map.js` (`TYPE_WEIGHTS`, `NODE_META`), `events.json`, `state.js` (`relicMods`), `event.js` (`applyOutcome`), plus `architecture.html`, `game.html`, `assets.html`, `index.html`

**État actuel du jeu, tel qu'il est en ligne :**
- Combat tour par tour réduit à un menu d'actions plates : Tirer / Bordée / Réparer / Défendre / Capacité / Passer, puis choix d'une munition, puis choix d'une cible
- Une barre de points de vie unique par navire
- 5 munitions, 6 améliorations, 7 reliques — presque tous des modificateurs de statistiques isolés (`+15% dégâts`, `+8 armure`) qui ne se combinent jamais entre eux
- Précision / esquive résolues par jets aléatoires
- Carte procédurale à nœuds, système de réputation à trois factions, moral et fatigue
- Un éditeur de sprites de navires génératif, en vue de profil, avec schéma `spriteSpec` finalisé (classes de coque, livrées, pavillons, usure, emblèmes) — **c'est la partie la plus solide et la plus aboutie du projet**
- Contenu thématique de type fantasy pirate générique : Kraken Mécanique, malédictions, temples oubliés, visions mystiques
- Une section « Nouveautés Gameplay Proposées » dans `architecture.html` : 8 quêtes secondaires, 8 nouveaux types de nœuds, artisanat, diplomatie à trois factions, 6 aléas

**Diagnostic.** Le combat est un échange de statistiques sans espace ni interaction entre systèmes ; rien ne se combine ; et le jeu ne répond pas à la question « pourquoi jouer à celui-ci plutôt qu'à un autre ». Le titre est l'élément le plus fort du projet et il est totalement inexploité.

**Influences déclarées** (dans `architecture.html`) : FTL, Into the Breach, Darkest Dungeon. Ce qu'elles ont en commun n'est pas leur contenu mais qu'un seul système central génère toute la tension : allocation de ressources sous pression pour FTL, puzzle spatial déterministe à information parfaite pour Into the Breach, positionnement et attrition psychologique pour Darkest Dungeon.

---

## 2. Ce qu'on supprime

Ce brief ajoute des systèmes. Il faut couper en compensation, sinon le projet devient ingérable.

| À supprimer | Raison |
|---|---|
| Précision et esquive comme jets aléatoires | Le combat doit être **entièrement déterministe** (voir §4) |
| La barre de points de vie unique | Remplacée par des dégâts localisés par salle |
| Les actions « Défendre » et « Passer » | Remplacées par le placement d'équipage |
| Tout bonus en `+X%` sec (améliorations, reliques) | À réécrire pour toucher le placement, les salles ou la distance — voir §6 |
| Le Kraken Mécanique | Appartient à un autre jeu (voir §8 sur le traitement du merveilleux) |
| La section « Nouveautés Gameplay Proposées » en entier | Backlog de contenu sur une boucle qui n'est pas encore plaisante. **À archiver, pas à implémenter.** |
| Le système de réputation à trois factions | Remplacé par une jauge unique de légitimité — voir §8.6 |
| La mécanique de vent, si du code existe | Essayée et écartée, voir §9 |

---

## 3. Le hook : on ne coule pas les navires, on les prend

> **Roguelite de tactique navale où votre butin est la flotte ennemie. Démâtez, abordez, capturez.**

C'est le pivot de toute la refonte, et il résout quatre problèmes d'un coup :

| Problème | Résolu par la prise |
|---|---|
| Combat plat | Il faut **neutraliser sans détruire** → dégâts localisés obligatoires → chaque tir devient un choix |
| Munitions interchangeables | Chaque munition vise un système différent → elles cessent d'être substituables |
| Éditeur de navires décoratif | Chaque prise est un navire procédural unique → le générateur devient porteur de gameplay |
| Rien ne donne envie de relancer | La flotte capturée est la récompense visible et racontable d'une partie |

**La tension centrale, répétée à chaque tour :** couler l'ennemi est rapide et sûr mais ne rapporte presque rien ; le capturer demande de démâter précisément, d'épuiser son équipage, de se coller bord à bord (donc de s'exposer) et de sacrifier des hommes à l'abordage. Le joueur choisit en permanence entre sécurité et richesse. Aujourd'hui, tuer vite est toujours optimal — c'est ce qu'il faut casser.

---

## 4. Principes de design non négociables

1. **Zéro hasard dans la résolution du combat.** Supprimer précision et esquive. Le hasard reste dans la génération (carte, ennemis, butin) mais jamais dans la résolution. Un plan qui échoue doit être la faute du joueur.
2. **Information parfaite.** Les intentions ennemies annoncent manœuvre + cible + salle visée, un tour à l'avance. Le tour doit se résoudre comme un puzzle.
3. **Le feu ne naît jamais du hasard** — uniquement d'une munition incendiaire, annoncée à l'avance. Sa propagation est déterministe et télégraphiée.
4. **Peu d'éléments, beaucoup de combinaisons.** Ne rien ajouter tant que l'existant ne se combine pas.
5. **Tout ce qui est mécanique doit être lisible sur le navire.** L'état de jeu se lit sur le sprite et le plan de pont, pas dans des barres de statistiques.
6. **Vocabulaire clair avant l'atmosphère.** Les termes de marine (bout au vent, gréement, au plus près) sont incompréhensibles pour un non-initié. Dans l'interface fonctionnelle, écrire la conséquence en clair (« les canons de gauche ne tirent plus ») ; garder le terme d'époque en étiquette secondaire, jamais comme porteur principal de l'information.

---

## 5. Le combat en vue de profil

### 5.1 Pourquoi le profil

**Décision : combat en vue de profil, deux navires face à face, sans grille de position.** FTL n'a aucune carte de position et personne ne le lui reproche.

| Gain | Détail |
|---|---|
| **Les sprites de l'éditeur deviennent le jeu** | La coque dessinée est le cadre du plan de pont. Le pipeline d'assets existant sert enfin le combat. |
| **Salles grandes et lisibles** | Aucune rotation, noms en clair. |
| **L'axe vertical devient signifiant** | Poudrière en fond de cale à l'arrière, batteries au milieu, barre en haut. |
| **L'arc de tir disparaît comme problème** | En profil on ne voit qu'un bord . |
| **Viable sur mobile** | Deux panneaux côte à côte ou empilés, salles cliquables au doigt. |

Une maquette HTML de cette vue accompagne ce brief (`profil.html`) : plans de pont de deux classes de coque, passages entre salles, déplacement animé d'un homme de salle en salle, infobulles. Elle est jetable — c'est une exploration visuelle, pas du code de production. Attention, cette maquette est uniquement informative. On utilise l'éditeur de bateau existant. On voit l'intérieur des bateaux lors des combats et lors d'événements de gestion. On voit donc la ligne de flottaison (légère animation) mais les bateaux apparaissent  bien plus grand qu'actuellement (on doit pouvoir voir toutes les salles). 

### 5.2 Distance, à la place du positionnement

Quatre bandes : **au loin / portée de canon / portée de mousquet / bord à bord.** Approcher ou rompre coûte une action et dépend de la vitesse du navire. On conserve la décision « je m'approche pour aborder mais je m'expose » sans avoir besoin d'une grille.

### 5.3 Plans de pont : une logique par classe de coque

Règle commune à toutes les tailles :
- Axe horizontal : poupe à gauche → proue à droite
- Axe vertical : pont supérieur en haut → cale en bas
- **La poudrière est toujours en fond de cale, à l'arrière** : le point le plus profond, le plus long à atteindre, le plus catastrophique en cas de feu
- Les batteries sont des salles longues et horizontales sur leur pont
- **Toutes les salles ne communiquent pas.** Les passages sont explicites et les changements de pont se font par échelle.
- Les salles n'ont pas la même taille

Le nombre de ponts découle de la classe de coque déjà définie dans l'éditeur :

| Classe | Type | Salles | Composition |
|---|---|---|---|
| 5–6 | Barque, sloop | 4 | barre, mât, batterie, cale-poudrière fusionnées |
| 3–4 | Brigantin, frégate | 6 | barre, mât, proue, batterie, cale, poudrière |
| 1–2 | Galion, vaisseau | 9 | + gaillard, seconde batterie, infirmerie |

**Conséquence de jeu, gratuite et forte :** sur un sloop tout est à trois pas ; sur un galion, envoyer le chirurgien de l'infirmerie à la sainte-barbe en feu prend trois tours de marche. **La taille du navire devient une contrainte de logistique interne**, pas seulement un total de points de vie. Capturer un galion, c'est hériter d'un navire puissant mais lent à administrer.

### 5.4 Salles et conséquences

Chaque salle a une structure (2 à 4 points) et un système. À zéro, la conséquence est immédiate et annoncée en clair :

| Salle | À zéro |
|---|---|
| Proue | Voie d'eau : la cale s'emplit |
| Batterie | Les canons de ce bord ne tirent plus |
| Grand mât | Plus de manœuvre, le navire ne peut plus changer de distance |
| Poudrière | Plus de poudre, plus un seul tir |
| Cale et pompes | L'eau monte sans frein |
| Infirmerie | Les blessés ne guérissent plus |
| Barre | Le cap est bloqué |

### 5.5 Le feu

Uniquement causé par une munition incendiaire. Le feu grandit d'un cran par tour dans une salle vide et abîme la structure. Des hommes envoyés dans la salle le combattent — **mais ils cessent alors de travailler**, c'est le cœur de la tension FTL : éteindre l'incendie de la batterie, c'est renoncer à tirer ce tour-là. À intensité maximale, il se propage vers une salle adjacente **annoncée à l'avance**, en priorité vers la poudrière. Feu maximal dans la poudrière = navire détruit, donc prise perdue.

### 5.6 Munitions

Les cinq munitions existantes deviennent non-interchangeables sans ajouter une ligne de contenu :

| Munition | Rôle |
|---|---|
| Boulet | Structure de la salle visée. La voie de la destruction. |
| Chaîne | Mât et voiles. **La munition de la prise.** |
| Mitraille | Blesse les hommes présents dans la salle visée. Prépare l'abordage. |
| Explosif | Dégâts dispersés, imprécis, risque de couler la prise |
| Carcasse incendiaire | Met le feu. Puissant mais **détruit souvent la prise** — arme de désespoir |

Un joueur qui veut capturer tire chaîne puis mitraille en évitant la coque. Un joueur pressé tire boulet. La même arme sert deux stratégies opposées.

### 5.7 Structure du tour — à afficher en permanence

Cette règle n'avait jamais été énoncée clairement, et c'est la première cause d'incompréhension du prototype :

> **Chaque tour : déplacer les hommes autant qu'on veut (gratuit), puis UNE manœuvre et UNE bordée, dans l'ordre souhaité. Les deux sont facultatives.**


### 5.8 L'abordage

A préciser plus tard

---

## 6. L'équipage

### 6.1 Le joueur n'est pas un personnage

**Le joueur commande, il n'est pas à bord** (comme dans FTL). Pas de ligne « vous » dans le rôle d'équipage, pas de capitaine-joueur blessable, **pas de fiche personnage du joueur**. Ce qui se construit d'une partie à l'autre, c'est la réputation et les officiers, pas un avatar.

### 6.2 Cinq spécialités

Cinq spécialités : **canonnage, manœuvre, réparation, soins, mêlée.** Chaque salle fait appel à une seule d'entre elles. Un homme dans la mauvaise salle travaille à faible rendement — le placement devient intéressant sans règle d'interdiction.

Équipage de départ type :

| Homme | Rôle | Fort en |
|---|---|---|
| Etcheverry | canonnier | canonnage 8 |
| Coudray | maître d'équipage | manœuvre 8 |
| Toussaint | charpentier | réparation 8, mêlée 7 |
| Ozanne | chirurgien | soins 7 |
| Gohier | matelot | tout à 5, polyvalent, promouvable |

**Les spécialités doivent être visibles en permanence.** Un des défauts majeurs du prototype était qu'on ne savait pas ce que valait chaque homme.

### 6.3 Déplacement visible

Un homme sélectionné éclaire les salles atteignables. Cliquer une destination le fait **traverser physiquement les salles intermédiaires**, une par une, en suivant les passages. Ce n'est pas cosmétique : traverser une salle en feu doit coûter une blessure, un long trajet doit coûter des tours. C'est ce qui rend la géographie du navire mécaniquement réelle.

### 6.4 Deux couches : nommés et anonymes

Historiquement les flibustiers surchargeaient leurs navires en hommes pour l'abordage — 40 à 80 sur une barque, plus de 100 sur un gros navire. Mais personne ne s'attache à 80 personnages nommés.

| Couche | Nombre | Rôle |
|---|---|---|
| **Nommés** | 5 en poste, une quinzaine au total | Personnages : attachement, progression, récits |
| **Anonymes** | 40 à 150 selon la coque | Ressource : force d'abordage, attrition |

Distinction qui fait tout le sel : **effectif minimal de manœuvre** contre **effectif complet**. En dessous du minimum, le navire est dégradé ; au-delà, chaque homme supplémentaire est de la puissance d'abordage.

**C'est ce qui fait qu'une prise se paie d'elle-même** : capturer un galion réclamant 45 hommes quand on en a 90 au total oblige à le naviguer sous-armé ou à vider son propre navire. La récompense a un coût, sans règle artificielle.

### 6.5 Promotion

Les matelots forment un vivier. Un poste vacant crée un appel d'air : un matelot doit monter. Un matelot promu gagne des spécialités détaillées et des traits — la promotion est une vraie récompense, pas un changement d'étiquette. On peut greffer là-dessus une politique de bord légère (un officier peut s'opposer à une promotion) sans écrire une ligne de dialogue.

### 6.6 Blessures persistantes

Barème historique authentique, prélevé sur le butin avant partage : deux yeux 2000 piastres, deux jambes 1500, bras droit 600, bras gauche 500, un œil 100, un doigt 100.

| État | Effet |
|---|---|
| Indemne | normal |
| Blessé | malus temporaire, soigné à l'infirmerie |
| Mutilé | malus **permanent** + dette d'indemnité sur le butin |
| Mort | perdu définitivement |

Pour chaque mutilé, une décision : **indemniser et débarquer** (on paie, on perd un homme expérimenté) ou **garder estropié** (on économise, il est diminué). Exemple concret : un canonnier ayant perdu le bras gauche sert mal la batterie de bâbord — la mutilation doit avoir un effet mécanique précis, pas un malus générique.

### 6.7 Amatelotage

Institution historique : deux matelots liés par pacte, partageant biens, tâches et hamac, héritant l'un de l'autre.

- Les hommes vont par paires, **le joueur décide qui va avec qui**
- Paire servant ensemble : bonus mutuel
- **Séparés sur deux navires : malus de moral aux deux** — contrainte réelle quand la flotte grandit
- À la mort de l'un : l'autre subit un choc de moral durable et **hérite d'un seul objet** (le reste va au coffre commun, comme le prévoyait le contrat d'équipage — voir §8.2)

**Héritage répété — bifurcation, pas empilement de malus :**

| Perte | Effet |
|---|---|
| 1ʳᵉ | *Endeuillé*. Choc de moral. Hérite d'un objet. |
| 2ᵈ | Selon son ancienneté : **Endurci** (bonus de mêlée, immunisé aux chocs) ou **Jonas** (l'équipage le croit porteur de malheur) |
| 3ᵉ | Réservé aux Endurcis : *Le Survivant*, trait légendaire |

Dans les deux branches, même conséquence : **plus personne ne veut être son matelot** — l'Endurci refuse, le Jonas est refusé. Il devient structurellement isolé, donc privé des bonus de paire. La punition est sociale, pas statistique. Le plafond d'un seul objet hérité empêche la thésaurisation.

C'est le générateur de récits le moins coûteux du projet : zéro dialogue à écrire, et le joueur raconte quand même l'histoire de ses deux hommes.

---

## 7. Nombre de navires

**1 seul navire .** Le calcul : 3 navires × 5 hommes nommés = 15 personnages, c'est déjà l'échelle d'un roster de Darkest Dungeon. À 4, plus personne n'a de nom mémorable.

Séquençage : **1 seul navire pendant tout le développement du combat.** N'ouvrir la flotte qu'une fois la boucle de partie complète et plaisante. En mono-navire, une prise se **vend** ou **remplace** le navire actuel — abandonner son navire nommé, avec ses cicatrices accumulées, pour monter sur mieux, est une décision intéressante en soi.

---

## 8. La couche historique

C'est ce qui répond à « pourquoi ce jeu plutôt qu'un autre », et ce n'est pas de l'ambiance : les Frères de la Côte ont rédigé leur propre règlement. Des barèmes chiffrés, des parts définies, une procédure de vote. **Un game design du XVIIᵉ siècle, écrit par des gens dont la survie dépendait de son équilibrage.**

**Règle de filtrage absolue : on ne retient un élément historique que s'il est déjà une mécanique.** La chasse-partie, le barème d'indemnités, l'amatelotage, le capitaine élu, la commission passent le test. La recette du boucan, les noms de gouverneurs, la chronologie des raids ne le passent pas — ils vont dans une encyclopédie consultable au menu titre, pas dans le gameplay.

### 8.1 Qui ils étaient

Des chasseurs européens installés illégalement dans l'ouest d'Hispaniola dès les années 1620, qui fumaient la viande sur un gril nommé *boucan* — d'où *boucanier*. Chassés par les Espagnols, ils se réfugient à l'île de la Tortue et prennent la mer : le boucanier devient *flibustier*. Société multinationale (Français, Anglais, Hollandais, engagés en fuite, marrons), opérant sous commissions de course délivrées par les gouverneurs de la Tortue ou de la Jamaïque, d'une valeur juridique douteuse mais suffisante pour revendre légalement le butin.

Leur modèle d'organisation — capitaine élu, parts contractuelles, indemnités, conseil d'équipage — est devenu le patron des codes pirates de l'âge d'or qui a suivi. **Positionnement libre :** tous les jeux de pirates font l'âge d'or anglais (Barbe-Noire, Nassau, le Jolly Roger). Le monde franco-caribéen des boucaniers n'est occupé par personne, et le jeu porte déjà le nom de l'original.

Source primaire : Alexandre-Olivier Exquemelin, chirurgien parmi eux, *Histoire des aventuriers flibustiers* (1678). C'est de lui que vient presque tout ce qu'on sait des chasses-parties.

### 8.2 La chasse-partie — le modificateur de partie

Contrat écrit et **voté par l'équipage entier** avant chaque expédition. Répartition documentée : capitaine et quartier-maître 2 parts, canonnier et maître d'équipage 1,5, autres officiers 1,25, matelots 1 part. Le contrat couvrait aussi la discipline : interdiction des jeux d'argent, lumières éteintes à huit heures, armes propres, abandon sur une île déserte pour le vol de butin.

**En jeu : l'écran d'ouverture de chaque partie.** Chaque clause est un couple avantage/contrainte :

| Clause | Avantage | Contrainte |
|---|---|---|
| Grande part au capitaine | Plus d'or capitalisé entre les parties | Moral qui s'effrite |
| Grande part à l'équipage | Moral haut, recrutement facile | Peu de butin capitalisé |
| Indemnités généreuses | Les hommes se battent sans se ménager | Chaque blessé coûte cher |
| Discipline stricte | Fatigue réduite, pas de désertion | Recrues rares et chères |
| Pas de quartier | Bonus d'abordage | Réputation effondrée, aucune reddition ennemie |
| Cible imposée (Espagnols seuls) | Prime de faction | Impossible d'attaquer les autres pavillons |

**L'équipage vote.** Le joueur propose, il n'impose pas : un équipage mécontent refuse la clause. C'est la fonction du choix de personnage dans un roguelite, mais entièrement diégétique. À rendre visuellement comme un **document signé**, pas comme un menu.

### 8.3 « Pas de prise, pas de paye »

Principe fondateur : aucun butin, aucun salaire. En jeu, le moral décroît à chaque nœud traversé **sans prise**. Éviter les combats devient impossible à long terme — le jeu pousse à l'agression sans mur artificiel. Cela règle le problème du roguelite où le joueur optimal joue prudemment et s'ennuie.

### 8.4 Bâbordais et tribordais

Les équipages étaient répartis en **bâbordais et tribordais**, assurant le service alternativement. C'est la justification historique littérale du système de batteries par bord : servir la bordée bâbord signifie que les tribordais ne sont pas à leurs canons. Le vocabulaire du jeu devient celui du métier, et la mécanique cesse d'être une abstraction. Utiliser ces termes en étiquette secondaire, avec la conséquence en clair au premier plan (cf. §4.6).

### 8.5 Le capitaine élu et le conseil

La part du capitaine n'était que le double de celle d'un matelot, là où chez les corsaires l'essentiel allait à l'armateur. Le capitaine était **élu**, et son autorité hors combat partagée avec le quartier-maître et le conseil.

**Remplace la mutinerie à moral bas** (simple événement punitif) par une gouvernance permanente :
- Autorité pleine **en combat uniquement**
- Hors combat, le conseil vote : cap, cible, répartition du butin
- Le joueur peut passer outre, au prix du moral
- À moral effondré, le conseil **le dépose** : fin de partie, mais **pas une mort**. Il est débarqué. Officiers survivants et réputation persistent.

Une défaite roguelite qui n'est pas une mort, c'est rare et mémorable.

### 8.6 La légitimité — remplace les trois factions

Une seule jauge lisible, fondée sur la ligne floue entre corsaire (commission, butin revendable) et pirate (hors-la-loi) :
- Commission valide : accès aux ports, revente au prix plein, réparations
- Attaquer un pavillon non couvert : gain immédiat, légitimité perdue
- Légitimité nulle : plus aucun port, revente à vil prix aux receleurs, chassé par toutes les marines

Une seule décision, répétée : *je respecte ma commission ou je prends ce navire ?* Bien plus fort que trois barres indépendantes.

### 8.7 Le calendrier 1640–1697 — la structure de méta-progression

L'histoire a une fin datée, et cette fin est une lente asphyxie administrative. Chaque partie avance le calendrier.

| Époque | Climat |
|---|---|
| 1640–1660 | Commissions faciles, Espagnols riches et mal défendus, la Tortue est libre |
| 1660–1680 | L'apogée, les grands raids |
| 1684 | Trêve de Ratisbonne : les commissions se raréfient |
| 1688–1697 | Guerre de la Ligue d'Augsbourg : sursis, on redevient utile aux États |
| 1697 | Traité de Ryswick. La Tortue doit être démantelée. **Dernière partie.** |

Le joueur ne cherche pas à « gagner » une partie mais à **construire quelque chose avant que le monde ne se ferme**. Question de campagne : que reste-t-il de vous en 1697 ? Les fins sont historiques, pas inventées : devenir planteur, passer dans la marine royale, ou refuser et basculer dans la piraterie pure — ce qui ouvre un mode post-1697 où plus aucun port n'est ami. **C'est le New Game+, fourni par l'Histoire.**

### 8.8 Deux questions de traitement

**Le merveilleux.** Garder le surnaturel mais le faire passer par la **superstition d'équipage** plutôt que par le surnaturel objectif. Les marins du XVIIᵉ croyaient réellement aux présages et aux navires maudits. Un navire que l'équipage *croit* maudit refuse de l'aborder : l'effet mécanique est réel (moral, refus d'ordre) sans que le jeu affirme l'existence du surnaturel. On garde la couleur, on gagne la crédibilité, on obtient une mécanique. Le Kraken Mécanique, en revanche, est à couper.

**L'esclavage — à ne pas contourner.** Le barème d'indemnités authentique est libellé en piastres *ou en esclaves*. Saint-Domingue devient après 1697 la colonie esclavagiste la plus brutale des Caraïbes, et la transition historique réelle est celle du flibustier devenu planteur. Le mythe des Frères de la Côte comme utopie libertaire est en partie vrai (le contrat, le vote, les indemnités) et en partie faux : ces hommes pratiquaient et profitaient de l'esclavage.

Traitement retenu : **ne pas l'effacer, ne pas en faire un système à optimiser.** L'esclavage existe dans le monde, apparaît dans les cargaisons et les textes, mais n'est jamais une ressource que le joueur gère ou monnaie. La fin « devenir planteur » est présentée pour ce qu'elle est, pas comme une récompense. Aucun sermon nécessaire : il suffit de ne pas mentir.

---

## 9. Pistes déjà essayées et écartées

**Cette section évite de reconstruire des choses testées et rejetées.** Plusieurs prototypes ont été faits et jugés.

| Piste | Verdict |
|---|---|
| **Grille de position en vue de dessus** | Écartée. Rend les sprites de profil inutilisables, force la rotation des salles donc l'illisibilité, impose des salles minuscules. Remplacée par le profil + bandes de distance (§5). |
| **Plans de pont pivotés selon le cap** | Écartée. Nécessitait de contre-pivoter tout le contenu des salles ; illisible et complexe pour rien. |
| **Mécanique de vent (allures, zone morte, élan, avantage du vent)** | **Écartée.** Testée en trois versions successives. La zone morte est un mur frustrant ; transformée en économie d'élan avec virement payant, elle restait un système entier à comprendre pour un gain de plaisir faible. **La vitesse découle des statistiques du navire et du nombre d'hommes au mât.** Si la manœuvre semble un jour trop plate, le vent pourra revenir comme simple modificateur de vitesse — jamais comme système central. |
| **Le joueur comme personnage à bord (capitaine blessable)** | Écartée. Il était à la fois l'interface et une unité, ce qui n'a pas de sens. Le joueur commande (§6.1). |
| **8 salles sur une grille en vue de dessus** | Écartée. Salles de 12 px, illisibles, symboles nécessitant une légende. Le profil permet des salles grandes. |
| **Interface reposant uniquement sur le survol** | Écartée. Ne fonctionne pas au doigt. Prévoir un panneau de détail fixe plutôt qu'une infobulle flottante si le mobile compte. |
| **Répartition de points sur écran vide au recrutement** | Écartée. Le joueur ne sait pas encore ce que vaut « réparation 8 » : choix demandé trop tôt. Voir §10. |
| **Officiers en 4 postes + capitaine-joueur** | Simplifié à 5 hommes spécialisés sans avatar (§6). |

---

## 10. Boucle de partie

### 10.1 Recrutement : archétypes, pas de points sur écran vide

**Trois équipages pré-composés lisibles**, puis 3 points de personnalisation libre. Assez pour s'approprier l'équipage, trop peu pour se saborder.

| Équipage | Composition | Style |
|---|---|---|
| Les Artilleurs | 2 canonniers, 1 charpentier, 2 matelots | tenir la distance, démâter |
| Les Écumeurs | 1 canonnier, 3 fortes mêlées, 1 maître d'équipage | foncer et aborder |
| Les Prudents | 1 chirurgien, 1 charpentier, 1 canonnier, 2 matelots | encaisser, durer, réparer |

Le recrutement libre par points se **débloque après une première partie terminée**, quand le joueur sait ce que valent les statistiques.

### 10.2 Enchaînement

```
NOUVELLE PARTIE
      │
      ├── 1. Choix de l'équipage (3 archétypes + 3 points)
      ├── 2. Choix du navire de départ (1 ou 2 options)
      ├── 3. Chasse-partie : contrat, clauses, vote de l'équipage
      │
      └── CARTE (acte 1)
            ├── nœud chasse     → combat → prise ou naufrage
            ├── nœud port       → réparer, recruter, vendre, promouvoir
            ├── nœud événement  → choix à conséquence
            ├── nœud épave      → butin gratuit mais risqué
            └── boss d'acte → acte 2 → acte 3 → fin de partie
                  │
                  └── MÉTA : officiers survivants, registre des prises,
                             port d'attache, légitimité, calendrier
```

**Le premier combat doit arriver en moins de deux minutes.** Trois écrans avant de jouer est la limite haute.

**Durée cible d'une partie : 45 à 60 minutes.** 3 actes, 8 à 10 nœuds par acte, un port et un boss par acte.

### 10.3 Chaque nœud pose une question, ne donne pas une récompense

Défaut actuel de la carte : les nœuds sont des distributeurs. Chaque nœud doit avoir un **coût visible** : un convoi riche mais bien escorté ; une épave gratuite mais dans une zone dangereuse ; un port qui répare mais coûte de la légitimité.

### 10.4 Méta-progression

**Persiste :** officiers survivants (expérience, traits, mutilations, paires), port d'attache à améliorer (chantier, taverne, fondeur, cartographe), légitimité de fin de partie, **registre des prises** — galerie de tous les navires capturés avec leur sprite procédural unique, leur nom, où et comment ils ont été pris. C'est le trophée collectionnable du jeu, produit gratuitement par l'éditeur existant, et c'est le contenu que les joueurs partagent.

**Ne persiste pas :** navire, or, munitions, dégâts, améliorations.

Déblocages **par accomplissement, pas par grind** : « capturer un navire de ligne », « terminer une partie sans couler un seul navire », « gagner sans jamais aborder ».

### 10.5 Diversité entre les parties

Cinq axes : équipage de départ, navire de départ, faction dominante hostile, clauses de chasse-partie, et prises précoces (capturer un galion au premier acte réoriente toute la partie).

---

## 11. Rôle de l'éditeur de navires

L'éditeur reste un **outil de génération d'assets en arrière-plan**, pas un système visible ou pilotable par le joueur. **Changement important par rapport à son statut actuel :** ses sprites de profil deviennent le cadre du plan de pont en combat (§5.1) et alimentent le registre des prises (§10.4). Il passe donc de décoratif à porteur de gameplay, sans devenir une interface joueur.

Le schéma `spriteSpec` existant (classes de coque, livrées, pavillons, usure, emblèmes, PRNG à graine) est conservé tel quel. La classe de coque pilote désormais aussi le plan de pont (§5.3).

---

## 12. Ordre de chantier

Chaque étape a une condition de sortie. **Ne pas passer à la suivante sans l'avoir validée** — c'est le seul garde-fou contre des semaines de travail sur une boucle qui ne mord pas.

| # | Étape | Condition de sortie |
|---|---|---|
| 0 | Corriger le bug de clés (§13), ou repartir propre — probablement plus sain | Le jeu actuel ne plante plus en fin de tour |
| 1 | Structures de données : plans de pont par classe de coque, salles, passages, spécialités | Les tests de §14 passent |
| 2 | Rendu profil : sprite de l'éditeur en cadre du plan de pont, salles cliquables | Un navire s'affiche avec son plan lisible |
| 3 | Déplacement d'équipage : trajet réel par les passages, coût en tours, traversée du feu | Un homme traverse trois salles et ça se voit |
| 4 | Combat 1 contre 1 : bandes de distance, batterie visible = engagée, dégâts localisés, feu, munitions, abordage | **Jouer 5 combats. Si on ne ressent jamais « je tente la prise ou je la coule ? », revoir le design plutôt qu'implémenter la suite.** |
| 5 | Boucle de partie (§10) : archétypes, chasse-partie, carte à coûts visibles, 3 actes | Une partie complète de 45 min sans crash |
| 6 | Méta-progression (§10.4) : officiers persistants, registre des prises, port, calendrier | On a envie de relancer |
| 7 | Interface : refonte une fois les mécaniques figées | — |
| 8 | Contenu : élargir seulement maintenant | — |

**Ne pas polir l'interface avant l'étape 7.** C'est le piège qui donne l'impression d'avancer sans changer la boucle de fond, et tout travail d'interface fait avant serait jeté.

---

## 13. Le bug à corriger dans le code actuel

```
TypeError: can't access property "hp", s.rooms[k] is undefined
```

Cause : le code interroge `s.rooms["coque"]`, `s.rooms["pompes"]` et `s.rooms["soins"]`. Ce sont des noms de **systèmes**, pas des clés de **salles** — les salles s'appellent `proue`, `cale`, `infirm`. Plantage à chaque fin de tour.

**Leçon générale :** une validation de syntaxe ne détecte pas une clé d'objet erronée. Il faut valider les **données**, pas seulement le code.

---

## 14. Tests à écrire en priorité

Ce sont les fautes qui ne se voient pas à la lecture :

1. **Cohérence des clés** : toute clé de salle référencée existe dans le plan ; aucun nom de système utilisé comme clé de salle (c'est exactement le bug de §13)
2. **Validité des plans de pont** : chaque passage relie deux salles existantes
3. **Connexité du graphe** : aucune salle inatteignable depuis les autres
4. **Chevauchement géométrique** : aucune salle n'en recouvre une autre — cette vérification a immédiatement trouvé une erreur (gaillard/batterie haute sur le galion) qui ne se voyait pas à la lecture
5. **Effectifs** : effectif minimal de manœuvre toujours inférieur à l'effectif complet, pour chaque classe de coque
6. **Déterminisme** : deux résolutions du même tour avec le même état donnent un résultat identique

---

## 15. Le test du no-brainer

À se reposer avant chaque étape :

1. **Pitch.** « Roguelite naval où on capture la flotte ennemie au lieu de la couler, chez les Frères de la Côte, avant que Versailles ne referme les Caraïbes en 1697 » — est-ce que ça donne envie en une phrase ?
2. **Capture d'écran.** Une image du combat montre-t-elle quelque chose qu'aucun autre jeu ne montre ? Un plan de pont en profil, une salle en feu, un navire démâté sur le point d'être abordé.
3. **Anecdote.** Un joueur peut-il raconter sa partie ? « J'ai pris un galion espagnol au premier acte avec six hommes, il m'a porté jusqu'à la fin. » Si les parties ne génèrent pas d'histoires, le roguelite a échoué.

---

## Annexes fournies avec ce brief

- `profil.html` — maquette de la vue de profil : plans de pont de deux classes, passages, déplacement animé, infobulles. **Exploration visuelle jetable, pas du code de production.**
- `role-equipage-mockup.html` — maquette du rôle d'équipage : officiers, matelots, amatelotage, mutilations, promotions. Sert de référence pour la présentation des informations d'équipage.
