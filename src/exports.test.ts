import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { comparisonRows, replicateRows, resultsCsv, resultsXlsx, sampleRows } from './exports.ts'
import type { Analysis } from './engine/qpcr.ts'
import type { Project } from './store.ts'

const p = { plates: [], settings: { method: 'livak' } } as unknown as Project
const of = (c: object = {}, samples: object[] = [], replicates: object[] = []) => ({ targets: [{ target: 'T', samples, groups: [], omnibus: { test: 'One-way ANOVA', stat: 1, p: 3.21987e-5 }, comparisons: [{ target: 'T', group: 'X', vs: 'C', na: 3, nb: 3, log2fc: -13, lo: -14, hi: -12, fold: 2 ** -13, foldLo: 2 ** -14, foldHi: 2 ** -12, p: 2e-6, stars: '****', test: 'w', ...c }] }], replicates, contamination: [], melt: [], curves: [], stability: null }) as unknown as Analysis

test('small p-values, folds and CIs keep five significant digits', () => {
  assert.deepEqual(comparisonRows(of())[1].slice(5, 10), [-13, 0.00012207, 0.000061035, 0.00024414, 0.000002])
  assert.equal(comparisonRows(of())[1][13], 0.000032199)
  assert.deepEqual(resultsCsv(of()).split('\n')[1].split(',').slice(5, 10).map(Number), [-13, 0.00012207, 0.000061035, 0.00024414, 0.000002])
  assert.deepEqual(sampleRows(of({}, [{ sample: 'a', group: 'X', dcq: 0.00123456, log2rel: -20.123456 }]), p)[1].slice(3), [0.0012346, -20.1235, 8.7546e-7])
})

test('a p-value is never 0, and no value is not a 0', () => {
  for (const tiny of [0, 1e-12, 9.9e-7]) assert.equal(comparisonRows(of({ p: tiny }))[1][9], '<0.000001')
  assert.equal(comparisonRows(of({ p: 1e-6 }))[1][9], 0.000001)
  for (const x of [null, NaN]) assert.equal(comparisonRows(of({ p: x }))[1][9], '')
  assert.equal(comparisonRows(of({ foldLo: NaN, foldHi: Infinity }))[1].slice(7, 9).join(), ',')
})

test('rounding noise stays 0 and larger numbers keep four decimals', () => {
  assert.deepEqual(sampleRows(of({}, [{ sample: 'a', group: 'C', dcq: 28.1 - 18, log2rel: 1.7e-15 }]), p)[1].slice(3), [10.1, 0, 1])
  assert.equal(comparisonRows(of({ fold: 123456.78912 }))[1][6], 123456.7891)
  assert.deepEqual(replicateRows(of({}, [], [{ plateId: 'p', sample: 's', group: 'g', target: 'T', mean: 20, sd: 3e-15, flag: 'ok', wells: [{ well: 'A1', cq: 20.123456, tm: null, excluded: false, auto: false, manual: false }] }]), p)[1].slice(5), [20.1235, '', '', '', 20, 0, 'ok'])
})

test('the workbook carries the same numbers', async () => {
  const wb = XLSX.read(await (await resultsXlsx(of(), p)).arrayBuffer())
  const r = (XLSX.utils.sheet_to_json(wb.Sheets.Comparisons) as Record<string, unknown>[])[0]
  assert.deepEqual([r['Fold change'], r['CI low'], r.p], [0.00012207, 0.000061035, 0.000002])
})
