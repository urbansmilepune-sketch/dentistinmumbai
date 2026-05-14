'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Dentist {
  id: string
  slug: string
  name: string
  clinic_name: string | null
  consultation_fee: number
  is_verified: boolean
  tier: string
  profile_photo: string | null
  areas: { name: string } | null
  dentist_treatments: { treatments: { name: string; slug: string } }[]
}

interface ShowMoreButtonProps {
  hiddenDentists: Dentist[]
  areaName: string
}

export default function ShowMoreButton({ hiddenDentists, areaName }: ShowMoreButtonProps) {
  const [expanded, setExpanded] = useState(false)

  if (hiddenDentists.length === 0) return null

  return (
    <>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
          {hiddenDentists.map(d => (
            <Link key={d.id} href={`/dentist/${d.slug}`} style={{ textDecoration: 'none' }}>
              <div className="card-hover" style={{
                background: '#fff', border: '1px solid var(--border)', borderRadius: 16,
                padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'center',
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 10, flexShrink: 0,
                  background: 'var(--blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                }}>
                  {d.profile_photo
                    ? <img src={d.profile_photo} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                    : '🦷'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>{d.name}</span>
                    {d.is_verified && <span className="verified-icon">✓</span>}
                    {d.tier === 'featured' && <span className="badge badge-featured">⭐ Featured</span>}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0' }}>{d.clinic_name}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {d.dentist_treatments?.slice(0, 2).map(dt => (
                      <span key={dt.treatments?.slug} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--blue-light)', color: 'var(--blue-dark)', borderRadius: 20 }}>
                        {dt.treatments?.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18 }}>
                    {d.consultation_fee ? `₹${d.consultation_fee}` : 'Call'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>consultation</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            border: '2px dashed var(--border)', background: 'transparent',
            fontSize: 14, fontWeight: 600, color: 'var(--blue)',
            cursor: 'pointer', fontFamily: 'var(--font-body)',
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--blue-light)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--blue)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          Show {hiddenDentists.length} more dentists in {areaName} ↓
        </button>
      )}
    </>
  )
}
