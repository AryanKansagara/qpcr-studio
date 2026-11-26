import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

/** Web fonts in index.html: answered with an empty stylesheet. */
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])

export const test = base.extend<{ external: string[] }>({
  external: async ({}, use) => { await use([]) },

  // Only the app is reachable: a request to any other host (Supabase included) fails the test, and so does an uncaught page error.
  context: async ({ context, baseURL, external }, use) => {
    const errors: string[] = []
    const origin = new URL(baseURL!).origin
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === origin) return route.continue()
      if (FONT_HOSTS.has(url.host)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' })
      external.push(url.host)
      return route.abort('blockedbyclient')
    })
    context.on('weberror', e => errors.push(String(e.error())))
    await use(context)
    expect(errors, 'uncaught page errors').toEqual([])
    expect(external, 'requests to hosts other than the app').toEqual([])
  },
})

export { expect }

export type FileInput = { name: string; text: string | Buffer }

/**
 * The hand-worked plate. One well per reaction; R is the reference.
 *   Ctrl: R 18, 18, 18   T 28, 29, 30     dCq 10, 11, 12  mean 11
 *   Trt : R 17, 17, 17   T 25, 26, 27     dCq  8,  9, 10  mean  9
 * Livak: ddCq -2, fold 2^2 = 4. Both variances are 1, so se = sqrt(2/3) = 0.8165, df 4, t = 2.4495.
 * t(0.975, 4) = 2.7764, so log2 CI = 2 +- 2.2669 = -0.2669 to 4.2669, fold 0.831 to 19.3.
 * p (df 4, closed form) = 1 - sin(a)(1 + cos(a)^2 / 2) with tan(a) = t / 2: sin 0.774597, cos^2 0.4, p = 0.0705.
 * Pfaffl (2001) with T at 90%: 1.9^3 / 2^1 = 3.4295.
 */
export const HAND = `well,sample,target,cq,group
${['Ctrl', 'Trt'].flatMap((g, gi) => [0, 1, 2].flatMap(i => [
  `${'AB'[gi]}${i * 2 + 1},${g}-${i + 1},R,${18 - gi}.00,${g}`,
  `${'AB'[gi]}${i * 2 + 2},${g}-${i + 1},T,${28 - 3 * gi + i}.00,${g}`,
])).join('\n')}
`

// ---------- Driving the app ----------

/** A blank experiment, with the import dialog open. */
export async function newExperiment(page: Page, name = 'E2E run') {
  await page.goto('/app')
  await page.getByRole('button', { name: 'New experiment' }).click()
  await page.getByLabel('Experiment name').fill(name)
  await page.getByRole('button', { name: 'Create and import' }).click()
  await expect(importDialog(page)).toBeVisible()
}
export const importDialog = (page: Page) => page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /^Import / }) })

/** Chooses a file in the open import dialog; nothing is committed. */
export async function choose(page: Page, f: FileInput) {
  await importDialog(page).locator('input[type=file]').setInputFiles({ name: f.name, mimeType: 'application/octet-stream', buffer: Buffer.isBuffer(f.text) ? f.text : Buffer.from(f.text) })
}
export async function commitImport(page: Page) {
  await importDialog(page).getByRole('button', { name: /^Import \d+ wells$/ }).click()
  await expect(page.getByText(/^Imported \d+ wells into/)).toBeVisible()
  await expect(importDialog(page)).toBeHidden()
}
/** New experiment, import and the Results tab. */
export async function analyse(page: Page, text: string, name = 'run.csv') {
  await newExperiment(page)
  await choose(page, { name, text })
  await commitImport(page)
  await openTab(page, 'Results')
}
export async function openTab(page: Page, name: string) {
  const link = page.getByRole('navigation', { name: 'Experiment sections' }).getByRole('link', { name: new RegExp(`^${name}`) })
  await link.click()
  await expect(link).toHaveAttribute('aria-current', 'page')
}
export const card = (page: Page | Locator, heading: string | RegExp) => page.locator('.card').filter({ has: ('goto' in page ? page : page.page()).getByRole('heading', { name: heading }) })

/** Every body row of a table as its trimmed cell texts. */
export const table = (t: Locator) => t.locator('tbody tr').evaluateAll(rs => rs.map(r => [...r.querySelectorAll('th,td')].map(c => (c.textContent ?? '').trim())))

export async function download(page: Page, button: Locator): Promise<[string, Buffer]> {
  const [d] = await Promise.all([page.waitForEvent('download'), button.click()])
  return [d.suggestedFilename(), await readFile(await d.path())]
}
export const csvRows = (b: Buffer) => b.toString('utf8').trimEnd().split('\n').map(l => l.split(','))

/** Picks a value in a Setup or plate-map field and leaves it, which is when it is saved. */
export async function fillAndLeave(l: Locator, v: string) { await l.fill(v); await l.blur() }
