'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  slug: string
  initial: { professional_bio: string; publications: string; hospital_affiliations: string }
}

export default function EditForm({ slug, initial }: Props) {
  const router = useRouter()
  const [bio, setBio] = useState(initial.professional_bio)
  const [pubs, setPubs] = useState(initial.publications)
  const [affil, setAffil] = useState(initial.hospital_affiliations)
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('saving'); setErr('')
    try {
      const res = await fetch('/api/professional/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professional_bio: bio,
          publications: pubs,
          hospital_affiliations: affil,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) { setState('error'); setErr(data?.error || 'Could not save'); return }
      router.push(`/professional/${slug}`)
      router.refresh()
    } catch { setState('error'); setErr('Network error') }
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }
  const taStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0',
    fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
    resize: 'vertical', minHeight: 110,
  }

  return (
    <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle} htmlFor="bio">Professional bio</label>
        <textarea id="bio" rows={5} value={bio} onChange={e => setBio(e.target.value)}
          placeholder="A few lines about your background, focus areas, and clinical philosophy."
          style={{ ...taStyle, minHeight: 130 }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle} htmlFor="pubs">Publications</label>
        <textarea id="pubs" rows={5} value={pubs} onChange={e => setPubs(e.target.value)}
          placeholder="One per line — papers, posters, talks, features. Markdown light supported on the public page (line breaks preserved)."
          style={taStyle} />
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle} htmlFor="affil">Hospital affiliations</label>
        <textarea id="affil" rows={4} value={affil} onChange={e => setAffil(e.target.value)}
          placeholder="One per line — hospitals or specialist centres you visit or consult at."
          style={taStyle} />
      </div>
      {err && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="submit" disabled={state === 'saving'}
          style={{ padding: '11px 22px', minHeight: 44, background: state === 'saving' ? '#93C5FD' : '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 700, cursor: state === 'saving' ? 'wait' : 'pointer' }}>
          {state === 'saving' ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
