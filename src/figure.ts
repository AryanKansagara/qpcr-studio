// Publication figure as a standalone SVG string, so the screen, the download and the PNG are identical.
import type { TargetResult } from './engine/qpcr.ts'
import { tQuantile } from './engine/stats.ts'

/** Okabe-Ito: distinguishable under the common forms of colour-vision deficiency. */
export const OKABE_ITO = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#000000']

export interface FigOpts { kind: 'bar' | 'dot'; groups: string[]; control: string; ink?: string; muted?: string; grid?: string; bg?: string; title?: string; width?: number; caption?: boolean }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmt = (f: number) => (f >= 10 ? f.toFixed(0) : f >= 1 ? String(+f.toFixed(1)) : String(+f.toPrecision(2)))

export function foldFigure(targets: TargetResult[], o: FigOpts): string {
  const ink = o.ink ?? '#171615', muted = o.muted ?? '#807d78', grid = o.grid ?? '#dddad4'
  const groups = o.groups.filter(g => targets.some(t => t.groups.some(x => x.group === g)))
  const colour = (g: string) => OKABE_ITO[groups.indexOf(g) % OKABE_ITO.length]
  const barW = 30, gap = 10, clusterGap = 34
  const clusterW = groups.length * barW + (groups.length - 1) * gap
  const left = 64, right = 16, top = o.title ? 62 : 44, bottom = 64 + (o.caption ? 30 : 0)
  const plotW = Math.max(clusterW * targets.length + clusterGap * Math.max(0, targets.length - 1), 160)
  const width = Math.max(o.width ?? 0, left + plotW + right)
  const height = 340 + (o.caption ? 30 : 0)
  const plotH = height - top - bottom

  // Each bar: log2 mean, CI and per-sample points, all relative to the control mean.
  type Bar = { target: string; group: string; y: number; lo: number; hi: number; pts: number[]; stars: string }
  const bars: Bar[] = []
  for (const t of targets) for (const g of groups) {
    const gs = t.groups.find(x => x.group === g)
    if (!gs) continue
    const pts = t.samples.filter(s => s.group === g).map(s => s.log2rel)
    const cmp = t.comparisons.find(c => c.group === g && c.vs === o.control)
    let lo = gs.meanLog2, hi = gs.meanLog2
    if (cmp) { lo = cmp.lo; hi = cmp.hi }
    else if (gs.n > 1) { const h = tQuantile(0.975, gs.n - 1) * gs.sdLog2 / Math.sqrt(gs.n); lo -= h; hi += h }
    bars.push({ target: t.target, group: g, y: gs.meanLog2, lo, hi, pts, stars: cmp?.stars ?? '' })
  }
  const vals = bars.flatMap(b => [b.lo, b.hi, ...b.pts, 0])
  let ymin = Math.floor(Math.min(...vals, -1)), ymax = Math.ceil(Math.max(...vals, 1) + 0.6)
  if (ymax - ymin < 3) ymax = ymin + 3
  const Y = (v: number) => top + plotH - ((v - ymin) / (ymax - ymin)) * plotH
  const step = ymax - ymin > 10 ? 2 : 1

  const s: string[] = []
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="IBM Plex Sans, Helvetica, Arial, sans-serif" role="img" aria-label="${esc(`Fold change vs ${o.control}: ${bars.filter(b => b.group !== o.control).map(b => `${b.target} ${b.group} ${fmt(2 ** b.y)}x ${b.stars}`).join('; ')}`)}">`)
  if (o.bg) s.push(`<rect width="100%" height="100%" fill="${o.bg}"/>`)
  if (o.title) s.push(`<text x="${left}" y="22" font-size="15" font-weight="600" fill="${ink}">${esc(o.title)}</text>`)
  // Legend
  let lx = left
  for (const g of groups) {
    s.push(`<rect x="${lx}" y="${top - 30}" width="11" height="11" rx="2" fill="${colour(g)}"/><text x="${lx + 16}" y="${top - 20}" font-size="12" fill="${ink}">${esc(g)}</text>`)
    lx += 30 + g.length * 7
  }
  // Axis and grid (log2 scale labelled as fold change).
  for (let v = ymin; v <= ymax; v += step) {
    const y = Y(v)
    s.push(`<line x1="${left}" x2="${left + plotW}" y1="${y}" y2="${y}" stroke="${v === 0 ? muted : grid}" stroke-width="${v === 0 ? 1 : 0.6}"${v === 0 ? '' : ' stroke-dasharray="2 3"'}/>`)
    s.push(`<text x="${left - 8}" y="${y + 4}" font-size="11" text-anchor="end" fill="${muted}">${fmt(2 ** v)}</text>`)
  }
  s.push(`<text transform="translate(16 ${top + plotH / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${ink}">Fold change vs ${esc(o.control)} (log2 scale)</text>`)

  targets.forEach((t, ti) => {
    const x0 = left + ti * (clusterW + clusterGap)
    s.push(`<text x="${x0 + clusterW / 2}" y="${top + plotH + 22}" font-size="13" font-style="italic" font-weight="600" text-anchor="middle" fill="${ink}">${esc(t.target)}</text>`)
    groups.forEach((g, gi) => {
      const b = bars.find(x => x.target === t.target && x.group === g)
      if (!b) return
      const x = x0 + gi * (barW + gap), cx = x + barW / 2, c = colour(g)
      if (o.kind === 'bar') {
        const y1 = Y(Math.max(0, b.y)), y2 = Y(Math.min(0, b.y))
        s.push(`<rect x="${x}" y="${y1}" width="${barW}" height="${Math.max(1, y2 - y1)}" fill="${c}" fill-opacity="0.85" rx="2"/>`)
      } else s.push(`<line x1="${x + 3}" x2="${x + barW - 3}" y1="${Y(b.y)}" y2="${Y(b.y)}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`)
      // CI whisker
      s.push(`<line x1="${cx}" x2="${cx}" y1="${Y(b.hi)}" y2="${Y(b.lo)}" stroke="${ink}" stroke-width="1.2"/>`)
      s.push(`<line x1="${cx - 6}" x2="${cx + 6}" y1="${Y(b.hi)}" y2="${Y(b.hi)}" stroke="${ink}" stroke-width="1.2"/><line x1="${cx - 6}" x2="${cx + 6}" y1="${Y(b.lo)}" y2="${Y(b.lo)}" stroke="${ink}" stroke-width="1.2"/>`)
      b.pts.forEach((v, i) => {
        const jx = cx + ((i % 3) - 1) * 6 + (b.pts.length > 3 ? (Math.floor(i / 3) % 2 ? 3 : -3) : 0)
        s.push(`<circle cx="${jx}" cy="${Y(v)}" r="3.4" fill="${o.kind === 'bar' ? (o.bg ?? '#ffffff') : c}" stroke="${o.kind === 'bar' ? ink : (o.bg ?? '#ffffff')}" stroke-width="1"/>`)
      })
      if (b.stars) s.push(`<text x="${cx}" y="${Y(Math.max(b.hi, ...b.pts)) - 7}" font-size="${b.stars === 'ns' ? 10 : 14}" font-weight="600" text-anchor="middle" fill="${ink}">${b.stars}</text>`)
    })
  })
  if (o.caption) s.push(`<text x="${left}" y="${height - 14}" font-size="10.5" fill="${muted}">Bars: mean fold change; dots: biological replicates; whiskers: 95% CI vs ${esc(o.control)} (control: 95% CI of its mean). * p&lt;0.05, ** p&lt;0.01, *** p&lt;0.001.</text>`)
  s.push('</svg>')
  return s.join('')
}

export async function svgToPng(svg: string, scale = 3): Promise<Blob> {
  const img = new Image()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
  const c = document.createElement('canvas')
  c.width = img.width * scale; c.height = img.height * scale
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0)
  URL.revokeObjectURL(url)
  return new Promise(res => c.toBlob(b => res(b!), 'image/png'))
}
