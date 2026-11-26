// A link into the dentist's city-site dashboard. It is a tiny form because
// the national site first creates a one-time sign-in token (POST), then
// sends the browser to the city domain already signed in.
// See src/app/api/auth/clinic-handoff/route.ts.

interface Props {
  page: string
  style?: React.CSSProperties
  children: React.ReactNode
  label?: string
}

export default function ClinicLink({ page, style, children, label }: Props) {
  return (
    <form method="post" action="/api/auth/clinic-handoff" style={{ display: 'contents' }}>
      <input type="hidden" name="page" value={page} />
      <button type="submit" aria-label={label} style={{ cursor: 'pointer', fontFamily: 'var(--font-body)', ...style }}>{children}</button>
    </form>
  )
}
