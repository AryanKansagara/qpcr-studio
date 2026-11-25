import { analyze, defaultSettings, type Plate, type Settings, type Well } from '../../src/engine/qpcr.ts'
import { csvCell, detect, parseDelimited, parseRows } from '../../src/engine/parse.ts'
import { mannWhitney } from '../../src/engine/stats.ts'
import { resultsCsv } from '../../src/exports.ts'
import { analyse, choose, commitImport, expect, fillAndLeave, HAND, newExperiment, openTab, test } from '../fixtures'

// Open bugs, one per issue. Each is an expected failure until its fix turns it into a normal test.
const well = (w: string, sample: string, target: string, cq: number | null): Well => ({ well: w, sample, target, role: 'unknown', cq })
const plate = (id: string, wells: Well[]): Plate => ({ id, name: id, format: 96, instrument: '', wells })
const plate1 = (rows: [string, string, number | null][]) => [plate('p', rows.map(([s, t, c], i) => well(`${'ABCDEFGH'[i / 12 | 0]}${i % 12 + 1}`, s, t, c)))]
const S = (p: Partial<Settings>): Settings => ({ ...defaultSettings(), method: 'livak', control: 'C', refs: ['R'], ...p })

test('#8 samples left out of a fold change are named', () => {
  const a = analyze(plate1([['C-1', 'R', 18], ['C-1', 'T', 28], ['C-2', 'R', 18], ['C-2', 'T', 28.2], ['X-1', 'R', 18], ['X-1', 'T', 30], ['X-2', 'R', 18], ['X-2', 'T', 30.1], ['X-3', 'R', 18], ['X-3', 'T', null]]), S({}))
  expect(a.warnings.join(' ')).toContain('X-3')
})

test.fail('#9 a pasted Cq of 0 is no amplification', async ({ page }) => {
  await newExperiment(page)
  await choose(page, { name: 'r.csv', text: 'well,sample,target,cq\nA1,S1,T,20\n' })
  await commitImport(page)
  await page.getByLabel('Fills').selectOption('cq')
  await page.getByLabel('Pasted plate layout').fill('A\t0')
  await page.getByRole('button', { name: 'Apply to plate' }).click()
  await openTab(page, 'QC')
  await expect(page.getByText('No amplification').first()).toBeVisible({ timeout: 10_000 })
})

test('#10 Mann-Whitney ties survive floating-point noise', () => {
  expect(mannWhitney([28.1 - 18, 12, 13], [28.2 - 18.1, 8, 9]).exact).toBe(false)
})

test.fail('#11 small p-values and folds keep significant digits', () => {
  const c = { target: 'T', group: 'X', vs: 'C', na: 3, nb: 3, log2fc: -13, lo: -14, hi: -12, fold: 2 ** -13, foldLo: 2 ** -14, foldHi: 2 ** -12, p: 2e-6, stars: '****', test: 'w' }
  const a = { targets: [{ target: 'T', samples: [], groups: [], omnibus: null, comparisons: [c] }] } as unknown as Parameters<typeof resultsCsv>[0]
  const cells = resultsCsv(a).split('\n')[1].split(',').map(Number)
  expect(cells[9]).toBeCloseTo(2e-6, 9)
  expect(cells[6]).toBeCloseTo(0.00012207, 8)
})

test.fail('#12 a formula in a name is neutralised in CSV', () => {
  expect(csvCell('=1+1')).not.toMatch(/^=/)
})

test('#13 calibrator wells excluded as outliers do not shift plates', () => {
  const p = (id: string, third: number) => plate(id, [well('A1', 'IRC', 'T', 20), well('A2', 'IRC', 'T', 20.1), well('A3', 'IRC', 'T', third)])
  // Plate 1 keeps 20, 20.1 (mean 20.05); plate 2 has 20, 20.1, 20.05 (mean 20.05).
  const a = analyze([p('1', 23), p('2', 20.05)], S({ calibrator: 'IRC' }))
  for (const c of a.calibration) expect(c.offset).toBeCloseTo(0, 9)
})

test.fail('#14 no reference recommendation from one sample', () => {
  const a = analyze(plate1([['C-1', 'R', 18], ['C-1', 'R2', 22], ['C-1', 'T', 28]]), S({ candidates: ['R', 'R2'] }))
  expect(a.stability).toBeNull()
})

test('#15 zero variance gives no p-value', () => {
  const a = analyze(plate1([['C-1', 'R', 18], ['C-1', 'T', 28], ['C-2', 'R', 18], ['C-2', 'T', 28], ['X-1', 'R', 18], ['X-1', 'T', 25], ['X-2', 'R', 18], ['X-2', 'T', 25]]), S({}))
  expect(a.targets[0].comparisons[0].p).toBeNull()
})

test('#16 an efficiency of 1.95 percent is refused', async ({ page }) => {
  await analyse(page, HAND)
  await openTab(page, 'Setup')
  await fillAndLeave(page.getByLabel('T efficiency percent'), '1.95')
  await expect(page.getByRole('row', { name: /^T / }).first()).not.toContainText('1.9%', { timeout: 5_000 })
  await expect(page.getByRole('cell', { name: 'assumed 100%' })).toHaveCount(2, { timeout: 5_000 })
})

test('#17 omitting one target of a duplex well keeps the other', async ({ page }) => {
  await analyse(page, 'Well\tWell Position\tOmit\tSample Name\tTarget Name\tTask\tCT\n1\tA1\ttrue\tS1\tT\tUNKNOWN\t20\n1\tA1\tfalse\tS1\tR\tUNKNOWN\t18\n', 'qs.txt')
  await openTab(page, 'QC')
  await expect(page.locator('.tile').filter({ hasText: 'Wells excluded' }).locator('b')).toHaveText('1', { timeout: 10_000 })
})

test('#18 a blank line does not cut off a short table', () => {
  const rows = parseDelimited('well,cq\nA1,20\nA2,21\n\nA3,22\nA4,23\n')
  const d = detect(rows)!
  expect(parseRows(rows, d.headerIndex, d.mapping).wells).toHaveLength(4)
})
