import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detect, parseDelimited, parseRole, parseRows } from './parse.ts'

test('samples whose names merely start like a control stay samples', () => {
  for (const s of ['H2O2-1', 'H2O2 100uM', 'Neg siRNA-1', 'Negative-1', 'siNeg', 'Watermelon', 'Northern-1', 'North', 'Norton 2', 'NTC siRNA-1', 'Waterlogged 1', 'Negev']) for (const role of ['UNKNOWN', 'Unkn-01', '']) assert.equal(parseRole(role, s), 'unknown', `${role} ${s}`)
})

test('controls are still recognised by name', () => {
  for (const s of ['NTC', 'ntc2', 'NTC_IL6', 'NTCIL6', 'H2O', 'H2O 2', 'water', 'Water 1', 'Water1', 'nuclease-free water', 'no template control', 'Negative control', 'NegCtrl1', 'neg', 'neg.', 'NegC', 'H2O (NTC)']) assert.equal(parseRole('', s), 'ntc', s)
  for (const s of ['NRT', 'NRT1', 'noRT Ctrl', 'no RT', '-RT Ctrl-1', 'noRTctrl']) assert.equal(parseRole('', s), 'nrt', s)
  assert.equal(parseRole('NTC', 'H2O2-1'), 'ntc')
  assert.equal(parseRole('Unkn-01', 'NTC'), 'ntc')
})

test('roles that come from a name are listed; roles from the file are not', () => {
  const run = (t: string) => { const r = parseDelimited(t), d = detect(r)!; return parseRows(r, d.headerIndex, d.mapping).issues.map(i => i.msg).join('\n') }
  assert.match(run('well,sample,target,cq\nA1,S,T,20\nA2,NTC,T,\n'), /because of their names: A2 NTC\./)
  assert.doesNotMatch(run('well,sample,target,role,cq\nA1,S,T,Unknown,20\nA2,NTC,T,NTC,\n'), /because of their names/)
})
