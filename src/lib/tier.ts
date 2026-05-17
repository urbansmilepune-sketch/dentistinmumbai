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
