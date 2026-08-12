# DentistIn Platform — Full Feature Audit

**Date:** 2026-08-12
**Commit audited:** `dd90904`
**Method:** Next 16.2.5 dev server on `localhost:3111`, driven with explicit `Host:` headers per city domain; live Supabase (`hpruudyeluingwckavws`) read via PostgREST + Auth Admin API with the service-role key; source inspection for anything behind a login.
**Nothing was fixed.** Two throwaway probe rows were created in `consent_templates` during testing and deleted immediately (row count verified back at 8).

---

## Coverage & honesty note — read this first

**Sections 1, 5, 6 and 7 were tested live.** Every status code, canonical, robots directive, schema block and row count below was actually observed, not inferred.

**Sections 2 and 3 were NOT tested live.** I have no dentist or admin password, and no way to mint a session without one. For those sections I verified two things only: that the route exists, and that its auth gate fires (`307 → /for-dentists/login`). Everything past the gate is marked ⏭️ SKIP. The one exception is Consent Forms (2.7), which I can mark ❌ FAIL from direct database evidence rather than from a UI click.

**Section 4 was partly tested live.** Rejection paths were exercised against the real API. The happy path was not — a successful registration writes an auth user, a `dentists` row and a `dentist_registrations` row to production, which an audit has no business doing.

**Dev-server caveat:** response headers on `localhost` are not Vercel's. Where a finding depends on production edge behaviour (www redirects, static-asset headers) I say so and fall back to reading the config.

---

## SECTION 1 — PUBLIC FACING (patient side)

Host: `dentistinpune.in`

### 1.1 Homepage
| Item | Status | Evidence |
|---|---|---|
| Loads, H1, dentist cards | ✅ PASS | `200`. Exactly one `<h1>`: "Find the Right Dentist in Pune" |
| Intent tiles → `/dentists?treatment=X` | ✅ PASS | `page.tsx:214` emits `/dentists?treatment=${tile.slug}`. The `/treatment/X` links on the page are the separate editorial browse block, not the intent tiles |
| City detection | ✅ PASS | 84 "Pune" vs 2 "Mumbai" occurrences; title, H1 and canonical all Pune |

### 1.2 Dentist listing `/dentists`
| Item | Status | Evidence |
|---|---|---|
| Loads with cards | ✅ PASS | `200`, H1 "147 Dentists in Pune" |
| Filters (area, treatment) | ✅ PASS | `?area=wakad` → H1 "30 Dentists in Pune · Wakad"; `?treatment=root-canal` → `200` |
| Pagination | ✅ PASS | `?page=2` → `200`. Status only — I did not diff the two result sets |
| Parameterised URL canonicalisation | ✅ PASS | `?area=wakad` emits `canonical → /area/wakad` **and** `robots: noindex, follow`. Textbook correct |

### 1.3 Dentist profile `/dentist/[slug]`
| Item | Status | Evidence |
|---|---|---|
| Complete profile (`dr-sweety-dighade`) | ✅ PASS | `200`, canonical correct, `index, follow` |
| Incomplete profile | ⏭️ SKIP | No active Pune dentist with a null bio in the sample I pulled; did not isolate a low-completion profile to load |
| Photo, bio, hours, treatments+fees | ✅ PASS | 27 Cloudinary refs; `<h2>` "About", "Treatments & fees"; day rows Mon/Tue + "Closed" render |
| WhatsApp / call / book buttons | ✅ PASS | 5× `wa.me`, 4× `tel:`, 30× `/book/` |
| Schema | ✅ PASS | `"@type":["Dentist","Physician"]` + `FAQPage` + `PostalAddress` |
| Articles section | ⏭️ SKIP | No "Articles" heading on this profile. 8 published articles exist platform-wide, but I did not confirm any are authored by this dentist — absence may be correct |
| Dead slug redirect | ✅ PASS | `dr-sweety-ingole-wakad` → `308` → `/dentist/dr-sweety-dighade` |

### 1.4 Area pages `/area/[slug]`
| Item | Status | Evidence |
|---|---|---|
| `/area/wakad` | ✅ PASS | `200`, `index, follow`, `MedicalBusiness` + `BreadcrumbList` + `FAQPage` |
| `/area/hadapsar` | ✅ PASS | `200`, `index, follow` — density gate passes |
| `/area/camp` should 404 | ⚠️ WARNING | Returns **`200` + `noindex, follow`**, not `404`. The gate is working, but for area hubs it degrades to noindex rather than 404. Only area×treatment 404s. Your expectation and the implementation differ — flagging so you can decide which is intended |
| Nearby-area links | ✅ PASS | `<h2>` "Other areas in Pune" + "More dentists in Wakad" |

### 1.5 Area × Treatment `/area/[slug]/[treatment]`
| Item | Status | Evidence |
|---|---|---|
| `/area/wakad/root-canal` | ✅ PASS | `200`, `index, follow` |
| `/area/wakad/teeth-whitening` | ✅ PASS | `200` |
| `/area/hadapsar/smile-makeover` → 404 | ✅ PASS | `404` |
| `/area/camp/root-canal` → 404 | ✅ PASS | `404` |
| Fee table renders | ✅ PASS | Real figures present: ₹3,500 / ₹4,500 / ₹300 |

### 1.6 Treatment pages `/treatment/[slug]`
| Item | Status | Evidence |
|---|---|---|
| `/treatment/root-canal` | ✅ PASS | `200` |
| `/treatment/dental-implants` | ✅ PASS | `200` |
| Medical review badge — Dr. Manish | ✅ PASS | Visible "Medically reviewed by Dr. Manish Dighade" + `reviewedBy` `Person` schema carrying `MSDC A-24630` and the author URL |
| Fee table | ✅ PASS | ₹3,000–₹8,000 range renders |

### 1.7 Search `/search`
| Item | Status | Evidence |
|---|---|---|
| Search works | ✅ PASS | `/search` and `/search?q=wakad` → `200` |
| Results relevant | ⚠️ WARNING | `/search?q=implant` does **not** return results — it `307`s to `/treatment/dental-implants`. Fine as a shortcut, but a patient searching "implant" can never reach a filtered dentist list for that term |

### 1.8 Booking `/book/[slug]`
| Item | Status | Evidence |
|---|---|---|
| Loads | ✅ PASS | `200` |
| Noindexed | ✅ PASS | `robots: noindex, nofollow` |
| robots.txt blocks `/book` | ✅ PASS | `Disallow: /book` |

### 1.9 Blog redirects
| Item | Status | Evidence |
|---|---|---|
| `/blog/root-canal-treatment-pune-cost-procedure` | ✅ PASS | `308` → `/treatment/root-canal` |
| `/blog/dental-implants-pune-cost-types-success` | ✅ PASS | `308` → `/treatment/dental-implants` |

*(`308` not `301` — Next's permanent redirect. Equivalent for SEO; Google treats both as permanent.)*

### 1.10 Policy pages
| Item | Status | Evidence |
|---|---|---|
| `/privacy` | ✅ PASS | `200` |
| `/terms` | ✅ PASS | `200` |
| `/cookie-policy` | ⚠️ WARNING | `404`. No redirect exists — deliberately omitted per the comment in `next.config.ts` ("no /consent or /cookies pages to point them at"). Grep confirms **nothing in the codebase links to it**, so there is no broken internal link. Only matters if external links or GSC still reference it |
| `/privacy-policy` | ✅ PASS | `308` → `/privacy` |

---

## SECTION 2 — DENTIST DASHBOARD

**All routes exist and all auth gates fire correctly** (`307 → /for-dentists/login`) — verified for `/dashboard`, `/articles`, `/articles/new`, `/consent-forms`, `/consent-forms/templates`, `/appointments`, `/profile`, `/hours`, `/badge`, `/treatments`, `/cases/new`. Behaviour past the gate could not be exercised.

> Two paths in your brief were wrong: working hours is `/for-dentists/dashboard/hours` (not `/working-hours`), and Grow Your Practice is `/for-dentists/dashboard/badge` (not `/grow`). Case submission is `/cases/new`, outside the dashboard tree.

| Ref | Item | Status | Note |
|---|---|---|---|
| 2.1 | Login / logout / password reset / session persistence | ⏭️ SKIP ×4 | No credentials. Login page renders `200`; `proxy.ts` implements a remember-me re-auth bounce for expired sessions |
| 2.2 | Overview: loads, stats, articles, Grow section, Write CTA | ⏭️ SKIP ×5 | Route gated |
| 2.3 | Edit profile: all field saves, photo, cover, hours, maps, fees | ⏭️ SKIP ×6 | Route gated. See 7.1 — the `dentists` UPDATE policy is case-sensitive on email, a latent write-failure risk |
| 2.4 | Appointments: view, walk-in, book | ⏭️ SKIP ×3 | Route gated |
| 2.5 | Articles list / new / topic picker / submit | ⏭️ SKIP ×4 | Routes gated |
| 2.5 | **AI Draft button streams** | ❌ FAIL (local) | `ANTHROPIC_API_KEY` is **absent from `.env.local`**. `ai-draft/route.ts:55` requires it and returns `502` without it. Cannot verify production — the key may be set in Vercel |
| 2.6 | Cases: form, template sections, photo upload, submit | ⏭️ SKIP ×4 | `/cases/new` gated |
| **2.7** | **Consent form template creation** | ❌ **FAIL** | **See detail below** |
| 2.8 | Working hours: picker, toggle, save | ⏭️ SKIP ×3 | Route gated |
| 2.9 | Badge HTML with correct slug + domain | ✅ PASS | `dashboard/page.tsx:162` builds badge HTML from `profileUrl` + `getCityBySlug(dentist.city)` — a Pune dentist gets `dentistinpune.in`, never a hardcoded host |
| 2.9 | Copy Code / GBP link / Copy Link / two-platform banner | ⏭️ SKIP ×4 | Client-island behaviour, route gated |

### 2.7 Consent Forms — ❌ FAIL (three separate breakages)

Directly verified against the live database, not inferred:

1. **Template creation still fails.** The `language` column was added on 2026-08-12, but with `DEFAULT 'english'` (the snippet from the original bug report) rather than the `'en'` the UI writes. **`template_group` was never added.** Replaying the browser's exact request returns:
   `{"code":"42703","message":"column consent_templates.template_group does not exist"}`
   The insert is transactional, so no orphan row is written — but the create fails and the template list renders empty for the same reason.
2. **No CHECK constraint.** I inserted `language = 'zz_not_a_lang'` successfully. All 8 existing rows hold `'english'`, which is outside the `Lang` union the UI understands.
3. **Saving a consent form is broken too.** `consent_forms` is still on its original 8 columns — the entire send workflow (`form_text`, `form_title`, `patient_name`, `patient_phone`, `status`, `sent_at`, `signed_by`, `signature_method`, `notes`, `appointment_id`) was never applied. Migration `20260623120000` has not run.

Root cause is consistent: `supabase/migrations/20260620140000`, `20260620150000` and `20260623120000` exist in the repo as reconstructions but were never replayed against the live database. The corrective SQL was supplied separately and is not repeated here.

---

## SECTION 3 — ADMIN PANEL

Admin route tree is small: `/admin`, `/admin/login`, `/admin/dentists/[id]/edit`. Tabs live inside the `/admin` page. `/admin` correctly gates (`307`), `/admin/login` renders `200`.

| Ref | Item | Status | Note |
|---|---|---|---|
| 3.1 | Dentist management — view / city filter / search / edit / saves / hours / login link / welcome email / delete | ⏭️ SKIP ×9 | No admin credentials |
| 3.2 | Articles tab — pending list, approve, reject | ⏭️ SKIP ×3 | Gated. Note: **there are currently 0 pending articles** (all 8 are `published`), so there is nothing to approve even with access |
| 3.3 | Cases tab — pending list, approve/reject | ⏭️ SKIP ×2 | Gated. 6 cases total |
| 3.4 | New registration → email | ✅ PASS | `sendAdminNewRegistrationAlert` called from `api/registrations` + `api/india/register` |
| 3.4 | New appointment → email | ✅ PASS | `sendAdminAppointmentAlert` called from `api/bookings` |
| 3.4 | New article → email | ✅ PASS | `sendAdminNewArticleAlert` called from `api/dentist/articles` |
| 3.4 | New case → email | ✅ PASS | `sendAdminNewCaseAlert` called from `api/cases` |

All four route to `dentistinmumbaiapp@gmail.com` (`src/lib/email.ts:6`). `RESEND_API_KEY` is present. Wiring verified by call-site; actual delivery not test-fired.

**Minor:** three exported email helpers have zero callers — `sendNewRegistrationAdminAlert`, `sendRegistrationEmailToAdmin`, `sendAutoApprovedAdminAlert`. Dead code, harmless, easy to confuse with the live ones (note the near-identical name to the live `sendAdminNewRegistrationAlert`).

---

## SECTION 4 — REGISTRATION FLOWS

### 4.1 Dentist registration
| Item | Status | Evidence |
|---|---|---|
| Form loads | ✅ PASS | `/for-dentists/register` → `200` |
| Honeypot present + hidden | ✅ PASS | `register/page.tsx:310` — field name `website`, wrapped in `display:none` + `aria-hidden` + `tabIndex={-1}` + `autoComplete="off"`. Correctly a styled-hidden text input, not `type=hidden` |
| Gibberish name rejected | ✅ PASS | Live: `{"error":"Please enter a valid name."}` `400` |
| Invalid phone rejected | ✅ PASS | Live: `{"error":"Enter a valid 10-digit Indian mobile number."}` `400` |
| Valid registration creates auth user + dentist row | ⏭️ SKIP | Would write real production records |
| Welcome email | ⏭️ SKIP | Depends on the happy path |
| Admin notification | ✅ PASS | Call-site verified (3.4) |
| Referral code `?ref=SALONI` | ✅ PASS | `route.ts:123` uppercases, trims, caps at 64 chars; falls back gracefully if the `ref` column is missing (`isMissingColumn` retry) |

### 4.2 National registration
| Item | Status | Evidence |
|---|---|---|
| `dentistinindia.in/join` loads | ✅ PASS | `200` |
| Creates dentist row, not orphan | ⏭️ SKIP | Happy path not exercised — **but see 7.2: 15 orphaned auth users already exist**, so this class of failure is live |

### 4.3 Spam protection
| Item | Status | Evidence |
|---|---|---|
| Honeypot blocks bots | ✅ PASS | `honeypotTripped()` checked at `route.ts:104`, ahead of rate-limiting and field validation |
| Rate limiting (3/hour) | ✅ PASS | Live — my 4th request in the window returned `429 "Too many registration attempts."` `withinRateLimit(key, max=3, windowMs=1h)` |
| Rate-limit durability | ⚠️ WARNING | Backed by an in-process `Map` (`registrationGuards.ts`). On Vercel that is per-instance and per-cold-start, so a distributed or patient bot largely bypasses it. Fine against casual spam, not against a determined one |

---

## SECTION 5 — SEO & TECHNICAL

### 5.1 robots.txt
| Item | Status | Evidence |
|---|---|---|
| `/book` disallowed | ✅ PASS | `Disallow: /book` |
| `/api` disallowed | ✅ PASS | `Disallow: /api/` |
| `/for-dentists/login` disallowed | ⚠️ WARNING | It is **explicitly Allowed**: `Allow: /for-dentists/login` sits above `Disallow: /for-dentists/`. Under the robots spec the longer, more specific `Allow` wins, so the login page **is** crawlable. Looks deliberate (register is allowed the same way) but contradicts your expectation |
| `/_next/static` noindex header | ❌ FAIL | No `X-Robots-Tag` on static assets, and `next.config.ts` has **no `headers()` block at all** — so this is a genuine absence, not a dev-server artifact. Low real-world impact (JS chunks rarely index) |

### 5.2 Sitemap — ❌ contains a major gap
| Item | Status | Evidence |
|---|---|---|
| `/sitemap.xml` loads | ✅ PASS | `200`, 133 URLs |
| Contains **area pages** | ❌ **FAIL** | **Zero.** See detail below |
| Contains area×treatment pages | ❌ **FAIL** | **Zero.** Same root cause |
| Contains treatment pages | ✅ PASS | 16 |
| Contains dentist profiles | ✅ PASS | 110 |
| No `/book` URLs | ✅ PASS | 0 |
| All non-www canonical | ✅ PASS | All 133 on `https://dentistinpune.in` |

**Root cause — a silent query failure.** `src/app/sitemap.ts:68` selects `id, slug, updated_at` from `areas`. **The `areas` table has no `updated_at` column** (`id, name, slug, zone, description, lat, lng, dentist_count, seo_content, is_active, city`). Confirmed live:

```
GET /rest/v1/areas?select=id,slug,updated_at&is_active=eq.true&city=eq.pune
→ {"code":"42703","message":"column areas.updated_at does not exist"}
```

The result is destructured as `{ data: areas }` with the error discarded, so `areas` is `null`, and both `areaPages` and `areaTreatmentPages` collapse to empty arrays. Every city sitemap is affected, not just Pune.

The impact is the inverse of the comment at `sitemap.ts:61-66`, which claims the sitemap "must NEVER advertise a URL that the route would notFound() or noindex" and that route and sitemap "can't drift". They have drifted — in the safe direction for false positives, but the entire programmatic area layer (`/area/wakad`, all 84 live area×treatment pages) is invisible to crawlers via the sitemap. These are exactly the pages the recent `7bc569a` commit expanded from 4 to 84.

Note this is the *same* error-swallowing pattern as the consent-forms bug: `{ data }` destructured without `error`, a `42703` rendering as "no data".

### 5.3 Canonicals
| Item | Status | Evidence |
|---|---|---|
| Homepage | ✅ PASS | `https://dentistinpune.in` |
| `/dentists` (no params) | ✅ PASS | `https://dentistinpune.in/dentists`; `?area=wakad` correctly points at `/area/wakad` + noindex |
| `/area/wakad` | ✅ PASS | Self-canonical |
| www redirect (308) | ⏭️ SKIP | Edge-level, not reproducible on localhost. Config reviewed — see 6.2, where it is **incomplete** |

### 5.4 Schema markup
| Item | Status | Evidence |
|---|---|---|
| Homepage LocalBusiness | ⚠️ WARNING | Present but typed `MedicalOrganization` (+ `WebSite`, `SearchAction`, `FAQPage`, `City`, `PostalAddress`), not `LocalBusiness`. Arguably more correct for a directory homepage — flagging only because it differs from the brief |
| Treatment pages MedicalWebPage | ✅ PASS | `MedicalWebPage` + `MedicalProcedure` + `MedicalAudience` |
| Author Person schema | ✅ PASS | `Person` with `name`, `identifier: MSDC A-24630`, `url` |
| FAQ schema on treatment pages | ✅ PASS | `FAQPage` + `Question`/`Answer` pairs |
| Area pages | ✅ PASS (bonus) | `MedicalBusiness` + `BreadcrumbList` + `FAQPage` |
| Dentist profiles | ✅ PASS (bonus) | `["Dentist","Physician"]` |

### 5.5 Page titles
| Item | Status | Evidence |
|---|---|---|
| No doubled domain | ✅ PASS | `Dentist in Pune \| Book Verified Dentists \| DentistInPune` — the `9de3105` fix holds |
| Treatment title format | ⚠️ WARNING | Format correct, but 109 chars: *"Root Canal Treatment (RCT) Cost in Pune — Real Fees from Verified Dentists (2026) \| dentistinpune.in"*. Google truncates around 60 |
| Area title format | ✅ PASS | `Best Dentists in Wakad, Pune \| dentistinpune.in` |

### 5.6 Density gate
| Item | Status | Evidence |
|---|---|---|
| `/area/wakad/root-canal` → 200 | ✅ PASS | `200` |
| `/area/camp/root-canal` → 404 | ✅ PASS | `404` |
| `/area/hadapsar/smile-makeover` → 404 | ✅ PASS | `404` |

The gate itself is working correctly. Its only problem is that the sitemap can no longer advertise the pages that pass it (5.2).

### 5.7 Slug redirects
| Item | Status | Evidence |
|---|---|---|
| `/dentist/dr-sweety-ingole-wakad` | ✅ PASS | `308` → `/dentist/dr-sweety-dighade` |
| `/dentist/dr-manish-waman-dighade-wakad` | ✅ PASS | `308` → `/dentist/urban-smile-orthodontic-and-dental-implant-centre` |

---

## SECTION 6 — MULTI-CITY

### 6.1 City routing — all correct
| Host | Status | Title served |
|---|---|---|
| `dentistinpune.in` | ✅ PASS | Dentist in Pune \| … \| DentistInPune |
| `dentistinmumbai.in` | ✅ PASS | Dentist in Mumbai \| … \| DentistInMumbai |
| `dentistinbangalore.in` | ✅ PASS | Dentist in Bangalore \| … \| DentistInBangalore |
| `dentistinmysore.com` | ✅ PASS | Dentist in Mysore \| … \| DentistInMysore |
| `dentistinmangalore.com` | ✅ PASS | Dentist in Mangalore \| … \| DentistInMangalore |
| `dentistinindia.in` | ✅ PASS | DentistIn India \| India's Dental Professional Network \| 16 Cities |

⚠️ **WARNING — the new Karnataka cities are empty.** Dentist counts by city: `pune 149, mumbai 46, nagpur 10, bangalore 4, nashik 4, kolhapur 3, surat 3, sambhajinagar 1`. **Mysore and Mangalore have zero dentists**, and Bangalore has four. Area rows exist (bangalore 15, mysore 6, mangalore 6), so these domains serve real pages with nothing to list.

### 6.2 Domain redirects
| Item | Status | Evidence |
|---|---|---|
| `www.dentistinpune.in` → 308 | ⏭️ SKIP (config OK) | Present in `vercel.json`; edge-level, untestable locally |
| `dentistinbengaluru.com` → bangalore | ✅ PASS (config) | `next.config.ts`, `(www\.)?` prefixed, permanent |
| `dentistinbengaluru.in` → bangalore | ✅ PASS (config) | Same |
| **www for the 3 new cities** | ❌ **FAIL** | `vercel.json` lists www redirects for 14 hosts but **omits `www.dentistinbangalore.in`, `www.dentistinmysore.com`, `www.dentistinmangalore.com`**. Worse than a missing redirect: `getCityByDomain()` strips `www.` (`cities.ts:66`), so those www hosts **serve a full duplicate of the site at 200** instead of redirecting — duplicate content on three live domains |

### 6.3 National domain
| Item | Status | Evidence |
|---|---|---|
| `/articles` → `/insights` | ✅ PASS | `308` → `/insights?tab=articles` |
| `/cases` → `/insights` | ✅ PASS | `308` → `/insights?tab=cases` |
| `/insights` loads with both tabs | ✅ PASS | `200`; `/cities` also `200` |
| City filter on national articles | ⏭️ SKIP | Client-side filter, not exercised |
| City domains keep their own `/articles` | ✅ PASS (bonus) | `dentistinpune.in/articles` → `200`, correctly not caught by the host-scoped redirect |

---

## SECTION 7 — DATABASE HEALTH

### 7.1 RLS policies
Policy *text* is read from `supabase/migrations/`; policy *behaviour* is probed with the anon key. Because this schema is managed out-of-band, migration files are a reconstruction — behavioural results are the stronger evidence.

Anon vs service-role row counts:

| Table | service | anon | Verdict |
|---|---|---|---|
| `dentists` | 220 | 218 | ✅ PASS — inactive rows hidden |
| `dentist_treatments` | 1914 | 1914 | ✅ PASS — public catalogue, intended |
| `dentist_articles` | 8 | 8 | ✅ PASS — all published |
| `consent_templates` | 8 | 7 | ✅ PASS — system rows only, custom row hidden |
| `treatment_plan_steps` | 6 | **0** | ✅ PASS — correctly private |
| `patients` | 255 | **0** | ✅ PASS — correctly private |
| `appointments` | 79 | **0** | ✅ PASS — correctly private |

| Item | Status | Evidence |
|---|---|---|
| `dentists` UPDATE policy uses lower() email match | ⚠️ **WARNING** | It does **not**. `20260516160000_dentists_update_rls.sql:25` uses `email = auth.jwt() ->> 'email'` — case-sensitive. `resolveCurrentDentist` (`currentDentist.ts`) matches the same way with `.eq('email', user.email)`. Supabase Auth lowercases emails, so any `dentists` row stored with capitals is unreachable for both resolution and writes. **Exactly one row is affected today** (see 7.3), so nothing is currently broken — but every future capitalised signup silently loses all write access. Note the staff fallback path already uses `.ilike`, so the two halves of the same function disagree |
| `dentist_treatments` RLS | ✅ PASS | Scoped policies in `20260516140000`; anon read matches intent |
| `dentist_articles` RLS | ✅ PASS | Anon sees published only |
| `consent_templates` RLS | ✅ PASS | `is_system OR own` behaves exactly as written |
| `treatment_plan_steps` RLS | ✅ PASS | Anon fully denied |

### 7.2 Data quality
| Item | Status | Evidence |
|---|---|---|
| Dentists whose area belongs to another city | ⚠️ WARNING | **1** — *Dr pranav pund*, `dentist.city = nashik`, but his area row `nashik` is filed under `city = pune`. The area row is the thing that is misfiled |
| `dentist_treatments` with no matching treatment | ✅ PASS | 0 of 1,914 (paginated past the 1,000-row cap; orphaned `dentist_id` also 0) |
| Dentists with a dangling `area_id` | ✅ PASS | 0 |
| Dentists with NULL `area_id` | ⚠️ WARNING | 5 — they cannot appear on any area page |
| **Orphaned auth users** | ❌ **FAIL** | **15 of 244** auth users have no `dentists`, `clinic_staff`, `admin_users` or `patients` row. All email-confirmed. See below |

**Orphaned auth users — this is live and ongoing.** Most recent is dated **2026-08-11 (yesterday)**:

```
dramrutatorkadi@gmail.com        2026-08-11
drprajaktapotdar@gmail.com       2026-08-05
manpreetkaur.dentist@gmail.com   2026-08-03
elitedentalcosmeticclinc@gmail.com 2026-07-21
jabadedentallcr@gmail.com        2026-07-20
dentauraprime@gmail.com          2026-07-18
ptayade12@gmail.com              2026-07-16
shwetavalunj9@gmail.com          2026-07-12
srushtidhande19@gmail.com        2026-07-11
mj488183@gmail.com               2026-07-10
dentalethernal15@gmail.com       2026-07-09
bombaycoffee1@gmail.com          2026-07-02
aarivadental@gmail.com           2026-06-16
drwaghmadhura32@gmail.com        2026-05-26
drdighademanish@gmail.com        2026-05-11
```

Cause is visible in `api/registrations/route.ts:162-168`: the dedupe check queries `dentist_registrations` and `dentists`, but **never `auth.users`**. When a prior signup created the auth user and then failed before the `dentists` insert, the retry passes dedupe, reaches `admin.auth.admin.createUser()`, and fails there instead. These 15 people are permanently locked out — they cannot register (auth row exists) and cannot use the product (no dentist row). At roughly two per week the list is still growing.

### 7.3 Slug health
| Item | Status | Evidence |
|---|---|---|
| Duplicate slugs | ✅ PASS | 0 across 220 dentists |
| Null / empty slugs | ✅ PASS | 0 |
| **Duplicate dentist rows for one email** | ⚠️ WARNING | Two rows differ only by case: `Dr.sweety.ingole.si@gmail.com` → `urban-smile`, and `dr.sweety.ingole.si@gmail.com` → `dr-sweety-dighade`. The auth user is lowercase, so login resolves to `dr-sweety-dighade` and **the dashboard works** — but the `urban-smile` row is unreachable by its owner and unwritable under RLS. This is the single row that trips the 7.1 case-sensitivity issue |

---

## TALLY

| | Count |
|---|---|
| ✅ PASS | **77** |
| ⚠️ WARNING | **13** |
| ❌ FAIL | **6** |
| ⏭️ SKIP | **49** |
| **Total items** | **145** |

The SKIP count is dominated by Sections 2 and 3 (43 of 49) — everything behind a dentist or admin login. **Give me a test dentist account and a test admin account and I can convert almost all of those.**

### The 6 FAILs
1. Sitemap emits zero area pages (5.2)
2. Sitemap emits zero area×treatment pages (5.2) — same root cause
3. Consent template creation broken (2.7)
4. 15 orphaned auth users (7.2)
5. www duplicate content on the 3 new city domains (6.2)
6. No `X-Robots-Tag` on `/_next/static` (5.1)

*(AI Draft is counted as SKIP rather than FAIL — it fails locally only because `ANTHROPIC_API_KEY` is absent from `.env.local`, and I cannot see Vercel's environment.)*

---

## TOP 5 PRIORITY FIXES

### 1. Sitemap drops every area + area×treatment page — 15 minutes
**Impact: highest.** One wrong column name in one query silently deletes the entire programmatic SEO layer from every city sitemap. These pages render fine, are `index, follow`, and pass the density gate — Google just has to find them by crawling instead of being told. This directly undercuts the `7bc569a` work that took area×treatment from 4 to 84 pages.
**Fix:** drop `updated_at` from the `areas` select in `sitemap.ts:68` and fall back to `new Date()` for `lastModified` (the code already has that fallback), **or** add an `updated_at` column to `areas`. Then surface the error instead of discarding it, so the next drift is loud.
**Risk:** trivial, one file.

### 2. Registration dedupe ignores `auth.users` — 30 minutes
**Impact: direct revenue loss.** 15 dentists tried to join and cannot. It is still happening (most recent yesterday). Each one is a signup you already paid to acquire.
**Fix:** add an `auth.users` lookup to the dedupe block at `route.ts:162`, and return the "try signing in instead" message when an auth row exists without a dentist row. Separately, clean up the 15 existing orphans — either delete the auth rows so they can re-register, or back-fill `dentists` rows and send login links.
**Risk:** low for the code change. The cleanup needs a decision per account.

### 3. Consent forms — finish the migration — 10 minutes to run
**Impact:** a paid dashboard feature is fully broken. Templates cannot be created, the list renders empty, and sending a consent form fails on `form_text`.
**Fix:** run the remaining SQL already supplied — add `template_group`, normalise the 8 rows from `'english'` to `'en'`, correct the default, add the CHECK constraint, then the `consent_forms` block. No code change needed; the hardening in `dd90904` is already deployed.
**Risk:** low, all statements idempotent. Order matters — normalise before adding the constraint.

### 4. www duplicate content on Bangalore / Mysore / Mangalore — 5 minutes
**Impact:** three live domains each serve a complete duplicate of themselves at `www.`, with no canonical pointing home. Cheapest fix on this list and it is pure SEO damage while it stands.
**Fix:** add the three missing `www.` entries to the `redirects` array in `vercel.json`, matching the 14 already there.
**Risk:** none.

### 5. Case-sensitive email in the `dentists` UPDATE policy — 20 minutes
**Impact:** latent, not yet biting — one affected row today, and its owner has a working duplicate. But the failure mode is the worst kind: a dentist logs in fine, edits their profile, sees no error, and nothing saves. It will hit the first person who registers with a capitalised email.
**Fix:** change the policy to `lower(email) = lower(auth.jwt() ->> 'email')`, make `resolveCurrentDentist` use `.ilike` to match the staff path it already sits next to, and lowercase `dentists.email` on write. Then resolve the duplicate `urban-smile` / `dr-sweety-dighade` pair.
**Risk:** medium — touches the auth resolution path for every dentist. Worth testing with a real session before shipping, which is another argument for a test account.

---

### Also worth queuing (not top 5)
- **Mysore and Mangalore have zero dentists** — two live domains with nothing to show. Either seed them or hold the launch.
- **`/search?q=implant` never returns results**, it redirects to the treatment page.
- **Treatment page titles run 109 characters** — Google truncates around 60.
- **Rate limiting is per-instance in-memory** — near-useless against a distributed bot on serverless.
- **`/area/camp` returns 200 + noindex, not 404** — confirm which behaviour you want for area hubs.
- **`/for-dentists/login` is explicitly `Allow`ed in robots.txt** — confirm that is intentional.
- **`CLAUDE_MODEL = 'claude-sonnet-4-6'`** (`src/lib/anthropic.ts:11`) is a previous-generation model id. I could not call the API to confirm whether it still resolves. Current equivalent is `claude-sonnet-5`.
- **Three dead email helpers** with zero callers, one near-identically named to a live one.
- **`{ data }` destructured without `error`** is a recurring pattern — it caused both the consent-forms symptom and the sitemap failure. Worth a lint rule.
