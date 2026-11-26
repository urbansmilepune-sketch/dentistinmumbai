// When a paid Featured listing stops being featured. Days count from the
// later of approval and payment, and never run past the event's last day.
export function featuredUntil(e: Record<string, any>): string | null {
  if (e.plan !== 'featured' || e.payment_status !== 'paid' || e.status !== 'approved') return null
  if (e.featured_until) return e.featured_until
  const start = Math.max(Date.parse(e.approved_at || '') || 0, Date.parse(e.paid_at || '') || 0) || Date.now()
  const days = Number(e.feature_days) || 7
  const until = new Date(start + 5.5 * 3600000 + days * 86400000).toISOString().slice(0, 10)
  const last = e.ends_on || e.starts_on
  return last && last < until ? last : until
}

export function isFeaturedNow(e: Record<string, any>, today: string): boolean {
  const u = featuredUntil(e)
  return !!u && u >= today
}

export function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10)
}
