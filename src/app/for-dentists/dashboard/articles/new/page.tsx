'use client'

// Write Article — the dentist's authoring flow.
//   STEP 1  pick a topic type (4 cards)
//   STEP 2  title input with a topic-specific placeholder + "Get AI Draft"
//   STEP 3  Tiptap editor (AI draft streams in, or write directly)
//   STEP 4  "Submit for Review" → POST /api/dentist/articles (status=pending)
//
// Built for speed and simplicity, not for bloggers: one linear path, big taps,
// plain language. The AI is optional — the dentist can always type by hand.

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TOPIC_TYPES, topicConfig, type ArticleTopicType } from '@/lib/articles'
import ArticleEditor, { type ArticleEditorHandle } from '../ArticleEditor'

// Streamed AI text is plain text with blank-line paragraph breaks. Convert it
// to the simple HTML Tiptap expects (paragraphs + <br> for single newlines),
// escaping first so a stray "<" in the draft can't inject markup.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function textToHtml(text: string): string {
  const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  if (paras.length === 0) return ''
  return paras.map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')
}

export default function NewArticlePage() {
  const router = useRouter()
  const editorRef = useRef<ArticleEditorHandle>(null)

  const [topicType, setTopicType] = useState<ArticleTopicType | null>(null)
  const [title, setTitle] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumped on every editor update so the Submit button's enabled state tracks
  // whether there's content, without lifting the whole HTML into React state.
  const [, setContentTick] = useState(0)

  const topic = topicType ? topicConfig(topicType) : null

  async function getAiDraft() {
    if (!title.trim()) { setError('Add a title first — it guides the draft.'); return }
    setError(null); setDraftReady(false); setDrafting(true)
    editorRef.current?.setContent('')
    try {
      const res = await fetch('/api/dentist/articles/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), topic_type: topicType }),
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Could not write a draft right now. Please try again or write it yourself.')
        setDrafting(false)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        editorRef.current?.setContent(textToHtml(acc))
      }
      editorRef.current?.setContent(textToHtml(acc))
      setContentTick(t => t + 1)
      setDraftReady(true)
    } catch {
      setError('The draft was interrupted. Please try again or write it yourself.')
    } finally {
      setDrafting(false)
    }
  }

  async function submit() {
    const content = editorRef.current?.getHTML() ?? ''
    if (!title.trim()) { setError('Please add a title.'); return }
    if (editorRef.current?.isEmpty()) { setError('Please write or generate the article first.'); return }
    setError(null); setSubmitting(true)
    try {
      const res = await fetch('/api/dentist/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content, topic_type: topicType }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setError(data?.error || 'Could not submit. Please try again.')
        setSubmitting(false)
        return
      }
      setSubmitted(true)
    } catch {
      setError('Could not submit. Please try again.')
      setSubmitting(false)
    }
  }

  const canSubmit = !!title.trim() && !editorRef.current?.isEmpty?.() && !submitting

  // ── Success screen ───────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginBottom: 8 }}>Submitted!</h1>
        <p style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 24 }}>We&apos;ll review within 24 hours.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Link href="/for-dentists/dashboard/articles" style={{ padding: '11px 20px', background: 'var(--blue)', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>View my articles</Link>
          <button onClick={() => router.refresh()} style={{ padding: '11px 20px', background: '#fff', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Write another</button>
        </div>
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)',
    fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/for-dentists/dashboard/articles" style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>← My Articles</Link>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, marginTop: 8 }}>Write an Article</h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 2 }}>Share your expertise. Patients searching for a dentist read these — and they help your profile rank.</p>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--font-body)' }}>✕</button>
        </div>
      )}

      {/* STEP 1 — Topic picker */}
      {!topicType ? (
        <>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>What kind of article?</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {TOPIC_TYPES.map(t => (
              <button
                key={t.type}
                onClick={() => { setTopicType(t.type); setError(null) }}
                style={{
                  textAlign: 'left', padding: 18, borderRadius: 14, border: '1px solid var(--border)',
                  background: '#fff', cursor: 'pointer', fontFamily: 'var(--font-body)',
                  display: 'flex', flexDirection: 'column', gap: 6, transition: 'box-shadow 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = 'var(--blue)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <span style={{ fontSize: 30 }}>{t.emoji}</span>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{t.label}</span>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t.blurb}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Chosen topic pill + change */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: 'var(--blue-light)', color: 'var(--blue)', borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
              <span>{topic?.emoji}</span> {topic?.label}
            </span>
            <button onClick={() => { setTopicType(null); setDraftReady(false) }} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'underline' }}>Change</button>
          </div>

          {/* STEP 2 — Title + Get AI Draft */}
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Article title</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={topic?.titlePlaceholder}
              style={{ ...inputStyle, flex: 1, minWidth: 240 }}
            />
            <button
              onClick={getAiDraft}
              disabled={drafting}
              style={{
                padding: '12px 18px', background: drafting ? 'var(--muted)' : 'var(--blue)', color: '#fff',
                border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14,
                cursor: drafting ? 'wait' : 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
              }}
            >
              {drafting ? 'Writing your article…' : '✨ Get AI Draft'}
            </button>
          </div>

          {draftReady && (
            <div style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', color: '#166534', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
              ✓ Draft ready — review and edit before submitting
            </div>
          )}

          {/* STEP 3 — Editor */}
          <ArticleEditor ref={editorRef} onChange={() => setContentTick(t => t + 1)} />

          {/* STEP 4 — Submit */}
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={submit}
              disabled={!canSubmit}
              style={{
                padding: '13px 28px', background: canSubmit ? 'var(--blue)' : 'var(--border)',
                color: canSubmit ? '#fff' : 'var(--muted)', border: 'none', borderRadius: 10,
                fontWeight: 700, fontSize: 15, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit for Review'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
