import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refStability } from './qpcr.ts'

// Expected values: separate transcription of stabMeasureRho.R (Bioconductor NormqPCR, after Andersen et al. 2004).
const run = (X: number[][], n1: number, n = X[0].length) => {
  const genes = ['A', 'B', 'C', 'D'].slice(0, n), s = X.map((_, i) => `s${i}`)
  const L = (x: string, g: string) => X[+x.slice(1)][genes.indexOf(g)]
  return refStability(genes, s, new Map(s.map((x, i) => [x, i < n1 ? 'g1' : 'g2'])), L, (x, g) => 30 - L(x, g), 'g1').normfinder!
}
const near = (got: Record<string, number>, want: number[]) => want.forEach((v, i) => assert.ok(Math.abs(got['ABCD'[i]] - v) < 1e-9, `${'ABCD'[i]} expected ${v} got ${got['ABCD'[i]]}`))

const X = [[0, 1, 2, 5], [1, 2.1, 2.8, 6.4], [2, 2.9, 4.3, 7.1], [4, 2.2, 3, 6], [5, 3.1, 4.1, 6.8], [6.2, 3.9, 4.8, 8.1], [4.7, 3, 3.6, 6.5]]
test('unequal groups', () => near(run(X, 3).stability, [1.2059344611578522, 0.394941923991191, 0.5723844792884736, 0.6207852677120436]))
test('equal groups', () => near(run(X.slice(0, 6), 3).stability, [1.231552474103983, 0.41422110265627293, 0.5896445161252866, 0.6143817467683876]))
test('no intergroup variance, one gene with zero variance', () => near(run([[0, 1, 2], [1, 1.5, 4], [2, 2, 3], [1, 2.5, 3.5], [3, 2, 6]], 2).stability, [0, 0.5983876588590962, 0.6289348300318488]))
test('the ranking follows the values', () => assert.deepEqual(run(X, 3).ranking, ['B', 'C', 'D', 'A']))
