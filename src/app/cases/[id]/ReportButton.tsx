'use client'

// Report-a-case button + lightweight modal. Mounted on /cases/[id]
// even for unauthenticated viewers — the API rejects anonymous
// reports, so the button explains "sign in to report" rather than
// hiding entirely. Mirrors the NotifyMeModal pattern from the
// /cities page.

import { useEffect, useState } from 'react'

interface Props {
  caseId: string
  signedIn: boolean
}

export default function ReportButton({ caseId, signedIn }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onEsc)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onEsc)
      document.body.style.overflow = prev
    }
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending'); setErr('')
    try {
      const res = await fetch(`/api/cases/${caseId}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.success) setState('sent')
      else { setState('error'); setErr(data?.error || 'Could not file report') }
    } catch { setState('error'); setErr('Network error') }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        style={{ background: 'transparent', border: 'none', color: '#94A3B8', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
        Report this case
      </button>

      {open && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15, 25, 35, 0.55)' }} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
            {!signedIn ? (
              <>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0F1923', marginBottom: 10 }}>Sign in to file a report</h3>
                <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 18 }}>
                  Reports are tied to a verified dentist account so we can follow up. Sign in to your dentist profile and try again.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setOpen(false)} style={{ padding: '9px 16px', minHeight: 40, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
                  <a href={`/for-dentists/login?next=/cases/${caseId}`}
                    style={{ padding: '9px 16px', minHeight: 40, background: '#1D4ED8', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                    Sign in
                  </a>
                </div>
              </>
            ) : state === 'sent' ? (
              <>
                <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>✓</div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#166534', marginBottom: 8, textAlign: 'center' }}>Report filed</h3>
                <p style={{ fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 1.6, marginBottom: 18 }}>
                  Thanks. An admin will review this case shortly.
                </p>
                <button onClick={() => setOpen(false)} style={{ width: '100%', padding: '11px 16px', minHeight: 44, background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Close</button>
              </>
            ) : (
              <form onSubmit={submit}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0F1923', marginBottom: 6 }}>Report this case</h3>
                <p style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>Why are you flagging this? Be specific — vague reports get dismissed.</p>
                <textarea required rows={4} value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="e.g. The X-ray doesn't match the clinical photo. Or: claims an outcome that's not supported by the imaging."
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', minHeight: 96 }} />
                {err && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6, fontWeight: 600 }}>{err}</div>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button type="button" onClick={() => setOpen(false)} style={{ padding: '9px 16px', minHeight: 40, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={state === 'sending'} style={{ padding: '9px 16px', minHeight: 40, background: state === 'sending' ? '#FECACA' : '#DC2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: state === 'sending' ? 'wait' : 'pointer' }}>
                    {state === 'sending' ? 'Filing…' : 'File report'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
