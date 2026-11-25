import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDelimited, parseLayout, parseRows, readPastedCqs } from './parse.ts'

const CELLS = ['20', '20,5', '0', '-1', '100', '50', '50.1', '41', 'No Cq', 'Undetermined', 'N/A', 'nan', '-', '—', 'abc', '2O.1', '0x1F', '1e1', '>40', '20 21', '1.234,5']

test('a pasted Cq follows the import rule, value and message', () => {
  for (const c of CELLS) {
    const p = readPastedCqs(parseLayout(`A\t${c}`))
    const f = parseRows(parseDelimited(`well\tsample\ttarget\tcq\nA1\tS\tT\t${c}\n`), 0, { well: 0, sample: 1, target: 2, cq: 3 })
    assert.deepEqual([...p.cqs], f.wells.map(w => [w.well, w.cq]), c)
    assert.deepEqual([...p.errors.map(m => m.replace('Well', 'Row')), ...p.warnings], f.issues.filter(i => /Cq/.test(i.msg)).map(i => i.msg), c)
  }
})

test('sentinels become no amplification and text is reported, not stored', () => {
  const p = readPastedCqs(parseLayout('0\t100\tNo Cq\tabc\t20.5'))
  assert.deepEqual([...p.cqs], [['A1', null], ['A2', null], ['A3', null], ['A5', 20.5]])
  assert.deepEqual(p.errors, ['Cq "abc" in A4 is not a number. Well skipped.'])
  assert.equal(p.warnings.length, 2)
})
