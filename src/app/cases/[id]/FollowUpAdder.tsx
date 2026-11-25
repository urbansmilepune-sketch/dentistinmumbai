'use client'

// Owner-only: add a follow-up photo or X-ray to an existing case
// (3, 6, 12 or 24 months after treatment). Uploads through the existing
// /api/cases/upload-photo route, then attaches it to this case.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const MONTHS = [3, 6, 12, 24]

export default function FollowUpAdder({ caseId, doneMonths }: { caseId: string; doneMonths: number[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [months, setMonths] = useState<number>(MONTHS.find(m => !doneMonths.includes(m)) ?? 12)
  const [kind, setKind] = useState<'xray_after' | 'after'>('xray_after')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function onFile(file: File) {
    setBusy(true); setMsg('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', kind)
      const up = await fetch('/api/cases/upload-photo', { method: 'POST', body: fd })
      const upData = await up.json().catch(() => ({}))
      if (!up.ok || !upData?.url) { setMsg(upData?.error || 'Upload failed'); setBusy(false); return }
      const res = await fetch(`/api/cases/${caseId}/followup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: upData.url, kind, months_after: months }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) { setMsg(data?.error || 'Could not add the follow-up'); setBusy(false); return }
      setMsg(`${months}-month follow-up added.`)
      router.refresh()
    } catch { setMsg('Network error, please try again.') }
    setBusy(false)
  }

  const chip = (active: boolean): React.CSSProperties => ({
    minHeight: 40, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
    background: active ? '#1D4ED8' : '#fff', color: active ? '#fff' : '#0F1923', border: active ? '1px solid #1D4ED8' : '1px solid #CBD5E1', fontFamily: 'var(--font-body)',
  })

  return (
    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#0F1923' }}>Add a follow-up to this case</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {MONTHS.map(m => (
          <button key={m} type="button" onClick={() => setMonths(m)} style={chip(months === m)}>
            {m} months{doneMonths.includes(m) ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setKind('xray_after')} style={chip(kind === 'xray_after')}>X-ray</button>
        <button type="button" onClick={() => setKind('after')} style={chip(kind === 'after')}>Clinical photo</button>
      </div>
      <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
        style={{ minHeight: 46, borderRadius: 10, border: 'none', background: busy ? '#93C5FD' : '#1D4ED8', color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font-body)' }}>
        {busy ? 'Uploading…' : `Upload ${months}-month ${kind === 'xray_after' ? 'X-ray' : 'photo'}`}
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); if (fileRef.current) fileRef.current.value = '' }} />
      <div style={{ fontSize: 12, color: '#475569' }}>Hide the patient&apos;s face and name before uploading.</div>
      {msg && <div style={{ fontSize: 13, fontWeight: 600, color: '#0F1923' }}>{msg}</div>}
    </div>
  )
}
