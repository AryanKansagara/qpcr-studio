import XLSX from 'xlsx'
import { CFX_CSV, LC480_TXT, QUANTSTUDIO_TXT, ROTORGENE_CSV } from '../src/engine/fixtures.ts'
import { RDML_PLATE } from '../src/engine/realFixtures.ts'
import { card, choose, commitImport, expect, HAND, importDialog, newExperiment, openTab, test, type FileInput } from './fixtures'

const QS_TABLE = QUANTSTUDIO_TXT.split('[Results]\n')[1].split('\n\n')[0].split('\n').map(l => l.split('\t'))
const xlsx = (() => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Well', 'Sample'], ['A1', 'x']]), 'Sample Setup')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Instrument Type', 'QuantStudio 5 System'], [], ...QS_TABLE]), 'Results')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
})()
const rdmlZip = (() => {
  const cfb = XLSX.CFB.utils.cfb_new()
  XLSX.CFB.utils.cfb_add(cfb, '/rdml_data.xml', Buffer.from(RDML_PLATE))
  return Buffer.from(XLSX.CFB.write(cfb, { type: 'buffer', fileType: 'zip' }) as Buffer)
})()

// Counts are the data lines of each file, counted by eye.
const GOOD: [FileInput, RegExp, number][] = [
  [{ name: 'cfx.csv', text: CFX_CSV }, /Bio-Rad CFX Maestro/, 11],
  [{ name: 'qs.txt', text: QUANTSTUDIO_TXT }, /Thermo QuantStudio/, 5],
  [{ name: 'qs.xlsx', text: xlsx }, /Thermo QuantStudio/, 5],
  [{ name: 'lc.txt', text: LC480_TXT }, /Roche LightCycler 480/, 6],
  [{ name: 'rg.csv', text: ROTORGENE_CSV }, /Qiagen Rotor-Gene/, 4],
  [{ name: 'hand.csv', text: HAND }, /Generic table/, 12],
  [{ name: 'bom-crlf.csv', text: '﻿' + HAND.replace(/\n/g, '\r\n') }, /Generic table/, 12],
  [{ name: 'utf16.txt', text: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(HAND, 'utf16le')]) }, /Generic table/, 12],
  [{ name: 'decimal-comma.csv', text: HAND.replace(/,/g, ';').replace(/\.00/g, ',00') }, /Generic table/, 12],
]
for (const [f, format, wells] of GOOD) test(`reads ${f.name}`, async ({ page }) => {
  await newExperiment(page)
  await choose(page, f)
  const d = importDialog(page)
  await expect(d.locator('.banner')).toContainText(format)
  await expect(d.getByText(/wells read/)).toContainText(`${wells} wells read`)
  await expect(d.getByText(/wells read/)).toContainText('0 errors')
  await commitImport(page)
})

for (const [name, text] of [['plain.rdml', RDML_PLATE], ['zipped.rdml', rdmlZip]] as const) test(`reads ${name}`, async ({ page }) => {
  await newExperiment(page)
  await choose(page, { name, text })
  await expect(importDialog(page).locator('.banner')).toContainText('RDML')
  const runs = importDialog(page).getByLabel(/^Run in this file/)
  await expect(runs.locator('option')).toHaveCount(2)
  await runs.selectOption({ index: 1 })
  await commitImport(page)
})

test('pasted table', async ({ page }) => {
  await newExperiment(page)
  await page.getByText('Or paste the table').click()
  await page.getByLabel('Pasted table').fill(HAND.replace(/,/g, '\t'))
  await page.getByRole('button', { name: 'Use pasted table' }).click()
  await expect(importDialog(page).getByText(/wells read/)).toContainText('12 wells read')
})

test('the column mapping can be corrected by hand', async ({ page }) => {
  await newExperiment(page)
  await choose(page, { name: 'odd.csv', text: 'place,who,what,value\nA1,S1,T,20\nA2,S2,T,21\n' })
  const d = importDialog(page)
  await expect(d).toContainText('Format not recognised')
  await expect(d).toContainText('Map the required columns: Well or position, Cq / Ct / Cp')
  await expect(d.getByRole('button', { name: /^Import \d+ wells/ })).toBeDisabled()
  await d.getByLabel('Well or position').selectOption('place')
  await d.getByLabel('Cq / Ct / Cp').selectOption('value')
  await d.getByLabel('Sample name').selectOption('who')
  await d.getByRole('combobox', { name: /^Target/ }).selectOption('what')
  await expect(d.getByText(/wells read/)).toContainText('2 wells read')
  await commitImport(page)
})

const REFUSED: [FileInput, RegExp][] = [
  [{ name: 'empty.csv', text: '' }, /no tabular rows/],
  [{ name: 'prose.txt', text: 'hello there\nthis is not a table\n' }, /no tabular rows/],
  [{ name: 'photo.png.csv', text: Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13]) }, /no tabular rows/],
  [{ name: 'cut.xlsx', text: xlsx.subarray(0, 900) }, /Could not read cut\.xlsx/],
  [{ name: 'cut.rdml', text: rdmlZip.subarray(0, 700) }, /Could not read cut\.rdml/],
  [{ name: 'half.rdml', text: RDML_PLATE.slice(0, RDML_PLATE.indexOf('</run>')) }, /no runs with reactions/],
  [{ name: 'empty.rdml', text: '' }, /no runs with reactions/],
  [{ name: 'amp.txt', text: 'Well\tCycle\tTarget Name\tRn\tDelta Rn\n1\t1\tT\t0.1\t0.01\n' }, /amplification curves only/],
  [{ name: 'geno.txt', text: 'Well\tWell Position\tSNP Assay Name\tAllele1 Ct\tAllele2 Ct\n1\tA1\trs1\t20\t21\n' }, /genotyping export/],
]
for (const [f, why] of REFUSED) test(`refuses ${f.name}`, async ({ page }) => {
  await newExperiment(page)
  await choose(page, f)
  await expect(importDialog(page).getByRole('alert')).toContainText(why)
  await expect(importDialog(page).getByRole('button', { name: /^Import \d+ wells/ })).toHaveCount(0)
})

test('header only: nothing to import', async ({ page }) => {
  await newExperiment(page)
  await choose(page, { name: 'h.csv', text: HAND.split('\n')[0] })
  await expect(importDialog(page)).toContainText('No data rows found under the header')
  await expect(importDialog(page).getByRole('button', { name: 'Import 0 wells' })).toBeDisabled()
})

test('a cut-off row and bad values are reported with their line numbers', async ({ page }) => {
  await newExperiment(page)
  await choose(page, { name: 'bad.csv', text: 'well,sample,target,cq\nZ9,S,T,20\nA1,S,T,abc\nA2,S,T,20\nA2,S,T,21\nA3,S,T,99\nA' })
  const d = importDialog(page)
  for (const t of ['Line 2Unrecognised well "Z9"', 'Line 3Cq "abc" in A1 is not a number', 'Line 5Duplicate A2', 'Line 6Cq 99 in A3 is outside 0 to 50', 'Line 7Unrecognised well "A"']) await expect(d.locator('.issues')).toContainText(t)
  await expect(d.getByText(/wells read/)).toContainText('2 wells read')
})

test('wells omitted in the instrument software start excluded', async ({ page }) => {
  await newExperiment(page)
  await choose(page, { name: 'qs.txt', text: QUANTSTUDIO_TXT.replace('2\tA2\tfalse', '2\tA2\ttrue') })
  await expect(importDialog(page)).toContainText('1 well was omitted in the instrument software (A2)')
  await commitImport(page)
  await openTab(page, 'QC')
  await page.getByLabel(/Flagged only/).uncheck()
  await expect(card(page, 'Technical replicates').getByRole('button', { name: /^A2 .*excluded/ })).toBeVisible()
})
