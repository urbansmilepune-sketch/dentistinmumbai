// "From ₹X" prices on the homepage come from the lowest fee_from any dentist
// entered for a treatment. Some dentists type their consultation fee into a
// treatment row, which made Braces show "from ₹400" and Smile makeover
// "from ₹300". A fee below the floor for that treatment is treated as a data
// entry slip and skipped. Floors sit well under the cheapest real price seen
// in Pune/Mumbai, so a genuinely cheap clinic still shows.
//
// Matched on the treatment NAME (lower-cased, substring), the same way the
// booking page matches treatments, so slug differences between cities don't
// matter. Treatments with no rule keep their plain minimum.
const FEE_FLOORS: { match: string; floor: number }[] = [
  { match: 'implant', floor: 8000 },
  { match: 'braces', floor: 8000 },
  { match: 'aligner', floor: 8000 },
  { match: 'smile makeover', floor: 5000 },
  { match: 'veneer', floor: 2500 },
  { match: 'denture', floor: 2000 },
  { match: 'root canal', floor: 1500 },
  { match: 'crown', floor: 1500 },
  { match: 'wisdom', floor: 1000 },
]

export function feeFloorFor(treatmentName: string): number {
  const n = treatmentName.toLowerCase()
  return FEE_FLOORS.find(r => n.includes(r.match))?.floor ?? 0
}

/** Lowest believable fee for a treatment, or null when none is left. */
export function plausibleFromFee(treatmentName: string, fees: number[] | undefined): number | null {
  if (!fees || fees.length === 0) return null
  const floor = feeFloorFor(treatmentName)
  let min: number | null = null
  for (const f of fees) {
    if (!(f > 0) || f < floor) continue
    if (min === null || f < min) min = f
  }
  return min
}
