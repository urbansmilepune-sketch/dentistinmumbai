'use client'

// My Articles — the dentist's list of submitted articles with status.
//   Pending review (amber) · Published (green, links to the live page) ·
//   Rejected (red, shows the reason inline so they can fix and resubmit).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { topicLabel } from '@/lib/articles'

type Article = {
  id: string
  title: string
  slug: string
  topic_type: string
  status: 'pending' | 'published' | 'rejected' | string
  rejection_reason: string | null
  published_at: string | null
  created_at: string
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: '#FEF3C7', color: '#92400E', label: 'Pending review' },
  published: { bg: '#DCFCE7', color: '#166534', label: 'Published' },
  rejected:  { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ArticlesListPage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [dentistSlug, setDentistSlug] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/dentist/articles', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!active) return
        if (!res.ok) { setError(data?.error || 'Could not load your articles.'); return }
        setArticles(data.articles || [])
        setDentistSlug(data.dentistSlug || '')
      } catch {
        if (active) setError('Network error loading your articles.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 4 }}>My Articles</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)' }}>Patient-education articles you&apos;ve written. Published ones appear on your public profile.</p>
        </div>
        <Link href="/for-dentists/dashboard/articles/new" style={{ padding: '11px 18px', background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          + Write Article
        </Link>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading…</div>
      ) : articles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', border: '1px solid var(--border)', borderRadius: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✍️</div>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No articles yet</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Write your first patient-education article — the AI can draft it for you in seconds.</p>
          <Link href="/for-dentists/dashboard/articles/new" style={{ padding: '11px 20px', background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Write your first article</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {articles.map(a => {
            const s = STATUS_STYLE[a.status] || { bg: 'var(--bg)', color: 'var(--muted)', label: a.status }
            const liveUrl = dentistSlug ? `/dentist/${dentistSlug}/articles/${a.slug}` : null
            return (
              <div key={a.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{topicLabel(a.topic_type)}</div>
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{a.title}</h3>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {a.status === 'published' && a.published_at ? `Published ${fmtDate(a.published_at)}` : `Submitted ${fmtDate(a.created_at)}`}
                    </div>
                  </div>
                  <span style={{ background: s.bg, color: s.color, padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{s.label}</span>
                </div>

                {a.status === 'rejected' && a.rejection_reason && (
                  <div style={{ marginTop: 12, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#991B1B' }}>
                    <strong>Reason:</strong> {a.rejection_reason}
                  </div>
                )}

                {a.status === 'published' && liveUrl && (
                  <div style={{ marginTop: 12 }}>
                    <a href={liveUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
                      View live article →
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
