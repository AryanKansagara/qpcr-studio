import { analyse, card, expect, openTab, test } from '../fixtures'

// Standards end at Cq 24.96; the NTC at 16 is 8.96 cycles earlier.
test.fail('#4 a contaminated NTC on a standard-curve plate fails', async ({ page }) => {
  await analyse(page, 'well,sample,target,role,cq,quantity\nA1,S1,T,Standard,15.00,50\nA2,S2,T,Standard,18.32,5\nA3,S3,T,Standard,21.64,0.5\nA4,S4,T,Standard,24.96,0.05\nH1,NTC,T,NTC,16.00,\n')
  await openTab(page, 'QC')
  await expect(card(page, 'NTC and no-RT controls').locator('li')).toHaveClass('bad', { timeout: 10_000 })
})
