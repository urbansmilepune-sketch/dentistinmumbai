import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Portfolio domains with no site of their own: spelling variants and
// duplicates point at the real city site for good. Every other owned city
// domain is a CITY_CONFIGS entry (see `opening` in src/config/cities.ts).
const ALIAS_DOMAINS: Record<string, string> = {
  'dentistin.in': 'https://dentistinindia.in',
  'dentistinsambhajinager.in': 'https://dentistinsambhajinagar.com',
  'dentistinsambhajinager.com': 'https://dentistinsambhajinagar.com',
  'dentistinaurangabad.in': 'https://dentistinsambhajinagar.com',
  'dentistinaurangabad.com': 'https://dentistinsambhajinagar.com',
  'dentistinkolhapur.com': 'https://dentistinkolhapur.in',
  'dentistinvizag.com': 'https://dentistinvisakhapatnam.com',
}

const hostPattern = (domain: string) => `(www\\.)?${domain.replace(/\./g, '\\.')}`

const PORTFOLIO_REDIRECTS = [
  ...Object.entries(ALIAS_DOMAINS).map(([domain, target]) => ({
    source: '/:path*',
    has: [{ type: 'host' as const, value: hostPattern(domain) }],
    destination: `${target}/:path*`,
    permanent: true,
  })),
]

const nextConfig: NextConfig = {
  // Put <title> and og: tags in the <head> of every response, for every
  // client. By default Next 16 only does that for a list of known bots and
  // streams metadata into <body> for everyone else. WhatsApp builds its link
  // preview on the sender's phone or desktop app, and those requests don't
  // always carry a user agent Next recognises: they got the tags late in
  // <body> and showed no preview at all.
  htmlLimitedBots: /.*/,

  // Share card pictures (src/lib/shareCards.tsx) read the Inter font files
  // from disk; make sure they ship with those functions.
  outputFileTracingIncludes: {
    '/api/og/**': ['./src/assets/fonts/**/*'],
  },

  // Build assets carry no content worth indexing, and robots.txt doesn't
  // disallow /_next/. An X-Robots-Tag keeps the chunks out of the index even
  // when a crawler reaches one directly from a rendered page.
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
      },
      // Dentist app alerts worker. Never cached, so a fix reaches phones on
      // the next app open.
      {
        source: '/dentist-sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ]
  },

  // Consolidate empty city domains into Mumbai so traffic doesn't hit blank
  // pages. Matched by request host, with path preserved on the destination.
  async redirects() {
    return [
      ...PORTFOLIO_REDIRECTS,
      {
        source: '/:path*',
        has: [{ type: 'host', value: '(www\\.)?dentistinthane\\.com' }],
        destination: 'https://dentistinmumbai.in/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: '(www\\.)?dentistinnavimumbai\\.in' }],
        destination: 'https://dentistinmumbai.in/:path*',
        permanent: true,
      },
      // Bengaluru spelling aliases → the canonical Bangalore domain. Both are
      // defensive registrations, not city configs — dentistinbangalore.in is
      // the only Karnataka-metro domain in CITY_CONFIGS.
      {
        source: '/:path*',
        has: [{ type: 'host', value: '(www\\.)?dentistinbengaluru\\.in' }],
        destination: 'https://dentistinbangalore.in/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: '(www\\.)?dentistinbengaluru\\.com' }],
        destination: 'https://dentistinbangalore.in/:path*',
        permanent: true,
      },
      // National consolidation — the /insights hub replaces the separate
      // Cases + Expert Advice surfaces on dentistinindia.in ONLY. Exact-path
      // sources so detail routes (/cases/[id], /articles/[city]/[slug]) are NOT
      // caught; Next forwards any query string onto the destination. City
      // domains have no /cases and keep their own /articles hub — no host match.
      //
      // Since the social-layer freeze /insights is articles-only, so both of
      // these land on the bare hub rather than a ?tab= that no longer exists.
      // /cases/[id] is deliberately still served: the six approved cases are
      // indexable and sitemap-listed, so their URLs must keep resolving.
      // '/cases' used to 301 to /insights during the social-layer freeze.
      // Since the Nov 2026 network v1 it is the dentists-only case library
      // again, so that redirect is gone.
      {
        source: '/articles',
        has: [{ type: 'host', value: '(www\\.)?dentistinindia\\.in' }],
        destination: '/insights',
        permanent: true,
      },
      // /feed is gone with the social layer. It was noindex and never in the
      // sitemap, so there's no crawl equity to preserve — this exists purely
      // so signed-in dentists with a bookmark land somewhere sensible.
      {
        source: '/feed',
        has: [{ type: 'host', value: '(www\\.)?dentistinindia\\.in' }],
        destination: '/',
        permanent: false,
      },
      // Section 7 — static 301s for legacy/dead URLs surfaced in GSC. These map
      // old flat URLs and retired blog posts onto their live equivalents so the
      // crawl equity transfers instead of 404-ing. Verified live on 2026-07-09:
      // all destinations resolve (treatments dental-implants/root-canal exist;
      // /area/koregaon-park exists in Pune; /privacy and /dentists exist).
      // The consent/cookie redirects from the ticket are intentionally omitted
      // — there are no /consent or /cookies pages to point them at.
      { source: '/dentist-in-koregaon-park', destination: '/area/koregaon-park', permanent: true },
      { source: '/blog/best-dental-clinics-pune-guide-2026', destination: '/dentists', permanent: true },
      { source: '/blog/dental-implants-pune-cost-types-success', destination: '/treatment/dental-implants', permanent: true },
      { source: '/blog/root-canal-treatment-pune-cost-procedure', destination: '/treatment/root-canal', permanent: true },
      { source: '/privacy-policy', destination: '/privacy', permanent: true },
      // More dead URLs from the GSC "Not found (404)" export, Nov 2026. The
      // privacy page covers cookies, so the old cookie/consent policy URLs
      // land there.
      { source: '/blog/teeth-whitening-pune-methods-costs', destination: '/treatment/teeth-whitening', permanent: true },
      { source: '/cookie-policy', destination: '/privacy', permanent: true },
      { source: '/consent-policy', destination: '/privacy', permanent: true },
      { source: '/forgot-password', destination: '/for-dentists/forgot-password', permanent: true },
      { source: '/dentist/register', destination: '/for-dentists/register', permanent: true },
      { source: '/area', destination: '/dentists', permanent: true },
      // /blog was an empty "coming soon" page with noindex, yet it sat in the
      // sitemap (one of the GSC "Excluded by noindex" URLs). Articles live at
      // /articles now.
      { source: '/blog', destination: '/articles', permanent: true },
    ]
  },
};

// `withSentryConfig` wires up source-map upload (when SENTRY_AUTH_TOKEN is
// present) and proxies error/perf instrumentation through the build.
// `org` is a placeholder — swap "your-sentry-org" for the real slug from
// the Sentry dashboard before enabling source-map upload.
export default withSentryConfig(nextConfig, {
  org: "your-sentry-org",
  project: "dentistinmumbai",
  silent: true,
  // Include more files in the client bundle source-map upload so deep
  // Next-injected chunks (e.g. _next/static internals) still resolve to
  // readable frames in the Sentry stack viewer.
  widenClientFileUpload: true,
  // Note on options removed in @sentry/nextjs v10:
  //   `hideSourceMaps` — gone from SentryBuildOptions; production builds
  //     already don't ship readable maps to the CDN by default.
  //   `disableLogger`  — deprecated; the replacement is the Next config
  //     `webpack.treeshake.removeDebugLogging`, and the SDK's own logger
  //     is already silent in production. Re-add either via the modern
  //     equivalent once a real DSN is wired.
});
