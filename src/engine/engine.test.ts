import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anova, grubbs, mannWhitney, qdunnett, qtukey, tQuantile, welch } from './stats.ts'
import { analyze, defaultSettings, guessGroup, methodsText, miqe, blankMeta, standardCurve, wellName, type Plate, type Settings, type Well } from './qpcr.ts'
import { detect, parseDelimited, parseLayout, parseRows } from './parse.ts'
import { CFX_CSV, GENERIC_CSV, LC480_TXT, QUANTSTUDIO_TXT, ROTORGENE_CSV } from './fixtures.ts'
import { SAMPLES } from './sample.ts'

const near = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} got ${a}`)

// ---------- Statistics ----------

test('Welch t-test matches R for (1,2,3) vs (4,5,6)', () => {
  const w = welch([1, 2, 3], [4, 5, 6])
  near(w.stat, -3.6742, 1e-4); near(w.df, 4, 1e-9); near(w.p, 0.02131, 1e-4)
  near(w.lo, -5.267, 1e-3); near(w.hi, -0.733, 1e-3)
})

test('t quantiles match tables', () => {
  near(tQuantile(0.975, 4), 2.7764, 1e-4)
  near(tQuantile(0.975, 30), 2.0423, 1e-4)
})

test('one-way ANOVA F and p', () => {
  const a = anova([[1, 2, 3], [4, 5, 6], [7, 8, 9]])
  near(a.f, 27, 1e-9); near(a.p, 0.001, 1e-6); assert.equal(a.df2, 6)
})

test('studentised range quantile matches Tukey tables', () => {
  near(qtukey(0.95, 3, 10), 3.877, 0.005)
  near(qtukey(0.95, 2, 10), Math.SQRT2 * tQuantile(0.975, 10), 0.003)
  near(qtukey(0.95, 4, 20), 3.958, 0.006)
})

test('Dunnett two-sided critical values match tables', () => {
  near(qdunnett(0.95, [Math.SQRT1_2, Math.SQRT1_2], 10), 2.57, 0.01)
  near(qdunnett(0.95, [Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2], 20), 2.54, 0.01)
  // One comparison reduces to the t distribution.
  near(qdunnett(0.95, [Math.SQRT1_2], 10), tQuantile(0.975, 10), 0.002)
})

test('Mann-Whitney exact p-values', () => {
  assert.deepEqual(mannWhitney([1, 2, 3], [4, 5, 6]), { u: 0, p: 0.1, exact: true })
  near(mannWhitney([1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11]).p, 2 / 462, 1e-12)
  assert.equal(mannWhitney([1, 2, 2], [2, 3, 4]).exact, false)
})

test('Grubbs flags a clear outlier at n=6 but cannot at n=3', () => {
  const g = grubbs([1, 1.1, 0.9, 1.05, 0.95, 3])!
  assert.equal(g.outlier, true); assert.equal(g.index, 5)
  assert.equal(grubbs([20.1, 20.2, 20.6])!.outlier, false)
})

// ---------- Standard curves ----------

test('standard curve with slope -3.3219 gives 100% efficiency', () => {
  const pts = [0, 1, 2, 3, 4].map(k => ({ log10q: -k, cq: 15 + 3.321928 * k, well: 'A' + (k + 1) }))
  const c = standardCurve('X', pts)!
  near(c.slope, -3.3219, 1e-4); near(c.efficiency, 1, 1e-5); near(c.r2, 1, 1e-12); assert.equal(c.decades, 4); assert.deepEqual(c.warnings, [])
})

test('standard curve warnings: low efficiency, short range, too few points', () => {
  const c = standardCurve('X', [0, 1, 2].map(k => ({ log10q: -k, cq: 15 + 3.9 * k + (k === 1 ? 0.6 : 0), well: 'A1' })))!
  assert.ok(c.efficiency < 0.9)
  assert.ok(c.warnings.some(w => /Efficiency/.test(w)) && c.warnings.some(w => /decades/.test(w)))
  assert.ok(standardCurve('X', [0, 1, 2, 3].map(k => ({ log10q: -k, cq: 15 + 3.3 * k + (k % 2 ? 2.5 : 0), well: 'A1' })))!.warnings.some(w => /R²/.test(w)))
  assert.equal(standardCurve('X', [{ log10q: 0, cq: 15, well: 'A1' }, { log10q: -1, cq: 18.3, well: 'A2' }]), null)
})

test('sample standard-curve run recovers the generating efficiencies', () => {
  const B = SAMPLES[1].build()
  const a = analyze(B.plates, B.settings)
  assert.equal(a.curves.length, 5)
  for (const c of a.curves) { near(c.efficiency, { ACTB: 0.981, HPRT1: 0.954, GAPDH: 1.012, IL6: 0.923, CCL2: 1.046 }[c.target]!, 0.03, c.target); assert.ok(c.r2 > 0.99) }
  assert.equal(a.efficiencies.IL6.source, 'curve')
})

// ---------- Plate helpers ----------

let n = 0
const W = (sample: string, target: string, cq: number | null, extra: Partial<Well> = {}): Well => { const i = n++ % 384; return { well: wellName(Math.floor(i / 24), i % 24), sample, target, role: 'unknown', cq, ...extra } }
const plate = (wells: Well[], id = 'p1'): Plate => ({ id, name: id, format: 384, instrument: 'test', wells })
const S = (p: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), ...p })

/** Builds a plate from per-sample Cq values (duplicates with tiny spread). */
function design(cqs: Record<string, Record<string, number>>, id = 'p1') {
  const wells: Well[] = []
  for (const [s, genes] of Object.entries(cqs)) for (const [g, c] of Object.entries(genes)) { wells.push(W(s, g, c - 0.01), W(s, g, c + 0.01)) }
  return plate(wells, id)
}

test('SD rule flags the furthest replicate; a manual override puts it back', () => {
  n = 0
  const p = plate([W('C-1', 'G', 20.0, { well: 'A1' }), W('C-1', 'G', 20.1, { well: 'A2' }), W('C-1', 'G', 21.5, { well: 'A3' })])
  const a = analyze([p], S())
  const r = a.replicates[0]
  assert.equal(r.flag, 'outlier'); assert.equal(r.wells.find(w => w.well === 'A3')!.excluded, true); near(r.mean!, 20.05, 1e-9)
  const b = analyze([p], S({ excluded: { 'p1|A3': false } }))
  assert.equal(b.replicates[0].wells.find(w => w.well === 'A3')!.excluded, false); near(b.replicates[0].mean!, 20.5333, 1e-3)
  const c = analyze([p], S({ outlier: 'none', excluded: { 'p1|A1': true } }))
  near(c.replicates[0].mean!, 20.8, 1e-9)
})

test('no-amplification and partial replicates are labelled', () => {
  const p = plate([W('C-1', 'G', null, { well: 'A1' }), W('C-1', 'G', null, { well: 'A2' }), W('C-2', 'G', 25, { well: 'B1' }), W('C-2', 'G', null, { well: 'B2' })])
  const a = analyze([p], S())
  assert.equal(a.replicates.find(r => r.sample === 'C-1')!.flag, 'no-amp')
  assert.equal(a.replicates.find(r => r.sample === 'C-2')!.flag, 'partial')
})

test('NTC within the window fails; a primer-dimer Tm downgrades it to a warning', () => {
  const p = plate([
    W('C-1', 'IL6', 30, { well: 'A1', tm: 81.2 }), W('C-1', 'IL6', 30.1, { well: 'A2', tm: 81.2 }),
    W('NTC', 'IL6', 35, { well: 'H1', role: 'ntc', tm: 81.3 }),
    W('C-1', 'G', 20, { well: 'A3', tm: 84 }), W('C-1', 'G', 20, { well: 'A4', tm: 84 }),
    W('NTC', 'G', 22, { well: 'H2', role: 'ntc', tm: 73 }),
    W('NTC', 'G', null, { well: 'H3', role: 'ntc' }),
  ])
  const a = analyze([p], S())
  const c = Object.fromEntries(a.contamination.map(x => [x.well, x]))
  assert.equal(c.H1.status, 'fail'); near(c.H1.gap!, 4.95, 1e-9)
  assert.equal(c.H2.status, 'warn'); assert.match(c.H2.note, /primer-dimer/)
  assert.equal(c.H3.status, 'pass')
})

test('NRT compares against the matching RT+ sample and estimates gDNA share', () => {
  const p = plate([W('C-1', 'ACTB', 18, { well: 'A1' }), W('C-1', 'ACTB', 18, { well: 'A2' }), W('C-1', 'ACTB', 22, { well: 'H1', role: 'nrt' })])
  const nrt = analyze([p], S()).contamination[0]
  assert.equal(nrt.status, 'fail'); assert.match(nrt.note, /6\.3%/)
})

test('melt flags a well whose Tm differs from the assay median', () => {
  const p = plate([80.5, 80.6, 80.4, 77.9].map((tm, i) => W(`C-${i}`, 'CCL2', 25, { well: `A${i + 1}`, tm })))
  const a = analyze([p], S())
  assert.equal(a.melt.length, 1); assert.equal(a.melt[0].well, 'A4')
})

// ---------- Quantification ----------

test('Livak ΔΔCt matches hand calculation (2^-ΔΔCt)', () => {
  n = 0
  const p = design({ 'C-1': { R: 18, T: 28 }, 'C-2': { R: 18.2, T: 28.4 }, 'X-1': { R: 18.1, T: 25.1 }, 'X-2': { R: 17.9, T: 24.7 } })
  const a = analyze([p], S({ method: 'livak', refs: ['R'], control: 'C' }))
  const t = a.targets.find(x => x.target === 'T')!
  // ΔCt control: 10, 10.2 (mean 10.1); treated 7.0, 6.8 (mean 6.9) -> ΔΔCt = -3.2
  near(t.comparisons[0].log2fc, 3.2, 1e-9); near(t.comparisons[0].fold, 2 ** 3.2, 1e-9)
  near(t.samples.find(x => x.sample === 'C-1')!.dcq, 10, 1e-9)
})

test('Pfaffl ratio with one reference equals E_t^ΔCt_t / E_r^ΔCt_r', () => {
  n = 0
  const p = design({ 'C-1': { R: 18, T: 28 }, 'C-2': { R: 18, T: 28 }, 'X-1': { R: 19, T: 25 }, 'X-2': { R: 19, T: 25 } })
  const a = analyze([p], S({ method: 'pfaffl', refs: ['R'], control: 'C', efficiencies: { T: 90, R: 100 } }))
  const expected = 1.9 ** (28 - 25) / 2.0 ** (18 - 19)
  near(a.targets[0].comparisons[0].fold, expected, 1e-9)
})

test('two references normalise to their geometric mean', () => {
  n = 0
  const p = design({ 'C-1': { R1: 18, R2: 24, T: 28 }, 'C-2': { R1: 18, R2: 24, T: 28 }, 'X-1': { R1: 19, R2: 24, T: 26 }, 'X-2': { R1: 19, R2: 24, T: 26 } })
  const a = analyze([p], S({ method: 'livak', refs: ['R1', 'R2'], control: 'C' }))
  // NF shifts by 0.5 cycles, target by -2 -> ΔΔCt = -2.5
  near(a.targets[0].comparisons[0].log2fc, 2.5, 1e-9)
})

test('inter-plate calibration removes a constant plate offset', () => {
  n = 0
  const p1 = design({ IRC: { R: 20, T: 25 }, 'C-1': { R: 18, T: 28 }, 'C-2': { R: 18.2, T: 28.1 } }, 'p1')
  const p2 = design({ IRC: { R: 21, T: 26 }, 'X-1': { R: 19, T: 26 }, 'X-2': { R: 19.2, T: 26.1 } }, 'p2')
  const off = analyze([p1, p2], S({ method: 'livak', refs: ['R'], control: 'C' }))
  const on = analyze([p1, p2], S({ method: 'livak', refs: ['R'], control: 'C', calibrator: 'IRC' }))
  assert.equal(on.calibration.length, 4)
  near(on.calibration.find(c => c.plateId === 'p2' && c.target === 'T')!.offset, 0.5, 1e-9)
  assert.ok(!on.samples.includes('IRC'))
  // A shift common to R and T cancels in ΔCt, so the fold change is unchanged; Cq values themselves move.
  near(on.targets[0].comparisons[0].log2fc, off.targets[0].comparisons[0].log2fc, 1e-9)
  near(on.replicates.find(r => r.sample === 'X-1' && r.target === 'T')!.mean!, 25.5, 1e-9)
})

test('three groups: ANOVA with Dunnett vs control, or Tukey all pairs', () => {
  n = 0
  const p = design({ 'C-1': { R: 18, T: 28 }, 'C-2': { R: 18, T: 28.3 }, 'C-3': { R: 18, T: 27.8 }, 'A-1': { R: 18, T: 26 }, 'A-2': { R: 18, T: 26.4 }, 'A-3': { R: 18, T: 25.9 }, 'B-1': { R: 18, T: 28.1 }, 'B-2': { R: 18, T: 27.7 }, 'B-3': { R: 18, T: 28.2 } })
  const d = analyze([p], S({ method: 'livak', refs: ['R'], control: 'C', posthoc: 'dunnett' })).targets[0]
  assert.equal(d.omnibus!.test, 'One-way ANOVA'); assert.ok(d.omnibus!.p < 0.001)
  assert.equal(d.comparisons.length, 2)
  assert.ok(d.comparisons.find(c => c.group === 'A')!.p! < 0.001)
  assert.ok(d.comparisons.find(c => c.group === 'B')!.p! > 0.5)
  const t = analyze([p], S({ method: 'livak', refs: ['R'], control: 'C', posthoc: 'tukey' })).targets[0]
  assert.equal(t.comparisons.length, 3)
  for (const c of t.comparisons) assert.ok(c.foldLo < c.fold && c.fold < c.foldHi)
})

test('nonparametric option uses Mann-Whitney and reports the exact floor for n=3', () => {
  n = 0
  const p = design({ 'C-1': { R: 18, T: 28 }, 'C-2': { R: 18, T: 28.3 }, 'C-3': { R: 18, T: 27.8 }, 'X-1': { R: 18, T: 26 }, 'X-2': { R: 18, T: 26.4 }, 'X-3': { R: 18, T: 25.9 } })
  const c = analyze([p], S({ method: 'livak', refs: ['R'], control: 'C', test: 'nonparametric' })).targets[0].comparisons[0]
  near(c.p!, 0.1, 1e-12); assert.match(c.test, /Mann-Whitney/)
})

test('statistics need two biological replicates per group', () => {
  n = 0
  const p = design({ 'C-1': { R: 18, T: 28 }, 'X-1': { R: 18, T: 26 } })
  const t = analyze([p], S({ method: 'livak', refs: ['R'], control: 'C' })).targets[0]
  assert.equal(t.comparisons.length, 0); assert.match(t.note!, /two biological replicates/)
})

// ---------- Reference stability ----------

test('geNorm M by hand: a gene with independent noise ranks last', () => {
  n = 0
  // R1 and R2 move together with input; R3 has its own noise.
  const input = [0, 0.5, -0.4, 0.2, -0.1, 0.3]
  const noise = [0.6, -0.5, 0.4, -0.7, 0.5, -0.3]
  const cqs: Record<string, Record<string, number>> = {}
  input.forEach((d, i) => (cqs[`S-${i}`] = { R1: 18 + d, R2: 24 + d + 0.05 * (i % 2), R3: 20 + d + noise[i] }))
  const a = analyze([design(cqs)], S({ method: 'livak', candidates: ['R1', 'R2', 'R3'], refs: ['R1', 'R2'] }))
  const g = a.stability!.genorm
  assert.equal(g.ranking[2], 'R3')
  // M(R1) = mean(sd(R1-R2), sd(R1-R3)) computed directly
  const sdv = (x: number[]) => { const m = x.reduce((a, b) => a + b) / x.length; return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1)) }
  const d12 = input.map((_, i) => -0.05 * (i % 2)), d13 = noise.map(v => -v)
  near(g.m.R1, (sdv(d12) + sdv(d13)) / 2, 1e-9)
  assert.equal(g.v.length, 1); assert.equal(g.v[0].label, 'V2/3')
  assert.deepEqual(g.recommended, ['R1', 'R2'])
})

test('sample experiment: GAPDH is the least stable candidate and responds to treatment', () => {
  const A = SAMPLES[0].build()
  const a = analyze(A.plates, A.settings)
  const st = a.stability!
  assert.equal(st.genorm.ranking[2], 'GAPDH')
  assert.equal(st.normfinder!.ranking[2], 'GAPDH')
  assert.ok(Math.abs(st.shift.GAPDH.diff) > Math.abs(st.shift.ACTB.diff))
  assert.ok(st.bestkeeper.GAPDH.sd > st.bestkeeper.ACTB.sd)
})

test('sample experiment: outlier, contamination and expected fold changes', () => {
  const A = SAMPLES[0].build()
  const a = analyze(A.plates, A.settings)
  assert.equal(a.replicates.filter(r => r.flag === 'outlier').length, 1)
  assert.equal(a.contamination.find(c => c.status === 'fail')!.target, 'IL6')
  const il6 = a.targets.find(t => t.target === 'IL6')!.comparisons[0]
  near(Math.log2(il6.fold), 3, 0.5); assert.ok(il6.p! < 0.01)
  const ccl2 = a.targets.find(t => t.target === 'CCL2')!.comparisons[0]
  near(ccl2.fold, 0.45, 0.1)
  // Normalising to GAPDH alone (which rises with treatment) hides part of the IL6 induction.
  const g = analyze(A.plates, { ...A.settings, refs: ['GAPDH'] }).targets.find(t => t.target === 'IL6')!.comparisons[0]
  assert.ok(g.fold < il6.fold / 1.6)
})

// ---------- MIQE and methods ----------

test('MIQE checklist reports missing primers, NRT and efficiency', () => {
  n = 0
  const p = design({ 'C-1': { R: 18, T: 28 }, 'X-1': { R: 18, T: 26 } })
  const items = miqe([p], S({ refs: ['R'] }), blankMeta(), analyze([p], S({ refs: ['R'] })))
  const by = Object.fromEntries(items.map(i => [i.id, i]))
  assert.equal(by.primers.status, 'missing'); assert.equal(by.nrt.status, 'warn'); assert.equal(by.eff.status, 'warn'); assert.equal(by.refs.status, 'warn')
})

test('methods paragraph names refs, efficiencies and the test on ΔCq', () => {
  const A = SAMPLES[0].build()
  const txt = methodsText(A.plates, A.settings, A.meta, analyze(A.plates, A.settings))
  assert.match(txt, /geometric mean of ACTB and HPRT1/)
  assert.match(txt, /IL6 92\.5%/)
  assert.match(txt, /Welch/)
  assert.match(txt, /not on fold changes/)
})

// ---------- Parsing ----------

test('detects Bio-Rad CFX and maps Content codes', () => {
  const rows = parseDelimited(CFX_CSV)
  const d = detect(rows)!
  assert.equal(d.format, 'cfx')
  const r = parseRows(rows, d.headerIndex, d.mapping)
  assert.equal(r.wells.length, 11)
  const by = Object.fromEntries(r.wells.map(w => [w.well, w]))
  assert.equal(by.A1.cq, 18.12); assert.equal(by.A1.group, 'Control')
  assert.equal(by.C1.role, 'standard'); assert.equal(by.C1.quantity, 50)
  assert.equal(by.H11.role, 'ntc'); assert.equal(by.H11.cq, null)
  assert.equal(by.H12.role, 'nrt')
})

test('detects QuantStudio with metadata lines, Undetermined and section end', () => {
  const rows = parseDelimited(QUANTSTUDIO_TXT)
  const d = detect(rows)!
  assert.equal(d.format, 'quantstudio'); assert.match(d.instrument, /QuantStudio 5/)
  const r = parseRows(rows, d.headerIndex, d.mapping)
  assert.equal(r.wells.length, 5)
  assert.equal(r.wells[0].well, 'A1'); assert.equal(r.wells[0].tm, 83.41)
  assert.equal(r.wells.find(w => w.well === 'H12')!.cq, null)
  assert.equal(r.wells.find(w => w.well === 'B1')!.role, 'standard')
})

test('LightCycler 480: no target column, Standard column marks standards', () => {
  const rows = parseDelimited(LC480_TXT)
  const d = detect(rows)!
  assert.equal(d.format, 'lc480'); assert.match(d.defaultTarget, /SYBR Green I/)
  const r = parseRows(rows, d.headerIndex, d.mapping, { defaultTarget: 'ACTB' })
  assert.equal(r.wells.filter(w => w.role === 'standard').length, 3)
  assert.ok(r.wells.every(w => w.target === 'ACTB'))
  assert.equal(r.wells.find(w => w.well === 'H12')!.role, 'ntc')
})

test('Rotor-Gene: numbered positions and channel name', () => {
  const rows = parseDelimited(ROTORGENE_CSV)
  const d = detect(rows)!
  assert.equal(d.format, 'rotorgene'); assert.equal(d.defaultTarget, 'Green')
  const r = parseRows(rows, d.headerIndex, d.mapping, { defaultTarget: 'GAPDH', numbered: true })
  assert.deepEqual(r.wells.map(w => w.well), ['A1', 'A2', 'B1', 'F12'])
  assert.equal(r.wells[2].role, 'standard'); assert.equal(r.wells[3].role, 'ntc')
})

test('generic CSV with dilution and group columns', () => {
  const rows = parseDelimited(GENERIC_CSV)
  const d = detect(rows)!
  assert.equal(d.format, 'generic')
  const r = parseRows(rows, d.headerIndex, d.mapping)
  assert.equal(r.wells.filter(w => w.role === 'standard').length, 2)
  assert.equal(r.wells.find(w => w.well === 'H12')!.role, 'ntc')
  assert.equal(r.wells[0].group, 'Control')
})

test('validation reports line numbers for bad wells, bad Cq and duplicates', () => {
  const txt = 'well,sample,target,cq\nA1,S1,G,20.1\nZ9,S1,G,20\nA2,S1,G,abc\nA1,S1,G,20.3\nA3,,G,45\n'
  const rows = parseDelimited(txt)
  const d = detect(rows)!
  const r = parseRows(rows, d.headerIndex, d.mapping)
  const at = (line: number) => r.issues.filter(i => i.line === line)
  assert.equal(at(3)[0].level, 'error')
  assert.match(at(4)[0].msg, /not a number/)
  assert.match(at(5)[0].msg, /Duplicate A1.*line 2/)
  assert.equal(at(6).length, 2)
  assert.equal(r.wells.length, 2); assert.equal(r.skipped, 3)
})

test('semicolon CSV with decimal commas', () => {
  const rows = parseDelimited('Well;Sample;Target;Cq\nA1;S1;G;"20,15"\n')
  const d = detect(rows)!
  assert.equal(parseRows(rows, d.headerIndex, d.mapping).wells[0].cq, 20.15)
})

test('plate layout paste with and without row and column labels', () => {
  const withLabels = parseLayout('\t1\t2\t3\nA\tCtrl-1\tCtrl-1\tCtrl-1\nB\tTrt-1\t\tTrt-1\n')
  assert.equal(withLabels.get('A1'), 'Ctrl-1'); assert.equal(withLabels.get('B3'), 'Trt-1'); assert.equal(withLabels.has('B2'), false)
  const bare = parseLayout('x\ty\nz\tw')
  assert.equal(bare.get('B2'), 'w')
})

test('group names are guessed from replicate suffixes', () => {
  assert.equal(guessGroup('Treated-2'), 'Treated')
  assert.equal(guessGroup('Vehicle_rep3'), 'Vehicle')
  assert.equal(guessGroup('KO 1'), 'KO')
  assert.equal(guessGroup('WT'), 'WT')
})
