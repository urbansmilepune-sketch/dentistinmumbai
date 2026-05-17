import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
