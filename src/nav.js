// Minimal screen router. Screens register a render function; go() switches.
const screens = {};
let currentName = null;

export function register(name, renderFn) {
  screens[name] = renderFn;
}

export function go(name, opts = {}) {
  if (!screens[name]) {
    console.error(`No screen: ${name}`);
    return;
  }
  currentName = name;
  screens[name](opts);
}

export function currentScreen() {
  return currentName;
}
