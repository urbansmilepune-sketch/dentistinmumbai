// Next 16 server-side instrumentation entry point. Called once when a new
// Next server boots — must complete before the server takes traffic. We
// fan out to the runtime-specific Sentry config file so each runtime
// gets its own Sentry.init with the right SDK (Node vs Edge).
//
// The browser counterpart is `sentry.client.config.ts`, which Sentry's
// webpack plugin wires into the client bundle automatically — no explicit
// `instrumentation-client.ts` needed.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
