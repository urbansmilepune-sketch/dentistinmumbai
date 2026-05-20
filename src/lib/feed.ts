// Shared feed-building logic used by /feed (server-rendered page) and
// /api/india/feed (JSON endpoint). Pulled out of the page so a future
// mobile app or partner integration can call the JSON route directly
// without reimplementing the join + fallback logic.
//
// Strategy:
//   * If the viewer follows at least one dentist → return up to 50
//     recent approved cases from those dentists.
//   * Otherwise → return up to 20 trending cases as a discovery
//     fallback. Trending score matches /cases:
//     (likes * 3) + (views * 0.1) + (comments * 2) − days_old.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface FeedCase {
  id: string
  title: string
  specialty: string
  complexity: number
  created_at: string
  like_count: number
  comment_count: number
  view_count: number
  thumb: string | null
  dentist: {
    name: string
    slug: string
    city: string | null
    clinic_name: string | null
    profile_photo: string | null
    is_verified: boolean | null
  } | null
}

export interface FeedResult {
  cases: FeedCase[]
  /** 'following' = at least one followed dentist; 'trending' = fallback */
  source: 'following' | 'trending'
  followingCount: number
}

const FEED_LIMIT = 50
const TRENDING_FALLBACK_LIMIT = 20
const TRENDING_WINDOW_DAYS = 14

function trendingScore(c: { like_count: number; view_count: number; comment_count: number; created_at: string }): number {
  const days = (Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)
  return (c.like_count * 3) + (c.view_count * 0.1) + (c.comment_count * 2) - days
}

function pickThumb(photos: Array<{ case_id: string; url: string; kind: string }>, caseId: string): string | null {
  const here = photos.filter(p => p.case_id === caseId)
  if (here.length === 0) return null
  return (here.find(p => p.kind === 'before' || p.kind === 'after') || here[0]).url
}

export async function buildFeedFor(admin: SupabaseClient, dentistId: string): Promise<FeedResult> {
  // Who does this dentist follow?
  const { data: follows } = await admin
    .from('dentist_follows').select('following_id').eq('follower_id', dentistId)
  const followingIds = (follows || []).map((f: any) => f.following_id as string)

  let rows: any[] = []
  let source: 'following' | 'trending' = 'following'

  if (followingIds.length > 0) {
    const { data } = await admin
      .from('cases')
      .select('id, title, specialty, complexity, created_at, like_count, comment_count, view_count, dentists(name, slug, city, clinic_name, profile_photo, is_verified)')
      .eq('status', 'approved')
      .in('dentist_id', followingIds)
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT)
    rows = data || []
  } else {
    source = 'trending'
    const cutoff = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await admin
      .from('cases')
      .select('id, title, specialty, complexity, created_at, like_count, comment_count, view_count, dentists(name, slug, city, clinic_name, profile_photo, is_verified)')
      .eq('status', 'approved')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(200)
    const scored = (data || []).map((r: any) => ({ ...r, _score: trendingScore({ like_count: r.like_count || 0, view_count: r.view_count || 0, comment_count: r.comment_count || 0, created_at: r.created_at }) }))
    scored.sort((a: any, b: any) => b._score - a._score)
    rows = scored.slice(0, TRENDING_FALLBACK_LIMIT)
  }

  // Thumbnails for every case in one query.
  const ids = rows.map(r => r.id as string)
  let photos: Array<{ case_id: string; url: string; kind: string }> = []
  if (ids.length) {
    const { data: ph } = await admin
      .from('case_photos').select('case_id, url, kind, display_order')
      .in('case_id', ids).order('display_order')
    photos = (ph || []) as any
  }

  const cases: FeedCase[] = rows.map(r => ({
    id: r.id,
    title: r.title,
    specialty: r.specialty,
    complexity: r.complexity,
    created_at: r.created_at,
    like_count: r.like_count || 0,
    comment_count: r.comment_count || 0,
    view_count: r.view_count || 0,
    thumb: pickThumb(photos, r.id),
    dentist: r.dentists,
  }))

  return { cases, source, followingCount: followingIds.length }
}
