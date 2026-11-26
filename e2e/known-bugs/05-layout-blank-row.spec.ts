import { choose, commitImport, expect, newExperiment, test } from '../fixtures'

test.fail('#5 a blank row in a pasted layout keeps its place', async ({ page }) => {
  await newExperiment(page)
  await choose(page, { name: 'r.csv', text: 'well,cq\nA1,20\nB1,21\nC1,22\n' })
  await commitImport(page)
  await page.getByLabel('Pasted plate layout').fill('Ctrl-1\n\t\nTrt-1\n')
  await page.getByRole('button', { name: 'Apply to plate' }).click()
  const sample = async (well: string) => {
    await page.keyboard.press('Escape')
    await page.getByRole('gridcell', { name: new RegExp(`^${well}\\b`) }).click()
    return page.getByLabel('Sample', { exact: true }).inputValue()
  }
  expect(await sample('A1')).toBe('Ctrl-1')
  expect(await sample('C1')).toBe('Trt-1')
})
