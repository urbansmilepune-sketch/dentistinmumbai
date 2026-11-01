// Inline SVG icons for the dentist dashboard (no icon library, no emoji).
// Every icon inherits `currentColor` so the caller sets the colour.

type P = { size?: number }

const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export const HomeIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" /></svg>
)
export const CalendarIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
)
export const PatientsIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" /></svg>
)
export const RupeeIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M6 3h12M6 8h12M14 21 6 13h3a5 5 0 0 0 0-10" /></svg>
)
export const MenuIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
)
export const PlusIcon = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg>
)
export const SearchIcon = ({ size = 16 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)
export const ChevronIcon = ({ size = 16 }: P) => (
  <svg {...base(size)}><path d="m9 6 6 6-6 6" /></svg>
)
export const CloseIcon = ({ size = 20 }: P) => (
  <svg {...base(size)}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const QrIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></svg>
)
export const StarIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z" /></svg>
)
export const PenIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></svg>
)
export const BadgeIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}><circle cx="12" cy="9" r="6" /><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7" /></svg>
)
export const WhatsAppIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.3 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.1.1.6-.1 1.2Z" />
  </svg>
)
