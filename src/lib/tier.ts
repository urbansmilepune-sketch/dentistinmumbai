// Tier comparison helper for the freemium gating in the dashboard.
// Tiers escalate left-to-right: free < silver < gold < featured. The dentist
// row stores the literal slug in `dentists.tier`; gating code asks
// `tierMeets(dentist.tier, 'silver')` rather than open-coding string compares
// at every callsite so a future tier insertion (e.g. 'plus') only edits this
// table.

export type Tier = 'free' | 'silver' | 'gold' | 'featured'

const RANK: Record<Tier, number> = { free: 0, silver: 1, gold: 2, featured: 3 }

export function normalizeTier(v: unknown): Tier {
  return v === 'silver' || v === 'gold' || v === 'featured' ? v : 'free'
}

/** True when `have` is at least as privileged as `need`. */
export function tierMeets(have: unknown, need: Tier): boolean {
  return RANK[normalizeTier(have)] >= RANK[need]
}

export const TIER_LABEL: Record<Tier, string> = {
  free: 'Free',
  silver: '✦ Silver',
  gold: '⭐ Gold',
  featured: '🔥 Featured',
}

// ── 30-day free trial ────────────────────────────────────────────────────
// Approved dentists get 30 days of Gold-equivalent access starting at
// `dentists.trial_started_at` (stamped in src/lib/approval.ts). The trial
// only ever lifts gating for dentists whose real tier is `free` — anyone
// who has already paid keeps their purchased tier as their effective tier.
// When the trial elapses, `effectiveTier` falls back to the stored tier.

export const TRIAL_DURATION_DAYS = 30
const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000

function trialStartMs(trial_started_at: string | null | undefined): number | null {
  if (!trial_started_at) return null
  const t = new Date(trial_started_at).getTime()
  return Number.isFinite(t) ? t : null
}

/** True when the dentist is inside the 30-day window from trial_started_at. */
export function isInTrial(trial_started_at: string | null | undefined): boolean {
  const start = trialStartMs(trial_started_at)
  if (start === null) return false
  return Date.now() - start < TRIAL_DURATION_MS
}

/**
 * Whole days remaining in the trial, clamped at 0. Returns 0 when the trial
 * is absent or already elapsed so the UI can show "0 days left" without
 * special-casing nulls.
 */
export function trialDaysLeft(trial_started_at: string | null | undefined): number {
  const start = trialStartMs(trial_started_at)
  if (start === null) return 0
  const msLeft = (start + TRIAL_DURATION_MS) - Date.now()
  if (msLeft <= 0) return 0
  // Round up so "0.5 days left" reads as "1 day left" in the banner; the
  // dentist still has access until the millisecond cutoff.
  return Math.ceil(msLeft / (24 * 60 * 60 * 1000))
}

/**
 * The tier callers should use for FEATURE-GATING decisions. Treats a dentist
 * inside their 30-day trial as Gold so the dashboard unlocks; otherwise
 * returns the stored tier. Purchased Silver/Gold/Featured tiers are NEVER
 * downgraded by this function — the trial only escalates `free`.
 */
export function effectiveTier(tier: unknown, trial_started_at: string | null | undefined): Tier {
  const real = normalizeTier(tier)
  if (real === 'free' && isInTrial(trial_started_at)) return 'gold'
  return real
}
