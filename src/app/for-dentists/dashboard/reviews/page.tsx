// Dentist "Reviews" page: every review patients left, live and waiting for
// our check, with a reply box on live ones. Rejected reviews are not shown.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveCurrentDentist } from '@/lib/currentDentist'
import { getCityBySlug } from '@/config/cities'
import { NAVY, TEAL_DARK } from '@/app/dentist/[slug]/profileTheme'
import RequestReviewCard from '../RequestReviewCard'
import ReplyBox from './ReplyBox'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  patient_name: string | null
  rating: number
  review_text: string | null
  treatment: string | null
  status: string
  created_at: string
  tags?: string[] | null
  verified_visit?: boolean | null
  dentist_reply?: string | null
}

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z'

function Stars({ n }: { n: number }) {
  return (
    <span role="img" aria-label={`${n} out of 5 stars`} style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} fill={i <= n ? '#F59E0B' : '#E2E8F0'} /></svg>
      ))}
    </span>
  )
}

export default async function DentistReviewsPage() {
  const supabase = await createClient()
  const dentist = await resolveCurrentDentist<{ id: string; name: string | null; clinic_name: string | null; slug: string | null; city: string | null; avg_rating: number | null }>(
    supabase, 'id, name, clinic_name, slug, city, avg_rating',
  )
  if (!dentist) redirect('/for-dentists/login')

  const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const base = 'id, patient_name, rating, review_text, treatment, status, created_at'
  let { data, error } = await db
    .from('reviews')
    .select(`${base}, tags, verified_visit, dentist_reply`)
    .eq('dentist_id', dentist.id)
    .in('status', ['approved', 'pending'])
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    // New columns not added yet: show the reviews without them.
    ({ data, error } = await db
      .from('reviews')
      .select(base)
      .eq('dentist_id', dentist.id)
      .in('status', ['approved', 'pending'])
      .order('created_at', { ascending: false })
      .limit(200) as any)
  }
  const rows = (data ?? []) as Row[]
  const live = rows.filter(r => r.status === 'approved')
  const waiting = rows.filter(r => r.status === 'pending')
  const canReply = dentist.__staffRole !== 'reception'

  const city = getCityBySlug(dentist.city)
  const profileUrl = dentist.slug ? `https://${city.domain}/dentist/${dentist.slug}` : ''
  const avg = Number(dentist.avg_rating) || (live.length ? live.reduce((s, r) => s + r.rating, 0) / live.length : 0)

  const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', display: 'grid', gap: 8 }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 800, color: NAVY }}>Patient reviews</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Shown on your public profile after a quick check by the DentistIn team.
          </p>
        </div>
        {profileUrl && <Link href={`${profileUrl}#reviews`} target="_blank" style={{ fontSize: 13, fontWeight: 700, color: TEAL_DARK, textDecoration: 'none' }}>See on your profile</Link>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 8px' }}>
        {[
          { v: avg ? avg.toFixed(1) : '–', l: 'your rating' },
          { v: String(live.length), l: 'live' },
          { v: String(waiting.length), l: 'being checked' },
        ].map(s => (
          <div key={s.l} style={{ textAlign: 'center' }}>
            <b style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 800 }}>{s.v}</b>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{s.l}</span>
          </div>
        ))}
      </div>

      {profileUrl && <RequestReviewCard profileUrl={profileUrl} clinicName={dentist.clinic_name || dentist.name || ''} dentistName={dentist.name || ''} />}

      {rows.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '28px 16px', color: 'var(--muted)', fontSize: 14 }}>
          No reviews yet. Mark visits Done in Appointments and patients get a review link on WhatsApp automatically, or ask a patient above.
        </div>
      )}

      {rows.map(r => (
        <article key={r.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ display: 'grid', gap: 2 }}>
              <b style={{ fontSize: 15 }}>{r.patient_name || 'Verified patient'}</b>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {[r.treatment, new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')}
              </span>
            </div>
            <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
              <Stars n={r.rating} />
              {r.status === 'pending' && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#FEF3C7', color: '#92400E' }}>Being checked</span>}
            </div>
          </div>
          {r.verified_visit && <span style={{ fontSize: 12, fontWeight: 600, color: TEAL_DARK }}>Verified visit</span>}
          {r.review_text && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#334155' }}>{r.review_text}</p>}
          {r.tags && r.tags.length > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.tags.join(' · ')}</span>}
          {r.status === 'approved' && 'dentist_reply' in r && (
            canReply
              ? <ReplyBox reviewId={r.id} initialReply={r.dentist_reply ?? ''} />
              : r.dentist_reply ? <p style={{ margin: 0, fontSize: 13, background: '#F1F5F9', borderRadius: 10, padding: '10px 12px' }}><b>Your reply:</b> {r.dentist_reply}</p> : null
          )}
        </article>
      ))}
    </div>
  )
}
