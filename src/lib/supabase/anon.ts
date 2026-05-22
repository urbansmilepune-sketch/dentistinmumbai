import { createClient } from '@supabase/supabase-js'

// Cookie-less server client for cache-safe public reads. The cookie-bound
// `createClient` in ./server.ts touches request-scoped APIs (cookies()),
// which `unstable_cache` forbids — so any data fetcher that goes through
// the Next.js Data Cache must come through here. Module-level singleton
// because the client carries no per-request state.
let cached: ReturnType<typeof createClient> | null = null

export function createAnonClient() {
  if (cached) return cached
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  return cached
}
