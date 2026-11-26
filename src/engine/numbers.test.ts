import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detect, parseDelimited, parseRows } from './parse.ts'

const read = (cqs: string[], qs: string[], sep = '\t') => {
  const rows = parseDelimited([['well', 'sample', 'target', 'role', 'cq', 'quantity'], ...cqs.map((c, i) => [`A${i + 1}`, `S${i}`, 'T', 'Standard', c, qs[i]])].map(r => r.join(sep)).join('\n'))
  const d = detect(rows)!
  const r = parseRows(rows, d.headerIndex, d.mapping)
  return { cq: r.wells.map(w => w.cq), q: r.wells.map(w => w.quantity), msg: r.issues.map(i => i.msg).join('\n') }
}

test('a point-decimal file: comma groups are thousands', () => {
  assert.deepEqual(read(['15.10', '18.42', '21.74', '25.06'], ['100,000', '10,000', '1,000', '100']).q, [100000, 10000, 1000, 100])
  assert.deepEqual(read(['15.1', '18.4', '21.7'], ['1,000,000', '5,720.562', '0,5']).q, [1000000, 5720.562, 0.5])
  assert.deepEqual(read(['15.123', '18.456'], ['10,000', '1,000']).q, [10000, 1000])
})

test('a comma-decimal file: point groups are thousands', () => {
  assert.deepEqual(read(['15,10', '18,42', '21,74', '25,06'], ['100.000', '10.000', '1.234,5', '0,5']), { cq: [15.1, 18.42, 21.74, 25.06], q: [100000, 10000, 1234.5, 0.5], msg: '' })
  assert.deepEqual(read(['18,253'], ['10.000']), { cq: [18.253], q: [10000], msg: '' })
  assert.deepEqual(read(['18,25', '19,5'], ['2,5', '0,250']).q, [2.5, 0.25])
  // Three decimals next to comma decimals elsewhere in the column stay decimals.
  assert.deepEqual(read(['18,25', '19,5'], ['1,250', '2,5']).q, [1.25, 2.5])
})

test('plain numbers, exponents and three decimals with a point are unchanged', () => {
  assert.deepEqual(read(['18.25', '20', '21.5'], ['1E+05', '1.250', '50']).q, [100000, 1.25, 50])
  assert.deepEqual(read(['18', '20'], ['10.000', '1.000']).q, [10, 1])
})

test('no evidence, or contradicting evidence: not read, and said so', () => {
  const a = read(['18', '20'], ['10,000', '1,000'])
  assert.deepEqual(a.q, [null, null]); assert.match(a.msg, /could be thousands or decimals \(A1 10,000, A2 1,000\)/)
  assert.deepEqual(read(['18,5', '20.5'], ['10,000', '7']).q, [null, 7])
})
