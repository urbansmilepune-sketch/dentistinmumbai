'use client'

// "Report a bug" affordance for the dashboard sidebar. Opens a modal that
// captures three things only: the (redacted) page URL, a browser/environment
// snapshot, and the dentist's description. It never reads or shows patient
// data — the URL is run through redactUrl at capture time so a path like
// /dashboard/patients/<uuid> can't carry a patient reference into the report,
// and the captured values are shown read-only so the dentist sees exactly
// what gets sent.
import { useEffect, useState } from 'react'
import { redactUrl } from '@/lib/redactUrl'

type Snapshot = { pageUrl: string; browser: Record<string, string> }

function captureBrowser(): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof navigator !== 'undefined') {
    if (navigator.userAgent) out.userAgent = navigator.userAgent
    if (navigator.platform) out.platform = navigator.platform
    if (navigator.language) out.language = navigator.language
  }
  if (typeof window !== 'undefined') {
    out.viewport = `${window.innerWidth}x${window.innerHeight}`
    if (window.screen) out.screen = `${window.screen.width}x${window.screen.height}`
  }
  return out
}

export default function BugReportButton() {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    // Capture at open time so the URL/viewport reflect the page the dentist
    // was actually on when they hit the bug.
    setSnapshot({ pageUrl: redactUrl(window.location.href), browser: captureBrowser() })
    setDescription('')
    setError(null)
    setDone(false)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open])

  async function submit() {
    if (!description.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/dentist/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_url: snapshot?.pageUrl,
          browser_info: snapshot?.browser,
          description: description.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not send the report')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report')
    } finally {
      setSubmitting(false)
    }
  }

  const browserSummary = snapshot
    ? Object.entries(snapshot.browser).map(([k, v]) => `${k}: ${v}`).join('\n')
    : ''

  return (
    <>
      <button onClick={openModal}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', width: '100%', textAlign: 'left' }}>
        🐞 Report a bug
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div role="dialog" aria-modal="true" aria-label="Report a bug"
            style={{ position: 'relative', background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-heading)', marginBottom: 4 }}>Report a bug</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              We&apos;ll include the page and browser details below. No patient information is collected.
            </div>

            {done ? (
              <>
                <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 20 }}>
                  ✅ Thanks — your report was sent. We&apos;ll take a look.
                </div>
                <button onClick={() => setOpen(false)}
                  style={{ height: 40, padding: '0 18px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Done
                </button>
              </>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  What went wrong?
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe what you were doing and what happened…"
                  rows={5}
                  maxLength={5000}
                  autoFocus
                  style={{ width: '100%', padding: 12, border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, fontFamily: 'var(--font-body)', resize: 'vertical', boxSizing: 'border-box' }}
                />

                <div style={{ marginTop: 14, padding: 12, background: 'var(--bg)', borderRadius: 10, fontSize: 12, color: 'var(--muted)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Attached automatically</div>
                  <div style={{ wordBreak: 'break-all', marginBottom: 6 }}><strong>Page:</strong> {snapshot?.pageUrl}</div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'var(--font-body)' }}>{browserSummary}</pre>
                </div>

                {error && <div style={{ marginTop: 12, fontSize: 13, color: '#EF4444' }}>{error}</div>}

                <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                  <button onClick={() => setOpen(false)}
                    style={{ height: 40, padding: '0 18px', background: 'none', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    Cancel
                  </button>
                  <button onClick={submit} disabled={!description.trim() || submitting}
                    style={{ height: 40, padding: '0 18px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: !description.trim() || submitting ? 'not-allowed' : 'pointer', opacity: !description.trim() || submitting ? 0.6 : 1, fontFamily: 'var(--font-body)' }}>
                    {submitting ? 'Sending…' : 'Send report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
