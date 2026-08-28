import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 375, height: 667 }, hasTouch: true });
p.on('pageerror', (e) => console.log('ERR', e.message));
const URL='file:///tmp/claude-0/-home-user-frere-de-la-cote/35633445-2434-51ee-a9c8-e4fcde3c2a3f/scratchpad/e.html?sansTuto&sansOuverture';
async function scen(nom, clics, tire, dx, dy, attente=250) {
  await p.goto(URL); await p.waitForSelector('.carte');
  const j = p.locator('.carte:not(.muet)');
  for (const i of clics) { await j.nth(i).click(); await p.waitForTimeout(120); }
  const box = await j.nth(tire).boundingBox();
  const uid = await j.nth(tire).getAttribute('data-uid');
  const x = box.x+box.width/2, y = box.y+box.height/2;
  await p.mouse.move(x,y); await p.mouse.down();
  for (let i=1;i<=10;i++) await p.mouse.move(x + dx*i/10, y + dy*i/10);
  const mid = await p.evaluate(() => {
    const pris=[...document.querySelectorAll('.carte.prise-en-main')].map(n=>({u:n.dataset.uid,z:+(n.style.zIndex||0)}));
    const t=pris.reduce((a,c)=>c.z>a.z?c:a,pris[0]||{u:null,z:-1});
    return {n:pris.length,tete:t.u,geste:document.querySelector('.tb-geste')?.innerHTML};
  });
  await p.mouse.up(); await p.waitForTimeout(attente);
  const ap = await p.evaluate(()=>({pris:document.querySelectorAll('.carte.prise-en-main').length,
    styles:[...document.querySelectorAll('.carte')].filter(n=>n.style.transform).length,
    cpt:document.body.innerText.match(/[⚔↻]\s*\d+/g)}));
  console.log(nom.padEnd(30),'| volée',mid.n, mid.tete===uid?'tête ✓':'tête ✗('+mid.tete+')','|',JSON.stringify(mid.geste).slice(0,58),'| après',JSON.stringify(ap));
}
await scen('rien → pousse ↑',        [],      0, 0, -300, 3000);
await scen('2 → pousse la 3e ↑',     [0,1],   2, 0, -300, 3000);
await scen('2 → tire la 1re ↑',      [0,1],   0, 0, -300, 3000);
await scen('3 pleine → pousse 4e ↑', [0,1,2], 3, 0, -300, 3000);
await scen('3 pleine → pousse 4e →', [0,1,2], 3, 70,   0);
await scen('2 → pousse la 3e ↓',     [0,1],   2, 0,  120, 900);
await scen('2 → pousse 3e latéral',  [0,1],   2, 70,   0);
await scen('monte puis redescend',   [0,1],   2, 0,    0);
await b.close();
