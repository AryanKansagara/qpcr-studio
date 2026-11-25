import { analyse, card, csvRows, download, expect, fillAndLeave, HAND, openTab, table, test } from './fixtures'

// Every number here is worked out on paper; HAND in fixtures.ts has the steps.

test('Livak fold change, Welch CI and p; then Pfaffl; then Mann-Whitney', async ({ page }) => {
  await analyse(page, HAND)
  await openTab(page, 'Setup')
  await page.getByLabel('Method').selectOption('livak')
  await page.getByLabel('Control group').selectOption('Ctrl')
  await openTab(page, 'Reference genes')
  await page.getByLabel('Normalise to R').check()
  await openTab(page, 'Results')
  const stats = card(page, 'Statistics').locator('table').first()
  await expect.poll(() => table(stats)).toEqual([['T', 'Trt vs Ctrl', '3 v 3', '4.00', '0.83 to 19.3', '0.070', 'ns', 'Welch t-test, df 4.0']])
  await page.getByText('Per-sample values').click()
  await expect.poll(async () => (await table(card(page, 'Statistics').locator('table').nth(1))).map(r => r[2])).toEqual(['10.00', '11.00', '12.00', '8.00', '9.00', '10.00'])
  const [, csv] = await download(page, page.getByRole('button', { name: 'Results CSV' }))
  // ln2 fold 2, CI 2 +- 2.2669; p = 1 - 0.774597 * 1.2 = 0.070484 to five significant digits.
  expect(csvRows(csv)[1]).toEqual(['T', 'Trt', 'Ctrl', '3', '3', '2', '4', '0.83107', '19.2523', '0.070484', 'ns', '"Welch t-test', ' df 4.0"', 'Welch t', '0.070484'])

  // Pfaffl: 1.9^3 / 2 = 3.4295 -> 3.43.
  await openTab(page, 'Setup')
  await page.getByLabel('Method').selectOption('pfaffl')
  await fillAndLeave(page.getByLabel('T efficiency percent'), '90')
  await openTab(page, 'Results')
  await expect(stats.locator('tbody tr')).toContainText('3.43')

  // Mann-Whitney on dCq 10 11 12 against 8 9 10: the 10s tie, U = 0.5, mu 4.5,
  // sigma^2 = 9/12 (7 - 6/30) = 5.1, z = 3.5 / 2.2583 = 1.5498, two-sided p = 0.121.
  await openTab(page, 'Setup')
  await page.getByLabel('Method').selectOption('livak')
  await page.getByRole('combobox', { name: /^Test/ }).selectOption('nonparametric')
  await openTab(page, 'Results')
  await expect.poll(async () => (await table(stats))[0].slice(5)).toEqual(['0.121', 'ns', 'Mann-Whitney U'])
})

test('standard curve: slope, efficiency and range', async ({ page }) => {
  // Slope -3.32 exactly; E = 10^(1/3.32) - 1 = 1.0008.
  await analyse(page, 'well,sample,target,role,cq,quantity\nA1,S1,T,Standard,15.00,1000\nA2,S2,T,Standard,18.32,100\nA3,S3,T,Standard,21.64,10\nA4,S4,T,Standard,24.96,1\n')
  await openTab(page, 'QC')
  const c = page.locator('figure.curve')
  await expect(c).toContainText('E 100.1%')
  await expect(c.locator('dd')).toHaveText(['-3.320', '1.0000', '3.0 log', '4'])
})

test('geNorm M and pairwise variation', async ({ page }) => {
  // ACTB 20 20 20, GAPDH 22 22 22, TBP 24 25 26. SD(ACTB-GAPDH) = 0, the other two pairs 1.
  // M: ACTB (0 + 1) / 2 = 0.5, GAPDH 0.5, TBP 1. V2/3 = SD(log2 NF2/NF3) = 1/3.
  const rows = [0, 1, 2].flatMap(i => [['ACTB', 20], ['GAPDH', 22], ['TBP', 24 + i]].map(([t, c], j) => `${'ABC'[i]}${j + 1},S-${i + 1},${t},${c}`))
  await analyse(page, `well,sample,target,cq\n${rows.join('\n')}\n`)
  await openTab(page, 'Reference genes')
  const m = page.getByRole('img', { name: 'geNorm M values' })
  await expect(m).toContainText('ACTB0.500GAPDH0.500TBP1.000')
  await expect(page.locator('.vlist')).toContainText('V2/3 0.333')
  await expect(page.locator('.recommend')).toContainText('ACTB > GAPDH > TBP')
})

test('replicate outlier, NTC gap and gDNA share', async ({ page }) => {
  // 20, 20.1, 21.5: SD 0.84, median 20.1, furthest 21.5. Mean of the rest 20.05.
  // NTC 22.85 is 2.8 cycles later: fail. NRT 24.05 is 4 cycles later: 100 / 16 = 6.3%.
  await analyse(page, 'well,sample,target,role,cq\nA1,S1,T,Unknown,20\nA2,S1,T,Unknown,20.1\nA3,S1,T,Unknown,21.5\nB1,NTC,T,NTC,22.85\nB2,S1,T,NRT,24.05\n')
  await openTab(page, 'QC')
  const rep = card(page, 'Technical replicates')
  await expect(rep.locator('tbody tr')).toContainText('20.050.07Outlier excluded')
  const checks = card(page, 'NTC and no-RT controls').locator('li')
  await expect(checks.first()).toContainText('only 2.8 cycles after latest sample (20.05)')
  await expect(checks.last()).toContainText('about 6.3% of signal')
  // Put it back: (20 + 20.1 + 21.5) / 3 = 20.53.
  await rep.getByRole('button', { name: /^A3 / }).click()
  await expect(rep.locator('tbody tr')).toContainText('20.53')
})
