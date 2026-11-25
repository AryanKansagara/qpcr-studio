import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detect, parseDelimited, parseRows } from './parse.ts'

const read = (text: string) => {
  const rows = parseDelimited(text), d = detect(rows)!
  return parseRows(rows, d.headerIndex, d.mapping, { numbered: d.numbered })
}
const wells = (t: string) => read(t).wells.map(w => `${w.well} ${w.cq}`)

test('a blank line in a two-column table does not end it', () => {
  const want = ['A1 20', 'A2 21', 'A3 22', 'A4 23']
  assert.deepEqual(wells('well,cq\nA1,20\nA2,21\n\nA3,22\nA4,23\n'), want)
  assert.deepEqual(wells('well,cq\n\nA1,20\n\n\nA2,21\n,\nA3,22\nA4,23\n\n'), want)
  assert.deepEqual(wells('cq;well\n20;A1\n21;A2\n\n22;A3\n23;A4\n'), want)
  assert.deepEqual(wells('well,cq\n1,20\n2,21\n\n3,22\n4,23\n'), want)
  assert.deepEqual(read('well,sample,cq\nA1,S1,20\n\nA2,,21\n').wells.map(w => w.well), ['A1', 'A2'])
})

test('footers still end the table', () => {
  for (const foot of ['Threshold,0.2', 'Analyst,12', '96,wells', 'A long note, with a comma', 'Total 2', '[Melt]\nA3,20']) {
    const r = read(`well,cq\nA1,20\nA2,21\n\n${foot}\n`)
    assert.deepEqual([r.wells.length, r.issues.filter(i => i.level === 'error')], [2, []], foot)
  }
})

test('wells below a footer are reported, not dropped silently', () => {
  const r = read('well,cq\nA1,20\n\nPlate B\nA3,22\nA4,23\n')
  assert.equal(r.wells.length, 1)
  assert.deepEqual(r.issues.filter(i => i.level === 'error').map(i => i.line), [5])
  assert.match(r.issues[0].msg, /^2 rows .* not read: the table ends at the blank line 3/)
})
