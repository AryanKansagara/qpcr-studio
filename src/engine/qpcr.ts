// qPCR analysis engine: replicate aggregation, contamination and melt checks, standard curves,
// reference-gene stability (geNorm, NormFinder-style, BestKeeper-style), normalisation, inter-plate
// calibration and statistics on log-scale values.
import { anova, grubbs, linreg, mannWhitney, mean, median, pearson, qdunnett, qtukey, sd, stars, tQuantile, welch, ptukey, pdunnett } from './stats.ts'

export type Role = 'unknown' | 'ntc' | 'nrt' | 'standard' | 'calibrator' | 'empty'
export const ROLES: Role[] = ['unknown', 'ntc', 'nrt', 'standard', 'calibrator', 'empty']
export const ROLE_LABEL: Record<Role, string> = { unknown: 'Sample', ntc: 'NTC', nrt: 'NRT (no RT)', standard: 'Standard', calibrator: 'Inter-run calibrator', empty: 'Empty' }

export interface Well {
  well: string
  sample: string
  target: string
  role: Role
  cq: number | null
  tm?: number | null
  quantity?: number | null
  group?: string
}

export interface Plate {
  id: string
  name: string
  format: 96 | 384
  instrument: string
  runDate?: string
  fileName?: string
  wells: Well[]
}

export interface Settings {
  method: 'livak' | 'pfaffl'
  /** Genes evaluated as reference candidates. */
  candidates: string[]
  /** Genes used for normalisation (geometric mean). */
  refs: string[]
  control: string
  test: 'parametric' | 'nonparametric'
  posthoc: 'tukey' | 'dunnett'
  outlier: 'sd' | 'grubbs' | 'none'
  sdThreshold: number
  ntcWindow: number
  tmTolerance: number
  /** Manual efficiencies in percent (e.g. 97.5). Overrides standard curves. */
  efficiencies: Record<string, number>
  /** Sample name run on every plate as an inter-run calibrator. */
  calibrator: string
  /** Sample to biological group overrides. */
  groups: Record<string, string>
  /** `${plateId}|${well}`: true excludes a well, false forces an auto-flagged well back in. */
  excluded: Record<string, boolean>
  groupOrder?: string[]
}

export interface Meta {
  instrument: string
  chemistry: '' | 'SYBR' | 'probe'
  organism: string
  rnaQuality: string
  rtProtocol: string
  operator: string
  primers: Record<string, { fwd: string; rev: string; amplicon: string }>
  notes: string
}

export const defaultSettings = (): Settings => ({
  method: 'pfaffl', candidates: [], refs: [], control: '', test: 'parametric', posthoc: 'dunnett', outlier: 'sd',
  sdThreshold: 0.3, ntcWindow: 5, tmTolerance: 1, efficiencies: {}, calibrator: '', groups: {}, excluded: {},
})
export const blankMeta = (): Meta => ({ instrument: '', chemistry: '', organism: '', rnaQuality: '', rtProtocol: '', operator: '', primers: {}, notes: '' })

// ---------- Well helpers ----------

export function parseWell(w: string): { row: number; col: number } | null {
  const m = /^\s*([A-Pa-p])\s*0*(\d{1,2})\s*$/.exec(w)
  if (!m) return null
  const row = m[1].toUpperCase().charCodeAt(0) - 65, col = +m[2] - 1
  return col >= 0 && col < 24 ? { row, col } : null
}
export const wellName = (row: number, col: number) => String.fromCharCode(65 + row) + (col + 1)
export const normWell = (w: string) => { const p = parseWell(w); return p ? wellName(p.row, p.col) : w.trim() }
export const plateDims = (f: 96 | 384) => (f === 96 ? { rows: 8, cols: 12 } : { rows: 16, cols: 24 })
/** Index (1-based, row-major) to well name, for instruments that number wells. */
export const wellFromIndex = (i: number, f: 96 | 384) => { const { cols } = plateDims(f); return wellName(Math.floor((i - 1) / cols), (i - 1) % cols) }
export const formatFor = (wells: string[]): 96 | 384 => wells.some(w => { const p = parseWell(w); return !!p && (p.row > 7 || p.col > 11) }) ? 384 : 96
export const wellKey = (plateId: string, well: string) => `${plateId}|${well}`

/** "Treated-2", "Treated_2", "Treated 2", "Treated rep2" -> "Treated". */
export function guessGroup(sample: string) {
  const g = sample.replace(/[\s_\-.]*(rep|r|bio|br|n|#)?[\s_\-.]*\d+[a-z]?$/i, '').trim()
  return g || sample
}

// ---------- Result types ----------

export interface RepWell { well: string; cq: number | null; tm: number | null; excluded: boolean; auto: boolean; manual: boolean }
export interface Replicate {
  plateId: string; sample: string; target: string; group: string
  wells: RepWell[]
  mean: number | null; sd: number | null; n: number
  flag: 'ok' | 'high-sd' | 'outlier' | 'partial' | 'no-amp'
}
export interface Contam { plateId: string; well: string; role: 'ntc' | 'nrt'; target: string; sample: string; cq: number | null; tm: number | null; ref: number | null; gap: number | null; status: 'pass' | 'warn' | 'fail'; note: string }
export interface Curve { target: string; slope: number; intercept: number; r2: number; efficiency: number; decades: number; points: { log10q: number; cq: number; well: string }[]; n: number; warnings: string[] }
export interface Eff { target: string; e: number; source: 'manual' | 'curve' | 'assumed' }
export interface MeltFlag { plateId: string; well: string; target: string; sample: string; tm: number; median: number; delta: number }
export interface GenormStep { genes: string[]; m: Record<string, number> }
export interface Stability {
  genes: string[]
  samples: number
  genorm: { steps: GenormStep[]; ranking: string[]; m: Record<string, number>; v: { label: string; v: number }[]; optimal: number; recommended: string[] }
  normfinder: { stability: Record<string, number>; ranking: string[]; groups: number; note?: string } | null
  bestkeeper: Record<string, { sd: number; cv: number; r: number; mean: number }>
  shift: Record<string, { diff: number; p: number; groupA: string; groupB: string }>
}
export interface SampleExpr { sample: string; group: string; dcq: number; log2rel: number }
export interface Comparison { target: string; group: string; vs: string; na: number; nb: number; log2fc: number; lo: number; hi: number; fold: number; foldLo: number; foldHi: number; p: number | null; stars: string; test: string }
export interface TargetResult { target: string; samples: SampleExpr[]; groups: { group: string; n: number; meanLog2: number; sdLog2: number }[]; omnibus: { test: string; stat: number; p: number } | null; comparisons: Comparison[]; note?: string }
export interface Calib { target: string; plateId: string; offset: number }

export interface Analysis {
  replicates: Replicate[]
  contamination: Contam[]
  curves: Curve[]
  efficiencies: Record<string, Eff>
  melt: MeltFlag[]
  stability: Stability | null
  targets: TargetResult[]
  groups: string[]
  control: string
  samples: string[]
  calibration: Calib[]
  warnings: string[]
  counts: { wells: number; excluded: number; outliers: number; contamFail: number; contamWarn: number; meltFlags: number }
}

// ---------- Analysis ----------

const log2E = (e: number) => Math.log2(1 + e)

export function groupOf(sample: string, s: Settings, wells: Well[]) {
  if (s.groups[sample]) return s.groups[sample]
  const w = wells.find(x => x.sample === sample && x.group)
  return w?.group || guessGroup(sample)
}

export function analyze(plates: Plate[], s: Settings): Analysis {
  const warnings: string[] = []
  const allWells = plates.flatMap(p => p.wells)

  // 1. Inter-plate calibration: per target, shift each plate so its calibrator mean matches the across-plate mean.
  const calibration: Calib[] = []
  const offset = new Map<string, number>()
  if (s.calibrator && plates.length > 1) {
    const targets = [...new Set(allWells.filter(w => w.sample === s.calibrator && w.cq !== null).map(w => w.target))]
    for (const t of targets) {
      const per = plates.map(p => ({ p, m: mean(p.wells.filter(w => w.sample === s.calibrator && w.target === t && w.cq !== null && !s.excluded[wellKey(p.id, w.well)]).map(w => w.cq!)) }))
      if (per.some(x => isNaN(x.m))) { warnings.push(`Calibrator ${s.calibrator} is missing for ${t} on some plates, so ${t} is not calibrated across plates.`); continue }
      const grand = mean(per.map(x => x.m))
      for (const x of per) { offset.set(`${x.p.id}|${t}`, x.m - grand); calibration.push({ target: t, plateId: x.p.id, offset: x.m - grand }) }
    }
  }
  const adj = (plateId: string, w: Well) => (w.cq === null ? null : w.cq - (offset.get(`${plateId}|${w.target}`) ?? 0))

  // 2. Technical replicates.
  const replicates: Replicate[] = []
  for (const p of plates) {
    const sets = new Map<string, Well[]>()
    for (const w of p.wells) {
      if (w.role !== 'unknown' && w.role !== 'calibrator') continue
      if (!w.sample || !w.target) continue
      const k = `${w.sample}\u0000${w.target}`
      sets.set(k, [...(sets.get(k) ?? []), w])
    }
    for (const ws of sets.values()) replicates.push(aggregate(p.id, ws, s, allWells, adj))
  }

  // 3. Standard curves and efficiencies.
  const curves: Curve[] = []
  const stdTargets = [...new Set(allWells.filter(w => w.role === 'standard').map(w => w.target))]
  for (const t of stdTargets) {
    const pts = plates.flatMap(p => p.wells.filter(w => w.role === 'standard' && w.target === t && w.cq !== null && (w.quantity ?? 0) > 0 && !s.excluded[wellKey(p.id, w.well)]).map(w => ({ log10q: Math.log10(w.quantity!), cq: w.cq!, well: w.well })))
    const c = standardCurve(t, pts)
    if (c) curves.push(c)
    else warnings.push(`Standard curve for ${t} needs at least three dilution points with a Cq.`)
  }
  const targetsAll = [...new Set(allWells.filter(w => w.target && w.role !== 'empty').map(w => w.target))]
  const efficiencies: Record<string, Eff> = {}
  for (const t of targetsAll) {
    const man = s.efficiencies[t]
    const c = curves.find(x => x.target === t)
    efficiencies[t] = man > 0 ? { target: t, e: man / 100, source: 'manual' } : c && c.efficiency > 0 && c.efficiency < 1.5 ? { target: t, e: c.efficiency, source: 'curve' } : { target: t, e: 1, source: 'assumed' }
  }
  const eOf = (t: string) => (s.method === 'livak' ? 1 : efficiencies[t]?.e ?? 1)

  // 4. Sample-level Cq (average across plates after calibration).
  const unknownReps = replicates.filter(r => r.mean !== null && allWells.some(w => w.sample === r.sample && w.role === 'unknown'))
  const cqMap = new Map<string, number>()
  const bySt = new Map<string, number[]>()
  for (const r of unknownReps) bySt.set(`${r.sample}|${r.target}`, [...(bySt.get(`${r.sample}|${r.target}`) ?? []), r.mean!])
  for (const [k, v] of bySt) cqMap.set(k, mean(v))
  const samples = [...new Set(unknownReps.map(r => r.sample))].filter(x => x !== s.calibrator)
  const sampleGroup = new Map(samples.map(x => [x, groupOf(x, s, allWells)]))
  const seen = [...new Set(samples.map(x => sampleGroup.get(x)!))]
  const groups = s.groupOrder?.length ? [...s.groupOrder.filter(g => seen.includes(g)), ...seen.filter(g => !s.groupOrder!.includes(g))] : seen
  const control = groups.includes(s.control) ? s.control : groups[0] ?? ''
  const L = (sample: string, t: string) => { const c = cqMap.get(`${sample}|${t}`); return c === undefined ? null : -c * log2E(eOf(t)) }

  // 5. Contamination and melt.
  const contamination = contaminationChecks(plates, s, unknownReps, adj)
  const melt = meltChecks(s, replicates)

  // 6. Reference stability.
  const cands = s.candidates.filter(t => targetsAll.includes(t))
  const stability = cands.length >= 2 ? refStability(cands, samples, sampleGroup, L, (smp, t) => cqMap.get(`${smp}|${t}`) ?? null, control) : null
  if (cands.length > 0 && cands.length < 3) warnings.push('geNorm pairwise variation and NormFinder need at least three candidate reference genes.')

  // 7. Normalisation and statistics.
  const refs = s.refs.filter(t => targetsAll.includes(t))
  if (!refs.length) warnings.push('Choose at least one reference gene to normalise against.')
  else if (refs.length === 1) warnings.push('Normalising to a single reference gene. MIQE recommends at least two validated reference genes.')
  const goi = targetsAll.filter(t => !refs.includes(t) && allWells.some(w => w.target === t && w.role === 'unknown'))
  const targets: TargetResult[] = refs.length ? goi.map(t => expression(t, refs, samples, sampleGroup, groups, control, L, s)) : []

  const excluded = replicates.flatMap(r => r.wells).filter(w => w.excluded).length
  return {
    replicates, contamination, curves, efficiencies, melt, stability, targets, groups, control, samples, calibration, warnings,
    counts: {
      wells: allWells.filter(w => w.role !== 'empty').length, excluded,
      outliers: replicates.filter(r => r.flag === 'outlier' || r.flag === 'high-sd').length,
      contamFail: contamination.filter(c => c.status === 'fail').length,
      contamWarn: contamination.filter(c => c.status === 'warn').length,
      meltFlags: melt.length,
    },
  }
}

function aggregate(plateId: string, ws: Well[], s: Settings, all: Well[], adj: (p: string, w: Well) => number | null): Replicate {
  const rows: RepWell[] = ws.map(w => ({ well: w.well, cq: adj(plateId, w), tm: w.tm ?? null, excluded: false, auto: false, manual: false }))
  const valid = rows.filter(r => r.cq !== null)
  let flag: Replicate['flag'] = 'ok'
  const vals = valid.map(r => r.cq!)
  if (s.outlier !== 'none' && vals.length >= 3) {
    let idx = -1
    if (s.outlier === 'sd' && sd(vals) > s.sdThreshold) {
      const med = median(vals)
      idx = vals.reduce((b, v, i) => (Math.abs(v - med) > Math.abs(vals[b] - med) ? i : b), 0)
    } else if (s.outlier === 'grubbs') {
      const g = grubbs(vals)
      if (g?.outlier) idx = g.index
    }
    if (idx >= 0) valid[idx].auto = true
  }
  for (const r of rows) {
    const o = s.excluded[wellKey(plateId, r.well)]
    r.manual = o !== undefined
    r.excluded = o === true || (r.auto && o !== false)
  }
  const used = rows.filter(r => r.cq !== null && !r.excluded).map(r => r.cq!)
  const m = used.length ? mean(used) : null
  const sdv = used.length >= 2 ? sd(used) : null
  if (!valid.length) flag = 'no-amp'
  else if (rows.some(r => r.auto)) flag = 'outlier'
  else if (sdv !== null && sdv > s.sdThreshold) flag = 'high-sd'
  else if (valid.length < rows.length) flag = 'partial'
  const sample = ws[0].sample
  return { plateId, sample, target: ws[0].target, group: groupOf(sample, s, all), wells: rows, mean: m, sd: sdv, n: used.length, flag }
}

export function standardCurve(target: string, pts: Curve['points']): Curve | null {
  const levels = new Set(pts.map(p => p.log10q.toFixed(6)))
  if (levels.size < 3) return null
  const { slope, intercept, r2 } = linreg(pts.map(p => p.log10q), pts.map(p => p.cq))
  const efficiency = Math.pow(10, -1 / slope) - 1
  const lq = pts.map(p => p.log10q)
  const decades = Math.max(...lq) - Math.min(...lq)
  const warnings: string[] = []
  if (efficiency < 0.9 || efficiency > 1.1) warnings.push(`Efficiency ${(efficiency * 100).toFixed(1)}% is outside 90 to 110%.`)
  if (r2 < 0.98) warnings.push(`R² ${r2.toFixed(3)} is below 0.98.`)
  if (decades < 3) warnings.push(`Dynamic range is ${decades.toFixed(1)} decades; MIQE suggests at least 3 for an efficiency estimate.`)
  return { target, slope, intercept, r2, efficiency, decades, points: pts, n: pts.length, warnings }
}

function contaminationChecks(plates: Plate[], s: Settings, reps: Replicate[], adj: (p: string, w: Well) => number | null): Contam[] {
  const out: Contam[] = []
  for (const p of plates) for (const w of p.wells) {
    if (w.role !== 'ntc' && w.role !== 'nrt') continue
    const cq = adj(p.id, w)
    const tReps = reps.filter(r => r.target === w.target && r.mean !== null)
    const productTm = median(tReps.flatMap(r => r.wells.filter(x => !x.excluded && x.tm != null).map(x => x.tm!)))
    let ref: number | null = null
    if (w.role === 'ntc') ref = tReps.length ? Math.max(...tReps.map(r => r.mean!)) : null
    else {
      const same = tReps.filter(r => r.sample === w.sample)
      ref = same.length ? mean(same.map(r => r.mean!)) : tReps.length ? mean(tReps.map(r => r.mean!)) : null
    }
    const base = { plateId: p.id, well: w.well, role: w.role, target: w.target, sample: w.sample, cq, tm: w.tm ?? null, ref }
    if (cq === null) { out.push({ ...base, gap: null, status: 'pass', note: 'No amplification.' }); continue }
    const gap = ref === null ? null : cq - ref
    const dimer = w.tm != null && !isNaN(productTm) && Math.abs(w.tm - productTm) > 2
    const label = w.role === 'ntc' ? `latest sample (${ref?.toFixed(2)})` : `the matching RT+ sample (${ref?.toFixed(2)})`
    if (gap !== null && gap < s.ntcWindow) {
      out.push({ ...base, gap, status: dimer ? 'warn' : 'fail', note: dimer
        ? `Amplified ${gap.toFixed(1)} cycles after ${label}, but Tm ${w.tm!.toFixed(1)} °C differs from the product (${productTm.toFixed(1)} °C): likely primer-dimer.`
        : w.role === 'ntc' ? `Amplified only ${gap.toFixed(1)} cycles after ${label}${w.tm != null && !isNaN(productTm) ? ` with the product Tm (${w.tm.toFixed(1)} °C)` : ''}: template contamination.`
          : `Only ${gap.toFixed(1)} cycles after ${label}: genomic DNA contributes about ${(100 / 2 ** gap).toFixed(1)}% of signal.` })
    } else {
      out.push({ ...base, gap, status: 'warn', note: `Late signal at Cq ${cq.toFixed(1)}${gap !== null ? `, ${gap.toFixed(1)} cycles after ${label}` : ''}${dimer ? ', melt suggests primer-dimer' : ''}. Below the ${s.ntcWindow}-cycle threshold for concern, but worth noting.` })
    }
  }
  return out
}

function meltChecks(s: Settings, reps: Replicate[]): MeltFlag[] {
  const out: MeltFlag[] = []
  const targets = [...new Set(reps.map(r => r.target))]
  for (const t of targets) {
    const ws = reps.filter(r => r.target === t).flatMap(r => r.wells.filter(w => w.tm != null && w.cq !== null).map(w => ({ r, w })))
    if (ws.length < 3) continue
    const med = median(ws.map(x => x.w.tm!))
    for (const { r, w } of ws) {
      const d = w.tm! - med
      if (Math.abs(d) > s.tmTolerance) out.push({ plateId: r.plateId, well: w.well, target: t, sample: r.sample, tm: w.tm!, median: med, delta: d })
    }
  }
  return out
}

/**
 * geNorm (Vandesompele 2002), NormFinder-style model (Andersen 2004) and BestKeeper-style descriptive stats (Pfaffl 2004).
 * L(sample, gene) is the log2 relative quantity (-Cq * log2(1 + E)).
 */
export function refStability(genes: string[], samples: string[], groupOf: Map<string, string>, L: (s: string, g: string) => number | null, cqOf: (s: string, g: string) => number | null, control: string): Stability {
  const usable = samples.filter(x => genes.every(g => L(x, g) !== null))
  const val = (x: string, g: string) => L(x, g)!

  // geNorm M with stepwise exclusion of the least stable gene.
  const mFor = (gs: string[]) => Object.fromEntries(gs.map(j => [j, mean(gs.filter(k => k !== j).map(k => sd(usable.map(x => val(x, j) - val(x, k)))))]))
  const steps: GenormStep[] = []
  let cur = [...genes]
  const removed: string[] = []
  while (cur.length >= 2) {
    const m = mFor(cur)
    steps.push({ genes: [...cur], m })
    if (cur.length === 2) break
    const worst = cur.reduce((a, b) => (m[b] > m[a] ? b : a))
    removed.unshift(worst)
    cur = cur.filter(g => g !== worst)
  }
  const ranking = [...cur.sort(), ...removed]
  const nf = (n: number) => usable.map(x => mean(ranking.slice(0, n).map(g => val(x, g))))
  const v: { label: string; v: number }[] = []
  for (let n = 2; n < ranking.length; n++) {
    const a = nf(n), b = nf(n + 1)
    v.push({ label: `V${n}/${n + 1}`, v: sd(a.map((x, i) => x - b[i])) })
  }
  const firstOk = v.findIndex(x => x.v < 0.15)
  const optimal = firstOk >= 0 ? firstOk + 2 : Math.min(ranking.length, 3)
  // Genes whose M at the step they left the ranking stays under 0.5 (homogeneous samples), never fewer than two.
  const mAtExit = Object.fromEntries(ranking.map(g => [g, steps.filter(st => st.genes.includes(g)).pop()!.m[g]]))
  const stable = ranking.filter(g => mAtExit[g] < 0.5)
  const recommended = ranking.slice(0, Math.max(2, Math.min(optimal, stable.length || 2)))

  // NormFinder-style: intragroup variance and shrunk intergroup variation, combined into a stability value.
  let normfinder: Stability['normfinder'] = null
  const grp = [...new Set(usable.map(x => groupOf.get(x)!))]
  const byG = grp.map(g => usable.filter(x => groupOf.get(x) === g)).filter(xs => xs.length >= 2)
  const k = genes.length
  if (k >= 3 && byG.length >= 1) {
    const sig: number[][] = genes.map(() => [])
    const dvals: number[][] = genes.map(() => [])
    const all = byG.flat()
    const gene = genes.map(g => mean(all.map(x => val(x, g))))
    const tot = mean(gene)
    byG.forEach((xs, gi) => {
      const ig = genes.map(g => mean(xs.map(x => val(x, g))))
      const sj = xs.map(x => mean(genes.map(g => val(x, g))))
      const gg = mean(ig)
      const raw = genes.map((g, i) => xs.reduce((acc, x, j) => acc + (val(x, g) - ig[i] - sj[j] + gg) ** 2, 0) / (xs.length - 1))
      const rs = raw.reduce((a, b) => a + b, 0)
      genes.forEach((_, i) => {
        sig[i][gi] = Math.max(1e-6, (raw[i] - rs / (k * (k - 1))) / (1 - 2 / k))
        dvals[i][gi] = ig[i] - gene[i] - gg + tot
      })
    })
    const G = byG.length
    const stability: Record<string, number> = {}
    if (G >= 2) {
      const sumD = dvals.flat().reduce((a, b) => a + b * b, 0)
      const sumS = genes.reduce((acc, _, i) => acc + byG.reduce((a, xs, gi) => a + sig[i][gi] / xs.length, 0), 0)
      const gamma2 = Math.max(0, sumD / ((k - 1) * (G - 1)) - sumS / (k * G))
      genes.forEach((g, i) => {
        const per = byG.map((xs, gi) => {
          const sn = sig[i][gi] / xs.length
          const shrink = gamma2 + sn > 0 ? gamma2 / (gamma2 + sn) : 0
          const dt = shrink * dvals[i][gi]
          return Math.sqrt(dt * dt + (gamma2 * sn) / (gamma2 + sn || 1) + sn)
        })
        stability[g] = mean(per)
      })
    } else genes.forEach((g, i) => (stability[g] = Math.sqrt(sig[i][0])))
    normfinder = { stability, ranking: [...genes].sort((a, b) => stability[a] - stability[b]), groups: G, note: G < 2 ? 'Only one group with two or more samples: intergroup variation is not estimated.' : undefined }
  }

  // BestKeeper-style: spread of raw Cq per gene and correlation with the BestKeeper index.
  const bestkeeper: Stability['bestkeeper'] = {}
  const bki = usable.map(x => Math.exp(mean(genes.map(g => Math.log(cqOf(x, g)!)))))
  for (const g of genes) {
    const c = usable.map(x => cqOf(x, g)!)
    const m = mean(c)
    const mad = mean(c.map(v => Math.abs(v - m)))
    bestkeeper[g] = { sd: mad, cv: (sd(c) / m) * 100, r: pearson(c, bki), mean: m }
  }

  // Treatment shift of each candidate: a reference gene should not respond to the treatment.
  const shift: Stability['shift'] = {}
  const others = grp.filter(g => g !== control)
  if (grp.includes(control) && others.length) {
    for (const g of genes) {
      let best: Stability['shift'][string] | null = null
      for (const o of others) {
        const a = usable.filter(x => groupOf.get(x) === o).map(x => cqOf(x, g)!)
        const b = usable.filter(x => groupOf.get(x) === control).map(x => cqOf(x, g)!)
        if (a.length < 2 || b.length < 2) continue
        const w = welch(a, b)
        if (!best || Math.abs(w.diff) > Math.abs(best.diff)) best = { diff: w.diff, p: w.p, groupA: o, groupB: control }
      }
      if (best) shift[g] = best
    }
  }
  return { genes, samples: usable.length, genorm: { steps, ranking, m: steps[0]?.m ?? {}, v, optimal, recommended }, normfinder, bestkeeper, shift }
}

function expression(t: string, refs: string[], samples: string[], gOf: Map<string, string>, groups: string[], control: string, L: (s: string, g: string) => number | null, s: Settings): TargetResult {
  const rows: SampleExpr[] = []
  for (const x of samples) {
    const lt = L(x, t)
    const lr = refs.map(r => L(x, r))
    if (lt === null || lr.some(v => v === null)) continue
    const y = lt - mean(lr as number[])
    rows.push({ sample: x, group: gOf.get(x)!, dcq: -y, log2rel: y })
  }
  const ctrl = rows.filter(r => r.group === control).map(r => r.log2rel)
  const base = ctrl.length ? mean(ctrl) : 0
  rows.forEach(r => (r.log2rel -= base))
  const by = (g: string) => rows.filter(r => r.group === g).map(r => r.log2rel)
  const gstats = groups.map(g => ({ group: g, n: by(g).length, meanLog2: mean(by(g)), sdLog2: by(g).length > 1 ? sd(by(g)) : NaN })).filter(g => g.n > 0)
  const res: TargetResult = { target: t, samples: rows, groups: gstats, omnibus: null, comparisons: [] }
  if (!ctrl.length) { res.note = `No samples in the control group (${control}) for ${t}.`; return res }
  const live = gstats.filter(g => g.n >= 2)
  const mk = (g: string, vs: string, na: number, nb: number, d: number, lo: number, hi: number, p: number | null, test: string): Comparison =>
    ({ target: t, group: g, vs, na, nb, log2fc: d, lo, hi, fold: 2 ** d, foldLo: 2 ** lo, foldHi: 2 ** hi, p, stars: stars(p), test })

  if (live.length < 2 || !live.some(g => g.group === control)) { res.note = 'Each group needs at least two biological replicates for statistics.'; return res }
  const others = live.filter(g => g.group !== control)

  if (s.test === 'nonparametric') {
    const raw = others.map(o => {
      const a = by(o.group), b = by(control)
      const w = welch(a, b)
      return { o, mw: mannWhitney(a, b), w }
    })
    // Holm correction across comparisons with the control.
    const order = raw.map((r, i) => ({ i, p: r.mw.p })).sort((a, b) => a.p - b.p)
    const adjP = new Array(raw.length).fill(1)
    let run = 0
    order.forEach((x, rank) => { run = Math.max(run, Math.min(1, x.p * (raw.length - rank))); adjP[x.i] = run })
    raw.forEach((r, i) => res.comparisons.push(mk(r.o.group, control, r.o.n, ctrl.length, r.w.diff, r.w.lo, r.w.hi, adjP[i], raw.length > 1 ? `Mann-Whitney U, Holm-adjusted${r.mw.exact ? ', exact' : ''}` : `Mann-Whitney U${r.mw.exact ? ' (exact)' : ''}`)))
    return res
  }
  if (live.length === 2) {
    const o = others[0]
    const w = welch(by(o.group), by(control))
    res.omnibus = { test: 'Welch t', stat: w.stat, p: w.p }
    res.comparisons.push(mk(o.group, control, o.n, ctrl.length, w.diff, w.lo, w.hi, w.p, `Welch t-test, df ${w.df.toFixed(1)}`))
    return res
  }
  const a = anova(live.map(g => by(g.group)))
  res.omnibus = { test: 'One-way ANOVA', stat: a.f, p: a.p }
  if (s.posthoc === 'tukey') {
    const q = qtukey(0.95, live.length, a.df2)
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      let A = live[j], B = live[i]
      if (A.group === control) [A, B] = [B, A]
      const se = Math.sqrt((a.mse / 2) * (1 / A.n + 1 / B.n))
      const d = A.meanLog2 - B.meanLog2
      const p = 1 - ptukey(Math.abs(d) / se, live.length, a.df2)
      res.comparisons.push(mk(A.group, B.group, A.n, B.n, d, d - q * se, d + q * se, Math.max(0, p), `Tukey HSD, df ${a.df2}`))
    }
  } else {
    const n0 = ctrl.length
    const lambdas = others.map(o => Math.sqrt(o.n / (o.n + n0)))
    const c = qdunnett(0.95, lambdas, a.df2)
    for (const o of others) {
      const se = Math.sqrt(a.mse * (1 / o.n + 1 / n0))
      const d = o.meanLog2 - mean(by(control))
      const p = 1 - pdunnett(Math.abs(d) / se, lambdas, a.df2)
      res.comparisons.push(mk(o.group, control, o.n, n0, d, d - c * se, d + c * se, Math.max(0, p), `Dunnett vs ${control}, df ${a.df2}`))
    }
  }
  return res
}

export const tCritical = (df: number) => tQuantile(0.975, df)

// ---------- MIQE checklist ----------

export interface MiqeItem { id: string; section: string; label: string; status: 'pass' | 'warn' | 'missing'; detail: string }

export function miqe(plates: Plate[], s: Settings, meta: Meta, a: Analysis): MiqeItem[] {
  const all = plates.flatMap(p => p.wells)
  const targets = [...new Set(all.filter(w => w.role === 'unknown').map(w => w.target))]
  const it = (id: string, section: string, label: string, ok: boolean | 'warn', detail: string, missing = false): MiqeItem => ({ id, section, label, status: missing ? 'missing' : ok === true ? 'pass' : 'warn', detail })
  const minN = Math.min(...a.groups.map(g => a.samples.filter(x => a.replicates.find(r => r.sample === x)?.group === g).length))
  const techMin = Math.min(...a.replicates.map(r => r.wells.length))
  const noNtc = targets.filter(t => !all.some(w => w.role === 'ntc' && w.target === t))
  const noEff = targets.filter(t => a.efficiencies[t]?.source === 'assumed')
  const noPrimer = targets.filter(t => !meta.primers[t]?.fwd || !meta.primers[t]?.rev)
  const noAmp = targets.filter(t => !meta.primers[t]?.amplicon)
  const hasTm = all.some(w => w.tm != null)
  const items: MiqeItem[] = [
    it('design', 'Experimental design', 'Groups and biological replicates', a.groups.length >= 2 && minN >= 3, a.groups.length ? `${a.groups.length} groups, smallest has ${isFinite(minN) ? minN : 0} biological replicates${minN < 3 ? ' (3 or more recommended)' : ''}.` : 'No groups defined.'),
    it('rna', 'Sample', 'RNA quality and integrity', true, meta.rnaQuality || 'Not reported (RIN or RQN, A260/280).', !meta.rnaQuality),
    it('rt', 'Reverse transcription', 'RT protocol and input amount', true, meta.rtProtocol || 'Not reported (kit, priming, RNA input per reaction).', !meta.rtProtocol),
    it('primers', 'qPCR target', 'Primer sequences for every target', noPrimer.length === 0, noPrimer.length ? `Missing for ${noPrimer.join(', ')}.` : 'Reported for all targets.', noPrimer.length === targets.length),
    it('amplicon', 'qPCR target', 'Amplicon length', noAmp.length === 0, noAmp.length ? `Missing for ${noAmp.join(', ')}.` : 'Reported for all targets.', noAmp.length === targets.length),
    it('eff', 'qPCR validation', 'PCR efficiency per assay', noEff.length === 0, noEff.length ? `No standard curve or entered efficiency for ${noEff.join(', ')} (100% assumed).` : targets.map(t => `${t} ${(a.efficiencies[t].e * 100).toFixed(1)}%`).join(', ') + '.'),
    it('r2', 'qPCR validation', 'Standard curve R² and dynamic range', a.curves.every(c => c.r2 >= 0.98 && c.decades >= 3), a.curves.length ? a.curves.map(c => `${c.target} R² ${c.r2.toFixed(3)}, ${c.decades.toFixed(1)} decades`).join('; ') + '.' : 'No standard curve in this project (efficiencies entered or assumed).', !a.curves.length && noEff.length > 0),
    it('ntc', 'qPCR validation', 'NTC for every assay, clean', noNtc.length === 0 && a.counts.contamFail === 0, noNtc.length ? `No NTC for ${noNtc.join(', ')}.` : a.counts.contamFail ? `${a.counts.contamFail} NTC/NRT well(s) failed contamination checks.` : 'All NTCs present and clean.'),
    it('nrt', 'qPCR validation', 'No-RT control for gDNA', all.some(w => w.role === 'nrt') && !a.contamination.some(c => c.role === 'nrt' && c.status === 'fail'), all.some(w => w.role === 'nrt') ? 'Included.' : 'No NRT wells (needed unless primers span an exon-exon junction).'),
    it('spec', 'qPCR validation', 'Specificity (melt curve or probe)', meta.chemistry === 'probe' || (hasTm && a.melt.length === 0), meta.chemistry === 'probe' ? 'Hydrolysis probe chemistry.' : hasTm ? a.melt.length ? `${a.melt.length} well(s) with Tm outside ±${s.tmTolerance} °C.` : 'Single, consistent Tm per assay.' : 'No melt data imported.', !hasTm && meta.chemistry !== 'probe'),
    it('instr', 'qPCR protocol', 'Instrument and chemistry', !!meta.instrument && !!meta.chemistry, [meta.instrument || 'instrument not set', meta.chemistry || 'chemistry not set'].join(', ') + '.', !meta.instrument && !meta.chemistry),
    it('tech', 'Data analysis', 'Technical replicates and outlier rule', techMin >= 2, `${isFinite(techMin) ? techMin : 0}+ technical replicates; ${s.outlier === 'none' ? 'no automatic outlier rule' : s.outlier === 'sd' ? `replicate SD > ${s.sdThreshold} flags the furthest well` : 'Grubbs test (alpha 0.05)'}; ${a.counts.excluded} well(s) excluded.`),
    it('refs', 'Data analysis', 'Reference genes: number and validation', s.refs.length >= 2 && !!a.stability, `${s.refs.length} reference gene(s)${a.stability ? `, stability evaluated over ${a.stability.genes.length} candidates` : ', stability not evaluated'}.`),
    it('stats', 'Data analysis', 'Statistical methods on log-scale values', true, `${s.test === 'parametric' ? 'Welch t-test / one-way ANOVA with ' + (s.posthoc === 'tukey' ? 'Tukey HSD' : 'Dunnett') : 'Mann-Whitney U with Holm correction'} on normalised log2 expression.`),
  ]
  return items
}

// ---------- Methods paragraph ----------

export function methodsText(plates: Plate[], s: Settings, meta: Meta, a: Analysis) {
  const pct = (t: string) => `${(a.efficiencies[t].e * 100).toFixed(1)}%`
  const targets = [...new Set(a.replicates.map(r => r.target))]
  const tech = Math.max(...a.replicates.map(r => r.wells.length))
  const parts: string[] = []
  const instr = meta.instrument || plates[0]?.instrument || 'a real-time PCR instrument'
  parts.push(`Quantitative PCR was performed on ${instr}${meta.chemistry ? ` using ${meta.chemistry === 'SYBR' ? 'SYBR Green' : 'hydrolysis probe'} chemistry` : ''}${isFinite(tech) ? `, with ${tech} technical replicates per sample` : ''}.`)
  if (meta.rnaQuality) parts.push(`RNA quality: ${meta.rnaQuality.replace(/\.$/, '')}.`)
  if (meta.rtProtocol) parts.push(`Reverse transcription: ${meta.rtProtocol.replace(/\.$/, '')}.`)
  const curveT = targets.filter(t => a.efficiencies[t]?.source === 'curve')
  const manT = targets.filter(t => a.efficiencies[t]?.source === 'manual')
  if (s.method === 'pfaffl') {
    const bits = []
    if (curveT.length) bits.push(`estimated from standard curves (E = 10^(-1/slope) - 1; ${curveT.map(t => { const c = a.curves.find(x => x.target === t)!; return `${t} ${pct(t)}, R² ${c.r2.toFixed(3)}` }).join('; ')})`)
    if (manT.length) bits.push(`taken from prior validation (${manT.map(t => `${t} ${pct(t)}`).join(', ')})`)
    const assumed = targets.filter(t => a.efficiencies[t]?.source === 'assumed')
    if (assumed.length) bits.push(`assumed to be 100% for ${assumed.join(', ')}`)
    parts.push(`Amplification efficiencies were ${bits.join(', and ')}.`)
  }
  if (a.stability) {
    const g = a.stability.genorm
    parts.push(`Reference gene stability was assessed for ${a.stability.genes.join(', ')} with geNorm (M values: ${g.ranking.map(x => `${x} ${g.m[x]?.toFixed(2)}`).join(', ')})${a.stability.normfinder ? ' and a NormFinder model-based estimate' : ''}.`)
  }
  if (s.refs.length) parts.push(`Expression was normalised to ${s.refs.length > 1 ? `the geometric mean of ${s.refs.join(' and ')}` : s.refs[0]}${s.method === 'pfaffl' ? ' using efficiency-corrected relative quantities (Pfaffl; generalised to multiple reference genes)' : ' using the comparative ΔΔCq method (Livak), assuming 100% efficiency'}.`)
  if (a.calibration.length) parts.push(`Inter-plate variation was corrected using ${s.calibrator} as an inter-run calibrator.`)
  parts.push(`Technical replicates were averaged${s.outlier === 'sd' ? `; replicates with SD > ${s.sdThreshold} cycles were inspected and the most deviant well excluded` : s.outlier === 'grubbs' ? '; outlying replicates were identified with Grubbs’ test (alpha = 0.05)' : ''}${a.counts.excluded ? ` (${a.counts.excluded} of ${a.counts.wells} wells excluded)` : ''}.`)
  const multi = a.groups.length > 2
  parts.push(`Statistical tests were performed on log2-transformed normalised expression (ΔCq scale), not on fold changes: ${s.test === 'nonparametric' ? `two-sided Mann-Whitney U tests against ${a.control}${multi ? ' with Holm correction' : ''}` : multi ? `one-way ANOVA followed by ${s.posthoc === 'tukey' ? 'Tukey’s HSD' : `Dunnett’s test against ${a.control}`}` : 'two-sided Welch’s t-test'}. Fold changes are reported relative to ${a.control} with 95% confidence intervals back-transformed from the log2 scale (2^x). P < 0.05 was considered significant.`)
  return parts.join(' ').replace(/\s+/g, ' ').replace(/ \./g, '.')
}
