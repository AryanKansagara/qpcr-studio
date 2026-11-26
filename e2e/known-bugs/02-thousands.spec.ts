import { analyse, choose, expect, importDialog, newExperiment, openTab, test } from '../fixtures'

const curve = (q: string[]) => `well,sample,target,role,cq,quantity\n${q.map((v, i) => `A${i + 1},S${i + 1},T,Standard,${(15 + 3.32 * i).toFixed(2)},"${v}"`).join('\n')}\n`

// Slope -3.32 over three decades; E = 10^(1/3.32) - 1 = 100.1%.
test('#2 quantities with a thousands comma', async ({ page }) => {
  await analyse(page, curve(['100,000', '10,000', '1,000', '100']))
  await openTab(page, 'QC')
  await expect(page.locator('figure.curve dd')).toHaveText(['-3.320', '1.0000', '3.0 log', '4'])
})

test('#2 a quantity that could be read either way is reported', async ({ page }) => {
  await newExperiment(page)
  await choose(page, { name: 'q.csv', text: 'well,sample,target,role,cq,quantity\nA1,S1,T,Standard,15,"10,000"\nA2,S2,T,Standard,18,"1,000"\n' })
  await expect(importDialog(page).locator('.issues')).toContainText('could be thousands or decimals', { timeout: 10_000 })
})
