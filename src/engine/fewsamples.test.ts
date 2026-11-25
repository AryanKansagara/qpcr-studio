import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSnapshot } from '../projectData.ts'
import { analyze, blankMeta, defaultSettings, methodsText, miqe, wellName, type Well } from './qpcr.ts'
import type { Project } from '../store.ts'

const run = (rows: [string, string, number | null][], candidates = ['R', 'R2']) => {
  const plates = [{ id: 'p', name: 'p', format: 96 as const, instrument: '', wells: rows.map(([sample, target, cq], i): Well => ({ well: wellName(i / 12 | 0, i % 12), sample, target, role: 'unknown', cq })) }]
  const s = { ...defaultSettings(), candidates, refs: ['R'] }
  return { a: analyze(plates, s), plates, s }
}

test('one common sample, or none, gives no ranking and says why', () => {
  const one = run([['C-1', 'R', 18], ['C-1', 'R2', 22], ['C-2', 'R', 18], ['C-2', 'R2', null]])
  assert.equal(one.a.stability, null)
  assert.equal(one.a.stabilityNote, 'Reference genes cannot be ranked: R, R2 both have a Cq in only one sample, and stability needs at least two.')
  assert.ok(one.a.warnings.includes(one.a.stabilityNote!))
  assert.match(miqe(one.plates, one.s, blankMeta(), one.a).find(i => i.id === 'refs')!.detail, /stability not evaluated/)
  assert.doesNotMatch(methodsText(one.plates, one.s, blankMeta(), one.a), /geNorm|NaN/)
  assert.deepEqual(makeSnapshot({ plates: one.plates, settings: one.s } as unknown as Project, one.a, 'x').stability, [])
  const none = run([['C-1', 'R', 18], ['C-2', 'R2', 22], ['C-3', 'R3', 20]], ['R', 'R2', 'R3'])
  assert.equal(none.a.stability, null); assert.match(none.a.stabilityNote!, /R, R2, R3 all have a Cq in no sample/)
})

test('two common samples are ranked; a single candidate is not a problem to report', () => {
  const two = run([['C-1', 'R', 18], ['C-1', 'R2', 22], ['C-2', 'R', 18.5], ['C-2', 'R2', 22]])
  assert.ok(two.a.stability!.genorm.m.R > 0); assert.equal(two.a.stabilityNote, undefined)
  const single = run([['C-1', 'R', 18]], ['R'])
  assert.equal(single.a.stability, null); assert.equal(single.a.stabilityNote, undefined)
})
