import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import { SPECIALTIES, getSpecialty } from '@/lib/dentalSpecialties'
import { LIVE_CITY_CONFIGS, NATIONAL_ORIGIN } from '@/config/cities'
import { adminDb, isNationalRequest, AFTER_KINDS, cityNameOf, initialsOf, isFoundingDentist, ui } from '@/lib/national'

export const dynamic = 'force-dynamic'

// /experts — patients researching before they choose a dentist.
// Pick a treatment (and optionally a city); dentists are sorted by the
// work they have shared with other dentists (approved cases in that
// specialty, then cases with a follow-up). Nobody can pay to rank higher.

type SP = { t?: string; c?: string }

// Words that mark a dentist's own specialty / skill text as matching.
const KEYWORDS: Record<string, string[]> = {
  implants: ['implant'], orthodontics: ['ortho', 'braces', 'aligner'], endodontics: ['endo', 'root canal'],
  cosmetic: ['cosmetic', 'smile', 'whitening', 'aesthetic'], prosthodontics: ['prostho', 'crown', 'bridge', 'denture'],
  periodontics: ['perio', 'gum'], 'oral-surgery': ['surgeon', 'surgery', 'wisdom', 'maxillofacial'],
  pediatric: ['pedo', 'paediatric', 'pediatric', 'kids', 'child'], general: ['general'], 'full-mouth': ['full-mouth', 'full mouth', 'rehab'],
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams
  const spec = getSpecialty(sp.t) || getSpecialty('implants')!
  const city = cityNameOf(sp.c)
  const title = `${spec.label} experts${city ? ' in ' + city : ' across India'} | DentistIn India`
  return {
    title: { absolute: title },
    description: `Find ${spec.label.toLowerCase()} dentists${city ? ' in ' + city : ' in India'} by the cases they have shared with other dentists and checked again after treatment. Nobody pays to rank higher.`,
    alternates: { canonical: `${NATIONAL_ORIGIN}/experts?t=${spec.slug}${sp.c && city ? '&c=' + sp.c : ''}` },
  }
}

export default async function ExpertsPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await isNationalRequest())) notFound()
  const sp = await searchParams
  const spec = getSpecialty(sp.t) || getSpecialty('implants')!
  const citySlug = sp.c && cityNameOf(sp.c) ? sp.c : null

  const db = adminDb()
  const { data: caseRows } = await db
    .from('cases').select('id, dentist_id').eq('status', 'approved').eq('specialty', spec.slug).limit(1000)
  const cases = (caseRows || []) as Array<{ id: string; dentist_id: string }>
  const perDentist = new Map<string, { cases: number; followups: number }>()
  for (const c of cases) {
    const cur = perDentist.get(c.dentist_id) || { cases: 0, followups: 0 }
    cur.cases++
    perDentist.set(c.dentist_id, cur)
  }
  if (cases.length) {
    const { data: after } = await db.from('case_photos').select('case_id').in('case_id', cases.map(c => c.id)).in('kind', AFTER_KINDS)
    const followedCases = new Set((after || []).map((p: any) => p.case_id as string))
    for (const c of cases) if (followedCases.has(c.id)) perDentist.get(c.dentist_id)!.followups++
  }

  // Dentists whose own profile lists this treatment, even with no cases yet.
  let dq = db.from('dentists').select('*').eq('is_active', true).limit(1000)
  if (citySlug) dq = dq.eq('city', citySlug)
  const { data: dentistRows } = await dq
  const words = KEYWORDS[spec.slug] || [spec.label.toLowerCase()]
  const listsIt = (d: Record<string, any>) => {
    const text = [...(Array.isArray(d.specialties) ? d.specialties : []), ...(Array.isArray(d.top_skills) ? d.top_skills : [])].join(' ').toLowerCase()
    return words.some(w => text.includes(w))
  }
  const experts = ((dentistRows || []) as Array<Record<string, any>>)
    .filter(d => perDentist.has(d.id) || listsIt(d))
    .map(d => ({ d, ...(perDentist.get(d.id) || { cases: 0, followups: 0 }) }))
    .sort((a, b) => b.cases - a.cases || b.followups - a.followups || Number(!!b.d.is_verified) - Number(!!a.d.is_verified) || String(a.d.name).localeCompare(String(b.d.name)))
    .slice(0, 60)

  const link = (patch: Partial<SP>) => {
    const next = { t: spec.slug, ...(citySlug ? { c: citySlug } : {}), ...patch }
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v as string)
    return `/experts?${p.toString()}`
  }

  return (
    <NationalShell>
      <main style={ui.page}>
        <h1 style={ui.h1}>{spec.label} experts{citySlug ? ` in ${cityNameOf(citySlug)}` : ' across India'}</h1>
        <p style={{ ...ui.sub, marginBottom: 16 }}>Sorted by real work: cases shared with other dentists and checked again after treatment. Nobody pays to be higher.</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {SPECIALTIES.map(s => <Link key={s.slug} href={link({ t: s.slug })} style={ui.chip(s.slug === spec.slug)}>{s.label}</Link>)}
        </div>
        <form action="/experts" method="get" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          <input type="hidden" name="t" value={spec.slug} />
          <label htmlFor="exp-city" style={{ fontSize: 14, fontWeight: 600 }}>City</label>
          <select id="exp-city" name="c" defaultValue={citySlug || ''} style={{ minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: 15, background: '#fff', fontFamily: 'var(--font-body)' }}>
            <option value="">All India</option>
            {LIVE_CITY_CONFIGS.map(c => <option key={c.citySlug} value={c.citySlug}>{c.cityName}</option>)}
          </select>
          <button type="submit" style={ui.btnGhost}>Show</button>
        </form>

        {experts.length === 0 ? (
          <div style={{ ...ui.card, borderStyle: 'dashed', padding: 28, textAlign: 'center' }}>
            <p style={{ ...ui.sub, marginBottom: 12 }}>No {spec.label.toLowerCase()} dentists here yet.</p>
            <Link href={link({ c: undefined })} style={ui.btnGhost}>Search all of India</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {experts.map(({ d, cases: n, followups }) => (
              <Link key={d.id} href={`/professional/${d.slug}`} style={{ ...ui.card, textDecoration: 'none', color: '#0F1923', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#DBEAFE', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                    {d.profile_photo ? <img src={d.profile_photo} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(d.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Dr. {d.name}</div>
                    <div style={{ fontSize: 13, color: '#475569' }}>
                      {[d.qualifications, typeof d.experience_years === 'number' && d.experience_years > 0 ? `${d.experience_years}+ years` : null, cityNameOf(d.city)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {n > 0 ? <span style={ui.pill('#EFF6FF', '#1D4ED8')}>{n} {spec.label.toLowerCase()} case{n === 1 ? '' : 's'} shared</span> : <span style={ui.pill('#F1F5F9', '#334155')}>Lists {spec.label.toLowerCase()}</span>}
                  {followups > 0 && <span style={ui.pill('#ECFDF5', '#065F46')}>{followups} checked after treatment</span>}
                  {d.is_verified && <span style={ui.pill('#ECFDF5', '#065F46')}>Registration verified</span>}
                  {isFoundingDentist(d.created_at) && <span style={ui.pill('#FEF3C7', '#78350F')}>Founding Dentist</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </NationalShell>
  )
}
