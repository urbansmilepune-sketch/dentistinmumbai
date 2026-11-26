// Data for the signed-in dentist home on dentistinindia.in (Nov 2026).
//
// Left column: the dentist's own profile card (same numbers as their public
// expert profile). Middle: the community feed, mixing approved cases and
// Question / Update posts (network_posts). Right: dentists in the same city
// to follow, the clinic snapshot behind "Manage my clinic", and the status
// of their city-site page.
//
// Every query is pinned to the signed-in dentist's id and runs with the
// service key (several tables have RLS that blocks the dentist role).
// Tables added later (network_posts) are optional: a missing table just
// leaves those items out.

import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb, AFTER_KINDS, cityNameOf, cityDomainOf, isFoundingDentist, EVENT_KIND_LABEL } from '@/lib/national'
import { loadExpertStats, expertHeadline } from '@/lib/expertProfile'
import { followedIds } from '@/lib/followDigest'
import { casePath } from '@/lib/caseSlug'
import { summaryText } from '@/lib/caseSummary'
import { getSpecialty } from '@/lib/dentalSpecialties'
import { drName } from '@/lib/dentistName'
import { setupPct } from '@/lib/setupSteps'
import { GBP_ADDED_EVENT } from '@/lib/googleBooking'
import { placeLabel } from '@/lib/eventCountries'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Author { id: string; name: string; slug: string; city: string | null; photo: string | null }

export type FeedItem =
  | {
      type: 'case'; id: string; href: string; title: string; summary: string
      specialty: string | null; specialtyLabel: string | null; specialtyColor: string; specialtyBg: string
      author: Author; createdAt: string; replies: number; likes: number; photos: string[]; hasFollowup: boolean
    }
  | {
      type: 'post'; id: string; kind: 'question' | 'update'; body: string
      author: Author; createdAt: string; replyCount: number
      replies: Array<{ id: string; body: string; author: Author; createdAt: string }>
    }

export interface HomeEvent { title: string; date: string; kindLabel: string; place: string }
export interface Suggestion { slug: string; name: string; photo: string | null; line: string }

export interface DentistHomeData {
  me: {
    id: string; name: string; slug: string; photo: string | null; qualifications: string | null
    cityName: string | null; headline: string; founding: boolean; verified: boolean; skills: string[]
    cases: number; followers: number; following: number; helpful: number; setup: number
  }
  followingIds: string[]
  feed: FeedItem[]
  postsEnabled: boolean
  event: HomeEvent | null
  suggestions: Suggestion[]
  clinic: {
    cityName: string | null; domain: string | null
    today: number; requests: number; unpaid: number
    live: boolean; reviews: number; googleButton: boolean; profileViews: number
  }
}

function author(d: any): Author {
  return { id: d?.id ?? '', name: drName(d?.name), slug: d?.slug ?? '', city: d?.city ?? null, photo: d?.profile_photo || null }
}

function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function monthStartIso(): string {
  const d = new Date()
  d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

async function loadFeed(db: SupabaseClient): Promise<{ items: FeedItem[]; postsEnabled: boolean }> {
  const [casesRes, postsRes] = await Promise.all([
    db.from('cases')
      .select('id, title, description, specialty, comment_count, like_count, created_at, dentist_id, dentists(id, name, slug, city, profile_photo)')
      .eq('status', 'approved').order('created_at', { ascending: false }).limit(40),
    db.from('network_posts')
      .select('id, kind, body, reply_count, created_at, dentist_id, dentists(id, name, slug, city, profile_photo)')
      .eq('status', 'live').order('created_at', { ascending: false }).limit(40),
  ])
  const postsEnabled = !postsRes.error
  const cases = (casesRes.data || []) as any[]
  const posts = (postsRes.error ? [] : postsRes.data || []) as any[]

  const photos = new Map<string, string[]>()
  const followed = new Set<string>()
  if (cases.length) {
    const { data } = await db.from('case_photos').select('case_id, url, kind, display_order')
      .in('case_id', cases.map(c => c.id)).order('display_order')
    for (const p of (data || []) as Array<{ case_id: string; url: string; kind: string }>) {
      const list = photos.get(p.case_id) || []
      if (list.length < 3) list.push(p.url)
      photos.set(p.case_id, list)
      if (AFTER_KINDS.includes(p.kind)) followed.add(p.case_id)
    }
  }

  const replies = new Map<string, Array<{ id: string; body: string; author: Author; createdAt: string }>>()
  const withReplies = posts.filter(p => (p.reply_count || 0) > 0).map(p => p.id)
  if (withReplies.length) {
    const { data, error } = await db.from('network_post_replies')
      .select('id, post_id, body, created_at, dentists(id, name, slug, city, profile_photo)')
      .in('post_id', withReplies).order('created_at', { ascending: true }).limit(500)
    if (!error) {
      for (const r of (data || []) as any[]) {
        const list = replies.get(r.post_id) || []
        list.push({ id: r.id, body: r.body, author: author(r.dentists), createdAt: r.created_at })
        replies.set(r.post_id, list)
      }
    }
  }

  const items: FeedItem[] = [
    ...cases.map((c): FeedItem => {
      const spec = getSpecialty(c.specialty)
      return {
        type: 'case', id: c.id, href: casePath({ id: c.id, title: c.title, city: c.dentists?.city }),
        title: c.title, summary: summaryText(c.description, 220),
        specialty: c.specialty ?? null, specialtyLabel: spec?.label ?? null,
        specialtyColor: spec?.color ?? '#475569', specialtyBg: spec?.bg ?? '#F1F5F9',
        author: author(c.dentists), createdAt: c.created_at, replies: c.comment_count || 0, likes: c.like_count || 0,
        photos: photos.get(c.id) || [], hasFollowup: followed.has(c.id),
      }
    }),
    ...posts.map((p): FeedItem => ({
      type: 'post', id: p.id, kind: p.kind === 'update' ? 'update' : 'question', body: p.body,
      author: author(p.dentists), createdAt: p.created_at, replyCount: p.reply_count || 0,
      replies: replies.get(p.id) || [],
    })),
  ]
  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return { items: items.slice(0, 50), postsEnabled }
}

async function loadEvent(db: SupabaseClient, city: string | null): Promise<HomeEvent | null> {
  const { data, error } = await db.from('events').select('*').eq('status', 'approved')
    .gte('starts_on', istToday()).order('starts_on').limit(20)
  if (error || !data?.length) return null
  const rows = data as any[]
  const e = rows.find(r => city && r.city === city) || rows[0]
  return { title: e.title, date: e.starts_on, kindLabel: EVENT_KIND_LABEL[e.kind] || 'Event', place: placeLabel(e, cityNameOf) }
}

async function loadSuggestions(db: SupabaseClient, meId: string, city: string | null, following: string[]): Promise<Suggestion[]> {
  if (!city) return []
  const { data, error } = await db.from('dentists')
    .select('id, name, slug, profile_photo, top_skills, specialties, network_claimed_at, created_at')
    .eq('city', city).eq('is_active', true).neq('id', meId)
    .order('created_at', { ascending: true }).limit(300)
  if (error || !data?.length) return []
  const skip = new Set(following)
  const pool = (data as any[]).filter(d => !skip.has(d.id) && d.slug)
  if (!pool.length) return []
  const { data: caseRows } = await db.from('cases').select('dentist_id').eq('status', 'approved').in('dentist_id', pool.map(d => d.id)).limit(1000)
  const caseCount = new Map<string, number>()
  for (const r of (caseRows || []) as Array<{ dentist_id: string }>) caseCount.set(r.dentist_id, (caseCount.get(r.dentist_id) || 0) + 1)
  const score = (d: any) => (caseCount.get(d.id) || 0) * 10 + (d.network_claimed_at ? 5 : 0) + (d.profile_photo ? 1 : 0)
  return pool
    .sort((a, b) => score(b) - score(a))
    .slice(0, 4)
    .map(d => {
      const n = caseCount.get(d.id) || 0
      const what = expertHeadline(d, [])
      return { slug: d.slug, name: drName(d.name), photo: d.profile_photo || null, line: n ? `${what} · ${n} case${n === 1 ? '' : 's'}` : what }
    })
}

async function loadClinic(db: SupabaseClient, dentist: any) {
  const today = istToday()
  const count = (r: { count: number | null; error: unknown }) => (r.error ? 0 : r.count ?? 0)
  const [todayRes, reqRes, unpaidRes, reviewRes, gbpRes, viewsRes] = await Promise.all([
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('appt_date', today).neq('status', 'cancelled'),
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'pending').gte('appt_date', today),
    db.from('invoices').select('id', { count: 'exact', head: true }).eq('dentist_id', dentist.id).in('payment_status', ['pending', 'overdue']),
    db.from('reviews').select('id', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('status', 'approved'),
    db.from('analytics_events').select('id', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('event_type', GBP_ADDED_EVENT),
    db.from('analytics_events').select('id', { count: 'exact', head: true }).eq('dentist_id', dentist.id).eq('event_type', 'profile_view').gte('created_at', monthStartIso()),
  ])
  return {
    today: count(todayRes), requests: count(reqRes), unpaid: count(unpaidRes),
    reviews: count(reviewRes), googleButton: count(gbpRes) > 0, profileViews: count(viewsRes),
  }
}

export async function loadDentistHome(dentistId: string): Promise<DentistHomeData | null> {
  const db = adminDb()
  const { data: dentist } = await db.from('dentists').select('*').eq('id', dentistId).maybeSingle()
  if (!dentist) return null

  const following = await followedIds(db, dentist.id)
  const [stats, followingCount, feed, event, suggestions, clinic] = await Promise.all([
    loadExpertStats(dentist),
    db.from('dentist_follows').select('id', { count: 'exact', head: true }).eq('follower_id', dentist.id),
    loadFeed(db),
    loadEvent(db, dentist.city),
    loadSuggestions(db, dentist.id, dentist.city, following),
    loadClinic(db, dentist),
  ])

  const cityName = cityNameOf(dentist.city)
  return {
    me: {
      id: dentist.id, name: drName(dentist.name), slug: dentist.slug, photo: dentist.profile_photo || null,
      qualifications: dentist.qualifications || null, cityName,
      headline: expertHeadline(dentist, stats.topSpecialties),
      founding: isFoundingDentist(dentist.created_at), verified: !!dentist.is_verified,
      skills: Array.isArray(dentist.top_skills) ? dentist.top_skills.slice(0, 3) : [],
      cases: stats.caseCount, followers: stats.followerCount, following: followingCount.count ?? 0,
      helpful: stats.helpfulCount, setup: setupPct(dentist),
    },
    followingIds: following,
    feed: feed.items,
    postsEnabled: feed.postsEnabled,
    event,
    suggestions,
    clinic: { cityName, domain: cityDomainOf(dentist.city), live: dentist.is_active !== false, ...clinic },
  }
}

