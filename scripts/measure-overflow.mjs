import { chromium } from 'playwright';

const URL = 'http://localhost:3000/treatment/root-canal';
const VW = 360;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: 800 } });
await page.goto(URL, { waitUntil: 'networkidle' });

const result = await page.evaluate((vw) => {
  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 0.5) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') || '').slice(0, 120),
        right: Math.round(r.right * 10) / 10,
        left: Math.round(r.left * 10) / 10,
        width: Math.round(r.width * 10) / 10,
      });
    }
  }
  offenders.sort((a, b) => b.right - a.right);
  return {
    top: offenders.slice(0, 6),
    totalOffenders: offenders.length,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
  };
}, VW);

console.log('=== VIEWPORT', VW, '===');
console.log('documentElement.scrollWidth:', result.scrollWidth);
console.log('window.innerWidth:', result.innerWidth);
console.log('body.scrollWidth:', result.bodyScrollWidth);
console.log('total elements right>', VW, ':', result.totalOffenders);
console.log('--- top 6 offenders (widest right edge first) ---');
for (const o of result.top) {
  console.log(`right=${o.right} left=${o.left} w=${o.width}  <${o.tag} class="${o.cls}">`);
}

await browser.close();
