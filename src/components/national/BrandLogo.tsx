'use client'

// Brand-mark renderer for dentistinindia.in. Tries the image asset at
// /india-logo.png first; if the file 404s (not yet uploaded, or the
// CDN hasn't propagated), the onError handler swaps in a styled text
// fallback so the nav + hero never show a broken-image icon.
//
// Client component so the runtime swap survives hydration. The default
// state assumes the image will load — there's no flash of text-then-
// image on a working asset.

import { useState } from 'react'

interface Props {
  /** Display height in px. Width auto-scales. Defaults to nav size. */
  height?: number
  /** Renders the text fallback at this font-size. Defaults track height. */
  fontSize?: number
  /** Optional className for the wrapping <span>. */
  className?: string
  /** Override styles applied to the wrapper, e.g. to centre the hero
   *  variant. The inner image and text fallback are positioned by
   *  height/fontSize props above. */
  style?: React.CSSProperties
}

export default function BrandLogo({ height = 28, fontSize, className, style }: Props) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span
        className={className}
        style={{
          fontFamily: 'var(--font-heading)', fontWeight: 800,
          fontSize: fontSize ?? Math.round(height * 0.72),
          color: '#0F1923', lineHeight: 1, whiteSpace: 'nowrap',
          ...style,
        }}
      >
        Dentist<span style={{ color: '#1D4ED8' }}>InIndia</span>.in
      </span>
    )
  }

  return (
    <img
      src="/india-logo.png"
      alt="Dentist In India"
      height={height}
      onError={() => setFailed(true)}
      className={className}
      style={{ height, width: 'auto', display: 'block', ...style }}
    />
  )
}
