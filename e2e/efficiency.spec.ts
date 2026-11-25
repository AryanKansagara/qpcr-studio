import { analyse, expect, fillAndLeave, HAND, openTab, test } from './fixtures'

test('an efficiency that is refused is explained, keeps the old value, and a good one clears the message', async ({ page }) => {
  await analyse(page, HAND)
  await openTab(page, 'Setup')
  const input = page.getByLabel('T efficiency percent'), row = page.getByRole('row').filter({ has: input })
  await fillAndLeave(input, '90')
  await expect(row).toContainText('90.0%')
  for (const bad of ['0.95', '1.95', '200', '-90']) {
    await fillAndLeave(input, bad)
    await expect(row.getByRole('alert')).toHaveText(`${bad} was not saved: enter a percentage from 50 to 150 (an amplification factor of 1.95 is 95).`)
    await expect(input).toHaveValue('90')
    await expect(row).toContainText('90.0%entered')
  }
  await fillAndLeave(input, '95')
  await expect(row.getByRole('alert')).toHaveCount(0)
  await expect(row).toContainText('95.0%')
  await fillAndLeave(input, '')
  await expect(row).toContainText('assumed 100%')
})

test('a curve efficiency outside 50 to 150% is not copied to another experiment', async ({ page }) => {
  await analyse(page, HAND)
  // Slope -6: E = 46.8%.
  await analyse(page, 'well,sample,target,role,cq,quantity\nA1,S1,T,Standard,15,1000\nA2,S2,T,Standard,21,100\nA3,S3,T,Standard,27,10\nA4,S4,T,Standard,33,1\n')
  await openTab(page, 'QC')
  await page.getByLabel('Use in').selectOption({ label: 'E2E run' })
  await page.getByRole('button', { name: 'Copy efficiencies' }).click()
  await expect(page.getByText('Nothing copied: every efficiency is outside 50 to 150%.')).toBeVisible()
})
