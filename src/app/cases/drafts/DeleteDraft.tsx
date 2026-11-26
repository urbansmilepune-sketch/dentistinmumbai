'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Two-tap delete (no browser confirm dialog): first tap asks, second deletes.
export default function DeleteDraft({ id, source }: { id: string; source: 'form' | 'whatsapp' }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function remove() {
    setBusy(true)
    setErr('')
    const res = await fetch('/api/cases/drafts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, source }),
    }).catch(() => null)
    if (!res?.ok) { setErr('Could not delete. Try again.'); setBusy(false); return }
    router.refresh()
  }

  const base: React.CSSProperties = { minHeight: 40, padding: '0 14px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {asking ? (
        <>
          <button type="button" onClick={remove} disabled={busy} style={{ ...base, background: '#DC2626', color: '#fff', border: 'none' }}>
            {busy ? 'Deleting…' : 'Yes, delete'}
          </button>
          <button type="button" onClick={() => setAsking(false)} disabled={busy} style={{ ...base, background: '#fff', color: '#475569', border: '1px solid #CBD5E1' }}>Keep</button>
        </>
      ) : (
        <button type="button" onClick={() => setAsking(true)} style={{ ...base, background: '#fff', color: '#DC2626', border: '1px solid #FECACA' }}>Delete</button>
      )}
      {err && <span style={{ color: '#DC2626', fontSize: 13 }}>{err}</span>}
    </span>
  )
}
