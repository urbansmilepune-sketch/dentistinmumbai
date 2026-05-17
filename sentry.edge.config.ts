// Sentry edge runtime initializer (middleware + edge routes). Loaded via
// `instrumentation.ts`. The Vercel-edge runtime has a different surface
// than Node, so this file exists as a separate Sentry.init call even
// though the options happen to match the server config today.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
})
