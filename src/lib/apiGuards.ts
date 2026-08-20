// Shared request guards for public/expensive API routes.
//
// Added 2026-08-20 after a recurring scanner (34.181.245.13, 4 hits in two
// weeks) probed /fetch, /proxy, /download and /read behind spoofed crawler
// user agents (Amazonbot, ChatGPT-User, Google-Extended). Those four paths are
// now answered with a cacheable 410 (see src/app/{fetch,proxy,download,read}),
// and the guards here extend the existing per-IP rate limiter to the endpoints
// that actually cost money when hammered.
//
// The limiter itself lives in registrationGuards.ts and is imported (not
// re-implemented) so every caller shares ONE in-memory window map. It is
// per-serverless-instance state: it resets on cold start and is not shared
// across concurrent instances, so treat it as defense-in-depth, never as the
// primary gate. There is no Redis/KV on this project (checked: no @vercel/kv,
// @upstash/redis or ioredis in package.json; no KV_URL / UPSTASH_REDIS_REST_URL
// / REDIS_URL in .env.local), and adding one is out of scope.

import { NextResponse, type NextRequest } from 'next/server'
import { clientIp, withinRateLimit } from './registrationGuards'

export { clientIp, withinRateLimit }

// Hard blocklist. Kept tiny and explicit — this is not a threat feed, just the
// handful of IPs observed probing the platform.
//
// NOTE: this can only be enforced inside the route handlers that call
// `blockedIpResponse`. There is no middleware.ts on this project (the only
// middleware is src/proxy.ts, which handles city routing and is off-limits),
// so a genuinely global block belongs in the Vercel Firewall dashboard
// (Project → Firewall → Deny IP). See the commit message for details.
export const BLOCKED_IPS = new Set([
  '34.181.245.13',
])

/** True when the request's client IP is on the hard blocklist. */
export function isBlockedIp(request: NextRequest): boolean {
  return BLOCKED_IPS.has(clientIp(request))
}

/**
 * 403 for blocklisted IPs, otherwise null. Call as the first line of a public
 * handler: `const blocked = blockedIpResponse(request); if (blocked) return blocked`.
 */
export function blockedIpResponse(request: NextRequest): Response | null {
  if (!isBlockedIp(request)) return null
  return new Response('Forbidden', { status: 403 })
}

// Crawlers we never want to rate-limit. Matched on user agent only, which is
// trivially spoofable — that is acceptable *because this list only ever grants
// an exemption from throttling*, never authentication or data access. The
// scanner above spoofed Amazonbot / ChatGPT-User / Google-Extended, none of
// which are here: only the two search crawlers whose traffic we actively want.
// A reverse-DNS verification would be the real check, but it costs a lookup on
// every request and buys nothing given the blast radius.
const GOOD_BOT_UA = /\b(Googlebot|Google-InspectionTool|Bingbot|AdsBot-Google)\b/i

/** True for the search crawlers that are exempt from rate limiting. */
export function isKnownGoodBot(request: NextRequest): boolean {
  return GOOD_BOT_UA.test(request.headers.get('user-agent') || '')
}

/**
 * Per-IP rate limit for a named endpoint. Returns a 429 (with `Retry-After`)
 * when the caller is over budget, or null when the request may proceed.
 * Blocklisted IPs get a 403 from here too, so one call covers both guards.
 *
 * `retryAfterSeconds` is what we tell the client to wait; it is independent of
 * `windowMs` on purpose — a 1-hour window with a 60s Retry-After nudges a
 * well-behaved client to back off without publishing the real window length.
 */
export function guardRequest(
  request: NextRequest,
  scope: string,
  { max, windowMs, retryAfterSeconds = 60, message = 'Too many requests. Please try again shortly.' }:
    { max: number; windowMs: number; retryAfterSeconds?: number; message?: string },
): Response | null {
  const blocked = blockedIpResponse(request)
  if (blocked) return blocked

  if (isKnownGoodBot(request)) return null

  if (!withinRateLimit(`${scope}:${clientIp(request)}`, max, windowMs)) {
    return NextResponse.json(
      { error: message },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    )
  }
  return null
}
