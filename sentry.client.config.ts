// Sentry browser SDK initializer. Loaded automatically by @sentry/nextjs
// in the client bundle — no manual import is required from app code.
// `dsn=undefined` (no env var set) puts the SDK in disabled mode: every
// API call becomes a no-op, so the placeholder DSN in .env.local won't
// produce errors in local dev until a real DSN is configured.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
})
