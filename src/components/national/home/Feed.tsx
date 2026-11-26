'use client'

// Community feed on the dentist home: cases and Question / Update posts,
// newest first, with Following / All India / my-specialty tabs. Case cards
// open the case page (likes, helpful marks and replies live there). Posts
// can be answered inline; the author can delete their own.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Avatar from './Avatar'
import type { FeedItem, HomeEvent } from '@/lib/dentistHome'

interface Props {
  items: FeedItem[]
  meId: string
  followingIds: string[]
  specialty: { slug: string; label: string } | null
  event: HomeEvent | null
  cityName: string | null
}

type Tab = 'following' | 'all' | 'specialty'

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }
const act: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer', textDecoration: 'none', fontFamily: 'var(--font-body)' }

export default function Feed({ items, meId, followingIds, specialty, event, cityName }: Props) {
  const following = useMemo(() => new Set([...followingIds, meId]), [followingIds, meId])
  const [tab, setTab] = useState<Tab>(followingIds.length ? 'following' : 'all')

  const shown = items.filter(it => {
    if (tab === 'following') return following.has(it.author.id)
    if (tab === 'specialty') return it.type === 'case' && specialty && it.specialty === specialty.slug
    return true
  })

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'following', label: 'Following' },
    { key: 'all', label: 'All India' },
    ...(specialty ? [{ key: 'specialty' as Tab, label: specialty.label }] : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E2E8F0', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            style={{ border: 'none', background: 'none', padding: '10px 12px', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'var(--font-body)', color: tab === t.key ? '#0F1923' : '#64748B', borderBottom: tab === t.key ? '2px solid #1D4ED8' : '2px solid transparent', marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <div style={{ ...card, borderStyle: 'dashed', alignItems: 'center', textAlign: 'center', padding: 28 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>
            {tab === 'following'
              ? 'Nothing here yet. Follow dentists from their cases or from the suggestions, and their new posts show up here.'
              : 'No posts yet. Be the first to share a case.'}
          </p>
          {tab === 'following' && <button type="button" style={act} onClick={() => setTab('all')}>See all of India</button>}
        </div>
      )}

      {shown.map((it, i) => (
        <div key={`${it.type}-${it.id}`} style={{ display: 'contents' }}>
          {it.type === 'case' ? <CaseCard it={it} /> : <PostCard it={it} meId={meId} />}
          {i === 1 && event && <EventCard event={event} cityName={cityName} />}
        </div>
      ))}
      {shown.length > 0 && shown.length < 2 && event && <EventCard event={event} cityName={cityName} />}

      <Link href="/cases" style={{ ...act, justifyContent: 'center', minHeight: 44 }}>Browse the full case library</Link>
    </div>
  )
}

function Who({ a, when, pill }: { a: FeedItem['author']; when: string; pill?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <Link href={`/professional/${a.slug}`} aria-label={a.name} style={{ display: 'inline-flex' }}><Avatar name={a.name} photo={a.photo} size={40} /></Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link href={`/professional/${a.slug}`} style={{ fontSize: 14.5, fontWeight: 700, color: '#0F1923', textDecoration: 'none' }}>{a.name}</Link>
        <div style={{ fontSize: 12.5, color: '#64748B' }}>{when}</div>
      </div>
      {pill}
    </div>
  )
}

function CaseCard({ it }: { it: Extract<FeedItem, { type: 'case' }> }) {
  return (
    <article style={card}>
      <Who a={it.author} when={ago(it.createdAt)} pill={it.specialtyLabel && (
        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: it.specialtyBg, color: it.specialtyColor, whiteSpace: 'nowrap' }}>{it.specialtyLabel}</span>
      )} />
      <Link href={it.href} style={{ textDecoration: 'none', color: '#0F1923', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 16.5, lineHeight: 1.35 }}>{it.title}</h3>
        {it.summary && <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.55 }}>{it.summary}</p>}
        {it.photos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(2, it.photos.length)}, minmax(0, 1fr))`, gap: 6 }}>
            {it.photos.map(src => (
              <div key={src} style={{ aspectRatio: '4 / 3', borderRadius: 10, overflow: 'hidden', background: '#1E293B' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        )}
      </Link>
      <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: '#64748B', flexWrap: 'wrap' }}>
        <span style={{ color: it.replies ? '#64748B' : '#B45309', fontWeight: it.replies ? 400 : 700 }}>{it.replies ? `${it.replies} repl${it.replies === 1 ? 'y' : 'ies'}` : 'Needs an answer'}</span>
        {it.likes > 0 && <span>{it.likes} like{it.likes === 1 ? '' : 's'}</span>}
        {it.hasFollowup && <span style={{ color: '#166534', fontWeight: 700 }}>Has follow-up</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid #E2E8F0', paddingTop: 10 }}>
        <Link href={it.href} style={act}>{it.replies ? 'Read and reply' : 'Answer this case'}</Link>
      </div>
    </article>
  )
}

function PostCard({ it, meId }: { it: Extract<FeedItem, { type: 'post' }>; meId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [gone, setGone] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const mine = it.author.id === meId

  async function send() {
    if (busy || reply.trim().length < 2) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/network-posts/${it.id}/replies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: reply }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data?.error || 'Could not reply. Please try again.'); return }
      setReply('')
      router.refresh()
    } catch { setErr('Network error. Please try again.') } finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/network-posts/${it.id}`, { method: 'DELETE' })
      if (!res.ok) { setErr('Could not delete. Please try again.'); return }
      setGone(true)
      router.refresh()
    } catch { setErr('Network error. Please try again.') } finally { setBusy(false) }
  }

  if (gone) return null
  const isQ = it.kind === 'question'
  return (
    <article style={card}>
      <Who a={it.author} when={ago(it.createdAt)} pill={
        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: isQ ? '#EFF6FF' : '#F1F5F9', color: isQ ? '#1E3A8A' : '#334155' }}>{isQ ? 'Question' : 'Update'}</span>
      } />
      <p style={{ margin: 0, fontSize: 15, color: '#0F1923', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{it.body}</p>

      {it.replies.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(open ? it.replies : it.replies.slice(-2)).map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 10, background: '#F8FAFC', borderRadius: 10, padding: '10px 12px' }}>
              <Avatar name={r.author.name} photo={r.author.photo} size={28} />
              <div style={{ minWidth: 0 }}>
                <Link href={`/professional/${r.author.slug}`} style={{ fontSize: 13, fontWeight: 700, color: '#0F1923', textDecoration: 'none' }}>{r.author.name}</Link>
                <span style={{ fontSize: 12, color: '#64748B' }}> · {ago(r.createdAt)}</span>
                <p style={{ margin: '2px 0 0', fontSize: 13.5, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.body}</p>
              </div>
            </div>
          ))}
          {!open && it.replies.length > 2 && (
            <button type="button" onClick={() => setOpen(true)} style={{ ...act, border: 'none', padding: 0, minHeight: 28, color: '#1D4ED8' }}>See all {it.replies.length} replies</button>
          )}
        </div>
      )}

      {open && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label htmlFor={`r-${it.id}`} style={{ position: 'absolute', left: -9999 }}>Your reply</label>
          <textarea id={`r-${it.id}`} value={reply} onChange={e => setReply(e.target.value)} maxLength={1000} placeholder={isQ ? 'Share your answer' : 'Write a reply'}
            style={{ flex: 1, minWidth: 0, minHeight: 60, border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', resize: 'vertical', fontSize: 14, fontFamily: 'var(--font-body)', background: '#F8FAFC', color: '#0F1923' }} />
          <button type="button" onClick={send} disabled={busy || reply.trim().length < 2}
            style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: '#1D4ED8', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: busy || reply.trim().length < 2 ? 0.55 : 1, fontFamily: 'var(--font-body)' }}>
            Reply
          </button>
        </div>
      )}
      {err && <div role="alert" style={{ fontSize: 13, color: '#991B1B' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid #E2E8F0', paddingTop: 10, alignItems: 'center' }}>
        <button type="button" style={act} onClick={() => setOpen(o => !o)}>{open ? 'Close' : isQ ? 'Answer' : 'Reply'}{it.replyCount ? ` · ${it.replyCount}` : ''}</button>
        {mine && !confirmDelete && <button type="button" style={{ ...act, marginLeft: 'auto' }} onClick={() => setConfirmDelete(true)}>Delete</button>}
        {mine && confirmDelete && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, color: '#334155' }}>
            Delete this post?
            <button type="button" style={{ ...act, borderColor: '#FECACA', color: '#991B1B' }} disabled={busy} onClick={remove}>Delete</button>
            <button type="button" style={act} onClick={() => setConfirmDelete(false)}>Keep</button>
          </span>
        )}
      </div>
    </article>
  )
}

function EventCard({ event, cityName }: { event: HomeEvent; cityName: string | null }) {
  const d = new Date(event.date + 'T00:00:00')
  return (
    <article style={card}>
      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#64748B' }}>
        {cityName && event.place === cityName ? `Coming up in ${cityName}` : 'Coming up'}
      </div>
      <Link href="/events" style={{ display: 'flex', gap: 14, alignItems: 'center', textDecoration: 'none', color: '#0F1923' }}>
        <div style={{ width: 56, flex: 'none', borderRadius: 10, border: '1px solid #E2E8F0', textAlign: 'center', padding: '6px 0' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{d.getDate()}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>{d.toLocaleDateString('en-IN', { month: 'short' })}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15 }}>{event.title}</div>
          <div style={{ fontSize: 13, color: '#64748B' }}>{event.kindLabel} · {event.place}</div>
        </div>
      </Link>
      <div style={{ display: 'flex', gap: 6, borderTop: '1px solid #E2E8F0', paddingTop: 10 }}>
        <Link href="/events" style={act}>See details</Link>
        <Link href="/events" style={act}>All events</Link>
      </div>
    </article>
  )
}
