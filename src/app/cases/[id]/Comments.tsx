'use client'

// Comments section for /cases/[id]. Renders server-fetched initial
// comments and lets verified dentists add / delete their own. Author
// metadata (name, city, specialty) is included with each comment so
// the avatar block can render without extra fetches.

import { useState } from 'react'
import { getSpecialty } from '@/lib/dentalSpecialties'
import { CITY_CONFIGS } from '@/config/cities'

interface Comment {
  id: string
  content: string
  created_at: string
  dentist_id: string
  dentist?: {
    name: string
    slug: string
    city: string | null
    specialties: string[] | null
    is_verified: boolean | null
  } | null
}

interface Props {
  caseId: string
  initialComments: Comment[]
  /** undefined if the visitor isn't signed in. */
  currentDentist?: { id: string; is_verified: boolean }
  discussionEnabled: boolean
}

export default function Comments({ caseId, initialComments, currentDentist, discussionEnabled }: Props) {
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setPosting(true); setErr('')
    try {
      const res = await fetch(`/api/cases/${caseId}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) { setErr(data?.error || 'Could not post'); setPosting(false); return }
      // Append optimistically with the server-stamped id + timestamp.
      // We don't have full dentist metadata for the new row, so we
      // synthesise the minimum needed for the row to render until the
      // page is refreshed.
      setComments(prev => [...prev, { ...data.comment, dentist: prev[0]?.dentist ?? null }])
      setContent('')
    } catch { setErr('Network error') }
    setPosting(false)
  }

  async function remove(id: string) {
    if (!confirm('Delete this comment?')) return
    const res = await fetch(`/api/case-comments/${id}`, { method: 'DELETE' })
    if (!res.ok) { setErr('Could not delete'); return }
    setComments(prev => prev.filter(c => c.id !== id))
  }

  return (
    <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, marginTop: 18 }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, color: '#0F1923', marginBottom: 14 }}>
        Discussion <span style={{ color: '#94A3B8', fontWeight: 600 }}>· {comments.length}</span>
      </h2>

      {comments.length === 0 ? (
        <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16, fontStyle: 'italic' }}>
          No comments yet. {discussionEnabled ? 'Be the first to weigh in.' : ''}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 18 }}>
          {comments.map(c => {
            const cfg = c.dentist?.city ? (CITY_CONFIGS as any)[c.dentist.city] : null
            const primarySpec = c.dentist?.specialties?.[0]
            const initials = c.dentist?.name?.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'D'
            const isOwn = currentDentist?.id === c.dentist_id
            return (
              <li key={c.id} style={{ display: 'flex', gap: 12 }}>
                <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    {c.dentist?.slug
                      ? <a href={`/professional/${c.dentist.slug}`} style={{ fontSize: 13, fontWeight: 700, color: '#0F1923', textDecoration: 'none' }}>Dr. {c.dentist.name}</a>
                      : <span style={{ fontSize: 13, fontWeight: 700, color: '#0F1923' }}>Dr. {c.dentist?.name || 'Unknown'}</span>}
                    {c.dentist?.is_verified && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', background: '#DCFCE7', color: '#166534', borderRadius: 999 }}>✓</span>}
                    {cfg && <span style={{ fontSize: 10, color: '#94A3B8' }}>· {cfg.cityName}</span>}
                    {primarySpec && <span style={{ fontSize: 10, color: '#94A3B8' }}>· {primarySpec}</span>}
                    <span style={{ fontSize: 10, color: '#94A3B8', marginLeft: 'auto' }}>{new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{c.content}</p>
                  {isOwn && (
                    <button type="button" onClick={() => remove(c.id)} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 11, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', marginTop: 4, padding: 0 }}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {!discussionEnabled ? (
        <div style={{ background: '#F8FAFC', border: '1px dashed #E2E8F0', borderRadius: 10, padding: '14px 16px', fontSize: 12, color: '#64748B' }}>
          The author has disabled discussion on this case.
        </div>
      ) : !currentDentist ? (
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#1D4ED8' }}>
          <a href={`/for-dentists/login?next=/cases/${caseId}`} style={{ color: '#1D4ED8', fontWeight: 700, textDecoration: 'none' }}>Sign in</a> as a verified dentist to join the discussion.
        </div>
      ) : !currentDentist.is_verified ? (
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#92400E' }}>
          Only MCI-verified dentists can comment. Get verified on your city dashboard to join the discussion.
        </div>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="new-comment" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>Add a comment</label>
          <textarea id="new-comment" rows={3} value={content} onChange={e => setContent(e.target.value)}
            placeholder="Constructive clinical feedback only. No promotion."
            style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', minHeight: 80 }} />
          {err && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6, fontWeight: 600 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="submit" disabled={posting || !content.trim()}
              style={{ padding: '9px 18px', minHeight: 40, background: posting || !content.trim() ? '#CBD5E1' : '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, cursor: posting ? 'wait' : 'pointer' }}>
              {posting ? 'Posting…' : 'Post comment'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
