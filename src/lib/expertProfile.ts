// Data for a public expert profile on dentistinindia.in. Shared by the
// profile page (/professional/[slug]) and its share card image
// (/api/og/profile/[slug]) so both always show the same numbers.

import { getSpecialty } from '@/lib/dentalSpecialties'
import { adminDb, AFTER_KINDS } from '@/lib/national'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>

export interface Loaded {
  dentist: Row
  caseCount: number
  followupCount: number
  answersCount: number
  helpfulCount: number
  likeCount: number
  followerCount: number
  topSpecialties: Array<{ slug: string; count: number }>
}

export async function loadExpertProfile(slug: string): Promise<Loaded | null> {
  const db = adminDb()
  // Slugs are not globally unique across cities: the oldest registration
  // owns the canonical one (same rule as before).
  const { data: matches } = await db
    .from('dentists').select('*')
    .eq('slug', slug).order('created_at', { ascending: true }).limit(1)
  const dentist = matches?.[0]
  if (!dentist || dentist.is_active === false) return null

  const { data: cases } = await db
    .from('cases').select('id, specialty, like_count')
    .eq('dentist_id', dentist.id).eq('status', 'approved').limit(1000)
  const caseRows = (cases || []) as Array<{ id: string; specialty: string; like_count: number | null }>
  const likeCount = caseRows.reduce((n, c) => n + (c.like_count || 0), 0)
  const { count: followerCount } = await db
    .from('dentist_follows').select('id', { count: 'exact', head: true }).eq('following_id', dentist.id)

  let followupCount = 0
  if (caseRows.length) {
    const { data: afterPhotos } = await db
      .from('case_photos').select('case_id')
      .in('case_id', caseRows.map(c => c.id)).in('kind', AFTER_KINDS)
    followupCount = new Set((afterPhotos || []).map((p: any) => p.case_id)).size
  }

  const { data: myComments } = await db
    .from('case_comments').select('id').eq('dentist_id', dentist.id).limit(1000)
  const commentIds = (myComments || []).map((c: any) => c.id as string)
  let helpfulCount = 0
  if (commentIds.length) {
    const { count, error } = await db
      .from('case_comment_helpful').select('comment_id', { count: 'exact', head: true })
      .in('comment_id', commentIds)
    if (!error) helpfulCount = count ?? 0
  }

  const bySpec = new Map<string, number>()
  for (const c of caseRows) bySpec.set(c.specialty, (bySpec.get(c.specialty) || 0) + 1)
  const topSpecialties = Array.from(bySpec.entries())
    .map(([s, count]) => ({ slug: s, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)

  return { dentist, caseCount: caseRows.length, followupCount, answersCount: commentIds.length, helpfulCount, likeCount, followerCount: followerCount ?? 0, topSpecialties }
}

export function expertHeadline(d: Row, top: Loaded['topSpecialties']): string {
  const skills: string[] = Array.isArray(d.top_skills) ? d.top_skills : []
  if (skills.length) return skills.slice(0, 2).join(' and ')
  const spec = top[0] ? getSpecialty(top[0].slug)?.label : null
  if (spec) return spec
  if (Array.isArray(d.specialties) && d.specialties.length) return d.specialties[0]
  return 'Dentist'
}

