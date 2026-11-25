import type { Analysis } from './engine/qpcr.ts'
import { toCsv } from './engine/parse.ts'
import type { Project } from './store.ts'

const none = (x: number | null | undefined): x is null | undefined => x === null || x === undefined || !isFinite(x)
/** Four decimals from 1 up, five significant digits below it, so small values keep their digits. */
const num = (x: number | null | undefined) => (none(x) ? '' : +(Math.abs(x) >= 1 ? x.toFixed(4) : x.toPrecision(5)))
/** For Cq and log2 values, where 1e-9 is rounding noise around 0. */
const cyc = (x: number | null | undefined) => num(!none(x) && Math.abs(x) < 1e-9 ? 0 : x)
/** Never 0. Below one in a million the numerical integration behind Dunnett and Tukey has no digits left. */
const pval = (p: number | null | undefined) => (none(p) ? '' : p < 1e-6 ? '<0.000001' : num(p))

export function comparisonRows(a: Analysis): unknown[][] {
  const out: unknown[][] = [['Target', 'Group', 'Versus', 'n group', 'n control', 'log2 fold change', 'Fold change', 'CI low', 'CI high', 'p', 'Significance', 'Test', 'Omnibus test', 'Omnibus p']]
  for (const t of a.targets) for (const c of t.comparisons) out.push([c.target, c.group, c.vs, c.na, c.nb, cyc(c.log2fc), num(c.fold), num(c.foldLo), num(c.foldHi), pval(c.p), c.stars, c.test, t.omnibus?.test ?? '', pval(t.omnibus?.p)])
  return out
}
export function sampleRows(a: Analysis, p: Project): unknown[][] {
  const out: unknown[][] = [['Sample', 'Group', 'Target', p.settings.method === 'livak' ? 'ΔCq (target - mean reference)' : 'Efficiency-corrected ΔCq (log2 units)', 'log2 relative to control', 'Relative expression']]
  for (const t of a.targets) for (const s of t.samples) out.push([s.sample, s.group, t.target, cyc(s.dcq), cyc(s.log2rel), num(2 ** s.log2rel)])
  return out
}
export function replicateRows(a: Analysis, p: Project): unknown[][] {
  const name = (id: string) => p.plates.find(x => x.id === id)?.name ?? id
  const out: unknown[][] = [['Plate', 'Well', 'Sample', 'Group', 'Target', 'Cq', 'Tm', 'Excluded', 'Auto-flagged', 'Replicate mean', 'Replicate SD', 'Flag']]
  for (const r of a.replicates) for (const w of r.wells) out.push([name(r.plateId), w.well, r.sample, r.group, r.target, cyc(w.cq), cyc(w.tm), w.excluded ? 'yes' : '', w.auto ? 'yes' : '', cyc(r.mean), cyc(r.sd), r.flag])
  return out
}
export function qcRows(a: Analysis): unknown[][] {
  const out: unknown[][] = [['Check', 'Well', 'Target', 'Sample', 'Status', 'Detail']]
  for (const c of a.contamination) out.push([c.role.toUpperCase(), c.well, c.target, c.sample, c.status, c.note])
  for (const m of a.melt) out.push(['Melt Tm', m.well, m.target, m.sample, 'warn', `Tm ${m.tm} vs median ${m.median.toFixed(2)} (Δ ${m.delta.toFixed(2)} °C)`])
  for (const c of a.curves) out.push(['Standard curve', '', c.target, '', c.warnings.length ? 'warn' : 'pass', `slope ${c.slope.toFixed(3)}, E ${(c.efficiency * 100).toFixed(1)}%, R² ${c.r2.toFixed(4)}, ${c.decades.toFixed(1)} decades`])
  return out
}

export const resultsCsv = (a: Analysis) => toCsv(comparisonRows(a))
export const samplesCsv = (a: Analysis, p: Project) => toCsv(sampleRows(a, p))

export async function resultsXlsx(a: Analysis, p: Project): Promise<Blob> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  add('Comparisons', comparisonRows(a))
  add('Samples', sampleRows(a, p))
  add('Replicates', replicateRows(a, p))
  add('QC', qcRows(a))
  if (a.stability) {
    const st = a.stability
    add('Reference stability', [['Gene', 'geNorm M', 'geNorm rank', 'NormFinder stability', 'BestKeeper ±Cq', 'BestKeeper CV %', 'r vs BestKeeper index', 'Treatment shift (Cq)', 'Shift p'],
      ...st.genes.map(g => [g, cyc(st.genorm.m[g]), st.genorm.ranking.indexOf(g) + 1, cyc(st.normfinder?.stability[g]), cyc(st.bestkeeper[g].sd), cyc(st.bestkeeper[g].cv), cyc(st.bestkeeper[g].r), cyc(st.shift[g]?.diff), pval(st.shift[g]?.p)])])
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'experiment'
