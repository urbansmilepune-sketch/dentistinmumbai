// Round dentist photo, or initials on a colour when there is no photo.
const COLOURS = ['#1D4ED8', '#7C3AED', '#0891B2', '#166534', '#C2410C', '#BE185D', '#0F766E', '#9F1239']

function initials(name: string): string {
  return name.replace(/^Dr\.?\s+/i, '').split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'D'
}

export default function Avatar({ name, photo, size = 40 }: { name: string; photo: string | null; size?: number }) {
  const colour = COLOURS[Array.from(name).reduce((n, c) => n + c.charCodeAt(0), 0) % COLOURS.length]
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', flex: 'none', overflow: 'hidden', display: 'inline-grid', placeItems: 'center', background: colour, color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: Math.round(size * 0.36) }}>
      {photo
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={photo} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials(name)}
    </span>
  )
}
