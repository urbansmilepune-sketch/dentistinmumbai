// Shared handler for paths that exist only because bots probe them.
//
// /fetch, /proxy, /download and /read are classic open-proxy / SSRF / local-file
// probe targets. This platform has never served them, so a 410 Gone is the
// honest answer: it tells any legitimate crawler to drop the URL permanently
// (a 404 invites re-crawling) and it costs nothing to produce.
//
// The long `cache-control` is the point of the exercise. The first hit runs this
// (trivial, no DB, no auth) handler; Vercel's CDN then serves the cached 410 for
// a year, so repeat probes never reach a function again.
//
// Why not a `routes` entry in vercel.json (the zero-invocation ideal)? The
// legacy `routes` key is mutually exclusive with `redirects` — Vercel rejects a
// config containing both, and vercel.json already carries 17 host redirects.
// Dropping those to gain an edge rule is a much worse trade. A Vercel Firewall
// rule is the correct zero-invocation fix and is dashboard-only.

const HEADERS = {
  'cache-control': 'public, max-age=31536000, immutable',
  'cdn-cache-control': 'public, max-age=31536000',
  'content-type': 'text/plain; charset=utf-8',
  'x-robots-tag': 'noindex, nofollow',
} as const

/** 410 Gone with a one-year cache, for every method. */
export function gone(): Response {
  return new Response('410 Gone', { status: 410, headers: HEADERS })
}

// Route handlers must export one function per method, so bundle the set the
// probes actually use. Anything not listed here falls through to Next's own
// 405 — also fine, and also cheap.
export const GET = gone
export const HEAD = gone
export const POST = gone
export const PUT = gone
export const DELETE = gone
export const OPTIONS = gone
