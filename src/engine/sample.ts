// Two synthetic experiments. All values are generated from a seeded model; they are not real data.
import { blankMeta, defaultSettings, wellName, type Meta, type Plate, type Settings, type Well } from './qpcr.ts'
import { rng } from './stats.ts'

export interface SampleDef { id: string; name: string; blurb: string; build(): { plates: Plate[]; settings: Settings; meta: Meta } }

// True assay efficiencies used to generate the data (the standard-curve sample recovers them).
export const TRUE_EFF: Record<string, number> = { ACTB: 0.981, HPRT1: 0.954, GAPDH: 1.012, IL6: 0.923, CCL2: 1.046 }
const TM: Record<string, number> = { ACTB: 85.6, HPRT1: 79.8, GAPDH: 83.4, IL6: 81.2, CCL2: 80.5 }
const PRIMERS: Meta['primers'] = {
  ACTB: { fwd: 'CACCATTGGCAATGAGCGGTTC', rev: 'AGGTCTTTGCGGATGTCCACGT', amplicon: '135 bp' },
  HPRT1: { fwd: 'CATTATGCTGAGGATTTGGAAAGG', rev: 'CTTGAGCACACAGAGGGCTACA', amplicon: '128 bp' },
  GAPDH: { fwd: 'GTCTCCTCTGACTTCAACAGCG', rev: 'ACCACCCTGTTGCTGTAGCCAA', amplicon: '131 bp' },
  IL6: { fwd: 'AGACAGCCACTCACCTCTTCAG', rev: 'TTCTGCCAGTGCCTCTTTGCTG', amplicon: '132 bp' },
  CCL2: { fwd: 'AGAATCACCAGCAGCAAGTGTCC', rev: 'TCCTGAACCCACTTCTGCTTGG', amplicon: '123 bp' },
}
const r1 = (x: number) => Math.round(x * 100) / 100

function expressionPlate(): Plate {
  const R = rng(20261009)
  // Control-group Cq for each gene, and the true fold change in Treated.
  const base: Record<string, number> = { ACTB: 18.1, HPRT1: 24.6, GAPDH: 19.3, IL6: 31.0, CCL2: 26.8 }
  const fold: Record<string, number> = { ACTB: 1, HPRT1: 1, GAPDH: 2.4, IL6: 8, CCL2: 0.45 }
  const samples = ['Vehicle-1', 'Vehicle-2', 'Vehicle-3', 'Treated-1', 'Treated-2', 'Treated-3']
  const input = samples.map(() => R.normal() * 0.45) // cDNA input differences, log2 units
  const genes = ['ACTB', 'GAPDH', 'HPRT1', 'IL6', 'CCL2']
  const bio: Record<string, number> = {}
  samples.forEach(s => genes.forEach(g => (bio[`${s}|${g}`] = R.normal() * (g === 'GAPDH' ? 0.35 : g === 'IL6' ? 0.4 : 0.12))))
  const cq = (s: string, g: string, i: number) => {
    const e = Math.log2(1 + TRUE_EFF[g])
    const treated = s.startsWith('Treated')
    const log2q = input[i] + bio[`${s}|${g}`] + (treated ? Math.log2(fold[g]) : 0)
    return base[g] - log2q / e + R.normal() * 0.07
  }
  const wells: Well[] = []
  const add = (row: number, col: number, w: Omit<Well, 'well'>) => wells.push({ well: wellName(row, col), ...w })
  // Rows A to F: one biological sample per row; columns 1-3 ACTB, 4-6 GAPDH, 7-9 HPRT1, 10-12 IL6.
  samples.forEach((s, i) => genes.slice(0, 4).forEach((g, gi) => {
    for (let rep = 0; rep < 3; rep++) {
      let v = cq(s, g, i)
      if (s === 'Treated-2' && g === 'IL6' && rep === 2) v += 2.4 // pipetting outlier
      add(i, gi * 3 + rep, { sample: s, target: g, role: 'unknown', cq: r1(v), tm: r1(TM[g] + R.normal() * 0.1), group: s.split('-')[0] })
    }
  }))
  // Rows G-H: CCL2 triplicates, then controls.
  samples.forEach((s, i) => {
    for (let rep = 0; rep < 3; rep++) {
      const idx = i * 3 + rep
      const tm = s === 'Treated-3' && rep === 0 ? 77.9 : TM.CCL2 + R.normal() * 0.1
      add(6 + Math.floor(idx / 12), idx % 12, { sample: s, target: 'CCL2', role: 'unknown', cq: r1(cq(s, 'CCL2', i)), tm: r1(tm), group: s.split('-')[0] })
    }
  })
  genes.forEach((g, gi) => {
    const v = g === 'IL6' ? 35.12 : g === 'GAPDH' ? 38.41 : null
    add(7, 6 + gi, { sample: 'NTC', target: g, role: 'ntc', cq: v, tm: g === 'IL6' ? 81.3 : g === 'GAPDH' ? 73.1 : null })
  })
  add(7, 11, { sample: 'Vehicle-1', target: 'ACTB', role: 'nrt', cq: 34.77, tm: 85.5 })
  return { id: 'sample-expr-plate', name: 'Plate 1 · THP-1 compound X 24 h', format: 96, instrument: 'Bio-Rad CFX96 (CFX Maestro 2.3)', runDate: '2026-10-09', fileName: 'synthetic_cfx_quantification_cq_results.csv', wells }
}

function curvePlate(): Plate {
  const R = rng(20261002)
  const top: Record<string, number> = { ACTB: 15.3, HPRT1: 21.7, GAPDH: 16.4, IL6: 22.1, CCL2: 20.6 }
  const genes = Object.keys(top)
  const qty = [50, 5, 0.5, 0.05, 0.005]
  const wells: Well[] = []
  let i = 0
  const next = () => { const w = wellName(Math.floor(i / 12), i % 12); i++; return w }
  for (const g of genes) {
    const slope = -1 / Math.log10(1 + TRUE_EFF[g])
    qty.forEach((q, k) => {
      for (let rep = 0; rep < 3; rep++) wells.push({ well: next(), sample: `Std ${k + 1}`, target: g, role: 'standard', quantity: q, cq: r1(top[g] - slope * k + R.normal() * (k === 4 ? 0.18 : 0.08)), tm: r1(TM[g] + R.normal() * 0.1) })
    })
  }
  for (const g of genes) wells.push({ well: next(), sample: 'NTC', target: g, role: 'ntc', cq: null, tm: null })
  return { id: 'sample-curve-plate', name: 'Primer validation · 10-fold dilution series', format: 96, instrument: 'Bio-Rad CFX96 (CFX Maestro 2.3)', runDate: '2026-10-02', fileName: 'synthetic_standard_curve.csv', wells }
}

const meta = (): Meta => ({
  ...blankMeta(), instrument: 'Bio-Rad CFX96 Touch', chemistry: 'SYBR', organism: 'Human (THP-1 monocytes)',
  rnaQuality: 'RIN 9.1 to 9.6 (Agilent TapeStation); A260/280 2.02 to 2.08', rtProtocol: '500 ng total RNA per 20 µL reaction, random hexamer and oligo(dT) priming',
  operator: 'Synthetic lab', primers: PRIMERS, notes: 'Synthetic dataset for demonstration.',
})

export const SAMPLES: SampleDef[] = [
  {
    id: 'expression', name: 'Compound X on THP-1 cells', blurb: '96-well plate: IL6 and CCL2 vs three candidate reference genes (GAPDH responds to treatment), Vehicle vs Treated, one outlier replicate and an NTC contaminated at Cq 35.',
    build: () => ({
      plates: [expressionPlate()],
      settings: { ...defaultSettings(), candidates: ['ACTB', 'GAPDH', 'HPRT1'], refs: ['ACTB', 'HPRT1'], control: 'Vehicle', groupOrder: ['Vehicle', 'Treated'], efficiencies: { ACTB: 98.0, HPRT1: 95.6, GAPDH: 101.1, IL6: 92.5, CCL2: 104.3 } },
      meta: meta(),
    }),
  },
  {
    id: 'curves', name: 'Primer efficiency validation', blurb: '5-point 10-fold dilution series in triplicate for five assays. Slopes, efficiencies, R² and dynamic range per target.',
    build: () => ({ plates: [curvePlate()], settings: { ...defaultSettings(), method: 'pfaffl' }, meta: meta() }),
  },
]
