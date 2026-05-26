import { permanentRedirect } from 'next/navigation'

// Short-URL alias. The real login flow lives at /for-dentists/login (which
// is already host-aware and brands itself for dentistinindia.in when served
// on the national domain). permanentRedirect emits a 308 so Search Console
// treats this as a permanent move and doesn't keep /login in the index.
// ?next= is forwarded so post-login redirects survive the bounce.
export default async function LoginAlias({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const target = next && next.startsWith('/') && !next.startsWith('//')
    ? `/for-dentists/login?next=${encodeURIComponent(next)}`
    : '/for-dentists/login'
  permanentRedirect(target)
}
