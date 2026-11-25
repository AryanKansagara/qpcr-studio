import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, toCsv } from './parse.ts'

test('text that a spreadsheet would run is neutralised', () => {
  for (const s of ['=1+1', '+1+1', '-1+1', '@SUM(A1)', '-RT', '-', '+', '-5-2', '=', '＝1+1']) assert.equal(csvCell(s), `'${s}`)
  assert.equal(csvCell('\t=1+1'), "'\t=1+1")
  assert.equal(csvCell('=HYPERLINK("http://x.example","a")'), `"'=HYPERLINK(""http://x.example"",""a"")"`)
  assert.equal(csvCell('\r=1+1'), `"'\r=1+1"`)
})

test('numbers stay numbers and other text is untouched', () => {
  assert.deepEqual([-2.5, 1.2e-7, 0, -1e21].map(csvCell), ['-2.5', '1.2e-7', '0', '-1e+21'])
  for (const s of ['-20', '+3.5', '-1.2e-7', '-.5', 'Ctrl-1', 'a=b', 'n/a', '<0.000001', 'ΔCq', "'x", '']) assert.equal(csvCell(s), s)
  assert.deepEqual([null, undefined].map(csvCell), ['', ''])
})

test('a lone CR is quoted so it cannot start a row', () => {
  assert.equal(toCsv([['a\rb', 1], ['c\nd', 'e,f']]), '"a\rb",1\n"c\nd","e,f"\n')
})
