// Share card pictures for dentistinindia.in (growth work, Nov 2026).
//
// These are the images WhatsApp, LinkedIn, Instagram and others show when a
// case or an expert profile link is shared. They are drawn by next/og
// (Satori), which only understands flexbox: every <div> with more than one
// child needs display: flex.
//
// Privacy rule: a case card never shows a clinical photo, X-ray, patient
// detail or the case text. Cases are for dentists only, but a link preview
// is seen by everyone in a WhatsApp group. The card is made from the title,
// specialty, city and the dentist's name. A profile card uses only the
// dentist's own profile photo and the public counts from their profile.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { getSpecialty } from '@/lib/dentalSpecialties'
import { drName } from '@/lib/dentistName'
import { adminDb, cityNameOf, initialsOf, isFoundingDentist } from '@/lib/national'
import { caseSlug, isCaseUuid, shortIdFromSlug, uuidRangeForShortId } from '@/lib/caseSlug'

export type CardFormat = 'og' | 'story'

export const CARD_SIZE: Record<CardFormat, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
}

export function cardFormat(req: Request): CardFormat {
  return new URL(req.url).searchParams.get('format') === 'story' ? 'story' : 'og'
}

// WhatsApp and Facebook re-fetch rarely anyway; a day at the CDN keeps the
// cost tiny and still picks up new counts.
const CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'

const INK = '#0F1923'
const PANEL = '#1E293B'
const SOFT = '#CBD5E1'
const BLUE = '#1D4ED8'

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

function Brand({ size }: { size: number }) {
  return (
    <div style={{ display: 'flex', fontSize: size, fontWeight: 800, color: '#fff' }}>
      <span>DentistIn</span>
      <span style={{ color: '#93C5FD', marginLeft: size * 0.25 }}>India</span>
    </div>
  )
}

function Pill({ text, bg, color, size }: { text: string; bg: string; color: string; size: number }) {
  return (
    <div style={{ display: 'flex', fontSize: size, fontWeight: 700, background: bg, color, padding: `${size * 0.35}px ${size * 0.8}px`, borderRadius: 999 }}>
      {text}
    </div>
  )
}

function Avatar({ photo, initials, size }: { photo: string | null; initials: string; size: number }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} width={size} height={size} alt="" style={{ width: size, height: size, borderRadius: size, objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{ display: 'flex', flexShrink: 0, width: size, height: size, borderRadius: size, background: '#FEF3C7', color: '#78350F', fontSize: size * 0.36, fontWeight: 800, alignItems: 'center', justifyContent: 'center' }}>
      {initials}
    </div>
  )
}

// Inter regular + extra bold (OFL, from @fontsource/inter), read once per
// server instance. If the files are missing the cards still render in the
// built-in font, just without bold.
type Font = { name: string; data: Buffer; weight: 400 | 800; style: 'normal' }
let fontsPromise: Promise<Font[]> | null = null
function loadFonts(): Promise<Font[]> {
  if (!fontsPromise) {
    const dir = join(process.cwd(), 'src/assets/fonts')
    fontsPromise = Promise.all([
      readFile(join(dir, 'inter-400.woff')),
      readFile(join(dir, 'inter-800.woff')),
    ])
      .then(([regular, bold]): Font[] => [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: bold, weight: 800, style: 'normal' },
      ])
      .catch((e) => {
        console.warn('[shareCards] fonts not found, using the default font', e)
        return []
      })
  }
  return fontsPromise
}

async function respond(el: React.ReactElement, format: CardFormat): Promise<ImageResponse> {
  const fonts = await loadFonts()
  return new ImageResponse(el, {
    ...CARD_SIZE[format],
    ...(fonts.length ? { fonts } : {}),
    headers: { 'Cache-Control': CACHE },
  })
}

/** Plain brand card, used when a case or profile can't be shown. */
export function brandCard(format: CardFormat): Promise<ImageResponse> {
  const story = format === 'story'
  return respond(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: INK, color: '#fff', padding: story ? 96 : 72, justifyContent: 'center', gap: 24 }}>
      <Brand size={story ? 84 : 64} />
      <div style={{ display: 'flex', fontSize: story ? 44 : 34, color: SOFT }}>Real cases and second opinions from dentists across India</div>
    </div>,
    format,
  )
}

// ── Case card ──────────────────────────────────────────────────────────

interface ShareCase {
  title: string
  specialtyLabel: string | null
  city: string | null
  dentistName: string
  photo: string | null
  founding: boolean
  verified: boolean
  replies: number
}

/** Loads an approved case by readable slug or old UUID. Null if not public. */
export async function loadCaseForShare(idOrSlug: string): Promise<ShareCase | null> {
  const db = adminDb()
  const select = 'id, title, specialty, status, comment_count, dentists(name, city, profile_photo, created_at, is_verified)'
  type Row = {
    id: string; title: string; specialty: string; status: string; comment_count: number | null
    dentists: { name: string; city: string | null; profile_photo: string | null; created_at: string | null; is_verified: boolean | null } | null
  }
  let row: Row | null = null
  if (isCaseUuid(idOrSlug)) {
    const { data } = await db.from('cases').select(select).eq('id', idOrSlug).maybeSingle()
    row = (data as unknown as Row) || null
  } else {
    const short = shortIdFromSlug(idOrSlug)
    if (!short) return null
    const { from, to } = uuidRangeForShortId(short)
    const { data } = await db.from('cases').select(select).gte('id', from).lte('id', to).limit(20)
    const rows = (data || []) as unknown as Row[]
    row = rows.find(r => caseSlug({ id: r.id, title: r.title, city: r.dentists?.city }) === idOrSlug) || (rows.length === 1 ? rows[0] : null)
  }
  // Only approved cases get a card: a pending or rejected title never leaks.
  if (!row || row.status !== 'approved') return null
  const d = row.dentists
  return {
    title: row.title,
    specialtyLabel: getSpecialty(row.specialty)?.label ?? null,
    city: cityNameOf(d?.city),
    dentistName: d?.name ? drName(d.name) : 'A verified dentist',
    photo: await safePhoto(d?.profile_photo),
    founding: isFoundingDentist(d?.created_at),
    verified: !!d?.is_verified,
    replies: row.comment_count || 0,
  }
}

export function caseCard(c: ShareCase, format: CardFormat): Promise<ImageResponse> {
  const story = format === 'story'
  const k = story ? 1.5 : 1
  const sub = [c.founding ? 'Founding Dentist' : null, c.verified ? 'Registration verified' : null].filter(Boolean).join(' · ')
  return respond(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: INK, color: '#fff', padding: story ? 96 : 64 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Brand size={34 * k} />
        <div style={{ display: 'flex', fontSize: 22 * k, color: SOFT }}>Clinical case</div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: story ? 220 : 48 }}>
        {c.specialtyLabel && <Pill text={c.specialtyLabel} bg={BLUE} color="#fff" size={22 * k} />}
        {c.city && <Pill text={c.city} bg="#334155" color="#fff" size={22 * k} />}
      </div>
      <div style={{ display: 'flex', fontSize: (c.title.length > 70 ? 50 : 60) * k, fontWeight: 800, lineHeight: 1.15, marginTop: 28 }}>
        {clip(c.title, story ? 120 : 95)}
      </div>
      {c.replies > 0 && (
        <div style={{ display: 'flex', fontSize: 26 * k, color: SOFT, marginTop: 20 }}>
          {`${c.replies} ${c.replies === 1 ? 'reply' : 'replies'} from dentists`}
        </div>
      )}
      <div style={{ display: 'flex', flexGrow: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Avatar photo={c.photo} initials={initialsOf(c.dentistName)} size={76 * k} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 32 * k, fontWeight: 800 }}>{clip(c.dentistName, 40)}</div>
          <div style={{ display: 'flex', fontSize: 22 * k, color: SOFT, marginTop: 4 }}>{sub || 'dentistinindia.in'}</div>
        </div>
      </div>
      {story && (
        <div style={{ display: 'flex', fontSize: 34, color: SOFT, marginTop: 72 }}>See the case at dentistinindia.in</div>
      )}
    </div>,
    format,
  )
}

// ── Profile card ───────────────────────────────────────────────────────

export interface ShareProfile {
  name: string
  headline: string
  city: string | null
  photo: string | null
  stats: Array<{ n: number; label: string }>
  badges: string[]
  slug: string
}

export function profileCard(p: ShareProfile, format: CardFormat): Promise<ImageResponse> {
  const story = format === 'story'
  const k = story ? 1.5 : 1
  // Zero counts are left off so a new dentist's card never says "0 cases".
  const stats = p.stats.filter(s => s.n > 0).slice(0, 3)
  return respond(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: INK, color: '#fff', padding: story ? 96 : 64 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Brand size={34 * k} />
        <div style={{ display: 'flex', fontSize: 22 * k, color: SOFT }}>Expert profile</div>
      </div>
      <div style={{ display: 'flex', flexDirection: story ? 'column' : 'row', alignItems: story ? 'flex-start' : 'center', gap: 32, marginTop: story ? 200 : 44 }}>
        <Avatar photo={p.photo} initials={initialsOf(p.name)} size={150 * k} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: (p.name.length > 24 ? 50 : 58) * k, fontWeight: 800, lineHeight: 1.1 }}>{clip(p.name, 40)}</div>
          <div style={{ display: 'flex', fontSize: 28 * k, color: SOFT, marginTop: 10 }}>
            {clip(`${p.headline}${p.city ? ' · ' + p.city : ''}`, 60)}
          </div>
        </div>
      </div>
      {stats.length > 0 && (
        <div style={{ display: 'flex', gap: 20, marginTop: 40 }}>
          {stats.map(s => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, flexBasis: 0, background: PANEL, borderRadius: 20, padding: `${20 * k}px ${24 * k}px` }}>
              <div style={{ display: 'flex', fontSize: 48 * k, fontWeight: 800 }}>{String(s.n)}</div>
              <div style={{ display: 'flex', fontSize: 22 * k, color: SOFT }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexGrow: 1 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {p.badges.slice(0, 2).map(b => (
            <Pill key={b} text={b} bg={b === 'Founding Dentist' ? '#FEF3C7' : '#ECFDF5'} color={b === 'Founding Dentist' ? '#78350F' : '#065F46'} size={22 * k} />
          ))}
        </div>
        {!story && <div style={{ display: 'flex', fontSize: 22, color: SOFT }}>dentistinindia.in</div>}
      </div>
      {story && (
        <div style={{ display: 'flex', fontSize: 34, color: SOFT, marginTop: 72 }}>{`dentistinindia.in/professional/${p.slug}`}</div>
      )}
    </div>,
    format,
  )
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Fetches a profile photo and returns it as a data URL, or null. The card
 * renderer fails outright on a broken or unsupported image, so anything
 * that isn't a small PNG or JPEG falls back to initials.
 */
export async function safePhoto(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https:\/\//i.test(url)) return null
  // Cloudinary uploads can be WebP, which the renderer can't read: ask for
  // a small square JPEG instead.
  if (url.includes('res.cloudinary.com/') && url.includes('/image/upload/')) {
    url = url.replace('/image/upload/', '/image/upload/f_jpg,q_80,w_320,h_320,c_fill,g_face/')
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (type !== 'image/jpeg' && type !== 'image/png') return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 3_000_000) return null
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

// ── Invite card ────────────────────────────────────────────────────────

export function inviteCard(p: { name: string; photo: string | null; line: string | null }, format: CardFormat): Promise<ImageResponse> {
  const story = format === 'story'
  const k = story ? 1.5 : 1
  return respond(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: INK, color: '#fff', padding: story ? 96 : 64 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Brand size={34 * k} />
        <div style={{ display: 'flex', fontSize: 22 * k, color: '#93C5FD', fontWeight: 800 }}>YOU&apos;RE INVITED</div>
      </div>
      <div style={{ display: 'flex', flexDirection: story ? 'column' : 'row', alignItems: story ? 'flex-start' : 'center', gap: 32, marginTop: story ? 220 : 56 }}>
        <Avatar photo={p.photo} initials={initialsOf(p.name)} size={130 * k} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 54 * k, fontWeight: 800, lineHeight: 1.15 }}>{clip(`${p.name} invited you to DentistIn India`, 70)}</div>
          {p.line && <div style={{ display: 'flex', fontSize: 26 * k, color: SOFT, marginTop: 12 }}>{clip(p.line, 60)}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', flexGrow: 1 }} />
      <div style={{ display: 'flex', fontSize: 28 * k, color: SOFT }}>Real cases and second opinions from dentists across India. Free.</div>
    </div>,
    format,
  )
}
