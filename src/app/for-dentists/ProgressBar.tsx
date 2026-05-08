'use client'

import { useEffect, useState } from 'react'

interface ProgressBarProps {
  listedCount: number
  spotsLeft: number
  pct: number
  showButton?: boolean
  onClaim?: () => void
}

export default function ProgressBar({ listedCount, spotsLeft, pct, showButton, onClaim }: ProgressBarProps) {
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{ width: '100%', maxWidth: 540 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
          🏅 Founding Members Joined
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#FBBF24' }}>
          {listedCount} / 250
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        width: '100%', height: 20, background: 'rgba(255,255,255,0.1)',
        borderRadius: 10, overflow: 'hidden', position: 'relative',
        border: '1px solid rgba(255,255,255,0.15)',
      }}>
        <div style={{
          height: '100%', borderRadius: 10,
          width: animated ? `${Math.max(pct, 2)}%` : '0%',
          background: 'linear-gradient(90deg, #F59E0B, #FBBF24, #F59E0B)',
          backgroundSize: '200% 100%',
          transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
          animation: animated ? 'shimmer 2s infinite linear' : 'none',
          position: 'relative',
        }}>
          {/* Pulsing glow on leading edge */}
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            width: 8, background: 'rgba(255,255,255,0.6)',
            borderRadius: '0 10px 10px 0',
            animation: 'pulse-glow 1.5s infinite',
          }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 12, color: '#F59E0B', fontWeight: 600 }}>
          ⚡ {spotsLeft} spots remaining
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
          {pct.toFixed(0)}% full
        </span>
      </div>

      {showButton && onClaim && (
        <button
          onClick={onClaim}
          style={{
            marginTop: 20, width: '100%', padding: '14px',
            background: '#FF6135', color: '#fff', border: 'none',
            borderRadius: 12, fontFamily: 'var(--font-body)',
            fontWeight: 700, fontSize: 16, cursor: 'pointer',
            transition: 'background 0.2s, transform 0.1s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#E5522A' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#FF6135' }}
        >
          🏅 Claim My Founding Spot →
        </button>
      )}

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
