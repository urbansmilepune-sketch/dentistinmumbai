'use client'

interface TickerBarProps {
  listedCount: number
  spotsLeft: number
}

export default function TickerBar({ listedCount, spotsLeft }: TickerBarProps) {
  const items = [
    `🟢 ${listedCount} dentists listed`,
    `📍 24 Mumbai areas covered`,
    `⚡ ${spotsLeft} founding spots left`,
    `💰 100% free to list right now`,
  ]

  return (
    <div style={{ background: '#0A1628', padding: '10px 0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 48, justifyContent: 'center', flexWrap: 'wrap', padding: '0 20px' }}>
        {items.map((item, i) => (
          <span key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 500, whiteSpace: 'nowrap' }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
