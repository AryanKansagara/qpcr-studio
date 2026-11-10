// Instrument export parsing: delimiter sniffing, format detection, column mapping and line-numbered validation.
import { formatFor, normWell, parseWell, wellFromIndex, type Role, type Well } from './qpcr.ts'

export type FormatId = 'cfx' | 'quantstudio' | 'lc480' | 'rotorgene' | 'generic'
export const FORMAT_LABEL: Record<FormatId, string> = {
  cfx: 'Bio-Rad CFX Maestro · Quantification Cq Results',
  quantstudio: 'Thermo QuantStudio / Design & Analysis · Results',
  lc480: 'Roche LightCycler 480 · text export',
  rotorgene: 'Qiagen Rotor-Gene · quantitation report',
  generic: 'Generic table',
}

export type Field = 'well' | 'sample' | 'target' | 'cq' | 'role' | 'tm' | 'quantity' | 'group'
export const FIELDS: { id: Field; label: string; required?: boolean }[] = [
  { id: 'well', label: 'Well or position', required: true },
  { id: 'cq', label: 'Cq / Ct / Cp', required: true },
  { id: 'sample', label: 'Sample name' },
  { id: 'target', label: 'Target / gene' },
  { id: 'role', label: 'Role (Content / Task / Type)' },
  { id: 'group', label: 'Biological group' },
  { id: 'quantity', label: 'Standard quantity' },
  { id: 'tm', label: 'Melt temperature (Tm)' },
]
export type Mapping = Partial<Record<Field, number>>

export interface Row { line: number; cells: string[] }
export interface Issue { line: number; level: 'error' | 'warn'; msg: string }

/** Splits delimited text into rows, keeping 1-based source line numbers. Handles quotes and embedded delimiters. */
export function parseDelimited(text: string): Row[] {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/)
  const sample = lines.slice(0, 60).join('\n')
  const count = (d: string) => sample.split(d).length
  const delim = count('\t') > count(',') && count('\t') > count(';') ? '\t' : count(';') > count(',') * 1.5 ? ';' : ','
  const out: Row[] = []
  lines.forEach((ln, i) => {
    if (!ln.trim()) { out.push({ line: i + 1, cells: [] }); return }
    const cells: string[] = []
    let cur = '', q = false
    for (let k = 0; k < ln.length; k++) {
      const ch = ln[k]
      if (q) {
        if (ch === '"' && ln[k + 1] === '"') { cur += '"'; k++ }
        else if (ch === '"') q = false
        else cur += ch
      } else if (ch === '"' && !cur.trim()) q = true
      else if (ch === delim) { cells.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cells.push(cur.trim())
    out.push({ line: i + 1, cells })
  })
  return out
}

/** Rows from a spreadsheet (already read as an array of arrays). */
export const fromSheet = (aoa: unknown[][]): Row[] => aoa.map((r, i) => ({ line: i + 1, cells: (r ?? []).map(c => (c === null || c === undefined ? '' : String(c).trim())) }))

const SYN: Record<Field, RegExp> = {
  well: /^(well position|well|pos|position|no\.?)$/i,
  sample: /^(sample( name)?|name)$/i,
  target: /^(target( name)?|gene|assay|detector( name)?)$/i,
  cq: /^(cq|ct|cp|c[tq] ?\(?value\)?|crt)$/i,
  role: /^(content|task|type|role|sample type)$/i,
  tm: /^(tm1?|melt temperature|melt temp|tm \(°?c\)|tm1 \(°?c\))$/i,
  quantity: /^(starting quantity \(sq\)|quantity|standard|given conc.*|concentration|sq|dilution|qty)$/i,
  group: /^(biological (set|group)( name)?|group|condition|treatment)$/i,
}

export function guessMapping(header: string[]): Mapping {
  const m: Mapping = {}
  const clean = header.map(h => h.replace(/\s+/g, ' ').trim())
  for (const f of Object.keys(SYN) as Field[]) {
    const i = clean.findIndex((h, idx) => SYN[f].test(h) && !Object.values(m).includes(idx))
    if (i >= 0) m[f] = i
  }
  // QuantStudio exports both "Well" (index) and "Well Position"; prefer the position.
  const wp = clean.findIndex(h => /^well position$/i.test(h))
  if (wp >= 0) m.well = wp
  // LightCycler: "Concentration" is the calculated value; "Standard" holds the known quantity.
  const std = clean.findIndex(h => /^standard$/i.test(h))
  if (std >= 0) m.quantity = std
  return m
}

export interface Detected { format: FormatId; headerIndex: number; header: string[]; mapping: Mapping; instrument: string; defaultTarget: string; numbered: boolean }

export function detect(rows: Row[]): Detected | null {
  const meta = rows.slice(0, 80).map(r => r.cells.join(' '))
  const find = (pred: (h: string[]) => boolean) => rows.findIndex(r => r.cells.length > 2 && pred(r.cells.map(c => c.toLowerCase())))
  const instrMatch = meta.map(l => /^\*?\s*instrument type\s*=\s*(.+)$/i.exec(l)).find(Boolean)

  let i = find(h => h.includes('well') && h.includes('fluor') && h.includes('content') && (h.includes('cq') || h.includes('melt temperature')))
  if (i >= 0) return mk('cfx', i, 'Bio-Rad CFX', '', false)
  i = find(h => h.includes('well position') && (h.includes('ct') || h.includes('cq') || h.includes('crt')) && (h.includes('target name') || h.includes('detector name')))
  if (i >= 0) return mk('quantstudio', i, instrMatch ? `Thermo ${instrMatch[1].trim()}` : 'Thermo QuantStudio', '', false)
  i = find(h => h.includes('pos') && h.includes('name') && (h.includes('cp') || h.includes('tm1')) && (h.includes('include') || h.includes('color')))
  if (i >= 0) {
    const filt = meta.map(l => /selected filter:\s*([^\t]+?)(\s{2,}|\t|$)/i.exec(l)).find(Boolean)
    return mk('lc480', i, 'Roche LightCycler 480', filt ? filt[1].trim() : '', false)
  }
  i = find(h => h.includes('no.') && h.includes('name') && h.includes('ct') && (h.includes('type') || h.includes('colour')))
  if (i >= 0) {
    const ch = meta.map(l => /quantitation data for cycling\s+[a-z]\.([a-z]+)/i.exec(l) ?? /channel\s*[:,]?\s*(cycling [a-z]\.[a-z]+)/i.exec(l)).find(Boolean)
    return mk('rotorgene', i, 'Qiagen Rotor-Gene Q', ch ? ch[1] : '', true)
  }
  i = rows.findIndex(r => { const g = guessMapping(r.cells); return g.well !== undefined && g.cq !== undefined })
  if (i >= 0) return mk('generic', i, '', '', false)
  return null

  function mk(format: FormatId, headerIndex: number, instrument: string, defaultTarget: string, numbered: boolean): Detected {
    const header = rows[headerIndex].cells
    return { format, headerIndex, header, mapping: guessMapping(header), instrument, defaultTarget, numbered }
  }
}

const UNDET = /^(undetermined|nan|n\/a|na|no ct|no cq|-|—|)$/i

export function parseRole(raw: string, sample: string): Role {
  const v = raw.trim().toLowerCase().replace(/[-_ ]?\d+$/, '')
  if (/^(unkn|unknown|sample|unk)$/.test(v)) return /^(ntc|h2o|water|neg)/i.test(sample) ? 'ntc' : 'unknown'
  if (/^(std|standard)$/.test(v)) return 'standard'
  if (/^(ntc|no template( control)?|neg ctrl|negative( control)?|negative)$/.test(v)) return 'ntc'
  if (/^(nrt|no rt|-rt|nac|no amplification control|rt-)$/.test(v)) return 'nrt'
  if (/^(irc|calibrator|inter-?run calibrator)$/.test(v)) return 'calibrator'
  if (/^(empty|none)$/.test(v)) return 'empty'
  if (/^(pos ctrl|positive( control)?)$/.test(v)) return 'unknown'
  if (/^(ntc|h2o|water|neg)/i.test(sample)) return 'ntc'
  if (/^(nrt|-rt|no ?rt)/i.test(sample)) return 'nrt'
  return 'unknown'
}

export interface ParseOptions { defaultTarget?: string; numbered?: boolean }
export interface ParseResult { wells: Well[]; issues: Issue[]; format: 96 | 384; skipped: number }

export function parseRows(rows: Row[], headerIndex: number, m: Mapping, opts: ParseOptions = {}): ParseResult {
  const issues: Issue[] = []
  const wells: Well[] = []
  const seen = new Map<string, number>()
  let skipped = 0
  const get = (r: Row, f: Field) => (m[f] === undefined ? '' : r.cells[m[f]!] ?? '')
  const num = (s: string) => { const v = Number(s.replace(',', '.')); return s.trim() !== '' && isFinite(v) ? v : NaN }
  const body = rows.slice(headerIndex + 1)
  const end = body.findIndex(r => !r.cells.length || /^\[.*\]$/.test(r.cells[0] ?? ''))
  const data = end >= 0 ? body.slice(0, end) : body
  const idxMax = Math.max(0, ...data.map(r => num(get(r, 'well'))).filter(isFinite))
  const numberedFormat = idxMax > 96 ? 384 : 96
  for (const r of data) {
    if (r.cells.every(c => !c)) continue
    const rawWell = get(r, 'well')
    let well = ''
    if (parseWell(rawWell)) well = normWell(rawWell)
    else if ((opts.numbered || /^\d+$/.test(rawWell)) && num(rawWell) >= 1 && num(rawWell) <= 384) well = wellFromIndex(num(rawWell), numberedFormat)
    if (!well) { issues.push({ line: r.line, level: 'error', msg: rawWell ? `Unrecognised well "${rawWell}". Expected A1 to P24 or a position number.` : 'Missing well. Row skipped.' }); skipped++; continue }
    const rawCq = get(r, 'cq')
    let cq: number | null = null
    if (!UNDET.test(rawCq.trim())) {
      const v = num(rawCq)
      if (isNaN(v)) { issues.push({ line: r.line, level: 'error', msg: `Cq "${rawCq}" in ${well} is not a number. Row skipped.` }); skipped++; continue }
      cq = v
      if (v <= 0 || v > 50) issues.push({ line: r.line, level: 'warn', msg: `Cq ${v} in ${well} is outside 0 to 50.` })
      else if (v > 40) issues.push({ line: r.line, level: 'warn', msg: `Cq ${v} in ${well} is above 40: at or past the reliable detection limit.` })
    }
    const sample = get(r, 'sample')
    const target = get(r, 'target') || opts.defaultTarget || ''
    const role = m.role !== undefined ? parseRole(get(r, 'role'), sample) : parseRole('', sample)
    const qRaw = get(r, 'quantity'), tmRaw = get(r, 'tm')
    const quantity = qRaw && isFinite(num(qRaw)) ? num(qRaw) : null
    const tm = tmRaw && isFinite(num(tmRaw)) ? num(tmRaw) : null
    // Without a role column, a known quantity marks a standard (LightCycler "Standard" column, generic dilution column).
    const finalRole: Role = m.role === undefined && quantity !== null && role === 'unknown' ? 'standard' : role
    if (!target) issues.push({ line: r.line, level: 'warn', msg: `No target for ${well}. Assign it in the plate map.` })
    if (finalRole === 'unknown' && !sample) issues.push({ line: r.line, level: 'warn', msg: `No sample name for ${well}. Assign it in the plate map.` })
    if (finalRole === 'standard' && !(quantity! > 0)) issues.push({ line: r.line, level: 'warn', msg: `Standard ${well} has no quantity, so it cannot be used in a standard curve.` })
    if (tmRaw && tm === null) issues.push({ line: r.line, level: 'warn', msg: `Tm "${tmRaw}" in ${well} is not a number; ignored.` })
    const key = `${well}|${target}`
    if (seen.has(key)) { issues.push({ line: r.line, level: 'warn', msg: `Duplicate ${well}${target ? ` / ${target}` : ''} (first seen on line ${seen.get(key)}). Kept the first.` }); skipped++; continue }
    seen.set(key, r.line)
    const group = get(r, 'group')
    wells.push({ well, sample, target, role: finalRole, cq, tm, quantity, ...(group ? { group } : {}) })
  }
  if (!wells.length) issues.push({ line: rows[headerIndex]?.line ?? 1, level: 'error', msg: 'No data rows found under the header.' })
  return { wells, issues, format: formatFor(wells.map(w => w.well)), skipped }
}

/**
 * Parses a block pasted from a spreadsheet laid out like the plate (optionally with a 1..12 header row and A..H labels).
 * Returns well -> value.
 */
export function parseLayout(text: string): Map<string, string> {
  const rows = text.replace(/\r/g, '').split('\n').filter(l => l.trim()).map(l => l.split('\t'))
  const out = new Map<string, string>()
  if (!rows.length) return out
  let r0 = 0
  if (rows[0].filter(c => /^\s*\d{1,2}\s*$/.test(c)).length >= Math.min(3, rows[0].length)) r0 = 1
  const hasRowLabels = rows.slice(r0).every(r => /^\s*[A-Pa-p]\s*$/.test(r[0] ?? ''))
  rows.slice(r0).forEach((r, ri) => {
    const cells = hasRowLabels ? r.slice(1) : r
    const rowIdx = hasRowLabels ? r[0].trim().toUpperCase().charCodeAt(0) - 65 : ri
    cells.forEach((c, ci) => { if (c.trim() && ci < 24 && rowIdx < 16) out.set(String.fromCharCode(65 + rowIdx) + (ci + 1), c.trim()) })
  })
  return out
}

// ---------- Exports ----------

export const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows: unknown[][]) => rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n'
