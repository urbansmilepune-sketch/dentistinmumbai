// Inline SVG icon set for the dentist profile. The project has no icon font
// (no Tabler/`ti-*` classes anywhere), and the design system bans emoji as
// icons, so these are hand-rolled SVGs that inherit `currentColor` from their
// parent. All are plain functions usable inside Server Components.

import type { CSSProperties } from 'react'

interface IconProps { size?: number; color?: string; style?: CSSProperties; strokeWidth?: number }

function base(size: number, style?: CSSProperties): { width: number; height: number; viewBox: string; style?: CSSProperties } {
  return { width: size, height: size, viewBox: '0 0 24 24', style }
}

// Stroke icons -----------------------------------------------------------
const stroke = (color: string, sw: number) => ({
  fill: 'none' as const, stroke: color, strokeWidth: sw,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
})

export function CheckIcon({ size = 16, color = 'currentColor', style, strokeWidth = 2.4 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><path d="M20 6 9 17l-5-5" /></svg>
}

export function StarIcon({ size = 16, color = '#F59E0B', style }: IconProps) {
  return <svg {...base(size, style)} fill={color}><path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.9l-5.81 3.06 1.11-6.47L2.6 9.9l6.5-.95L12 2.5z" /></svg>
}

export function ShieldCheckIcon({ size = 16, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>
}

export function PhoneIcon({ size = 18, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><path d="M6.6 10.8a14 14 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11 11 0 0 0 3.4.55 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .55 3.4 1 1 0 0 1-.24 1l-2.2 2.4z" /></svg>
}

export function CalendarIcon({ size = 18, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></svg>
}

export function MapPinIcon({ size = 16, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
}

export function ClockIcon({ size = 16, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
}

export function DirectionsIcon({ size = 16, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><path d="M12 2l10 10-10 10L2 12 12 2z" /><path d="M9 13v-2a2 2 0 0 1 2-2h4" /><path d="m13.5 6.5 2.5 2.5-2.5 2.5" /></svg>
}

export function LanguagesIcon({ size = 14, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><path d="M4 5h7M9 3v2c0 4-2.5 7-6 8" /><path d="M5 9c0 2.5 2.5 4.5 6 5" /><path d="M13 20l4-9 4 9M14.5 17h5" /></svg>
}

export function CardIcon({ size = 14, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 9.5h19M6 15h4" /></svg>
}

export function CameraIcon({ size = 14, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><path d="M4 7h3l1.5-2h7L18 7h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.2" /></svg>
}

// Gender icons (replace the spec's `ti-gender-male/female`, which don't exist
// in this project — there is no Tabler font). Mars / Venus glyphs.
export function GenderMaleIcon({ size = 14, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><circle cx="9.5" cy="14.5" r="5" /><path d="M14 10l6-6M15 4h5v5" /></svg>
}

export function GenderFemaleIcon({ size = 14, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><circle cx="12" cy="8.5" r="5" /><path d="M12 13.5V21M9 18h6" /></svg>
}

export function SparkleIcon({ size = 16, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><path d="M12 3l1.8 4.8L18.6 9l-4.8 1.8L12 15l-1.8-4.2L5.4 9l4.8-1.2L12 3z" /><path d="M19 14l.9 2.1 2.1.9-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" /></svg>
}

export function EyeIcon({ size = 18, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size, style)} {...stroke(color, strokeWidth)}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>
}

// WhatsApp glyph (filled) — lifted from the existing hero CTA so the brand
// mark stays identical across the page.
export function WhatsAppIcon({ size = 18, color = '#fff', style }: IconProps) {
  return (
    <svg {...base(size, style)} fill={color} viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  )
}
