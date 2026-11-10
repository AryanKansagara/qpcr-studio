import type { Analysis } from './engine/qpcr.ts'
import { toCsv } from './engine/parse.ts'
import type { Project } from './store.ts'

const r4 = (x: number | null | undefined) => (x === null || x === undefined || !isFinite(x) ? '' : +x.toFixed(4))

export function comparisonRows(a: Analysis): unknown[][] {
  const out: unknown[][] = [['Target', 'Group', 'Versus', 'n group', 'n control', 'log2 fold change', 'Fold change', 'CI low', 'CI high', 'p', 'Significance', 'Test', 'Omnibus test', 'Omnibus p']]
  for (const t of a.targets) for (const c of t.comparisons) out.push([c.target, c.group, c.vs, c.na, c.nb, r4(c.log2fc), r4(c.fold), r4(c.foldLo), r4(c.foldHi), r4(c.p), c.stars, c.test, t.omnibus?.test ?? '', r4(t.omnibus?.p)])
  return out
}
export function sampleRows(a: Analysis, p: Project): unknown[][] {
  const out: unknown[][] = [['Sample', 'Group', 'Target', p.settings.method === 'livak' ? 'ΔCq (target - mean reference)' : 'Efficiency-corrected ΔCq (log2 units)', 'log2 relative to control', 'Relative expression']]
  for (const t of a.targets) for (const s of t.samples) out.push([s.sample, s.group, t.target, r4(s.dcq), r4(s.log2rel), r4(2 ** s.log2rel)])
  return out
}
export function replicateRows(a: Analysis, p: Project): unknown[][] {
  const name = (id: string) => p.plates.find(x => x.id === id)?.name ?? id
  const out: unknown[][] = [['Plate', 'Well', 'Sample', 'Group', 'Target', 'Cq', 'Tm', 'Excluded', 'Auto-flagged', 'Replicate mean', 'Replicate SD', 'Flag']]
  for (const r of a.replicates) for (const w of r.wells) out.push([name(r.plateId), w.well, r.sample, r.group, r.target, r4(w.cq), r4(w.tm), w.excluded ? 'yes' : '', w.auto ? 'yes' : '', r4(r.mean), r4(r.sd), r.flag])
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
      ...st.genes.map(g => [g, r4(st.genorm.m[g]), st.genorm.ranking.indexOf(g) + 1, r4(st.normfinder?.stability[g]), r4(st.bestkeeper[g].sd), r4(st.bestkeeper[g].cv), r4(st.bestkeeper[g].r), r4(st.shift[g]?.diff), r4(st.shift[g]?.p)])])
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'experiment'
