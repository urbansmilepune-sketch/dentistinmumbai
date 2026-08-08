import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Consolidate empty city domains into Mumbai so traffic doesn't hit blank
  // pages. Matched by request host, with path preserved on the destination.
  async redirects() {
    return [
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
      // National consolidation — the merged /insights hub replaces the separate
      // Cases + Expert Advice surfaces on dentistinindia.in ONLY. Exact-path
      // sources so detail routes (/cases/[id], /articles/[city]/[slug]) are NOT
      // caught; Next forwards any query string onto the destination. City
      // domains have no /cases and keep their own /articles hub — no host match.
      {
        source: '/cases',
        has: [{ type: 'host', value: '(www\\.)?dentistinindia\\.in' }],
        destination: '/insights?tab=cases',
        permanent: true,
      },
      {
        source: '/articles',
        has: [{ type: 'host', value: '(www\\.)?dentistinindia\\.in' }],
        destination: '/insights?tab=articles',
        permanent: true,
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
