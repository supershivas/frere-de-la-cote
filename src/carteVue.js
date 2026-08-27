// LE DEDANS D'UNE CARTE — écrit UNE fois, pour tout le monde.
//
// La main du jeu, le listeau de la réserve, le contenu d'un paquet en modale et
// le banc d'essai du geste montrent exactement le même objet, à l'échelle près.
// Deux gabarits qui divergent, ce sont deux cartes différentes pour la même
// munition — c'est la règle 3 du dépôt : un composant partagé n'a QU'UNE
// définition. Ce code vivait dans `docs/refonte/mockups/e-cartes.html` tant
// qu'un seul écran s'en servait.
//
// AUCUN IMPORT, ET SURTOUT PAS `src/ui.js`. Son `el` aurait été commode, mais
// `ui.js` traîne derrière lui i18n, data, state, tooltip et sprites — toute la
// chaîne de l'ancien jeu, dont la moitié est dans la colonne « écarté ». Et
// son `el` se serait heurté au `el` local des maquettes : dans le fichier
// autonome produit par `tools/bundle-mockup.mjs`, tous les modules partagent
// une seule portée, et un nom déclaré deux fois y donne une page blanche
// (règle 13). Trois `document.createElement` coûtent moins que ça.
//
// Présentation pure : aucune règle, aucun aléatoire, aucun état.

// IMPORTS NOMMÉS, ET NON `import * as C`. `tools/bundle-mockup.mjs` met tous
// les modules à plat dans une seule portée : il retire les lignes d'import, et
// il ne sait défaire un préfixe de namespace que dans le corps de la maquette.
// Un `C.estFeu(…)` laissé dans un MODULE survit à la mise à plat et le fichier
// autonome s'ouvre sur « C is not defined » — page blanche, une ligne en
// console. Le script échoue maintenant là-dessus plutôt que de le livrer.
import { estFeu, poudreDe } from './cartes.js';

// LA MUNITION EST UN SYMBOLE, dessiné. Cinq formes qu'on distingue à distance
// de bras sans lire un mot — c'est ce qui permet de RECONNAÎTRE une figure, et
// une figure qu'il faut lire pour la voir n'est pas une figure.
// Dessiné en SVG et non en emoji : un emoji change de forme et de couleur d'un
// téléphone à l'autre, et arrive en couleurs qui ne sont pas les nôtres.
export const GLYPHES = {
  // Le boulet ramé : deux boulets liés par une barre.
  boulet_rame: '<circle cx="5.4" cy="12" r="4"/><circle cx="18.6" cy="12" r="4"/><rect x="8.4" y="10.6" width="7.2" height="2.8" rx="1"/>',
  // Le boulet rouge : un boulet et la chaleur qui en sort.
  boulet_rouge: '<circle cx="12" cy="12.6" r="5.6"/>'
    + '<path d="M12 1.6 L12 5 M5.6 4.4 L7.6 7 M18.4 4.4 L16.4 7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" fill="none"/>',
  // La mitraille : une poignée de ferraille qui s'ouvre en gerbe.
  mitraille: '<circle cx="12" cy="4.6" r="2.3"/><circle cx="6" cy="11.4" r="2.3"/><circle cx="18" cy="11.4" r="2.3"/>'
    + '<circle cx="9" cy="19" r="2.3"/><circle cx="16" cy="18.4" r="2.3"/>',
  // La chaîne : deux maillons qui s'accrochent.
  chaine: '<rect x="2.4" y="8.2" width="10.4" height="7.6" rx="3.8" fill="none" stroke="currentColor" stroke-width="2.6"/>'
    + '<rect x="11.2" y="8.2" width="10.4" height="7.6" rx="3.8" fill="none" stroke="currentColor" stroke-width="2.6"/>',
  // La barrique : un fût, deux cercles de fer.
  barrique: '<path d="M7.4 3.4 Q4.4 12 7.4 20.6 L16.6 20.6 Q19.6 12 16.6 3.4 Z"/>'
    + '<path d="M5.4 8.6 L18.6 8.6 M5.4 15.4 L18.6 15.4" stroke="rgba(0,0,0,.34)" stroke-width="1.6" fill="none"/>',
};

export function munitionVue(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'currentColor');
  svg.innerHTML = GLYPHES[id] || '<circle cx="12" cy="12" r="6"/>';
  return svg;
}

const span = (cls, texte) => {
  const n = document.createElement('span');
  n.className = cls;
  if (texte !== undefined) n.textContent = texte;
  return n;
};

// LE BORD EST L'ENSEIGNE, comme la couleur d'une carte à jouer, et la MUNITION
// est le bandeau : son nom se répète dans le paquet, et c'est cette répétition
// qui rend les figures reconnaissables d'un coup d'œil.
//
// `P` n'est là que pour `poudreDe` : l'état-major change la poudre d'une
// munition (Etcheverry double les boulets rouges), et une carte qui afficherait
// le chiffre de base mentirait sur ce que la volée vaut. Sans partie, on montre
// la poudre nue.
export function contenuCarte(c, P = null) {
  const estUnFeu = estFeu(c);
  const bandeau = span('c-bandeau');
  if (!estUnFeu) bandeau.appendChild(munitionVue(c.id));
  bandeau.appendChild(span('c-nom', estUnFeu ? 'Feu' : c.nom));
  return [
    c.mouillee ? span('c-etat', 'mouillée') : null,
    estUnFeu ? span('c-fumee') : null,
    bandeau,
    // LA POUDRE occupe le centre du champ libre. Toutes les munitions du même
    // nom portent le même chiffre : c'est ce qui permet aux figures d'exister.
    span('c-val', estUnFeu ? '—' : String(poudreDe(c, P))),
  ].filter(Boolean);
}
