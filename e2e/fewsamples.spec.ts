import { analyse, expect, openTab, test } from './fixtures'

test('two candidates in one common sample: no recommendation, and the reason is shown', async ({ page }) => {
  await analyse(page, 'well,sample,target,cq\nA1,C-1,ACTB,18\nA2,C-1,GAPDH,22\nA3,C-1,T,28\nA4,C-2,ACTB,18\n')
  await openTab(page, 'Reference genes')
  await expect(page.getByText('ACTB, GAPDH both have a Cq in only one sample')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recommendation' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Use / })).toHaveCount(0)
})
