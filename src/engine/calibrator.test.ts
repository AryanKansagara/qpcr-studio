import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyze, defaultSettings, type Plate, type Settings } from './qpcr.ts'

const plate = (id: string, cqs: (number | null)[]): Plate => ({ id, name: id, format: 96, instrument: '', wells: cqs.map((cq, i) => ({ well: `A${i + 1}`, sample: 'IRC', target: 'T', role: 'unknown', cq })) })
const offsets = (a: (number | null)[], b: (number | null)[], s: Partial<Settings> = {}) => analyze([plate('1', a), plate('2', b)], { ...defaultSettings(), calibrator: 'IRC', ...s }).calibration.map(c => +c.offset.toFixed(9))

test('a calibrator well excluded as an outlier does not shift the plates', () => {
  // Plate 1 keeps 20 and 20.1 (mean 20.05); plate 2 has mean 20.05.
  assert.deepEqual(offsets([20, 20.1, 23], [20, 20.1, 20.05]), [0, 0])
  // Put back by hand, it counts again: 21.0333 against 20.05, half the difference each way.
  assert.deepEqual(offsets([20, 20.1, 23], [20, 20.1, 20.05], { excluded: { '1|A3|T': false } }), [0.491666667, -0.491666667])
  // Without an outlier rule every well counts; a manual exclusion still removes one.
  assert.deepEqual(offsets([20, 20.1, 23], [20, 20.1, 20.05], { outlier: 'none' }), [0.491666667, -0.491666667])
  assert.deepEqual(offsets([20, 20.1, 23], [20, 20.1, 20.05], { outlier: 'none', excluded: { '1|A3|T': true } }), [0, 0])
})

test('wells within the threshold still set the offset, and a plate without a calibrator Cq is not calibrated', () => {
  assert.deepEqual(offsets([21, 21.1], [20, 20.1]), [0.5, -0.5])
  for (const bad of [[null, null], []]) assert.deepEqual(offsets([20, 20.1], bad), [])
})
