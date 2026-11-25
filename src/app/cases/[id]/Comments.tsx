'use client'

// Discussion on /cases/[id] (v1 network). Replies are typed as a
// suggestion, a question or a comment, can be sorted by "most helpful",
// and any dentist except the author can mark a reply helpful. A mark from
// the dentist who posted the case is called out, so the advice that
// actually helped sits on top.

import { useMemo, useState } from 'react'
import { CITY_CONFIGS } from '@/config/cities'
import { drName } from '@/lib/dentistName'

export interface CaseComment {
  id: string
  content: string
  created_at: string
  dentist_id: string
  kind?: string | null
  helpful_count?: number
  viewer_marked?: boolean
  asker_marked?: boolean
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
  caseAuthorId: string
  initialComments: CaseComment[]
  /** undefined if the visitor isn't signed in. */
  currentDentist?: { id: string; is_verified: boolean; name?: string }
  discussionEnabled: boolean
}

type Tab = 'helpful' | 'suggestion' | 'question' | 'all'

const KIND_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  suggestion: { label: 'Suggestion', bg: '#EFF6FF', color: '#1D4ED8' },
  question:   { label: 'Question',   bg: '#FEF3C7', color: '#92400E' },
  comment:    { label: 'Comment',    bg: '#F1F5F9', color: '#334155' },
}

export default function Comments({ caseId, caseAuthorId, initialComments, currentDentist, discussionEnabled }: Props) {
  const [comments, setComments] = useState<CaseComment[]>(initialComments)
  const [tab, setTab] = useState<Tab>('helpful')
  const [content, setContent] = useState('')
  const [kind, setKind] = useState<'suggestion' | 'question' | 'comment'>('suggestion')
  const [posting, setPosting] = useState(false)
  const [err, setErr] = useState('')

  const shown = useMemo(() => {
    const list = comments.slice()
    if (tab === 'suggestion' || tab === 'question') return list.filter(c => (c.kind || 'comment') === tab)
    if (tab === 'helpful') {
      return list.sort((a, b) =>
        (Number(!!b.asker_marked) - Number(!!a.asker_marked)) ||
        ((b.helpful_count || 0) - (a.helpful_count || 0)) ||
        (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
    }
    return list
  }, [comments, tab])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setPosting(true); setErr('')
    try {
      const res = await fetch(`/api/cases/${caseId}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, kind }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) { setErr(data?.error || 'Could not post'); setPosting(false); return }
      setComments(prev => [...prev, {
        ...data.comment, kind: data.comment.kind || kind, helpful_count: 0,
        dentist: { name: currentDentist?.name || 'You', slug: '', city: null, specialties: null, is_verified: currentDentist?.is_verified ?? null },
      }])
      setContent('')
      setTab('all')
    } catch { setErr('Network error') }
    setPosting(false)
  }

  async function toggleHelpful(id: string) {
    setErr('')
    const res = await fetch(`/api/case-comments/${id}/helpful`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.success) { setErr(data?.error || 'Could not save'); return }
    setComments(prev => prev.map(c => c.id === id ? {
      ...c, viewer_marked: data.marked, helpful_count: data.count,
      asker_marked: currentDentist?.id === caseAuthorId ? data.marked : c.asker_marked,
    } : c))
  }

  async function remove(id: string) {
    if (!confirm('Delete this reply?')) return
    const res = await fetch(`/api/case-comments/${id}`, { method: 'DELETE' })
    if (!res.ok) { setErr('Could not delete'); return }
    setComments(prev => prev.filter(c => c.id !== id))
  }

  const chip = (active: boolean): React.CSSProperties => ({
    minHeight: 38, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
    background: active ? '#0F1923' : '#fff', color: active ? '#fff' : '#0F1923', border: active ? '1px solid #0F1923' : '1px solid #CBD5E1', fontFamily: 'var(--font-body)',
  })

  return (
    <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18, marginTop: 18 }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, color: '#0F1923', margin: '0 0 12px' }}>
        Discussion <span style={{ color: '#64748B', fontWeight: 600 }}>· {comments.length}</span>
      </h2>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" onClick={() => setTab('helpful')} style={chip(tab === 'helpful')}>Most helpful</button>
        <button type="button" onClick={() => setTab('suggestion')} style={chip(tab === 'suggestion')}>Suggestions</button>
        <button type="button" onClick={() => setTab('question')} style={chip(tab === 'question')}>Questions</button>
        <button type="button" onClick={() => setTab('all')} style={chip(tab === 'all')}>Newest</button>
      </div>

      {shown.length === 0 ? (
        <p style={{ fontSize: 14, color: '#475569', margin: '0 0 16px' }}>
          {comments.length === 0 ? 'No replies yet. Be the first to help.' : 'Nothing in this tab yet.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shown.map(c => {
            const cfg = c.dentist?.city ? (CITY_CONFIGS as any)[c.dentist.city] : null
            const k = KIND_STYLE[c.kind || 'comment'] || KIND_STYLE.comment
            const isOwn = currentDentist?.id === c.dentist_id
            const n = c.helpful_count || 0
            return (
              <li key={c.id} style={{ border: '1px solid #E2E8F0', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: c.asker_marked ? '#F0FDF4' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {c.dentist?.slug
                    ? <a href={`/professional/${c.dentist.slug}`} style={{ fontSize: 14, fontWeight: 700, color: '#0F1923', textDecoration: 'none' }}>{drName(c.dentist.name)}</a>
                    : <span style={{ fontSize: 14, fontWeight: 700, color: '#0F1923' }}>{c.dentist?.name === 'You' ? 'You' : drName(c.dentist?.name)}</span>}
                  {cfg && <span style={{ fontSize: 12, color: '#475569' }}>{cfg.cityName}</span>}
                  {c.dentist_id === caseAuthorId && <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>· posted this case</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: k.bg, color: k.color }}>{k.label}</span>
                </div>
                <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{c.content}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {currentDentist && !isOwn ? (
                    <button type="button" onClick={() => toggleHelpful(c.id)}
                      style={{ minHeight: 36, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', border: c.viewer_marked ? '1px solid #047857' : '1px solid #CBD5E1', background: c.viewer_marked ? '#047857' : '#fff', color: c.viewer_marked ? '#fff' : '#047857' }}>
                      {c.viewer_marked ? `Helpful ✓ · ${n}` : `Mark helpful · ${n}`}
                    </button>
                  ) : n > 0 ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#047857' }}>{n} found this helpful</span>
                  ) : null}
                  {c.asker_marked && <span style={{ fontSize: 12, fontWeight: 700, color: '#047857' }}>Marked helpful by the dentist who asked</span>}
                  {isOwn && (
                    <button type="button" onClick={() => remove(c.id)} style={{ background: 'none', border: 'none', color: '#64748B', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0, minHeight: 32 }}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {err && <div style={{ fontSize: 13, color: '#B91C1C', marginBottom: 10, fontWeight: 600 }}>{err}</div>}

      {!discussionEnabled ? (
        <div style={{ background: '#F8FAFC', border: '1px dashed #E2E8F0', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#475569' }}>
          The author has turned off discussion on this case.
        </div>
      ) : !currentDentist ? null : !currentDentist.is_verified ? (
        <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#92400E' }}>
          Replies are open to dentists whose registration number has been checked. Add your registration number on your city dashboard to get verified.
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['suggestion', 'question', 'comment'] as const).map(k => (
              <button key={k} type="button" onClick={() => setKind(k)} style={{ ...chip(kind === k), background: kind === k ? '#1D4ED8' : '#fff', borderColor: kind === k ? '#1D4ED8' : '#CBD5E1' }}>
                {KIND_STYLE[k].label}
              </button>
            ))}
          </div>
          <label htmlFor="new-comment" style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Your reply</label>
          <textarea id="new-comment" rows={3} value={content} onChange={e => setContent(e.target.value)}
            placeholder={kind === 'question' ? 'What would you like to know about this case?' : 'What would you do? Clinical advice only, no promotion.'}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: 15, fontFamily: 'var(--font-body)', boxSizing: 'border-box', resize: 'vertical', minHeight: 90 }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={posting || !content.trim()}
              style={{ minHeight: 46, padding: '0 20px', background: posting || !content.trim() ? '#93C5FD' : '#1D4ED8', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, cursor: posting ? 'wait' : 'pointer' }}>
              {posting ? 'Posting…' : 'Post reply'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
