import { chromium } from 'playwright'

const VW = 360
const BASE = 'http://localhost:3000'

// Pass paths as CLI args, else use the full public-template sweep.
const PATHS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      '/dentists',
      '/dentists?view=grid',
      '/',
      '/search?q=teeth',
      '__PROFILE__',           // resolved to first dentist profile link found on /dentists
      '/treatment/root-canal',
      '/area/bandra',
    ]

const browser = await chromium.launch()

async function measure(page, path) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  return await page.evaluate((vw) => {
    const offenders = []
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (r.right > vw + 0.5) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute('class') || '').slice(0, 80),
          id: el.id || '',
          right: Math.round(r.right * 10) / 10,
          left: Math.round(r.left * 10) / 10,
          width: Math.round(r.width * 10) / 10,
          txt: (el.textContent || '').trim().slice(0, 40),
        })
      }
    }
    offenders.sort((a, b) => b.right - a.right)
    return {
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      totalOffenders: offenders.length,
      top: offenders.slice(0, 8),
    }
  }, VW)
}

// Resolve a real profile path from the listing page.
let profilePath = null
{
  const page = await browser.newPage({ viewport: { width: VW, height: 800 } })
  await page.goto(BASE + '/dentists', { waitUntil: 'networkidle' })
  profilePath = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/dentist/"]')
    return a ? new URL(a.href).pathname : null
  })
  await page.close()
}

for (const rawPath of PATHS) {
  const path = rawPath === '__PROFILE__' ? (profilePath || '/dentists') : rawPath
  const page = await browser.newPage({ viewport: { width: VW, height: 800 } })
  let res
  try {
    res = await measure(page, path)
  } catch (e) {
    console.log(`\n### ${path}\n  ERROR: ${e.message}`)
    await page.close()
    continue
  }
  console.log(`\n### ${path}`)
  console.log(`  body.scrollWidth=${res.bodyScrollWidth}  doc.scrollWidth=${res.docScrollWidth}  innerWidth=${res.innerWidth}  offenders(right>${VW})=${res.totalOffenders}`)
  for (const o of res.top) {
    console.log(`    right=${o.right} left=${o.left} w=${o.width}  <${o.tag}${o.id ? '#' + o.id : ''} class="${o.cls}"> "${o.txt}"`)
  }
  await page.close()
}

await browser.close()
