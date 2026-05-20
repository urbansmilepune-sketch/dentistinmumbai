import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import NationalShell from '@/components/national/NationalShell'
import { getSpecialty } from '@/lib/dentalSpecialties'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'My saved cases | Dentist In India',
  robots: { index: false, follow: false },
}

// Auth-gated page listing every case the signed-in dentist has saved
// for later. case_saves RLS restricts SELECT to the owning dentist so
// the user-bound client is the right tool here — service-role only
// shows up to join the cases payload (RLS on cases.status='approved'
// is already public, so we use the same anon-safe path for consistency).

interface SavedCard {
  case_id: string
  saved_at: string
  case: {
    id: string
    title: string
    specialty: string
    complexity: number
    status: string
  } | null
  thumb: string | null
}

export default async function SavedCasesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/for-dentists/login?next=/cases/saved')

  const { data: dentist } = await supabase
    .from('dentists').select('id').eq('email', user.email).single()
  if (!dentist) redirect('/for-dentists/register')

  const { data: saves } = await supabase
    .from('case_saves')
    .select('case_id, created_at, cases:case_id(id, title, specialty, complexity, status)')
    .eq('dentist_id', dentist.id)
    .order('created_at', { ascending: false })
    .limit(200)

  // Fetch thumbnails via service role (case_photos RLS on a non-approved
  // case would hide the photo for the saved owner who isn't the case
  // author — service role bypasses that and keeps the list complete).
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const caseIds = (saves || []).map((s: any) => s.case_id as string)
  const thumbs = new Map<string, string>()
  if (caseIds.length) {
    const { data: photos } = await admin
      .from('case_photos')
      .select('case_id, url, kind, display_order')
      .in('case_id', caseIds)
      .order('display_order')
    for (const p of (photos || []) as Array<{ case_id: string; url: string; kind: string }>) {
      if (!thumbs.has(p.case_id) || p.kind === 'before' || p.kind === 'after') {
        thumbs.set(p.case_id, p.url)
      }
    }
  }

  const cards: SavedCard[] = (saves || []).map((s: any) => ({
    case_id: s.case_id,
    saved_at: s.created_at,
    case: s.cases,
    thumb: thumbs.get(s.case_id) ?? null,
  }))

  return (
    <NationalShell badge="Saved">
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px 64px' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, color: '#0F1923', marginBottom: 6 }}>
            My saved cases
          </h1>
          <p style={{ fontSize: 13, color: '#64748B' }}>
            {cards.length} bookmarked case{cards.length === 1 ? '' : 's'}. Only you can see this list.
          </p>
        </header>

        {cards.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>☆</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0F1923', marginBottom: 6 }}>Nothing saved yet.</p>
            <p style={{ fontSize: 13, color: '#64748B' }}>
              Hit the ☆ button on any case to bookmark it here. <Link href="/cases" style={{ color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>Browse cases →</Link>
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {cards.filter(c => c.case).map(c => {
              const spec = getSpecialty(c.case!.specialty)
              return (
                <Link key={c.case_id} href={`/cases/${c.case_id}`} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', textDecoration: 'none', color: '#0F1923', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ width: '100%', aspectRatio: '4 / 3', background: '#F1F5F9', overflow: 'hidden' }}>
                    {c.thumb ? <img src={c.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#CBD5E1', fontSize: 32 }}>🦷</div>}
                  </div>
                  <div style={{ padding: 14, flex: 1 }}>
                    {spec && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 8px', background: spec.bg, color: spec.color, borderRadius: 999 }}>{spec.label}</span>}
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#0F1923', marginTop: 6, lineHeight: 1.3 }}>{c.case!.title}</h3>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>Saved {new Date(c.saved_at).toLocaleDateString('en-IN')}</div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </NationalShell>
  )
}
