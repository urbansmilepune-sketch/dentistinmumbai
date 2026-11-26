import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import NationalShell from '@/components/national/NationalShell'
import { adminDb, getViewerDentist, ui } from '@/lib/national'
import { getSpecialty } from '@/lib/dentalSpecialties'
import DeleteDraft from './DeleteDraft'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'My case drafts | DentistIn India',
  robots: { index: false, follow: false },
}

// /cases/drafts — the signed-in dentist's unfinished cases: drafts saved from
// the case form (case_drafts) plus cases started on WhatsApp that were never
// submitted (whatsapp_case_drafts, last 7 days). Only the owner sees this.

interface Row {
  id: string
  source: 'form' | 'whatsapp'
  title: string
  specialty: string | null
  thumb: string | null
  photoCount: number
  updatedAt: string
  href: string
}

export default async function CaseDraftsPage() {
  const viewer = await getViewerDentist()
  if (!viewer) redirect('/for-dentists/login?next=/cases/drafts')
  if (!viewer.is_active) redirect('/for-dentists/pending')

  const db = adminDb()
  // Either table may be missing on a fresh DB; then that list is just empty.
  const [{ data: saved }, { data: wa }] = await Promise.all([
    db.from('case_drafts').select('id, title, data, updated_at')
      .eq('dentist_id', viewer.id).order('updated_at', { ascending: false }).limit(100),
    db.from('whatsapp_case_drafts').select('id, photo_urls, note, created_at')
      .eq('dentist_id', viewer.id).is('used_at', null)
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('created_at', { ascending: false }).limit(20),
  ])

  const rows: Row[] = [
    ...((saved || []) as Array<Record<string, any>>).map(d => {
      const photos = Array.isArray(d.data?.photos) ? d.data.photos : []
      return {
        id: d.id, source: 'form' as const,
        title: d.title || 'Untitled case',
        specialty: typeof d.data?.specialty === 'string' ? d.data.specialty : null,
        thumb: photos[0]?.url ?? null, photoCount: photos.length,
        updatedAt: d.updated_at, href: `/cases/new?draft=${d.id}`,
      }
    }),
    ...((wa || []) as Array<Record<string, any>>)
      .filter(d => Array.isArray(d.photo_urls) && d.photo_urls.length > 0)
      .map(d => ({
        id: d.id, source: 'whatsapp' as const,
        title: (d.note || '').replace(/(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}/g, '').trim().slice(0, 80) || 'Case sent on WhatsApp',
        specialty: null, thumb: d.photo_urls[0] ?? null, photoCount: d.photo_urls.length,
        updatedAt: d.created_at, href: `/cases/new?wa=${d.id}`,
      })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <NationalShell badge="Drafts">
      <main style={{ ...ui.page, maxWidth: 880 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <h1 style={ui.h1}>My drafts</h1>
            <p style={ui.sub}>Cases you started but have not posted yet. Only you can see them.</p>
          </div>
          <Link href="/cases/new" style={ui.btn}>Post a case</Link>
        </div>

        {rows.length === 0 ? (
          <div style={{ ...ui.card, padding: 40, textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0F1923', margin: '0 0 6px' }}>No drafts.</p>
            <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>Tap Save draft on the case form to finish a case later.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {rows.map(r => {
              const spec = r.specialty ? getSpecialty(r.specialty) : null
              return (
                <div key={`${r.source}-${r.id}`} style={{ ...ui.card, padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 84, height: 84, flexShrink: 0, borderRadius: 10, overflow: 'hidden', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#CBD5E1', fontSize: 28 }}>
                    {r.thumb ? <img src={r.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : '🦷'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      {r.source === 'whatsapp'
                        ? <span style={ui.pill('#ECFDF5', '#065F46')}>From WhatsApp</span>
                        : <span style={ui.pill('#F1F5F9', '#475569')}>Draft</span>}
                      {spec && <span style={ui.pill(spec.bg, spec.color)}>{spec.label}</span>}
                    </div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, color: '#0F1923', lineHeight: 1.3, wordBreak: 'break-word' }}>{r.title}</div>
                    <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                      {r.photoCount} photo{r.photoCount === 1 ? '' : 's'} · {r.source === 'whatsapp' ? 'Sent' : 'Saved'} {new Date(r.updatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      <Link href={r.href} style={{ ...ui.btn, minHeight: 40, fontSize: 14 }}>Continue and publish</Link>
                      <DeleteDraft id={r.id} source={r.source} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </NationalShell>
  )
}
