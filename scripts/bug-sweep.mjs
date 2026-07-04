// Comprehensive Playwright bug sweep across the three DentistIn surfaces.
// Report only — fixes nothing. Prints PASS / FAIL / SKIP per test with a
// one-line reason, then a summary. Modelled on measure-overflow-all.mjs.
//
//   PATIENT SITE  -> http://localhost:3000  (dev server must be running)
//   API CHECKS    -> https://dentistinpune.in  (live)
//   MOBILE SWEEP  -> spawns scripts/measure-overflow-all.mjs
//
// Run:  node scripts/bug-sweep.mjs

import { chromium, request as pwRequest } from 'playwright'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const VW = 360
const BASE = 'http://localhost:3000'
const LIVE = 'https://dentistinpune.in'
// The email-OTP send has a real side effect (DB row + Resend email); aim it at
// the account owner so no third party is spammed.
const OTP_EMAIL = 'urbansmilepune@gmail.com'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const results = []
const record = (n, name, status, reason) => {
  results.push({ n, name, status, reason })
  const tag = { PASS: 'PASS', FAIL: 'FAIL', SKIP: 'SKIP', ERROR: 'ERROR' }[status] || status
  console.log(`[${String(n).padStart(2, ' ')}] ${tag.padEnd(5)} ${name}\n         ↳ ${reason}`)
}

// Measure worst horizontal overflow on the current page.
async function overflow(page) {
  return page.evaluate((vw) => {
    let worstRight = 0
    let offenders = 0
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (r.right > vw + 0.5) { offenders++; if (r.right > worstRight) worstRight = r.right }
    }
    return {
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      offenders,
      worstRight: Math.round(worstRight * 10) / 10,
    }
  }, VW)
}

const browser = await chromium.launch()

// Fresh 360px page per test so state never leaks.
async function newMobilePage() {
  return browser.newPage({ viewport: { width: VW, height: 800 } })
}

// ────────────────────────────────────────────────────────────────────────────
// PATIENT SITE (localhost:3000)
// ────────────────────────────────────────────────────────────────────────────

// 1. Homepage at 360px — body.scrollWidth === 360
{
  const page = await newMobilePage()
  try {
    const resp = await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    if (!resp || !resp.ok()) {
      record(1, 'Homepage @360 loads + no overflow', 'FAIL', `HTTP ${resp ? resp.status() : 'no response'}`)
    } else {
      const m = await overflow(page)
      if (m.bodyScrollWidth === 360) record(1, 'Homepage @360 loads + no overflow', 'PASS', `body.scrollWidth=${m.bodyScrollWidth}, offenders=${m.offenders}`)
      else record(1, 'Homepage @360 loads + no overflow', 'FAIL', `body.scrollWidth=${m.bodyScrollWidth} (want 360), worstRight=${m.worstRight}, offenders=${m.offenders}`)
    }
  } catch (e) {
    record(1, 'Homepage @360 loads + no overflow', 'ERROR', e.message)
  } finally { await page.close() }
}

// 2. Search "root canal" → redirects to /treatment/root-canal
{
  const page = await newMobilePage()
  try {
    await page.goto(BASE + '/search?q=' + encodeURIComponent('root canal'), { waitUntil: 'networkidle' })
    const final = new URL(page.url()).pathname
    if (final === '/treatment/root-canal') record(2, 'Search "root canal" → /treatment/root-canal', 'PASS', `landed on ${final}`)
    else record(2, 'Search "root canal" → /treatment/root-canal', 'FAIL', `landed on ${final} (want /treatment/root-canal)`)
  } catch (e) {
    record(2, 'Search "root canal" → /treatment/root-canal', 'ERROR', e.message)
  } finally { await page.close() }
}

// 3. /treatment/root-canal at 360px — no overflow, cards present
{
  const page = await newMobilePage()
  try {
    const resp = await page.goto(BASE + '/treatment/root-canal', { waitUntil: 'networkidle' })
    if (!resp || !resp.ok()) {
      record(3, '/treatment/root-canal @360 no overflow + cards', 'FAIL', `HTTP ${resp ? resp.status() : 'no response'}`)
    } else {
      const m = await overflow(page)
      const cards = await page.locator('a[href^="/dentist/"]').count()
      const noOverflow = m.bodyScrollWidth === 360
      if (noOverflow && cards > 0) record(3, '/treatment/root-canal @360 no overflow + cards', 'PASS', `body.scrollWidth=${m.bodyScrollWidth}, dentist cards=${cards}`)
      else record(3, '/treatment/root-canal @360 no overflow + cards', 'FAIL', `body.scrollWidth=${m.bodyScrollWidth}${noOverflow ? '' : ' (overflow)'}, dentist cards=${cards}${cards ? '' : ' (none)'}`)
    }
  } catch (e) {
    record(3, '/treatment/root-canal @360 no overflow + cards', 'ERROR', e.message)
  } finally { await page.close() }
}

// 4. /area/wakad — loads, no horizontal overflow
{
  const page = await newMobilePage()
  try {
    const resp = await page.goto(BASE + '/area/wakad', { waitUntil: 'networkidle' })
    if (!resp || !resp.ok()) {
      record(4, '/area/wakad loads + no overflow', 'FAIL', `HTTP ${resp ? resp.status() : 'no response'}`)
    } else {
      const m = await overflow(page)
      if (m.bodyScrollWidth === 360) record(4, '/area/wakad loads + no overflow', 'PASS', `HTTP ${resp.status()}, body.scrollWidth=${m.bodyScrollWidth}, offenders=${m.offenders}`)
      else record(4, '/area/wakad loads + no overflow', 'FAIL', `body.scrollWidth=${m.bodyScrollWidth} (want 360), worstRight=${m.worstRight}`)
    }
  } catch (e) {
    record(4, '/area/wakad loads + no overflow', 'ERROR', e.message)
  } finally { await page.close() }
}

// 5. /dentist/dr-sweety-dighade — loads at 360px, no overflow
{
  const page = await newMobilePage()
  try {
    const resp = await page.goto(BASE + '/dentist/dr-sweety-dighade', { waitUntil: 'networkidle' })
    if (!resp || !resp.ok()) {
      record(5, '/dentist/dr-sweety-dighade @360 loads + no overflow', 'FAIL', `HTTP ${resp ? resp.status() : 'no response'}`)
    } else {
      const m = await overflow(page)
      if (m.bodyScrollWidth === 360) record(5, '/dentist/dr-sweety-dighade @360 loads + no overflow', 'PASS', `HTTP ${resp.status()}, body.scrollWidth=${m.bodyScrollWidth}, offenders=${m.offenders}`)
      else record(5, '/dentist/dr-sweety-dighade @360 loads + no overflow', 'FAIL', `body.scrollWidth=${m.bodyScrollWidth} (want 360), worstRight=${m.worstRight}`)
    }
  } catch (e) {
    record(5, '/dentist/dr-sweety-dighade @360 loads + no overflow', 'ERROR', e.message)
  } finally { await page.close() }
}

// 6. Header has "Dentist Login" link
{
  const page = await newMobilePage()
  try {
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    const login = page.locator('a[href="/for-dentists/login"]')
    const count = await login.count()
    if (count > 0) {
      const txt = (await login.first().innerText()).replace(/\s+/g, ' ').trim()
      const ok = /login/i.test(txt)
      if (ok) record(6, 'Header "Dentist Login" link present', 'PASS', `href=/for-dentists/login, text="${txt}"`)
      else record(6, 'Header "Dentist Login" link present', 'FAIL', `link found but text="${txt}"`)
    } else {
      record(6, 'Header "Dentist Login" link present', 'FAIL', 'no a[href="/for-dentists/login"] in header')
    }
  } catch (e) {
    record(6, 'Header "Dentist Login" link present', 'ERROR', e.message)
  } finally { await page.close() }
}

// ────────────────────────────────────────────────────────────────────────────
// API CHECKS (live: dentistinpune.in)
// ────────────────────────────────────────────────────────────────────────────
const api = await pwRequest.newContext({ baseURL: LIVE, ignoreHTTPSErrors: true })

// 7. POST /api/auth/email-otp/send with valid email → 200
try {
  const r = await api.post('/api/auth/email-otp/send', { data: { email: OTP_EMAIL }, timeout: 30000 })
  const body = await r.text()
  if (r.status() === 200) record(7, 'POST email-otp/send valid email → 200', 'PASS', `200 ${body.slice(0, 80)} (real OTP emailed to ${OTP_EMAIL})`)
  else record(7, 'POST email-otp/send valid email → 200', 'FAIL', `HTTP ${r.status()} — ${body.slice(0, 120)}`)
} catch (e) {
  record(7, 'POST email-otp/send valid email → 200', 'ERROR', e.message)
}

// 8. GET /for-dentists/dashboard unauthenticated → 307 redirect to login
try {
  const r = await api.get('/for-dentists/dashboard', { maxRedirects: 0, timeout: 30000 })
  const loc = r.headers()['location'] || ''
  const locPath = loc ? new URL(loc, LIVE).pathname : ''
  const is307 = r.status() === 307
  const toLogin = /login/.test(locPath)
  if (is307 && toLogin) record(8, 'GET dashboard unauth → 307 redirect to login', 'PASS', `307 → ${locPath} (spec said /login; actual guard target is /for-dentists/login)`)
  else if (is307) record(8, 'GET dashboard unauth → 307 redirect to login', 'FAIL', `307 but → ${locPath || '(no location)'}`)
  else record(8, 'GET dashboard unauth → 307 redirect to login', 'FAIL', `HTTP ${r.status()} (want 307), location=${locPath || '(none)'}`)
} catch (e) {
  record(8, 'GET dashboard unauth → 307 redirect to login', 'ERROR', e.message)
}

// 9. POST /api/auth/password-login with wrong password → 401
try {
  const r = await api.post('/api/auth/password-login', { data: { email: OTP_EMAIL, password: 'definitely-wrong-password-' + VW }, timeout: 30000 })
  const body = await r.text()
  if (r.status() === 401) record(9, 'POST password-login wrong password → 401', 'PASS', `401 ${body.slice(0, 80)}`)
  else record(9, 'POST password-login wrong password → 401', 'FAIL', `HTTP ${r.status()} — ${body.slice(0, 120)}`)
} catch (e) {
  record(9, 'POST password-login wrong password → 401', 'ERROR', e.message)
}

await api.dispose()
await browser.close()

// ────────────────────────────────────────────────────────────────────────────
// MOBILE SWEEP — run measure-overflow-all.mjs, assert every body.scrollWidth=360
// ────────────────────────────────────────────────────────────────────────────
try {
  const sweep = spawnSync(process.execPath, [path.join(__dirname, 'measure-overflow-all.mjs')], {
    encoding: 'utf8', timeout: 180000,
  })
  const out = (sweep.stdout || '') + (sweep.stderr || '')
  if (sweep.status !== 0 && !out.includes('body.scrollWidth')) {
    record(10, 'measure-overflow-all: all pages body.scrollWidth=360', 'ERROR', `child exited ${sweep.status}: ${(sweep.stderr || '').slice(0, 120)}`)
  } else {
    const widths = [...out.matchAll(/body\.scrollWidth=(\d+)/g)].map(m => Number(m[1]))
    const bad = widths.filter(w => w !== 360)
    if (widths.length === 0) record(10, 'measure-overflow-all: all pages body.scrollWidth=360', 'FAIL', 'no measurements parsed from output')
    else if (bad.length === 0) record(10, 'measure-overflow-all: all pages body.scrollWidth=360', 'PASS', `${widths.length} pages, all body.scrollWidth=360`)
    else record(10, 'measure-overflow-all: all pages body.scrollWidth=360', 'FAIL', `${bad.length}/${widths.length} pages overflow: widths ${bad.join(', ')}`)
  }
} catch (e) {
  record(10, 'measure-overflow-all: all pages body.scrollWidth=360', 'ERROR', e.message)
}

// ────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ────────────────────────────────────────────────────────────────────────────
const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a }, {})
console.log('\n──────────────────────────────────────────')
console.log(`SUMMARY: ${results.length} tests — ` +
  `PASS ${counts.PASS || 0} · FAIL ${counts.FAIL || 0} · SKIP ${counts.SKIP || 0} · ERROR ${counts.ERROR || 0}`)
const failed = results.filter(r => r.status === 'FAIL' || r.status === 'ERROR')
if (failed.length) {
  console.log('Attention:')
  for (const r of failed) console.log(`  [${r.n}] ${r.status} — ${r.name}: ${r.reason}`)
}
process.exitCode = failed.length ? 1 : 0
