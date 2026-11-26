// Browser side of invite links: remember the code for 30 days and read it
// back on the join form. localStorage only; failures are ignored (private
// mode etc.) because the code also travels in the /join?ref= link.

const KEY = 'dentistin_invite'
const DAYS_30 = 30 * 24 * 60 * 60 * 1000

export function rememberInvite(code: string): void {
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })) } catch { /* ignore */ }
}

export function recallInvite(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { code?: string; at?: number }
    if (!v.code || !v.at || Date.now() - v.at > DAYS_30) return null
    return v.code
  } catch {
    return null
  }
}
