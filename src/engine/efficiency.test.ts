import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyze, blankMeta, defaultSettings, miqe, type Plate, type Well } from './qpcr.ts'

const std: Well[] = [0, 1, 2, 3].map(i => ({ well: `A${i + 1}`, sample: `S${i}`, target: 'T', role: 'standard', cq: 15 + 3.32 * i, quantity: 10 ** (4 - i) }))
const run = (v: number | undefined, curve = false) => {
  const p: Plate = { id: 'p', name: 'p', format: 96, instrument: '', wells: [{ well: 'B1', sample: 'X', target: 'T', role: 'unknown', cq: 20 }, ...(curve ? std : [])] }
  const s = { ...defaultSettings(), efficiencies: (v === undefined ? {} : { T: v }) as Record<string, number> }, a = analyze([p], s)
  return { e: a.efficiencies.T, warned: a.warnings.filter(w => w.includes('entered for T')).length, miqe: miqe([p], s, blankMeta(), a).find(i => i.id === 'eff')!.status }
}

test('a saved efficiency outside 50 to 150% is not used and is explained', () => {
  for (const v of [1.95, 0.95, 49.9, 150.1, 0, -5, 1000, NaN]) {
    const r = run(v)
    assert.deepEqual([r.e.e, r.e.source, r.warned, r.miqe], [1, 'assumed', 1, 'warn'], String(v))
  }
  const c = run(1.95, true)
  assert.equal(c.e.source, 'curve'); assert.ok(Math.abs(c.e.e - 1.0008) < 1e-3); assert.equal(c.warned, 1)
})

test('50 to 150% is used; blank is not a mistake', () => {
  for (const v of [50, 95, 150]) assert.deepEqual([run(v).e, run(v).warned], [{ target: 'T', e: v / 100, source: 'manual' }, 0])
  assert.deepEqual([run(undefined).e.source, run(undefined).warned], ['assumed', 0])
})
