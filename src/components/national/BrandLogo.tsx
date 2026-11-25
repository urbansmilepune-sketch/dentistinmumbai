'use client'

// Brand-mark renderer for dentistinindia.in. Tries the image asset at
// /logo-india.webp first; if the file 404s (not yet uploaded, or the
// CDN hasn't propagated), the onError handler swaps in a styled text
// fallback so the nav + hero never show a broken-image icon.
//
// Client component so the runtime swap survives hydration. The default
// state assumes the image will load — there's no flash of text-then-
// image on a working asset.

import { useState } from 'react'

interface Props {
  /** Visible height of the logo mark in px. Width scales from it. */
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

  // logo-india.webp is 252x168 with the mark only in the box x 32-222,
  // y 62-108 (same as the city logos, see SiteHeader.tsx). Crop to that
  // box so `height` is the visible mark height, not mostly padding.
  const scale = height / 46
  return (
    <span
      className={className}
      style={{ display: 'block', overflow: 'hidden', height, width: Math.round(190 * scale), ...style }}
    >
      <img
        src="/logo-india.webp"
        alt="Dentist In India"
        onError={() => setFailed(true)}
        style={{ display: 'block', maxWidth: 'none', height: Math.round(168 * scale), width: 'auto', marginLeft: -32 * scale, marginTop: -62 * scale }}
      />
    </span>
  )
}
