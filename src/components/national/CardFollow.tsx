import FollowButton from './FollowButton'
import type { adminDb } from '@/lib/national'

// Follow button pinned to the top-right corner of a dentist card on
// /experts and /dentists (dentistinindia.in). The card itself stays one
// big link to the profile; this sits beside it (not inside it) so the
// button isn't a button nested in a link. The card's header row needs
// right padding (CARD_FOLLOW_SPACE) so a long name wraps before it.
// On the narrower /dentists cards it sits bottom-left under the stats
// instead, with bottom padding on the card.

export const CARD_FOLLOW_SPACE = 108

export default function CardFollow({ slug, isMe, signedIn, following, autoFollow, pos = { top: 16, right: 16 } }: {
  slug: string
  isMe: boolean
  signedIn: boolean
  following: boolean
  autoFollow: boolean
  /** Where the button sits on the card (default: top-right). */
  pos?: { top?: number; right?: number; bottom?: number; left?: number }
}) {
  return (
    <div style={{ position: 'absolute', ...pos }}>
      {isMe ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 32, padding: '0 12px', borderRadius: 999, background: '#F1F5F9', color: '#475569', fontSize: 12, fontWeight: 700 }}>You</span>
      ) : (
        <FollowButton slug={slug} initialFollowing={following} compact stacked={pos.right !== undefined} signedIn={signedIn} autoFollow={autoFollow} />
      )}
    </div>
  )
}

/** The set of dentist ids the viewer follows, among `ids`. */
export async function followingIdsOf(db: ReturnType<typeof adminDb>, viewerId: string | null, ids: string[]): Promise<Set<string>> {
  if (!viewerId || ids.length === 0) return new Set()
  const out = new Set<string>()
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await db.from('dentist_follows').select('following_id').eq('follower_id', viewerId).in('following_id', ids.slice(i, i + 500))
    if (error) break
    for (const r of (data || []) as Array<{ following_id: string }>) out.add(r.following_id)
  }
  return out
}
