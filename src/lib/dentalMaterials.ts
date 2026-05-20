// Curated dental materials catalogue used by the case-create form's
// multi-select. The case spec calls for a "dropdown from the DentalSamaan
// catalogue" — when that catalogue ships as a queryable data source we
// swap this constant for a fetch; until then the list below covers the
// brands + materials a clinician would realistically tag against a
// clinical case across our supported specialties.
//
// Items are grouped purely for UI sectioning in the picker; the persisted
// `materials text[]` on the cases table stores flat slugs.

export interface MaterialGroup {
  label: string
  items: string[]
}

export const MATERIAL_GROUPS: MaterialGroup[] = [
  {
    label: 'Implant systems',
    items: [
      'Nobel Biocare Active',
      'Nobel Biocare Replace',
      'Straumann BLT',
      'Straumann BLX',
      'Osstem TS III',
      'Osstem TS IV',
      'AB Dental I5',
      'BioHorizons Tapered Plus',
      'MIS C1',
      'Dentsply Sirona Astra Tech EV',
      'Zimmer Tapered Screw-Vent',
    ],
  },
  {
    label: 'Bone graft & membranes',
    items: [
      'Bio-Oss xenograft',
      'Bio-Gide collagen membrane',
      'OsteoBiol Gen-Os',
      'Symbios PerioPatch',
      'PRF (autologous)',
      'PRP (autologous)',
    ],
  },
  {
    label: 'Crowns & bridges',
    items: [
      'Zirconia (monolithic)',
      'Zirconia (layered)',
      'E.max lithium disilicate',
      'PFM (porcelain-fused-to-metal)',
      'Full metal — Co-Cr',
      'Full metal — gold alloy',
      'Temporary acrylic',
    ],
  },
  {
    label: 'Veneers & cosmetic',
    items: [
      'E.max veneer',
      'Feldspathic veneer',
      'Lumineers (no-prep)',
      'Composite veneer',
      'Bleaching gel (in-office)',
      'Bleaching tray (take-home)',
    ],
  },
  {
    label: 'Composites & restoratives',
    items: [
      '3M Filtek Z350 XT',
      '3M Filtek Supreme Ultra',
      'Tokuyama Estelite Sigma Quick',
      'Ivoclar Tetric N-Ceram',
      'GC G-aenial',
      'Kuraray Clearfil Majesty',
      'Dual-cure core build-up',
    ],
  },
  {
    label: 'Adhesives & bonding',
    items: [
      '3M Single Bond Universal',
      'Kuraray Clearfil SE Bond 2',
      'Ivoclar AdheSE Universal',
      'GC G-Premio Bond',
    ],
  },
  {
    label: 'Endodontic',
    items: [
      'Protaper Gold rotary files',
      'Protaper Next rotary files',
      'Reciproc Blue',
      'WaveOne Gold',
      'AH Plus sealer',
      'MTA Angelus',
      'Biodentine',
      'EDTA 17%',
      'Sodium hypochlorite 5.25%',
    ],
  },
  {
    label: 'Orthodontic',
    items: [
      'Invisalign',
      'Clear Correct',
      'Indian aligner brands (e.g. Toothsi, Illusion)',
      'Damon Q self-ligating brackets',
      'Roth metal brackets',
      'MBT metal brackets',
      'Ceramic brackets',
      'NiTi archwire',
      'TMA archwire',
      'Stainless steel archwire',
    ],
  },
  {
    label: 'Impression & lab',
    items: [
      '3M Imprint 4 PVS',
      'Kerr Take 1 Advanced PVS',
      'Alginate (irreversible hydrocolloid)',
      'Digital scan (iTero / Trios / Medit)',
    ],
  },
]

// Flattened list used to validate posted material names against a known
// vocabulary on the server. Anything not in this set is silently dropped
// on insert.
export const ALL_MATERIALS = new Set<string>(
  MATERIAL_GROUPS.flatMap(g => g.items),
)
