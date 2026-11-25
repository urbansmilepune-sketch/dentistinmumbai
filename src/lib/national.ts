// Shared helpers for the dentistinindia.in dentist network (v1, Nov 2026).
//
// The network's own tables (case_comment_helpful, events, event_interest)
// and the new columns (case_comments.kind, cases.question, dentists.top_skills
// ...) are added by supabase/migrations/20261125120000_national_v1.sql, which
// is run by hand in the Supabase SQL editor. Every read here selects `*` or
// tolerates a missing table so the pages keep rendering if the code ships
// before that SQL runs.

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { CITY_CONFIGS } from '@/config/cities'
import { cleanName } from '@/lib/dentistName'

export function adminDb(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Everyone registered before the network launch is a Founding Dentist.
export const FOUNDING_CUTOFF = '2026-12-01T00:00:00+05:30'

export function isFoundingDentist(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  return new Date(createdAt).getTime() < new Date(FOUNDING_CUTOFF).getTime()
}

// A case counts as "followed up" once it has an after photo or X-ray.
export const AFTER_KINDS = ['after', 'xray_after']

export interface ViewerDentist {
  id: string
  name: string
  slug: string
  email: string
  city: string | null
  is_active: boolean
  is_verified: boolean
}

// The signed-in dentist on this host, or null. Auth is per domain, so this
// is the dentistinindia.in session, not the city-site one.
export async function getViewerDentist(): Promise<ViewerDentist | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const { data } = await supabase
    .from('dentists')
    .select('id, name, slug, email, city, is_active, is_verified')
    .eq('email', user.email)
    .single()
  if (!data) return null
  return {
    id: data.id, name: data.name, slug: data.slug, email: data.email, city: data.city,
    is_active: !!data.is_active, is_verified: !!data.is_verified,
  }
}

export function cityNameOf(slug: string | null | undefined): string | null {
  if (!slug) return null
  return (CITY_CONFIGS as Record<string, { cityName: string }>)[slug]?.cityName ?? null
}

export function cityDomainOf(slug: string | null | undefined): string | null {
  if (!slug) return null
  return (CITY_CONFIGS as Record<string, { domain: string }>)[slug]?.domain ?? null
}

export function initialsOf(name: string | null | undefined): string {
  return (cleanName(name) || 'D').split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

export function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === '42703' || err.code === 'PGRST204' || err.code === '42P01' || err.code === 'PGRST205') return true
  return /could not find the .* (column|table)|(column|relation) .* does not exist/i.test(err.message || '')
}

// Skills a dentist can pick on the claim page (top 3 shown to patients).
export const SKILL_OPTIONS = [
  'Implants', 'Root canal', 'Braces', 'Aligners', 'Smile design', 'Full-mouth rehab',
  'Crowns and bridges', 'Gum treatment', 'Wisdom teeth', 'Kids dentistry', 'Dentures', 'Teeth whitening',
]

export const EVENT_KIND_LABEL: Record<string, string> = {
  exhibition: 'Exhibition',
  course: 'Hands-on course',
  seminar: 'Seminar',
  study_club: 'Study club',
  conference: 'Conference',
}

// Shared look for the national pages (inline styles only, per repo rules).
export const ui = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 16px 64px' } as React.CSSProperties,
  h1: { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28, lineHeight: 1.2, color: '#0F1923', margin: '0 0 8px' } as React.CSSProperties,
  h2: { fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18, color: '#0F1923', margin: '0 0 12px' } as React.CSSProperties,
  sub: { fontSize: 15, color: '#475569', lineHeight: 1.6, margin: 0 } as React.CSSProperties,
  card: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16 } as React.CSSProperties,
  btn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: '0 18px', borderRadius: 10, background: '#1D4ED8', color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' } as React.CSSProperties,
  btnGhost: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: '0 18px', borderRadius: 10, background: '#fff', color: '#0F1923', fontWeight: 700, fontSize: 15, textDecoration: 'none', border: '1px solid #CBD5E1', cursor: 'pointer', fontFamily: 'var(--font-body)' } as React.CSSProperties,
  chip: (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', minHeight: 38, padding: '0 14px', borderRadius: 999,
    fontSize: 13, fontWeight: active ? 700 : 500, textDecoration: 'none', cursor: 'pointer',
    background: active ? '#1D4ED8' : '#fff', color: active ? '#fff' : '#0F1923',
    border: active ? '1px solid #1D4ED8' : '1px solid #CBD5E1', fontFamily: 'var(--font-body)',
  }),
  pill: (bg: string, color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: bg, color,
  }),
}

// The network pages exist on every host (one Next app serves all domains),
// but they only make sense on dentistinindia.in. City hosts get a 404.
export async function isNationalRequest(): Promise<boolean> {
  const { headers } = await import('next/headers')
  const { isNationalHost } = await import('@/config/cities')
  const h = await headers()
  return h.get('x-is-national') === '1' || isNationalHost(h.get('x-forwarded-host') || h.get('host'))
}
