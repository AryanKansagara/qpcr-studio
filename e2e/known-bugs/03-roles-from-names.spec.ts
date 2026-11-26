import { analyse, card, expect, openTab, test } from '../fixtures'

test('#3 H2O2, negative siRNA and Northern samples stay samples', async ({ page }) => {
  await analyse(page, 'well,sample,target,role,cq\nA1,H2O2-1,T,Unknown,20\nA2,Neg siRNA-1,T,Unknown,21\nA3,Northern-1,T,Unknown,22\nA4,NTC,T,Unknown,\n')
  await openTab(page, 'QC')
  await expect(card(page, 'Technical replicates')).toContainText('Flagged only')
  await expect(card(page, 'NTC and no-RT controls').locator('li')).toHaveCount(1, { timeout: 10_000 })
})
