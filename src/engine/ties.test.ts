import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mannWhitney } from './stats.ts'

test('values that differ only by rounding are ties, in either order', () => {
  const a = [28.1 - 18, 12, 13], b = [28.2 - 18.1, 8, 9]
  assert.notEqual(a[0], b[0])
  assert.deepEqual(mannWhitney(a, b), mannWhitney([10.1, 12, 13], [10.1, 8, 9]))
  assert.deepEqual(mannWhitney(b, a), mannWhitney([10.1, 8, 9], [10.1, 12, 13]))
  assert.equal(mannWhitney(a, b).exact, false)
  // Ranks 1 2 3.5 | 3.5 5 6: U = 0.5 or 8.5, mu 4.5, sigma^2 = 9/12 (7 - 6/30) = 5.1, z = 3.5 / 2.2583, p = 0.121.
  assert.ok(Math.abs(mannWhitney(a, b).p - 0.1212) < 5e-4)
})

test('real differences are not ties', () => {
  assert.equal(mannWhitney([1, 2, 3], [1.00000001, 2.5, 3.5]).exact, true)
  assert.equal(mannWhitney([10.01, 12, 13], [10.02, 8, 9]).exact, true)
  // Ties are counted from the first value of a run, so closely spaced values do not chain into one.
  assert.equal(mannWhitney([0, 1.6e-9], [0.8e-9, 1]).p, mannWhitney([0, 2], [0, 3]).p)
})
