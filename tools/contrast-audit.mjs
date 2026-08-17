// Contrast audit by sampling REAL rendered pixels. Computing from CSS misses
// backgrounds painted by a canvas or a fixed layer behind the app — which is
// exactly how the parchment bug hid from a style-based audit.
//   python3 -m http.server 8000 &
//   npm i playwright-core            # dev-only; the game itself ships no deps
//   node tools/contrast-audit.mjs
//
// Chromium comes from CHROMIUM_PATH, or playwright's own resolution.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await b.newPage(); await p.setViewportSize({width:1400,height:900});

const AUDIT = async (dataUrl) => {
  const lum=(r,g,bb)=>{const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(bb);};
  const img=new Image(); img.src=dataUrl; await img.decode();
  const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height;
  const cx=cv.getContext('2d'); cx.drawImage(img,0,0);
  const W=img.width, D=cx.getImageData(0,0,cv.width,cv.height).data;
  const out=[];
  for (const n of document.querySelectorAll('h1,h2,h3,p,span,b,li,button,div')) {
    const t=(n.textContent||'').trim();
    if(!t || n.children.length>0) continue;
    const cs=getComputedStyle(n); if(cs.display==='none'||cs.visibility==='hidden') continue;
    const r=n.getBoundingClientRect();
    if(r.width<6||r.height<6||r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth) continue;
    // Un élément recouvert par un calque (carte d'ouverture, overlay de fin)
    // n'est pas illisible : il n'est pas là. Sans ce test, l'audit lit les
    // pixels du calque et invente un échec sur du texte que personne ne voit.
    const c=n.getBoundingClientRect();
    const top=document.elementFromPoint(c.left+c.width/2, c.top+c.height/2);
    if(top && top!==n && !n.contains(top) && !top.contains(n)) continue;
    const size=parseFloat(cs.fontSize), bold=parseInt(cs.fontWeight)>=700;
    const need=(size>=24||(size>=18.66&&bold))?3:4.5;
    // Sample the WHOLE box, every other row: a mid-height strip can fall between
    // two lines of a wrapped caption and report background-vs-background, which
    // showed up as a phantom 1.0:1 failure.
    const x0=Math.round(r.left), y0=Math.round(r.top);
    let dl=2, ll=-1;
    for(let y=Math.max(0,y0); y<Math.min(cv.height,y0+Math.round(r.height)); y+=2)
      for(let x=x0; x<Math.min(cv.width, x0+Math.round(r.width)); x++){
        const i=(y*W+x)*4, L=lum(D[i],D[i+1],D[i+2]);
        if(L<dl)dl=L; if(L>ll)ll=L;
      }
    if(ll<0) continue;
    // Almost no variance means no glyph was sampled — not a contrast failure.
    if(ll-dl < 0.02) continue;
    const ratio=(ll+0.05)/(dl+0.05);
    out.push({txt:t.slice(0,30), cls:(n.className||n.tagName).toString().slice(0,24),
      size:+size.toFixed(1), need, ratio:+ratio.toFixed(2), pass:ratio>=need});
  }
  return out;
};

async function audit(name, prep) {
  await prep();
  const buf = await p.screenshot();
  const res = await p.evaluate(AUDIT, 'data:image/png;base64,'+buf.toString('base64'));
  const fails = res.filter(r=>!r.pass).sort((a,b)=>a.ratio-b.ratio);
  console.log(`\n=== ${name} : ${res.length} textes, ${fails.length} sous le seuil ===`);
  for(const f of fails.slice(0,7)) console.log(`  ${String(f.ratio).padStart(5)}:1 (min ${f.need}) ${f.size}px "${f.txt}" [${f.cls}]`);
  if(!fails.length) console.log('  tout passe');
}

const goto=(h)=>async()=>{ await p.goto('http://localhost:8000/index.html'+h); await p.waitForTimeout(1700); };
await audit('recrutement', goto('#recrutement'));
await audit('recrutement — carte choisie', async()=>{ await p.evaluate(()=>document.querySelectorAll('.run-card')[0].click()); await p.waitForTimeout(400); });
await audit('chasse-partie', async()=>{ await p.evaluate(()=>[...document.querySelectorAll('.btn-level-1')].find(x=>/chasse/i.test(x.textContent)).click()); await p.waitForTimeout(500); });
await audit('chasse-partie — clauses cochées', async()=>{ await p.evaluate(()=>document.querySelectorAll('.charte-clause')[1].click()); await p.waitForTimeout(250);
  await p.evaluate(()=>document.querySelectorAll('.charte-clause')[4].click()); await p.waitForTimeout(350); });
await audit('carte', async()=>{ await p.evaluate(()=>[...document.querySelectorAll('.btn-level-1')].find(x=>/Signer/i.test(x.textContent)).click()); await p.waitForTimeout(1000); });
await audit('combat', goto('#bataille'));

// La maquette B2 : c'est elle qu'on regarde en ce moment, et sa carte
// d'ouverture empile des petits textes sur fond sombre — exactement la classe
// de bug qui a rendu la lettre de marque illisible.
const B2 = 'http://localhost:8000/docs/refonte/mockups/b2-combat.html';
await audit('B2 — carte d\'ouverture', async()=>{ await p.goto(B2); await p.waitForSelector('.rc-carte'); await p.waitForTimeout(900); });
await audit('B2 — combat engagé', async()=>{ await p.click('.rc-carte .btn-level-1'); await p.waitForTimeout(700); });
await audit('B2 — outils de maquette', async()=>{ await p.click('.rc-gear'); await p.waitForTimeout(500); });

// La rade (proposition C) : beaucoup de petits libellés posés directement sur
// la mer animée, sans panneau derrière — la situation la plus fragile de tout
// le jeu pour le contraste.
const C = 'http://localhost:8000/docs/refonte/mockups/c-rade.html';
await audit('C — la rade', async()=>{ await p.goto(C); await p.waitForSelector('.fl-rade'); await p.waitForTimeout(900); });
await audit('C — une escadre visée', async()=>{ await p.click('.fl-bande.ici .fl-escadre'); await p.waitForTimeout(400); });
await b.close();
