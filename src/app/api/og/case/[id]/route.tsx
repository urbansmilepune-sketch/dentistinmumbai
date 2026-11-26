import { brandCard, cardFormat, caseCard, loadCaseForShare } from '@/lib/shareCards'

// Share card picture for a case: /api/og/case/<readable-slug or uuid>.
// ?format=story gives the tall Instagram story version.
// No clinical photo or case text ever goes on it (see src/lib/shareCards.tsx).

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const format = cardFormat(req)
  try {
    const c = await loadCaseForShare(id)
    return c ? caseCard(c, format) : brandCard(format)
  } catch (e) {
    console.error('[og/case] failed', e)
    return brandCard(format)
  }
}
