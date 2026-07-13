import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import NationalShell from '@/components/national/NationalShell'
import { getSpecialty } from '@/lib/dentalSpecialties'
import ReportButton from './ReportButton'
import LikeButton from './LikeButton'
import SaveButton from './SaveButton'
import Comments from './Comments'
import ShareButton from '@/components/national/ShareButton'
import { NATIONAL_ORIGIN } from '@/config/cities'

export const dynamic = 'force-dynamic'

// Service role used here because case_photos has RLS that defers to the
// parent case's status; anon clients only see photos for approved cases,
// which is exactly what /cases/[id] needs in the public-read path. But
// when the owner is viewing their own pending case we need to bypass
// that gate too, and the cleanest way is to fetch with the admin client
// and re-check authorization in code.

interface CaseRow {
  id: string
  dentist_id: string
  title: string
  specialty: string
  complexity: number
  description: string | null
  materials: string[] | null
  cost_min: number | null
  cost_max: number | null
  duration_weeks: number | null
  clinical_notes: string | null
  is_private_notes: boolean
  discussion_enabled: boolean
  status: string
  view_count: number
  like_count: number
  comment_count: number
  created_at: string
  // Structured patient-case template — nullable/optional because they're
  // added to the DB out-of-band; a pre-migration row simply omits them.
  patient_age: number | null
  patient_gender: string | null
  chief_complaint: string | null
  medical_history: string | null
  diagnosis: string | null
  treatment_plan_detail: string | null
  num_sittings: number | null
  outcome_summary: string | null
  key_learning: string | null
  patient_satisfaction: string | null
  dentists: {
    name: string
    slug: string
    clinic_name: string | null
    city: string | null
    email: string
    is_verified: boolean | null
  } | null
}

interface PhotoRow {
  id: string
  url: string
  kind: 'before' | 'after' | 'xray_before' | 'xray_after'
  caption: string | null
  display_order: number
}

const KIND_LABEL: Record<PhotoRow['kind'], string> = {
  before: 'Before',
  after: 'After',
  xray_before: 'X-ray · Before',
  xray_after: 'X-ray · After',
}

async function loadCase(id: string): Promise<{ row: CaseRow; photos: PhotoRow[] } | null> {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const [{ data: row }, { data: photos }] = await Promise.all([
    // Select `*` so the query never 400s on the structured-template columns
    // before their out-of-band migration lands; embed the dentist join.
    admin.from('cases')
      .select('*, dentists(name, slug, clinic_name, city, email, is_verified)')
      .eq('id', id).single(),
    admin.from('case_photos').select('id, url, kind, caption, display_order').eq('case_id', id).order('display_order'),
  ])
  if (!row) return null
  return { row: row as unknown as CaseRow, photos: (photos || []) as PhotoRow[] }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const data = await loadCase(id)
  if (!data || data.row.status !== 'approved') {
    return { title: 'Case | Dentist In India', robots: { index: false, follow: false } }
  }
  const spec = getSpecialty(data.row.specialty)
  const dentistName = data.row.dentists?.name ?? 'an State Dental Council-verified dentist'
  const ogTitle = `${data.row.title} by Dr. ${dentistName}`
  const ogDescription = data.row.description?.slice(0, 160)
    || `${spec?.label || 'Clinical case'} · ${'★'.repeat(data.row.complexity)} complexity · Shared on DentistIn India`
  // Prefer a clinical (before/after) photo for the share preview; fall
  // back to whatever photo is first. Photo URLs are already absolute
  // (Supabase storage), so they work directly as og:image.
  const ogPhoto = data.photos.find(p => p.kind === 'before' || p.kind === 'after') || data.photos[0]
  const ogImage = ogPhoto?.url
  const ogUrl = `${NATIONAL_ORIGIN}/cases/${data.row.id}`
  return {
    title: `${data.row.title} | Dentist In India`,
    description: ogDescription,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: ogUrl,
      siteName: 'Dentist In India',
      type: 'article',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDescription,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await loadCase(id)
  if (!data) notFound()

  // Authorization: approved cases are public; non-approved are visible
  // only to the owning dentist. Anyone else gets a 404 — same response
  // shape as a non-existent case so a rejected/pending case can't be
  // enumerated by ID.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isOwner = user?.email && data.row.dentists?.email && user.email.toLowerCase() === data.row.dentists.email.toLowerCase()
  if (data.row.status !== 'approved' && !isOwner) notFound()

  // ── Social context ──────────────────────────────────────────────────
  // Look up the signed-in dentist's id once, then fan out: my-like,
  // my-save, comments thread. We use the service role for comments
  // because the GET endpoint joins author rows that anon can't read
  // when the case is pending (owner preview case). All fan-outs are
  // best-effort — if any one fails we just render zero state for that
  // section rather than failing the whole page.
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let currentDentist: { id: string; is_verified: boolean } | undefined
  let myLiked = false
  let mySaved = false
  if (user?.email) {
    const { data: d } = await supabase
      .from('dentists').select('id, is_verified').eq('email', user.email).single()
    if (d) {
      currentDentist = { id: d.id, is_verified: !!d.is_verified }
      const [{ data: likeRow }, { data: saveRow }] = await Promise.all([
        adminClient.from('case_likes').select('id').eq('case_id', data.row.id).eq('dentist_id', d.id).maybeSingle(),
        adminClient.from('case_saves').select('id').eq('case_id', data.row.id).eq('dentist_id', d.id).maybeSingle(),
      ])
      myLiked = !!likeRow
      mySaved = !!saveRow
    }
  }

  const { data: commentsRows } = await adminClient
    .from('case_comments')
    .select('id, content, created_at, dentist_id, dentist:dentist_id(name, slug, city, specialties, is_verified)')
    .eq('case_id', data.row.id)
    .order('created_at', { ascending: true })
    .limit(200)

  // Bump view_count for every load on an approved case. Fire-and-forget
  // — view counts only matter for the trending algorithm, so a missed
  // bump on a transient error is fine. We don't await the response.
  if (data.row.status === 'approved') {
    adminClient.from('cases').update({ view_count: (data.row.view_count || 0) + 1 }).eq('id', data.row.id).then(() => {})
  }

  const spec = getSpecialty(data.row.specialty)
  const before    = data.photos.filter(p => p.kind === 'before')
  const after     = data.photos.filter(p => p.kind === 'after')
  const xrayBefore = data.photos.filter(p => p.kind === 'xray_before')
  const xrayAfter  = data.photos.filter(p => p.kind === 'xray_after')

  const showClinicalNotes = !data.row.is_private_notes || isOwner
  const costLine = data.row.cost_min || data.row.cost_max
    ? `₹${(data.row.cost_min ?? 0).toLocaleString('en-IN')}${data.row.cost_max && data.row.cost_max !== data.row.cost_min ? ' – ₹' + data.row.cost_max.toLocaleString('en-IN') : ''}`
    : null

  return (
    <NationalShell badge="Case">
      <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 20px 64px' }}>
        {/* Status banner for owner-only views */}
        {isOwner && data.row.status !== 'approved' && (
          <div style={{ background: data.row.status === 'rejected' ? '#FEE2E2' : '#FEF3C7', border: `1px solid ${data.row.status === 'rejected' ? '#FECACA' : '#FDE68A'}`, color: data.row.status === 'rejected' ? '#991B1B' : '#92400E', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, fontWeight: 600 }}>
            {data.row.status === 'rejected' ? 'This case was not approved.' : 'This case is in admin moderation — only you can see it for now.'}
          </div>
        )}

        {/* Header */}
        <header style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {spec && (
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '4px 10px', background: spec.bg, color: spec.color, borderRadius: 999 }}>
                {spec.label}
              </span>
            )}
            <span style={{ fontSize: 11, color: '#64748B' }}>
              {'★'.repeat(data.row.complexity)}<span style={{ color: '#CBD5E1' }}>{'★'.repeat(5 - data.row.complexity)}</span>
              <span style={{ marginLeft: 6 }}>{data.row.complexity}/5 complexity</span>
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 32, lineHeight: 1.2, color: '#0F1923', marginBottom: 12 }}>
            {data.row.title}
          </h1>
          {data.row.dentists && (
            <div style={{ fontSize: 14, color: '#475569', marginBottom: 16 }}>
              By{' '}
              <Link href={`/professional/${data.row.dentists.slug}`} style={{ color: '#1D4ED8', textDecoration: 'none', fontWeight: 600 }}>
                Dr. {data.row.dentists.name}
              </Link>
              {data.row.dentists.clinic_name && <> · {data.row.dentists.clinic_name}</>}
              {data.row.dentists.is_verified && <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', background: '#DCFCE7', color: '#166534', borderRadius: 999, fontWeight: 700 }}>✓ Verified</span>}
            </div>
          )}
          {/* Social actions — only for approved cases so a pending case's
              owner preview doesn't get like/save buttons that would write
              against an unpublishable row. */}
          {data.row.status === 'approved' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <LikeButton
                caseId={data.row.id}
                initialLiked={myLiked}
                initialCount={data.row.like_count || 0}
                signedIn={!!user?.email}
              />
              <SaveButton
                caseId={data.row.id}
                initialSaved={mySaved}
                signedIn={!!user?.email}
              />
              <ShareButton
                caseId={data.row.id}
                caseTitle={data.row.title}
                dentistName={data.row.dentists?.name || 'a verified dentist'}
                dentistId={data.row.dentist_id}
              />
            </div>
          )}
        </header>

        {/* Structured patient-case template — each block self-hides when it
            has no data, so older cases (and pre-migration rows) still render
            cleanly. Order: intro → pre-op imaging → plan → post-op imaging →
            conclusion. */}
        <PatientIntroCard row={data.row} />
        <PhotoGroup title="Before Treatment — Clinical Photos" rows={before} />
        <PhotoGroup title="Pre-Treatment X-Ray / OPG" rows={xrayBefore} />
        <DiagnosisCard row={data.row} />
        <PhotoGroup title="After Treatment — Clinical Photos" rows={after} />
        <PhotoGroup title="Post-Treatment X-Ray / OPG" rows={xrayAfter} />
        <ConclusionCard row={data.row} />

        {/* Description */}
        {data.row.description && (
          <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, marginBottom: 18 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0F1923', marginBottom: 10 }}>Treatment</h2>
            <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{data.row.description}</p>
          </section>
        )}

        {/* Logistics */}
        {(costLine || data.row.duration_weeks) && (
          <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, marginBottom: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18 }}>
            {costLine && (
              <Fact label="Total cost" value={costLine} />
            )}
            {data.row.duration_weeks && (
              <Fact label="Treatment duration" value={`${data.row.duration_weeks} week${data.row.duration_weeks === 1 ? '' : 's'}`} />
            )}
          </section>
        )}

        {/* Materials */}
        {data.row.materials && data.row.materials.length > 0 && (
          <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, marginBottom: 18 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: '#0F1923', marginBottom: 12 }}>Materials used</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {data.row.materials.map(m => (
                <span key={m} style={{ fontSize: 12, padding: '4px 10px', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 999, fontWeight: 600 }}>{m}</span>
              ))}
            </div>
          </section>
        )}

        {/* Clinical notes */}
        {data.row.clinical_notes && showClinicalNotes && (
          <section style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 14, padding: 24, marginBottom: 18 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: '#0F1923', marginBottom: 10 }}>
              Clinical notes
              {data.row.is_private_notes && (
                <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', background: '#FEF3C7', color: '#92400E', borderRadius: 999, fontWeight: 700 }}>Private</span>
              )}
            </h2>
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{data.row.clinical_notes}</p>
          </section>
        )}

        {/* Discussion — only when the case is approved AND the author
            opted in. The Comments component renders its own empty /
            verify-needed / sign-in states. */}
        {data.row.status === 'approved' && (
          <Comments
            caseId={data.row.id}
            initialComments={(commentsRows as any) || []}
            currentDentist={currentDentist}
            discussionEnabled={data.row.discussion_enabled}
          />
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>
            Posted {new Date(data.row.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <ReportButton caseId={data.row.id} signedIn={!!user?.email} />
        </div>
      </main>
    </NationalShell>
  )
}

// Card + heading styles shared by the structured-template sections and the
// photo groups (module scope so the helper components below can use them).
const templateCardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, marginBottom: 18,
}
const templateHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0F1923', marginBottom: 14,
}

// A single photo group (one kind), rendered only when it has photos. Each
// image shows its caption underneath.
function PhotoGroup({ title, rows }: { title: string; rows: PhotoRow[] }) {
  if (rows.length === 0) return null
  return (
    <section style={templateCardStyle}>
      <h2 style={{ ...templateHeadingStyle, fontSize: 16, marginBottom: 12 }}>{title}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {rows.map(r => (
          <figure key={r.id} style={{ margin: 0 }}>
            <img src={r.url} alt={r.caption || title} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 10, border: '1px solid #E2E8F0' }} />
            {r.caption && <figcaption style={{ fontSize: 12, color: '#64748B', marginTop: 6, lineHeight: 1.5 }}>{r.caption}</figcaption>}
          </figure>
        ))}
      </div>
    </section>
  )
}

function LabeledText({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{text}</p>
    </div>
  )
}

// Section 1 — patient introduction (👤). Hidden entirely when empty.
function PatientIntroCard({ row }: { row: CaseRow }) {
  if (!row.patient_age && !row.patient_gender && !row.chief_complaint && !row.medical_history) return null
  const hasText = !!(row.chief_complaint || row.medical_history)
  return (
    <section style={templateCardStyle}>
      <h2 style={templateHeadingStyle}>👤 Patient introduction</h2>
      {(row.patient_age || row.patient_gender) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 18, marginBottom: hasText ? 18 : 0 }}>
          {row.patient_age ? <Fact label="Age" value={`${row.patient_age} years`} /> : null}
          {row.patient_gender ? <Fact label="Gender" value={row.patient_gender} /> : null}
        </div>
      )}
      {row.chief_complaint && <LabeledText label="Chief complaint" text={row.chief_complaint} />}
      {row.medical_history && <LabeledText label="Medical history" text={row.medical_history} />}
    </section>
  )
}

// Section 3 — diagnosis & treatment plan (🔬).
function DiagnosisCard({ row }: { row: CaseRow }) {
  if (!row.diagnosis && !row.treatment_plan_detail && !row.num_sittings) return null
  return (
    <section style={templateCardStyle}>
      <h2 style={templateHeadingStyle}>🔬 Diagnosis &amp; treatment plan</h2>
      {row.diagnosis && <LabeledText label="Diagnosis" text={row.diagnosis} />}
      {row.treatment_plan_detail && <LabeledText label="Treatment plan" text={row.treatment_plan_detail} />}
      {row.num_sittings ? <Fact label="Number of sittings" value={String(row.num_sittings)} /> : null}
    </section>
  )
}

const SATISFACTION_BADGE: Record<string, { bg: string; color: string }> = {
  'Excellent':          { bg: '#DCFCE7', color: '#166534' },
  'Good':               { bg: '#DBEAFE', color: '#1D4ED8' },
  'Satisfactory':       { bg: '#FEF3C7', color: '#92400E' },
  'Requires follow-up': { bg: '#FEE2E2', color: '#991B1B' },
}

// Section 5 — dentist conclusion (✅), with a colour-coded satisfaction badge.
function ConclusionCard({ row }: { row: CaseRow }) {
  if (!row.outcome_summary && !row.key_learning && !row.patient_satisfaction) return null
  const badge = row.patient_satisfaction ? SATISFACTION_BADGE[row.patient_satisfaction] : undefined
  const hasText = !!(row.outcome_summary || row.key_learning)
  return (
    <section style={templateCardStyle}>
      <h2 style={templateHeadingStyle}>✅ Dentist conclusion</h2>
      {row.patient_satisfaction && (
        <div style={{ marginBottom: hasText ? 16 : 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 999, background: badge?.bg ?? '#F1F5F9', color: badge?.color ?? '#475569' }}>
            Patient satisfaction: {row.patient_satisfaction}
          </span>
        </div>
      )}
      {row.outcome_summary && <LabeledText label="Outcome summary" text={row.outcome_summary} />}
      {row.key_learning && <LabeledText label="Key learning" text={row.key_learning} />}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, color: '#0F1923', fontWeight: 700 }}>{value}</div>
    </div>
  )
}
