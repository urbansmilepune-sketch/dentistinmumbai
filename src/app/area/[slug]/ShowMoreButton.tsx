'use client'

// Toggle wrapper for the overflow dentists below the first few results. The
// cards themselves are server-rendered DentistResultCards passed in as
// children — this component only owns the expand/collapse state, so the new
// card design stays a Server Component.

import { useState } from 'react'
import { NAVY, TEAL, TEAL_SOFT } from '@/app/dentist/[slug]/profileTheme'

interface ShowMoreButtonProps {
  count: number
  areaName: string
  children: React.ReactNode
}

export default function ShowMoreButton({ count, areaName, children }: ShowMoreButtonProps) {
  const [expanded, setExpanded] = useState(false)

  if (count === 0) return null

  if (expanded) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>{children}</div>
  }

  return (
    <>
      <button onClick={() => setExpanded(true)} className="area-showmore">
        Show {count} more dentist{count === 1 ? '' : 's'} in {areaName} ↓
      </button>
      <style>{`
        .area-showmore {
          width: 100%; margin-top: 16px; padding: 14px; border-radius: 12px;
          border: 1.5px dashed #CBD5E1; background: ${TEAL_SOFT};
          font-family: var(--font-body); font-size: 14px; font-weight: 700; color: ${NAVY};
          cursor: pointer; transition: border-color .15s, background .15s;
        }
        .area-showmore:hover { border-color: ${TEAL}; }
      `}</style>
    </>
  )
}
