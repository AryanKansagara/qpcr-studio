import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyze, defaultSettings, guessGroup, type Well } from './qpcr.ts'

const is = (o: Record<string, string>) => { for (const [s, g] of Object.entries(o)) assert.equal(guessGroup(s), g, s) }

test('times, doses and temperatures stay apart', () => is({ LPS_6h: 'LPS_6h', LPS_24h: 'LPS_24h', 'WT 2d': 'WT 2d', Ctrl_37C: 'Ctrl_37C', 'Ctrl 0.5': 'Ctrl 0.5', '10uM': '10uM', LPS_24h_1: 'LPS_24h', 'LPS 6h rep2': 'LPS 6h' }))

test('words keep their letters', () => is({ Tumor1: 'Tumor', Donor2: 'Donor', Strain1: 'Strain', Vector1: 'Vector', 'Liver-3': 'Liver' }))

test('replicate suffixes still strip', () => is({ 'Treated-2': 'Treated', Treated_2: 'Treated', 'Treated 2': 'Treated', 'Treated rep2': 'Treated', Treatedrep2: 'Treated', 'Ctrl_r2': 'Ctrl', 'KO n3': 'KO', WTr1: 'WT', HUVECn2: 'HUVEC', 'Ctrl #4': 'Ctrl', 'Treated-1a': 'Treated', 'T1.2': 'T1', 'Ctrl bio 2': 'Ctrl', 'Ctrl-BR1': 'Ctrl', rep1: 'rep1', '12': '12' }))

test('two time points are not compared as replicates of one group', () => {
  const wells = ['LPS_6h', 'LPS_24h', 'Ctrl_6h', 'Ctrl_24h'].flatMap((sample, i): Well[] => ['R', 'T'].map((target, j) => ({ well: `A${i * 2 + j + 1}`, sample, target, role: 'unknown', cq: 18 + 6 * j + i })))
  const a = analyze([{ id: 'p', name: 'p', format: 96, instrument: '', wells }], { ...defaultSettings(), refs: ['R'] })
  assert.equal(a.groups.length, 4)
  assert.equal(a.targets[0].comparisons.length, 0)
})
