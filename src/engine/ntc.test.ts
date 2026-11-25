import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyze, blankMeta, defaultSettings, miqe, type Plate, type Role, type Well } from './qpcr.ts'

const w = (well: string, sample: string, role: Role, cq: number | null, x: Partial<Well> = {}): Well => ({ well, sample, target: 'T', role, cq, ...x })
const run = (wells: Well[], excluded: Record<string, boolean> = {}) => {
  const p: Plate = { id: 'p', name: 'p', format: 96, instrument: '', wells }, s = { ...defaultSettings(), excluded }
  const a = analyze([p], s)
  return { c: a.contamination[0], fails: a.counts.contamFail, miqe: miqe([p], s, blankMeta(), a).find(i => i.id === 'ntc')! }
}
// 10-fold dilutions at slope -3.32: 15, 18.32, 21.64, 24.96.
const std = [50, 5, 0.5, 0.05].map((quantity, i) => w(`A${i + 1}`, `S${i}`, 'standard', 15 + 3.32 * i, { quantity, tm: 81 }))

test('on a standard-curve plate the NTC is compared with the latest standard', () => {
  const bad = run([...std, w('H1', 'NTC', 'ntc', 16)])
  assert.equal(bad.c.status, 'fail'); assert.match(bad.c.note, /9\.0 cycles before latest standard \(24\.96\)/); assert.equal(bad.fails, 1); assert.notEqual(bad.miqe.status, 'pass')
  const late = run([...std, w('H1', 'NTC', 'ntc', 34)])
  assert.equal(late.c.status, 'warn'); assert.match(late.c.note, /9\.0 cycles after latest standard/)
  assert.equal(run([...std, w('H1', 'NTC', 'ntc', 28, { tm: 73 })]).c.status, 'warn') // primer-dimer Tm
  assert.equal(run([...std, w('H1', 'NTC', 'ntc', null)]).c.status, 'pass')
  // Without the 24.96 well the latest standard is 21.64; 28 is 6.36 later.
  assert.equal(run([...std, w('H1', 'NTC', 'ntc', 28)], { 'p|A4': true }).c.status, 'warn')
  assert.equal(run([...std, w('H1', 'NTC', 'ntc', 28)]).c.status, 'fail')
})

test('samples are still preferred over standards', () => {
  assert.match(run([...std, w('B1', 'X', 'unknown', 30), w('H1', 'NTC', 'ntc', 33)]).c.note, /latest sample \(30\.00\)/)
})

test('nothing to compare with is never called fine', () => {
  const r = run([w('B1', 'X', 'unknown', null), w('H1', 'NTC', 'ntc', 16)])
  assert.equal(r.c.status, 'warn'); assert.match(r.c.note, /cannot be ruled out/); assert.doesNotMatch(r.c.note, /Late signal|Below/)
  assert.equal(r.miqe.status, 'warn'); assert.match(r.miqe.detail, /nothing to be compared with/)
  assert.match(run([...std, w('H1', 'X', 'nrt', 16)]).c.note, /no RT\+ sample/)
})
