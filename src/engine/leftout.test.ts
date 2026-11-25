import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyze, defaultSettings, wellName, type Settings, type Well } from './qpcr.ts'

type R = [sample: string, target: string, cq: number | null]
const run = (rows: R[], s: Partial<Settings> = {}) => analyze([{ id: 'p', name: 'p', format: 96, instrument: '', wells: rows.map(([sample, target, cq], i): Well => ({ well: wellName(i / 12 | 0, i % 12), sample, target, role: 'unknown', cq })) }], { ...defaultSettings(), method: 'livak', control: 'C', refs: ['R'], ...s })
const full = (g: string, n: number, t: number): R[] => Array.from({ length: n }, (_, i) => [[`${g}-${i + 1}`, 'R', 18], [`${g}-${i + 1}`, 'T', t + i / 10]] as R[]).flat()
const left = (a: ReturnType<typeof run>) => a.targets[0].leftOut.map(x => [x.sample, x.why])

test('a sample without a Cq is named with its target and the bias is stated', () => {
  const a = run([...full('C', 3, 28), ...full('X', 2, 25), ['X-3', 'R', 18], ['X-3', 'T', null]])
  assert.deepEqual(left(a), [['X-3', 'T undetermined']])
  assert.ok(a.warnings.includes('T: left out of the fold change: X-3 (T undetermined). Leaving out samples without amplification biases the fold change.'))
  assert.equal(a.targets[0].comparisons[0].na, 2)
})

test('references, excluded wells and wells that were never run are told apart', () => {
  const a = run([...full('C', 3, 28), ...full('X', 2, 25), ['X-3', 'R', null], ['X-3', 'T', 25], ['X-4', 'R', 18], ['X-5', 'R', 18], ['X-5', 'T', 25]], { excluded: { 'p|B3': true } })
  assert.deepEqual(left(a), [['X-3', 'R undetermined'], ['X-4', 'no T well'], ['X-5', 'every T well with a Cq is excluded']])
})

test('a sample and a group with nothing amplified at all are still named', () => {
  const a = run([...full('C', 2, 28), ...full('X', 2, 25), ['Z-1', 'R', null], ['Z-1', 'T', null], ['Z-2', 'R', 18], ['Z-2', 'T', null]])
  assert.deepEqual(left(a), [['Z-1', 'T undetermined, R undetermined'], ['Z-2', 'T undetermined']])
  assert.match(a.warnings.join(), /fewer than two samples left: Z \(0\)/)
})

test('nothing is said when every sample is used, and calibrators are not samples', () => {
  const a = run([...full('C', 2, 28), ...full('X', 2, 25), ['IRC', 'T', 20]], { calibrator: 'IRC' })
  assert.deepEqual(left(a), []); assert.doesNotMatch(a.warnings.join(), /left out/)
})
