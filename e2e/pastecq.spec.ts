import { choose, commitImport, expect, newExperiment, test } from './fixtures'

test('pasted Cq values: messages are shown and unread cells keep their value', async ({ page }) => {
  await newExperiment(page)
  await choose(page, { name: 'r.csv', text: 'well,sample,target,cq\nA1,S1,T,20\nA2,S2,T,21\nA3,S3,T,22\n' })
  await commitImport(page)
  await page.getByLabel('Fills').selectOption('cq')
  const paste = page.getByLabel('Pasted plate layout'), apply = page.getByRole('button', { name: 'Apply to plate' })
  await paste.fill('abc')
  await expect(page.getByText('No Cq values that can be read.')).toBeVisible()
  await expect(apply).toBeDisabled()
  await paste.fill('100\tabc\t23.5\txyz')
  await expect(page.locator('.issues li')).toHaveText(['Cq "abc" in A2 is not a number. Well skipped.', 'Cq "xyz" in A4 is not a number. Well skipped.', 'Cq 100 in A1 is outside 0 to 50; read as no amplification.'])
  await expect(page.getByText('2 wells will be filled.')).toBeVisible()
  await apply.click()
  await expect(page.getByText('Pasted 2 cq values. 2 could not be read and were skipped.')).toBeVisible()
  for (const [w, cq] of [['A1', 'T Undet.'], ['A2', 'T 21.00'], ['A3', 'T 23.50']]) await expect(page.getByRole('gridcell', { name: new RegExp(`^${w}\\b`) })).toHaveAccessibleName(new RegExp(`^${w}: ${cq.replace('.', '\\.')}`))
  await expect(page.getByRole('gridcell', { name: /^A4\b/ })).toHaveAccessibleName('A4 empty')
})
