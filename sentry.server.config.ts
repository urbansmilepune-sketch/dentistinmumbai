// Sentry Node.js SDK initializer for server-side runtime. Loaded via
// `instrumentation.ts` (Next 16 doesn't auto-load sentry.*.config.ts on
// the server — that file convention only fires on the client).
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
})
