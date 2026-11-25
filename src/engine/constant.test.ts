import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldFigure } from '../figure.ts'
import { comparisonRows } from '../exports.ts'
import { analyze, defaultSettings, wellName, type Settings, type Well } from './qpcr.ts'
import { anova, welch } from './stats.ts'

// Target Cq per group; R is 18 for every sample.
const run = (g: Record<string, number[]>, s: Partial<Settings> = {}) => {
  const rows = Object.entries(g).flatMap(([n, t]) => t.flatMap((c, i) => [[`${n}-${i + 1}`, 'R', 18], [`${n}-${i + 1}`, 'T', c]] as const))
  return analyze([{ id: 'p', name: 'p', format: 96, instrument: '', wells: rows.map(([sample, target, cq], i): Well => ({ well: wellName(i / 12 | 0, i % 12), sample, target, role: 'unknown', cq })) }], { ...defaultSettings(), method: 'livak', control: 'C', refs: ['R'], ...s })
}

test('constant groups have no p-value, CI or stars, whatever the difference', () => {
  for (const x of [[25, 25], [28, 28]]) {
    const a = run({ C: [28, 28], X: x }), c = a.targets[0].comparisons[0]
    assert.equal(c.p, null); assert.equal(c.stars, ''); assert.ok(isNaN(c.foldLo) && isNaN(c.foldHi))
    assert.equal(c.fold, 2 ** (28 - x[0]))
    assert.match(c.test, /no p-value/); assert.doesNotMatch(c.test, /NaN/)
    assert.deepEqual(comparisonRows(a)[1].slice(7, 11), ['', '', '', ''])
    assert.doesNotMatch(foldFigure(a.targets, { kind: 'bar', groups: a.groups, control: 'C' }), /NaN|\*/)
  }
})

test('rounding noise is not variance', () => {
  assert.equal(welch([28.1 - 18, 28.2 - 18.1], [25.3 - 18, 25.4 - 18.1]).p, null)
  assert.equal(anova([[10.1, 28.2 - 18.1], [7, 7], [8, 8]]).p, null)
  // Noise in one ΔCq reaches the engine too.
  assert.equal(run({ C: [28.1, 28.1], X: [25.3, 25.3] }, { method: 'pfaffl' }).targets[0].comparisons[0].p, null)
})

test('three constant groups: no Dunnett or Tukey result', () => {
  for (const posthoc of ['dunnett', 'tukey'] as const) {
    const t = run({ C: [28, 28], X: [25, 25], Z: [27, 27] }, { posthoc }).targets[0]
    assert.equal(t.omnibus!.p, null)
    const want = [['X', 'C', 8, null, ''], ['Z', 'C', 2, null, '']]
    assert.deepEqual(t.comparisons.map(c => [c.group, c.vs, c.fold, c.p, c.stars]), posthoc === 'tukey' ? [...want, ['Z', 'X', 0.25, null, '']] : want)
  }
})

test('one varying group is enough, and small real variance is kept', () => {
  // R: t.test(c(3.1, 2.9), c(0, 0)): t = 30, df = 1, p = 0.02121
  const w = welch([3.1, 2.9], [0, 0])
  assert.ok(Math.abs(w.p! - 0.02121) < 1e-5); assert.ok(Math.abs(w.df - 1) < 1e-9)
  assert.ok(welch([1, 1.00001], [1, 1.00002]).p! > 0)
})
