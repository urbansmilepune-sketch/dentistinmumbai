import { brandCard, cardFormat } from '@/lib/shareCards'

// Plain DentistIn India share card: /api/og/brand. The default link preview
// picture for dentistinindia.in pages that have no card of their own
// (home, /join, /claim, /first-case).

export async function GET(req: Request) {
  return brandCard(cardFormat(req))
}
