import { analyse, csvRows, download, expect, HAND, openTab, test } from './fixtures'

test('formulas in sample, group and target names reach the CSVs as text', async ({ page }) => {
  // Samples =1+1-1 to =1+1-3 in group =1+1, target @T, reference R.
  await analyse(page, HAND.replace(/Trt/g, '=1+1').replace(/,T,/g, ',@T,'))
  await openTab(page, 'Reference genes')
  await page.getByLabel('Normalise to R').check()
  await openTab(page, 'Results')
  const [, samples] = await download(page, page.getByRole('button', { name: 'Per-sample CSV' }))
  expect(csvRows(samples).slice(-3).map(r => r.slice(0, 3))).toEqual([1, 2, 3].map(i => [`'=1+1-${i}`, "'=1+1", "'@T"]))
  const [, results] = await download(page, page.getByRole('button', { name: 'Results CSV' }))
  expect(csvRows(results)[1].slice(0, 3)).toEqual(["'@T", "'=1+1", 'Ctrl'])
  // Numbers are not touched.
  expect(csvRows(samples).some(r => r[4] === '-1')).toBe(true)
})
