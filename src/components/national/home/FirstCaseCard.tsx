'use client'

// "Post your first case" card at the top of the dentist home feed (approved
// 27 Nov 2026, first-case/mockup.html). Shown until the dentist has a case
// live or in review; it takes the place of the "Your week" card until then.
// Photos dropped (or picked) here go straight into the quick flow at
// /first-case; WhatsApp posting is the other way in.

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { handOffPhotos } from '@/lib/firstCaseHandoff'
import { FIRST_CASE_IDEAS, POST_BY_WHATSAPP_URL } from '@/lib/firstCaseShared'

export default function FirstCaseCard({ cityName }: { cityName: string | null }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  function go(files: FileList | File[] | null) {
    if (files && files.length) handOffPhotos(Array.from(files))
    router.push('/first-case')
  }

  const step = (n: string, text: string, state: 'done' | 'now' | 'next') => (
    <div style={{ borderRadius: 10, padding: '8px 9px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, fontSize: 12.5, lineHeight: 1.3,
      background: state === 'now' ? '#fff' : 'rgba(255,255,255,.08)', color: state === 'now' ? '#0F1923' : '#B9C8E3', fontWeight: state === 'now' ? 700 : 500 }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff',
        background: state === 'done' ? '#10B981' : state === 'now' ? '#1D4ED8' : 'rgba(255,255,255,.16)' }}>{n}</span>
      {text}
    </div>
  )

  return (
    <section aria-labelledby="first-case-title" style={{ background: 'linear-gradient(160deg, #0B1B33 0%, #13325E 100%)', color: '#fff', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div>
        <h2 id="first-case-title" style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 19, fontWeight: 800 }}>Post your first case</h2>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: '#B9C8E3' }}>
          {cityName ? `Dentists in ${cityName} see it at the top of their feed for 2 days.` : 'Dentists across India see it at the top of their feed for 2 days.'} It takes about 2 minutes.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        {step('✓', 'Profile live', 'done')}
        {step('2', 'Post one case', 'now')}
        {step('3', 'Get your first reply', 'next')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' }}>
        <button type="button" onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); go(e.dataTransfer.files) }}
          style={{ flex: '1 1 220px', minWidth: 0, minHeight: 96, borderRadius: 12, border: `1.5px dashed ${over ? '#fff' : '#7C9CCB'}`, background: over ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>Pick 1 to 4 photos</span>
          <span style={{ fontSize: 12.5, color: '#B9C8E3' }}>or drop them here. Faces and names get hidden.</span>
        </button>
        <input ref={fileRef} id="first-case-card-photos" type="file" accept="image/*" multiple hidden onChange={e => go(e.target.files)} />
        <div style={{ flex: '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
          <a href={POST_BY_WHATSAPP_URL} target="_blank" rel="noopener"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, borderRadius: 10, background: '#25D366', color: '#fff', fontWeight: 800, fontSize: 14.5, textDecoration: 'none' }}>
            Send photos on WhatsApp
          </a>
          <span style={{ fontSize: 12, color: '#B9C8E3', textAlign: 'center' }}>Send photos to 77190 13232. We make the case for you.</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: '#B9C8E3' }}>A simple case is fine:</span>
        {FIRST_CASE_IDEAS.map(i => (
          <Link key={i} href="/first-case" style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.1)', color: '#E2E8F0', textDecoration: 'none', whiteSpace: 'nowrap' }}>{i}</Link>
        ))}
      </div>
    </section>
  )
}
