import { analyse, expect, openTab, test } from '../fixtures'

test.fail('#6 time points are separate groups and words keep their letters', async ({ page }) => {
  await analyse(page, 'well,sample,target,cq\nA1,LPS_6h,T,20\nA2,LPS_24h,T,21\nA3,Tumor1,T,22\n')
  await openTab(page, 'Setup')
  for (const [s, g] of [['LPS_6h', 'LPS_6h'], ['LPS_24h', 'LPS_24h'], ['Tumor1', 'Tumor']]) await expect(page.getByLabel(`Group for ${s}`)).toHaveValue(g, { timeout: 10_000 })
})
