import { analyse, card, expect, openTab, test } from './fixtures'

const QS = 'Well\tWell Position\tOmit\tSample Name\tTarget Name\tTask\tCT\n1\tA1\ttrue\tS1\tT\tUNKNOWN\t20\n1\tA1\tfalse\tS1\tR\tUNKNOWN\t18\n'

test('a duplex reaction is toggled on its own', async ({ page }) => {
  await analyse(page, QS, 'qs.txt')
  await openTab(page, 'QC')
  await page.getByLabel(/Flagged only/).uncheck()
  const row = (t: string) => card(page, 'Technical replicates').locator('tbody tr').filter({ has: page.locator('td i', { hasText: t }) }).getByRole('button')
  await expect(row('T')).toHaveAttribute('aria-pressed', 'false')
  await expect(row('R')).toHaveAttribute('aria-pressed', 'true')
  await row('T').click()
  await row('R').click()
  await expect(row('T')).toHaveAttribute('aria-pressed', 'true')
  await expect(row('R')).toHaveAttribute('aria-pressed', 'false')
  await openTab(page, 'Plates')
  const a1 = page.getByRole('gridcell', { name: /^A1\b/ })
  await expect(a1).toHaveAccessibleName(/; excluded \(R\)$/)
  await a1.click()
  await page.getByRole('button', { name: 'Exclude from analysis' }).click()
  await expect(a1).toHaveAccessibleName(/; excluded$/)
  await page.getByRole('button', { name: 'Include', exact: true }).click()
  await expect(a1).not.toHaveAccessibleName(/excluded/)
})

test('an excluded well stays excluded when its target is renamed', async ({ page }) => {
  await analyse(page, QS.split('\n').slice(0, 2).join('\n') + '\n', 'qs.txt')
  await openTab(page, 'Plates')
  const a1 = page.getByRole('gridcell', { name: /^A1\b/ })
  await a1.click()
  await page.getByLabel('Target', { exact: true }).fill('IL6')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(a1).toHaveAccessibleName(/^A1: IL6 .*; excluded$/)
})
