'use client'

import { useState } from 'react'
import RegistrationModal from './RegistrationModal'

interface HeroButtonsProps {
  listedCount: number
  areaNames: string[]
  orange?: boolean
  large?: boolean
}

export default function HeroButtons({ listedCount, areaNames, orange, large }: HeroButtonsProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const btnSize = large ? { padding: '16px 36px', fontSize: 17 } : { padding: '13px 28px', fontSize: 15 }

  return (
    <>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            ...btnSize,
            background: '#FF6135', color: '#fff', border: 'none',
            borderRadius: 12, fontFamily: 'var(--font-body)', fontWeight: 700,
            cursor: 'pointer', transition: 'background 0.2s, transform 0.1s',
            boxShadow: '0 4px 20px rgba(255,97,53,0.4)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#E5522A' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FF6135' }}
        >🏅 Claim My Free Spot →</button>

        {!orange && (
          <a href="#how-it-works" style={{
            ...btnSize,
            background: 'rgba(255,255,255,0.1)', color: '#fff',
            border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 12,
            fontFamily: 'var(--font-body)', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center',
          }}>See How It Works ↓</a>
        )}
      </div>

      <RegistrationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        foundingNumber={listedCount}
        areas={areaNames}
      />
    </>
  )
}
