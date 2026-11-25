import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detect, parseDelimited, parseRows } from './parse.ts'
import { analyze, defaultSettings, isExcluded, moveExclusions, withExclusion, type Well } from './qpcr.ts'

const w = (target: string, cq: number): Well => ({ well: 'A1', sample: 'S1', target, role: 'unknown', cq })
const run = (excluded: Record<string, boolean>, wells = [w('T', 20), w('R', 18)]) => Object.fromEntries(analyze([{ id: 'p', name: 'p', format: 96, instrument: '', wells }], { ...defaultSettings(), excluded }).replicates.map(r => [r.target, r.wells[0].excluded]))
const qs = (rows: string) => { const r = parseDelimited(`Well\tWell Position\tOmit\tSample Name\tTarget Name\tTask\tCT\n${rows}`), d = detect(r)!; return parseRows(r, d.headerIndex, d.mapping) }

test('one target of a duplex well is excluded on its own', () => {
  assert.deepEqual(run({ 'p|A1|T': true }), { T: true, R: false })
  // A standard of the excluded target leaves the curve, the other stays.
  const std = (target: string): Well[] => [1, 2, 3, 4].map(i => ({ well: `A${i}`, sample: 's', target, role: 'standard', cq: 15 + 3.32 * i, quantity: 10 ** (5 - i) }))
  const a = analyze([{ id: 'p', name: 'p', format: 96, instrument: '', wells: [...std('T'), ...std('R')] }], { ...defaultSettings(), excluded: { 'p|A1|T': true } })
  assert.deepEqual(a.curves.map(c => [c.target, c.n]), [['T', 3], ['R', 4]])
})

test('exclusions saved per well still cover every target, and each can be put back', () => {
  const old = { 'p|A1': true }
  assert.deepEqual(run(old), { T: true, R: true })
  const next = withExclusion(old, 'p', 'A1', 'T', false, false)
  assert.deepEqual(run(next), { T: false, R: true })
  assert.deepEqual(withExclusion(next, 'p', 'A1', 'T', false, true), old)
  // A saved "put back" for an auto-flagged well is kept too.
  assert.equal(isExcluded({ excluded: { 'p|A1': false } }, 'p', 'A1', 'T', true), false)
})

test('toggling keeps an entry only where it differs from the automatic decision', () => {
  assert.deepEqual(withExclusion({}, 'p', 'A1', 'T', true, false), { 'p|A1|T': false })
  assert.deepEqual(withExclusion({ 'p|A1|T': false }, 'p', 'A1', 'T', true, true), {})
  assert.deepEqual(withExclusion({}, 'p', 'A1', 'T', false, true), { 'p|A1|T': true })
})

test('renaming a target keeps its exclusions', () => {
  const before = [w('T', 20), w('R', 18)], after = [w('R', 20), w('T', 18)]
  assert.deepEqual(moveExclusions({ 'p|A1|T': true, 'p|A1': false, 'q|A1|T': true }, 'p', before, after), { 'p|A1|R': true, 'p|A1': false, 'q|A1|T': true })
  assert.deepEqual(moveExclusions({ 'p|A1|T': true }, 'p', [w('T', 20)], [w('IL6', 20), w('x', 1)]), { 'p|A1|IL6': true })
})

test('import reports which target was omitted, and a dropped duplicate omits nothing', () => {
  const r = qs('1\tA1\ttrue\tS1\tT\tUNKNOWN\t20\n1\tA1\tfalse\tS1\tR\tUNKNOWN\t18\n2\tA2\ttrue\tS1\tT\tUNKNOWN\t20\n')
  assert.deepEqual(r.omittedReactions, [{ well: 'A1', target: 'T' }, { well: 'A2', target: 'T' }])
  assert.ok(r.issues.some(i => i.msg.startsWith('2 wells were omitted in the instrument software (A1 T, A2)')))
  assert.deepEqual(qs('1\tA1\tfalse\tS1\tT\tUNKNOWN\t20\n1\tA1\ttrue\tS1\tT\tUNKNOWN\t21\n').omittedReactions, [])
})
