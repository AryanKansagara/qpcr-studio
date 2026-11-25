// Instrument export parsing: delimiter sniffing, format detection, column mapping and line-numbered validation.
import { formatFor, normWell, parseWell, wellFromIndex, type Role, type Well } from './qpcr.ts'

export type FormatId = 'cfx' | 'quantstudio' | 'lc480' | 'rotorgene' | 'rdml' | 'generic'
export const FORMAT_LABEL: Record<FormatId, string> = {
  cfx: 'Bio-Rad CFX Maestro · Quantification Cq Results',
  quantstudio: 'Thermo QuantStudio / Design & Analysis · Results',
  lc480: 'Roche LightCycler 480 · text export',
  rotorgene: 'Qiagen Rotor-Gene · quantitation report',
  rdml: 'RDML (Real-time PCR Data Markup Language)',
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

// Some QuantStudio versions write Ct with a Cyrillic "т".
const cleanHeader = (h: string) => h.replace(/т/g, 't').replace(/\s+/g, ' ').trim()

export function guessMapping(header: string[]): Mapping {
  const m: Mapping = {}
  const clean = header.map(cleanHeader)
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
  const find = (pred: (h: string[]) => boolean) => rows.findIndex(r => r.cells.length > 2 && pred(r.cells.map(c => cleanHeader(c).toLowerCase())))
  // "* Instrument Type = QuantStudio 5 System" in text exports, a "Instrument Type | QuantStudio 1 System" row in spreadsheets.
  const instrMatch = meta.map(l => /^\*?\s*instrument type\s*=?\s*(.+)$/i.exec(l.trim())).find(Boolean)

  if (rows[0]?.cells[0] === RDML_MARK) return mk('rdml', 1, rows[0].cells[1] ?? '', '', false)

  let i = find(h => h.includes('well') && h.includes('fluor') && h.includes('content') && (h.includes('cq') || h.includes('melt temperature')))
  if (i >= 0) return mk('cfx', i, 'Bio-Rad CFX', '', false)
  i = find(h => h.includes('well position') && (h.includes('ct') || h.includes('cq') || h.includes('crt')) && (h.includes('target name') || h.includes('detector name') || h.includes('target')))
  if (i >= 0) return mk('quantstudio', i, instrMatch ? `Thermo ${instrMatch[1].replace(/\(TM\)|™|®/gi, '').replace(/\s+/g, ' ').trim()}` : 'Thermo QuantStudio', '', false)
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

/** For files that are a real instrument export but not a per-well Cq table: says what to export instead. */
export function unsupportedReason(rows: Row[]): string | null {
  const heads = rows.slice(0, 1200).filter(r => r.cells.length > 2).map(r => r.cells.map(c => c.toLowerCase()))
  if (heads.some(h => h.includes('allele1 ct') || h.includes('snp assay name'))) return 'This is a QuantStudio genotyping export (two alleles per well). qPCR Studio analyses gene-expression runs: export the Results of a Standard Curve or Comparative Ct experiment.'
  if (heads.some(h => h.includes('samplepos') && h.includes('cycle#'))) return 'This is a LightCycler raw fluorescence export, not a results table. In the LightCycler software run Abs Quant / 2nd Derivative Max, then right-click the results table and export it.'
  if (heads.some(h => h.includes('cycle') && (h.includes('rn') || h.includes('delta rn'))) && !heads.some(h => h.includes('well position') && (h.includes('ct') || h.includes('cq')))) return 'This file holds amplification curves only. Export the Results table (one Cq per well) instead.'
  return null
}

const UNDET = /^(undetermined|nan|n\/a|na|no ct|no cq|-|—|)$/i

// Control wells recognised by name. Whole names, not prefixes: H2O2 is a treatment, a negative siRNA or "Northern-1" is a sample.
const NTC_NAME = /^\s*(ntc(?![\s_-]*(si|sh|sg|g)rna)|no[\s_-]?template|((h2o|(nuclease[\s_-]*free[\s_-]*)?water)([\s_-]+\d{1,2})?|water\d{1,2}|neg(ative)?\.?|neg[\s_-]*c|(h2o|water|neg(ative)?)[\s_-]*(ctrl|control)([\s_-]*\d{1,2})?)\s*$|.*\(ntc\)\s*$)/i
const NRT_NAME = /^\s*(nrt|-rt|no[\s_-]?rt)(?=$|[^a-z]|ctrl|control)/i

export function parseRole(raw: string, sample: string): Role {
  const v = raw.trim().toLowerCase().replace(/[-_ ]?\d+$/, '')
  if (/^(unkn|unknown|sample|unk)$/.test(v)) return NTC_NAME.test(sample) ? 'ntc' : 'unknown'
  if (/^(std|standard)$/.test(v)) return 'standard'
  if (/^(ntc|no template( control)?|neg ctrl|negative( control)?|negative)$/.test(v)) return 'ntc'
  if (/^(nrt|no rt|-rt|nac|no amplification control|rt-)$/.test(v)) return 'nrt'
  if (/^(irc|calibrator|inter-?run calibrator)$/.test(v)) return 'calibrator'
  if (/^(empty|none)$/.test(v)) return 'empty'
  if (/^(pos ctrl|positive( control)?)$/.test(v)) return 'unknown'
  if (NTC_NAME.test(sample)) return 'ntc'
  if (NRT_NAME.test(sample)) return 'nrt'
  return 'unknown'
}

const GROUPED = { ',': /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/, '.': /^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/ }

/**
 * Decides whether a file writes 1,234.5 or 1.234,5 and returns a reader for its numbers (NaN when not a number).
 * A Cq or Tm is far below 1000, so a lone separator in one is always the decimal mark. A lone separator before exactly
 * three digits in a quantity ("10,000") takes the other role once the decimal mark is known. A comma that cannot be decided is NaN.
 */
export function numberReader(quantities: string[], cqs: string[]) {
  const all = [...quantities, ...cqs].map(x => x.trim())
  const uses = (mark: ',' | '.') => {
    const m = mark === ',' ? ',' : '\\.', o = mark === ',' ? '\\.' : ','
    const short = new RegExp(`^[+-]?(\\d*${m}(\\d{1,2}|\\d{4,})|\\d{4,}${m}\\d+|0*${m}\\d+|\\d+${m}\\d+e[+-]?\\d+|\\d{1,3}(${o}\\d{3})+${m}\\d+|\\d{1,3}(${o}\\d{3}){2,})$`, 'i')
    const lone = new RegExp(`^[+-]?\\d+${m}\\d+$`)
    return all.some(x => short.test(x)) || cqs.some(x => lone.test(x.trim()))
  }
  const comma = uses(','), point = uses('.')
  return (raw: string, cell?: 'quantity') => {
    const t = raw.trim()
    let s = t
    if (cell && GROUPED[','].test(t) && !/^[+-]?0/.test(t) && (point || /,.*[,.]/.test(t))) {
      if (comma && point && !/,.*[,.]/.test(t)) return NaN
      s = t.replace(/,/g, '')
    } else if (cell && GROUPED['.'].test(t) && !/^[+-]?0/.test(t) && comma && (!point || /\..*[.,]/.test(t))) s = t.replace(/\./g, '').replace(',', '.')
    else if (cell && GROUPED[','].test(t) && !/^[+-]?0/.test(t) && !comma) return NaN
    else if (GROUPED[','].test(t) && /,.*[,.]/.test(t)) s = t.replace(/,/g, '')
    else s = t.replace(',', '.')
    const v = Number(s)
    return t !== '' && isFinite(v) ? v : NaN
  }
}

export interface ParseOptions { defaultTarget?: string; numbered?: boolean }
export interface ParseResult { wells: Well[]; issues: Issue[]; format: 96 | 384; skipped: number; /** Wells the instrument software had omitted (QuantStudio Omit, LightCycler Include). */ omitted: string[] }

export function parseRows(rows: Row[], headerIndex: number, m: Mapping, opts: ParseOptions = {}): ParseResult {
  const issues: Issue[] = []
  const wells: Well[] = []
  const seen = new Map<string, number>()
  let skipped = 0
  const get = (r: Row, f: Field) => (m[f] === undefined ? '' : r.cells[m[f]!] ?? '')
  const body = rows.slice(headerIndex + 1)
  const blank = (r: Row) => r.cells.every(c => !c)
  const section = (r: Row) => /^\[.*\]$/.test(r.cells[0] ?? '')
  // Positions are plain numbers only in a table that starts with one, so a numeric footer is not taken for a well.
  const counted = /^\d+$/.test(get(body.find(r => !blank(r)) ?? { line: 0, cells: [] }, 'well'))
  const hasWell = (r: Row) => { const w = get(r, 'well'); return r.cells.filter(Boolean).length > 1 && (!!parseWell(w) || (counted && /^\d+$/.test(w) && +w >= 1 && +w <= 384)) }
  // The table ends at the next [section], or at a blank row followed by a footer (key/value lines) or nothing.
  const end = body.findIndex((r, i) => {
    if (section(r)) return true
    if (!blank(r)) return false
    const next = body.slice(i + 1).find(x => !blank(x))
    return !next || (next.cells.filter(Boolean).length < 3 && !hasWell(next)) || section(next)
  })
  const data = end >= 0 ? body.slice(0, end) : body
  // Wells below the footer are not read: say so instead of dropping them.
  const rest = end >= 0 ? body.slice(end) : []
  const stop = rest.findIndex(section)
  const unread = (stop >= 0 ? rest.slice(0, stop) : rest).filter(hasWell)
  if (unread.length) issues.push({ line: unread[0].line, level: 'error', msg: `${unread.length} row${unread.length > 1 ? 's' : ''} from here on look${unread.length > 1 ? '' : 's'} like wells but ${unread.length > 1 ? 'were' : 'was'} not read: the table ends at the blank line ${body[end].line}. Remove the text between them, or import them separately.` })
  const num = numberReader(data.map(r => get(r, 'quantity')), data.flatMap(r => [get(r, 'cq'), get(r, 'tm')]))
  const header = (rows[headerIndex]?.cells ?? []).map(h => cleanHeader(h).toLowerCase())
  const dyeCol = header.findIndex(h => /^(fluor|reporter|dye)$/.test(h))
  const omitCol = header.indexOf('omit'), includeCol = header.indexOf('include')
  const omitted: string[] = []
  let emptyWells = 0, dyeAsTarget = false
  const fromName: Well[] = []
  const undecided: string[] = []
  const roleFromName: string[] = []
  const noTarget: string[] = [], noSample: string[] = [], stdNoQty: string[] = []
  const list = (w: string[]) => `${w.length} well${w.length > 1 ? 's' : ''} (${w.slice(0, 6).join(', ')}${w.length > 6 ? ', ...' : ''})`
  const idxMax = Math.max(0, ...data.map(r => num(get(r, 'well'))).filter(isFinite))
  const numberedFormat = idxMax > 96 ? 384 : 96
  for (const r of data) {
    if (blank(r)) continue
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
      // Sentinels such as 0, -1 or 100 are how some software writes "no amplification".
      if (v <= 0 || v > 50) { cq = null; issues.push({ line: r.line, level: 'warn', msg: `Cq ${v} in ${well} is outside 0 to 50; read as no amplification.` }) }
      else if (v > 40) issues.push({ line: r.line, level: 'warn', msg: `Cq ${v} in ${well} is above 40: at or past the reliable detection limit.` })
    }
    const sample = get(r, 'sample')
    const role = m.role !== undefined ? parseRole(get(r, 'role'), sample) : parseRole('', sample)
    const byName = (role === 'ntc' || role === 'nrt') && parseRole(m.role === undefined ? '' : get(r, 'role'), '') === 'unknown'
    // Unused wells that the software still lists (no sample, nothing amplified) are not part of the experiment.
    if (role === 'unknown' && !sample && cq === null) { emptyWells++; continue }
    let target = get(r, 'target') || opts.defaultTarget || ''
    // Multiplex runs exported without target names: the fluorophore tells the assays apart.
    if (!target && dyeCol >= 0 && r.cells[dyeCol]) { target = r.cells[dyeCol]; dyeAsTarget = true }
    const qRaw = get(r, 'quantity'), tmRaw = get(r, 'tm')
    let quantity = qRaw && isFinite(num(qRaw, 'quantity')) ? num(qRaw, 'quantity') : null
    if (qRaw && quantity === null && /^[\d.,]+$/.test(qRaw) && isFinite(Number(qRaw.replace(',', '.')))) undecided.push(`${well} ${qRaw}`)
    const tm = tmRaw && isFinite(num(tmRaw)) ? num(tmRaw) : null
    // Without a role column, a known quantity marks a standard (LightCycler "Standard" column, generic dilution column).
    // LightCycler writes 0 there for every non-standard well.
    const finalRole: Role = m.role === undefined && quantity !== null && quantity > 0 && role === 'unknown' ? 'standard' : role
    // Design & Analysis keeps standard quantities out of the Results sheet; standards are usually named after them.
    let named = false
    if (finalRole === 'standard' && !(quantity! > 0) && m.quantity === undefined) {
      const q = /(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*([km])?\)?\s*$/i.exec(sample)
      const v = q ? Number(q[1]) * (!q[2] ? 1 : q[2].toLowerCase() === 'k' ? 1e3 : 1e6) : 0
      if (v > 0) { quantity = v; named = true }
    }
    // The quantity column of other wells is the software's own interpolation, not an input.
    if (finalRole !== 'standard') quantity = null
    if ((omitCol >= 0 && /^true$/i.test(r.cells[omitCol] ?? '')) || (includeCol >= 0 && /^false$/i.test(r.cells[includeCol] ?? ''))) omitted.push(well)
    if (byName) roleFromName.push(`${well} ${sample}`)
    if (!target) noTarget.push(well)
    if (finalRole === 'unknown' && !sample) noSample.push(well)
    if (finalRole === 'standard' && !(quantity! > 0) && !named) stdNoQty.push(well)
    if (tmRaw && tm === null) issues.push({ line: r.line, level: 'warn', msg: `Tm "${tmRaw}" in ${well} is not a number; ignored.` })
    const key = `${well}|${target}`
    if (seen.has(key)) { issues.push({ line: r.line, level: 'warn', msg: `Duplicate ${well}${target ? ` / ${target}` : ''} (first seen on line ${seen.get(key)}). Kept the first.` }); skipped++; continue }
    seen.set(key, r.line)
    const group = get(r, 'group')
    wells.push({ well, sample, target, role: finalRole, cq, tm, quantity, ...(group ? { group } : {}) })
    if (named) fromName.push(wells[wells.length - 1])
  }
  const at = rows[headerIndex]?.line ?? 1
  if (emptyWells) issues.push({ line: at, level: 'warn', msg: `${emptyWells} well${emptyWells > 1 ? 's' : ''} with no sample name and no Cq ${emptyWells > 1 ? 'were' : 'was'} treated as empty and left out.` })
  if (dyeAsTarget) issues.push({ line: at, level: 'warn', msg: `No target names in the file, so the fluorophore (${[...new Set(wells.map(w => w.target))].slice(0, 4).join(', ')}) is used as the target. Rename targets in the plate map.` })
  if (fromName.length) {
    // "Std_1250, Std_2500, ..." is a dilution series; "Std 1, Std 2, Std 3" is only a numbering.
    const qs = [...new Set(fromName.map(w => w.quantity!))].sort((a, b) => a - b)
    const numbering = qs.every((q, i) => Number.isInteger(q) && (i === 0 || q - qs[i - 1] === 1))
    if (qs.length >= 3 && !numbering && qs[qs.length - 1] / qs[0] >= 8) issues.push({ line: at, level: 'warn', msg: `No quantity column: ${fromName.length} standard quantities were read from the sample names (${qs.slice(0, 4).join(', ')}${qs.length > 4 ? ', ...' : ''}). Check them in the plate map.` })
    else for (const w of fromName) { w.quantity = null; stdNoQty.push(w.well) }
  }
  if (undecided.length) issues.push({ line: at, level: 'warn', msg: `Quantities could be thousands or decimals (${undecided.slice(0, 4).join(', ')}${undecided.length > 4 ? ', ...' : ''}) and were not read. Write them without separators, or enter them in the plate map.` })
  if (roleFromName.length) issues.push({ line: at, level: 'warn', msg: `Read as NTC or no-RT controls because of their names: ${roleFromName.slice(0, 6).join(', ')}${roleFromName.length > 6 ? ', ...' : ''}. If they are samples, change the role in the plate map.` })
  if (noTarget.length) issues.push({ line: at, level: 'warn', msg: `No target for ${list(noTarget)}. Assign it in the plate map.` })
  if (noSample.length) issues.push({ line: at, level: 'warn', msg: `No sample name for ${list(noSample)}. Assign it in the plate map.` })
  if (stdNoQty.length) issues.push({ line: at, level: 'warn', msg: `No quantity for ${list(stdNoQty)} marked as standards, so they cannot be used in a standard curve. Enter quantities in the plate map.` })
  if (omitted.length) issues.push({ line: at, level: 'warn', msg: `${omitted.length} well${omitted.length > 1 ? 's were' : ' was'} omitted in the instrument software (${omitted.slice(0, 6).join(', ')}${omitted.length > 6 ? ', ...' : ''}) and will start excluded.` })
  if (!wells.length) issues.push({ line: at, level: 'error', msg: 'No data rows found under the header.' })
  return { wells, issues, format: formatFor(wells.map(w => w.well)), skipped, omitted }
}

// ---------- RDML ----------

const RDML_MARK = 'RDML'
const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const GUID = /@?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface RdmlRun { name: string; runDate: string; rows: Row[] }

/**
 * Reads the Cq table of every run in an RDML document (versions 1.0 to 1.4) as rows the importer understands.
 * Only per-reaction results are read; amplification and melt curve points are ignored.
 */
export function parseRdml(xml: string): RdmlRun[] {
  const tag = (s: string, t: string) => { const m = new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`).exec(s); return m ? unxml(m[1].trim()) : '' }
  const blocks = (s: string, t: string) => [...s.matchAll(new RegExp(`<${t}\\s+id="([^"]*)"\\s*>([\\s\\S]*?)</${t}>`, 'g'))].map(m => ({ id: unxml(m[1]), body: m[2] }))
  // Curve points are most of the file; drop them before matching.
  const doc = xml.replace(/<(adp|mdp)>[\s\S]*?<\/\1>/g, '')
  const head = doc.slice(0, doc.search(/<experiment[\s>]/) >>> 0)
  const samples = new Map(blocks(head, 'sample').map(b => {
    const desc = tag(b.body, 'description')
    const q = /<quantity>\s*<value>([^<]*)<\/value>/.exec(b.body)
    // LightCycler 96 uses GUIDs as ids and keeps the visible name in the description.
    return [b.id, { name: GUID.test(b.id) ? desc : b.id, type: tag(b.body, 'type'), quantity: q ? q[1].trim() : '' }] as const
  }))
  const publisher = tag(tag(head, 'id'), 'publisher')
  const version = /<rdml[^>]*\sversion="([^"]*)"/.exec(xml)?.[1] ?? ''
  const runs: RdmlRun[] = []
  for (const exp of blocks(doc, 'experiment')) for (const run of blocks(exp.body, 'run')) {
    const cols = Number(tag(tag(run.body, 'pcrFormat'), 'columns')) || 12
    const rowsN = Number(tag(tag(run.body, 'pcrFormat'), 'rows')) || 8
    const out: Row[] = [
      { line: 1, cells: [RDML_MARK, publisher, version] },
      { line: 2, cells: ['Well', 'Sample', 'Target', 'Role', 'Cq', 'Tm', 'Quantity', 'Omit'] },
    ]
    for (const react of blocks(run.body, 'react')) {
      const idx = Number(react.id)
      // Ids are reading-order numbers in 1.1+, well names in some 1.0 files; rotors (one row) stay numbered.
      const well = Number.isInteger(idx) && idx > 0 && rowsN > 1 && rowsN <= 16 && cols <= 24 ? String.fromCharCode(65 + Math.floor((idx - 1) / cols)) + (((idx - 1) % cols) + 1) : react.id
      const sid = unxml(/<sample\s+id="([^"]*)"/.exec(react.body)?.[1] ?? '')
      const smp = samples.get(sid) ?? { name: sid, type: '', quantity: '' }
      for (const d of react.body.match(/<data>[\s\S]*?<\/data>/g) ?? []) {
        const tar = unxml(/<tar\s+id="([^"]*)"/.exec(d)?.[1] ?? '').replace(GUID, '')
        const cqRaw = tag(d, 'cq')
        // RDML tools write -1 (and some instruments NaN) when nothing amplified.
        const cq = cqRaw === '' || !(Number(cqRaw) > 0) ? '' : cqRaw
        const excl = /<excl>\s*\S/.test(d)
        const role = smp.type === 'opt' || smp.type === 'ntp' ? 'ntc' : smp.type
        out.push({ line: out.length + 1, cells: [well, smp.name, tar, role, cq, tag(d, 'meltTemp'), smp.quantity, excl ? 'true' : ''] })
      }
    }
    if (out.length > 2) runs.push({ name: exp.id === run.id || GUID.test(exp.id) ? run.id : `${exp.id} / ${run.id}`, runDate: tag(run.body, 'runDate').slice(0, 10), rows: out })
  }
  return runs
}

/**
 * Parses a block pasted from a spreadsheet laid out like the plate (optionally with a 1..12 header row and A..H labels).
 * Returns well -> value.
 */
export function parseLayout(text: string): Map<string, string> {
  const rows = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.split('\t').map(c => c.trim()))
  const blank = (r: string[]) => r.every(c => !c)
  while (rows.length && blank(rows[rows.length - 1])) rows.pop()
  const out = new Map<string, string>()
  if (!rows.length) return out
  const label = (c: string) => (/^[A-Pa-p]$/.test(c) ? c.toUpperCase().charCodeAt(0) - 65 : -1)
  const labelled = (rs: string[][]) => {
    const l = rs.filter(r => !blank(r))
    return l.some(r => r.length > 1) && l.every(r => label(r[0]) >= 0) && new Set(l.map(r => label(r[0]))).size === l.length
  }
  // Column numbers: 1, 2, 3, ... (any ascending run beside row labels). Other numbers in the first row are values.
  const h = rows.findIndex(r => !blank(r))
  const body = rows.slice(h + 1)
  // The corner is empty, or a caption such as "<>" above row labels.
  const corner = !rows[h][0] || (!/^\d/.test(rows[h][0]) && label(rows[h][0]) < 0 && rows[h].length > 1 && labelled(body))
  const heads = (corner ? rows[h].slice(1) : rows[h]).filter((c, i, all) => c || all.slice(i).some(Boolean)).map(c => (/^\d{1,2}$/.test(c) ? +c : NaN))
  const counted = heads.every((n, i) => n === i + 1)
  const ascending = heads.every((n, i) => n >= 1 && n <= 24 && (i === 0 || n > heads[i - 1]))
  const header = body.length > 0 && heads.length > 0 && (corner ? counted || (ascending && labelled(body)) : counted && heads.length >= 3)
  const data = header ? body : rows
  const hasRowLabels = labelled(data)
  data.forEach((r, ri) => {
    if (blank(r)) return
    // A corner cell without row labels under it leaves an empty first column.
    const cells = hasRowLabels || (header && corner && data.every(x => !x[0])) ? r.slice(1) : r
    const rowIdx = hasRowLabels ? label(r[0]) : ri
    cells.forEach((c, i) => {
      const ci = header && corner && hasRowLabels ? (heads[i] ?? NaN) - 1 : i
      if (c && ci < 24 && rowIdx < 16) out.set(String.fromCharCode(65 + rowIdx) + (ci + 1), c)
    })
  })
  return out
}

// ---------- Exports ----------

export const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows: unknown[][]) => rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n'
