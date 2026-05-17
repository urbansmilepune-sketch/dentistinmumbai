import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// `withSentryConfig` wires up source-map upload (when SENTRY_AUTH_TOKEN is
// present) and proxies error/perf instrumentation through the build. With
// no auth token configured the build skips upload silently, so the wrap
// is safe to leave on in local dev. `silent` suppresses the build banner
// outside CI to keep the dev terminal quiet.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
});
