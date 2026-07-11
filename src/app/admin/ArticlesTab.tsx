'use client'

// Admin article review queue. Self-contained tab (like VisitLogsTab): fetches
// /api/admin/articles on mount, shows pending first, and lets an admin
// preview, approve, or reject each article. Approve → published; reject
// requires a reason that's shown back to the dentist inline on their side.

import { useCallback, useEffect, useState } from 'react'
import { sanitizeArticleHtml, topicLabel } from '@/lib/articles'

type AdminArticle = {
  id: string
  title: string
  slug: string
  content: string
  topic_type: string
  status: 'pending' | 'published' | 'rejected' | string
  rejection_reason: string | null
  published_at: string | null
  created_at: string
  dentists: {
    id: string
    name: string | null
    clinic_name: string | null
    slug: string
    city: string | null
    areas: { name: string | null } | null
  } | null
}

const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16,
  boxShadow: '0 4px 12px rgba(15,25,35,0.04), 0 1px 3px rgba(15,25,35,0.06)', overflow: 'auto',
}
const th: React.CSSProperties = { textAlign: 'left', padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, borderTop: '1px solid var(--border)', verticalAlign: 'top' }

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: '#FEF3C7', color: '#92400E', label: 'Pending' },
  published: { bg: '#DCFCE7', color: '#166534', label: 'Published' },
  rejected:  { bg: '#FEE2E2', color: '#991B1B', label: 'Rejected' },
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ArticlesTab() {
  const [articles, setArticles] = useState<AdminArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<AdminArticle | null>(null)
  const [rejectTarget, setRejectTarget] = useState<AdminArticle | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/articles', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Failed to load articles.'); setArticles([]) }
      else setArticles(data.articles || [])
    } catch {
      setError('Network error loading articles.'); setArticles([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function act(id: string, body: any) {
    setBusy(id); setError(null)
    try {
      const res = await fetch('/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { setError(data?.error || 'Action failed.'); return false }
      await load()
      return true
    } catch {
      setError('Network error.'); return false
    } finally {
      setBusy(null)
    }
  }

  async function approve(a: AdminArticle) { await act(a.id, { action: 'approve' }) }

  async function confirmReject() {
    if (!rejectTarget) return
    const ok = await act(rejectTarget.id, { action: 'reject', rejection_reason: rejectReason.trim() })
    if (ok) { setRejectTarget(null); setRejectReason('') }
  }

  const pendingCount = articles.filter(a => a.status === 'pending').length

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 4 }}>Articles</h1>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
        {pendingCount > 0 ? `${pendingCount} article${pendingCount === 1 ? '' : 's'} awaiting review` : 'No articles awaiting review'}
      </p>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>{error}</div>
      )}

      <div style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              {['Title', 'Dentist', 'Clinic', 'Area', 'Submitted', 'Status', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td style={td} colSpan={7}>Loading…</td></tr>
            ) : articles.length === 0 ? (
              <tr><td style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: 40 }} colSpan={7}>No articles yet.</td></tr>
            ) : articles.map(a => {
              const s = STATUS_STYLE[a.status] || { bg: 'var(--bg)', color: 'var(--muted)', label: a.status }
              const d = a.dentists
              return (
                <tr key={a.id}>
                  <td style={{ ...td, maxWidth: 240 }}>
                    <div style={{ fontWeight: 600 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{topicLabel(a.topic_type)}</div>
                    {a.status === 'rejected' && a.rejection_reason && (
                      <div style={{ fontSize: 11, color: '#991B1B', marginTop: 4 }}>Reason: {a.rejection_reason}</div>
                    )}
                  </td>
                  <td style={td}>{d?.name || '—'}</td>
                  <td style={td}>{d?.clinic_name || '—'}</td>
                  <td style={td}>{d?.areas?.name || '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(a.created_at)}</td>
                  <td style={td}><span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{s.label}</span></td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => setPreview(a)} style={btnStyle('#EFF6FF', '#1D4ED8', '#BFDBFE')}>Preview</button>
                      {a.status !== 'published' && (
                        <button disabled={busy === a.id} onClick={() => approve(a)} style={btnStyle('#DCFCE7', '#166534', '#BBF7D0')}>{busy === a.id ? '…' : 'Approve'}</button>
                      )}
                      {a.status !== 'rejected' && (
                        <button disabled={busy === a.id} onClick={() => { setRejectTarget(a); setRejectReason('') }} style={btnStyle('#FEE2E2', '#991B1B', '#FECACA')}>Reject</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Preview modal */}
      {preview && (
        <Modal onClose={() => setPreview(null)}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{topicLabel(preview.topic_type)}</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22, marginBottom: 6 }}>{preview.title}</h2>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
            By {preview.dentists?.name || '—'} · {preview.dentists?.clinic_name || '—'}
          </div>
          <div
            style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text)' }}
            dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(preview.content) }}
          />
          <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {preview.status !== 'published' && (
              <button disabled={busy === preview.id} onClick={async () => { await approve(preview); setPreview(null) }} style={{ ...btnStyle('#DCFCE7', '#166534', '#BBF7D0'), padding: '9px 16px' }}>Approve &amp; Publish</button>
            )}
            <button onClick={() => setPreview(null)} style={{ ...btnStyle('#F1F5F9', '#475569', '#E2E8F0'), padding: '9px 16px' }}>Close</button>
          </div>
        </Modal>
      )}

      {/* Reject reason modal */}
      {rejectTarget && (
        <Modal onClose={() => setRejectTarget(null)}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Reject article</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>The dentist will see this reason so they can revise and resubmit.</p>
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="e.g. Please remove the specific price you mentioned, and expand the closing paragraph."
            rows={4}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical' }}
          />
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setRejectTarget(null)} style={{ ...btnStyle('#F1F5F9', '#475569', '#E2E8F0'), padding: '9px 16px' }}>Cancel</button>
            <button
              disabled={!rejectReason.trim() || busy === rejectTarget.id}
              onClick={confirmReject}
              style={{ ...btnStyle('#FEE2E2', '#991B1B', '#FECACA'), padding: '9px 16px', opacity: rejectReason.trim() ? 1 : 0.5 }}
            >
              {busy === rejectTarget.id ? 'Rejecting…' : 'Reject article'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function btnStyle(bg: string, color: string, border: string): React.CSSProperties {
  return { padding: '5px 12px', background: bg, color, border: `1px solid ${border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,25,35,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 640, width: '100%', boxShadow: '0 25px 60px rgba(0,0,0,0.18)' }}
      >
        {children}
      </div>
    </div>
  )
}
