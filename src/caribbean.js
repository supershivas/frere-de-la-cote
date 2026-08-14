// The Caribbean, as a real place — not a procedural ladder of abstract nodes.
//
// Replaces the Slay-the-Spire grid of the old `map.js`. Every stop is a place
// these men actually sailed to, positioned by its real latitude and longitude,
// and the run ALWAYS starts from the same corner: l'Île de la Tortue, the
// refuge the boucaniers fled to when the Spanish drove them off Hispaniola
// (§8.1). Starting from the same place every run is what makes the map
// learnable — you come to know these waters.

// Bounding box of the theatre, in real degrees.
const WEST = -98, EAST = -58, SOUTH = 8, NORTH = 26;

// Longitude/latitude to fractions of the chart, west→east and north→south.
function project(lon, lat) {
  return {
    x: (lon - WEST) / (EAST - WEST),
    y: (NORTH - lat) / (NORTH - SOUTH),
  };
}

// act: which act the place belongs to. The theatre widens as the run goes on —
// act 1 hugs Hispaniola, act 2 opens onto Jamaica and Cuba, act 3 reaches the
// Spanish Main, where the treasure fleets actually were.
const PLACES = [
  // --- Act 1: around the refuge -------------------------------------------
  { id: 'tortue', name: 'Île de la Tortue', lon: -72.80, lat: 20.05, label: 'n', act: 1, type: 'port', start: true,
    note: 'Le repaire. Commission du gouverneur, radoub, recrutement.' },
  { id: 'port_margot', name: 'Port-Margot', lon: -72.55, lat: 19.75, label: 'e', act: 1, type: 'chasse',
    note: 'Caboteurs espagnols le long de la côte nord.' },
  { id: 'petit_goave', name: 'Petit-Goâve', lon: -72.87, lat: 18.43, label: 's', act: 1, type: 'port',
    note: 'L’autre port français. On y vend sans trop de questions.' },
  { id: 'gonave', name: 'Île de la Gonâve', lon: -73.05, lat: 18.85, label: 'w', act: 1, type: 'epave',
    note: 'Hauts-fonds. Une carcasse s’y est éventrée le mois dernier.' },
  { id: 'cap_tiburon', name: 'Cap Tiburon', lon: -74.45, lat: 18.35, label: 'w', act: 1, type: 'evenement',
    note: 'Le vent tombe sous la côte. On y croise des chasseurs.' },
  { id: 'santo_domingo', name: 'Santo Domingo', lon: -69.90, lat: 18.47, label: 'e', act: 1, type: 'chasse',
    note: 'La plus vieille ville espagnole des Indes. Bien gardée.' },

  // --- Act 2: the wider sea ------------------------------------------------
  { id: 'port_royal', name: 'Port Royal', lon: -76.84, lat: 17.93, label: 's', act: 2, type: 'port',
    note: 'La Jamaïque anglaise. Commissions faciles, prix corrects.' },
  { id: 'santiago', name: 'Santiago de Cuba', lon: -75.82, lat: 20.02, label: 'n', act: 2, type: 'chasse',
    note: 'Convois de cabotage entre Cuba et la Terre-Ferme.' },
  { id: 'caimans', name: 'Îles Caïmans', lon: -81.25, lat: 19.30, label: 'n', act: 2, type: 'epave',
    note: 'Tortues et naufrages. Personne n’y vit.' },
  { id: 'curacao', name: 'Curaçao', lon: -68.95, lat: 12.17, label: 'e', act: 2, type: 'port',
    note: 'Les Hollandais achètent tout, sans regarder le pavillon.' },
  { id: 'maracaibo', name: 'Maracaïbo', lon: -71.60, lat: 10.65, label: 's', act: 2, type: 'chasse',
    note: 'Une lagune, une passe étroite, une ville riche au fond.' },
  { id: 'saint_christophe', name: 'Saint-Christophe', lon: -62.72, lat: 17.30, label: 'e', act: 2, type: 'evenement',
    note: 'Français et Anglais s’y partagent la même île, mal.' },

  // --- Act 3: the Spanish Main --------------------------------------------
  { id: 'la_havane', name: 'La Havane', lon: -82.38, lat: 23.13, label: 'n', act: 3, type: 'chasse',
    note: 'Là où la flotte des Indes se rassemble avant de passer.' },
  { id: 'campeche', name: 'Campêche', lon: -90.53, lat: 19.85, label: 'w', act: 3, type: 'chasse',
    note: 'Bois de teinture, entrepôts, garnison molle.' },
  { id: 'vera_cruz', name: 'Vera Cruz', lon: -96.13, lat: 19.19, label: 'w', act: 3, type: 'evenement',
    note: 'Le débouché de l’argent du Mexique. On n’y entre pas impunément.' },
  { id: 'porto_bello', name: 'Porto Bello', lon: -79.65, lat: 9.55, label: 's', act: 3, type: 'port',
    note: 'La foire où l’argent du Pérou attend les galions.' },
  { id: 'carthagene', name: 'Carthagène des Indes', lon: -75.51, lat: 10.42, label: 's', act: 3, type: 'boss',
    note: 'La place la mieux fortifiée des Indes. L’Almirante y mouille.' },
];

// Coastlines, traced coarsely in real degrees. Not a survey — enough that the
// player reads a sea with land around it rather than dots on a blue field, and
// recognises where the Spanish Main actually is.
const COASTS = {
  cuba: [[-84.9,21.9],[-83.0,22.4],[-81.2,23.1],[-79.3,22.6],[-77.5,21.6],[-75.7,20.9],[-74.2,20.3],
         [-74.9,19.9],[-76.5,19.9],[-77.7,19.9],[-79.5,20.6],[-81.5,21.4],[-83.5,21.6],[-84.9,21.9]],
  hispaniola: [[-74.4,18.4],[-73.0,18.2],[-71.7,17.9],[-70.0,18.2],[-68.4,18.4],[-68.3,19.0],[-69.3,19.4],
               [-70.8,19.7],[-72.3,19.9],[-73.4,19.9],[-74.4,20.0],[-73.2,19.4],[-72.6,18.6],[-74.4,18.4]],
  jamaique: [[-78.4,18.5],[-77.2,18.5],[-76.2,18.2],[-76.4,17.8],[-77.5,17.7],[-78.4,18.2],[-78.4,18.5]],
  porto_rico: [[-67.3,18.5],[-65.6,18.4],[-65.6,17.9],[-67.2,18.0],[-67.3,18.5]],
  yucatan: [[-97.5,25.9],[-94.5,18.2],[-92.0,18.6],[-90.5,19.9],[-90.3,21.2],[-88.0,21.6],[-86.8,21.4],
            [-87.5,20.2],[-88.3,18.5],[-89.2,17.5],[-91.5,17.2],[-94.0,16.2],[-96.5,15.7],[-98.0,16.5]],
  amerique_centrale: [[-89.2,17.5],[-88.2,15.9],[-87.5,15.9],[-85.8,16.0],[-84.0,15.9],[-83.2,15.0],
                      [-83.4,13.0],[-82.7,11.5],[-81.5,9.6],[-79.9,9.6],[-78.5,9.3],[-77.4,8.7]],
  terre_ferme: [[-77.4,8.7],[-76.0,9.4],[-75.6,10.4],[-74.2,11.1],[-72.5,11.6],[-71.3,11.8],[-70.2,12.2],
                [-68.4,11.4],[-66.3,10.6],[-64.2,10.6],[-62.5,10.6],[-61.0,10.7],[-60.0,10.0],[-59.0,8.5]],
  floride: [[-82.9,26.0],[-82.0,25.2],[-81.1,25.1],[-80.3,25.5],[-80.1,26.0]],
  bahamas: [[-78.9,26.0],[-77.8,25.1],[-77.3,24.3],[-76.0,23.5],[-74.8,22.8],[-73.8,22.0]],
  petites_antilles: [[-62.7,17.3],[-62.2,16.7],[-61.6,16.2],[-61.4,15.4],[-61.1,14.7],[-61.0,13.9],
                     [-60.9,13.2],[-59.6,13.1],[-61.2,12.5],[-61.9,12.0]],
};

// The coastlines, already projected into chart fractions, ready to draw.
export function coastlines() {
  return Object.entries(COASTS).map(([id, pts]) => ({
    id,
    closed: pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1],
    points: pts.map(([lon, lat]) => project(lon, lat)),
  }));
}

export const START_ID = 'tortue';

export function places(act = null) {
  const list = act ? PLACES.filter((p) => p.act === act) : PLACES;
  return list.map((p) => ({ ...p, ...project(p.lon, p.lat) }));
}

export function placeById(id) {
  const p = PLACES.find((x) => x.id === id);
  return p ? { ...p, ...project(p.lon, p.lat) } : null;
}

// Great-circle-ish distance in degrees, used to decide what is "a leg away".
// Not navigation, just a plausible cost: farther places take longer to reach.
export function legDistance(a, b) {
  const dx = (a.lon - b.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const dy = a.lat - b.lat;
  return Math.sqrt(dx * dx + dy * dy);
}

// Where you can sail from here: places in this act or the next, within reach.
// The chart is a real sea, so reachability is geography, not a row index.
export function reachableFrom(id, act) {
  const from = placeById(id);
  if (!from) return [];
  return places()
    .filter((p) => p.id !== id && (p.act === act || p.act === act + 1))
    .map((p) => ({ ...p, leg: legDistance(from, p) }))
    .filter((p) => p.leg <= 14)
    .sort((a, b) => a.leg - b.leg)
    .slice(0, 4);
}

// §10.3: every node asks a question, none is a vending machine. The cost is
// stated up front so the choice is informed.
export function nodeCost(place, run) {
  switch (place.type) {
    case 'chasse':
      return { label: 'Escorte probable', danger: place.act, gold: 0 };
    case 'port':
      return { label: run && run.legitimacy < 50 ? 'Receleurs seulement' : 'Radoub et recrutement', danger: 0 };
    case 'epave':
      return { label: 'Gratuit, mais eaux dangereuses', danger: 1 };
    case 'evenement':
      return { label: 'Issue incertaine', danger: 1 };
    case 'boss':
      return { label: 'L’Almirante', danger: 3 };
    default:
      return { label: '', danger: 0 };
  }
}

export { PLACES };
