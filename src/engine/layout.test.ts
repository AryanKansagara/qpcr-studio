import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLayout } from './parse.ts'

const L = (t: string) => Object.fromEntries(parseLayout(t))

test('blank rows keep their place', () => {
  assert.deepEqual(L('Ctrl-1\tCtrl-2\n\t\nTrt-1\tTrt-2\n'), { A1: 'Ctrl-1', A2: 'Ctrl-2', C1: 'Trt-1', C2: 'Trt-2' })
  assert.deepEqual(L('a\r\n\r\nb\r\n\r\n'), { A1: 'a', C1: 'b' })
  assert.deepEqual(L('\t\nx\ty'), { B1: 'x', B2: 'y' })
  assert.deepEqual(L('1\t2\t3\nCt\tb\tc\n\t\t\nTr\te\tf'), { A1: 'Ct', A2: 'b', A3: 'c', C1: 'Tr', C2: 'e', C3: 'f' })
})

test('only 1, 2, 3 ... is a header row', () => {
  assert.deepEqual(L('25\t26\t27\n28\t29\t30'), { A1: '25', A2: '26', A3: '27', B1: '28', B2: '29', B3: '30' })
  assert.deepEqual(L('\t1\nA\tCtrl-1\nB\tTrt-1'), { A1: 'Ctrl-1', B1: 'Trt-1' })
  assert.deepEqual(L('\t1\t2\nA\tx\ty'), { A1: 'x', A2: 'y' })
  assert.deepEqual(L('\t4\t5\t6\nC\tx\ty\tz'), { C4: 'x', C5: 'y', C6: 'z' })
  assert.deepEqual(L('<>\t1\t2\nA\tx\ty'), { A1: 'x', A2: 'y' })
  assert.deepEqual(L('A\tx\nB\ty\nC\tz'), { A1: 'x', B1: 'y', C1: 'z' })
  assert.deepEqual(L('A\t1\t2\nB\t3\t4'), { A1: '1', A2: '2', B1: '3', B2: '4' })
  assert.deepEqual(L('18\t19'), { A1: '18', A2: '19' })
})

test('labelled and unlabelled blocks as before', () => {
  assert.deepEqual(L('\t1\t2\t3\nA\tx\t\ty\nC\tz'), { A1: 'x', A3: 'y', C1: 'z' })
  assert.deepEqual(L('A\tx\nB\ty'), { A1: 'x', B1: 'y' })
  assert.deepEqual(L('B\ty\nA\tx'), { A1: 'x', B1: 'y' })
  assert.deepEqual(L('A\nB\nC'), { A1: 'A', B1: 'B', C1: 'C' })
  assert.deepEqual(L(' \n\t\n'), {})
})
