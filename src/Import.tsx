import { useMemo, useState } from 'react'
import { detect, FIELDS, FORMAT_LABEL, fromSheet, guessMapping, parseDelimited, parseRdml, parseRows, unsupportedReason, type Detected, type Field, type Mapping, type RdmlRun, type Row } from './engine/parse.ts'
import { CFX_CSV, GENERIC_CSV, LC480_TXT, QUANTSTUDIO_TXT, ROTORGENE_CSV } from './engine/fixtures.ts'
import type { Plate } from './engine/qpcr.ts'
import { PlateMap } from './PlateMap.tsx'
import { analyze, wellKey } from './engine/qpcr.ts'
import { autoConfigure, makeSnapshot } from './projectData.ts'
import { saveProject, uuid, type Project } from './store.ts'
import { Link, Modal, toast } from './ui.tsx'

const EXAMPLES: [string, string, string][] = [
  ['Bio-Rad CFX', 'example_cfx_quantification_cq_results.csv', CFX_CSV],
  ['QuantStudio', 'example_quantstudio_results.txt', QUANTSTUDIO_TXT],
  ['LightCycler 480', 'example_lc480_abs_quant.txt', LC480_TXT],
  ['Rotor-Gene', 'example_rotorgene_quantitation.csv', ROTORGENE_CSV],
  ['Generic CSV', 'example_generic.csv', GENERIC_CSV],
]

// Instrument software on Windows often writes UTF-16 text exports.
const decode = (b: Uint8Array) => new TextDecoder(b[0] === 0xff && b[1] === 0xfe ? 'utf-16le' : b[0] === 0xfe && b[1] === 0xff ? 'utf-16be' : 'utf-8').decode(b)

export async function readFile(f: File): Promise<Row[] | RdmlRun[]> {
  const bytes = new Uint8Array(await f.arrayBuffer())
  const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b
  if (/\.(rdml|rdm|xml)$/i.test(f.name)) {
    let xml = ''
    if (zipped) {
      // An .rdml file is a zip holding one XML document.
      const XLSX = await import('xlsx')
      const entry = XLSX.CFB.read(bytes, { type: 'array' }).FileIndex.find((e: { name: string; content?: ArrayLike<number> }) => /\.xml$/i.test(e.name) && e.content?.length)
      if (!entry) throw new Error('no XML document inside the RDML archive')
      xml = decode(new Uint8Array(entry.content as ArrayLike<number>))
    } else xml = decode(bytes)
    const runs = parseRdml(xml)
    if (!runs.length) throw new Error('no runs with reactions found in this RDML file')
    if (!runs.some(r => r.rows.slice(2).some(x => x.cells[4]))) throw new Error('it holds amplification curves but no Cq values. Analyse the run in the instrument software or RDML-Tools (LinRegPCR) first, then export again')
    return runs
  }
  if (/\.xlsx?$/i.test(f.name)) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(bytes, { type: 'array' })
    const name = wb.SheetNames.find(n => /^results?$/i.test(n.trim())) ?? wb.SheetNames.find(n => /result/i.test(n)) ?? wb.SheetNames[0]
    return fromSheet(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }) as unknown[][])
  }
  return parseDelimited(decode(bytes))
}
const isRuns = (x: Row[] | RdmlRun[]): x is RdmlRun[] => x.length > 0 && 'rows' in x[0]

export function ImportWizard({ open, onClose, p }: { open: boolean; onClose(): void; p: Project }) {
  const [src, setSrc] = useState<{ name: string; rows: Row[] } | null>(null)
  const [det, setDet] = useState<Detected | null>(null)
  const [mapping, setMapping] = useState<Mapping>({})
  const [headerIndex, setHeaderIndex] = useState(0)
  const [defaultTarget, setDefaultTarget] = useState('')
  const [numbered, setNumbered] = useState(false)
  const [plateName, setPlateName] = useState('')
  const [runDate, setRunDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [paste, setPaste] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [runs, setRuns] = useState<{ file: string; list: RdmlRun[]; i: number } | null>(null)

  const reset = () => { setSrc(null); setDet(null); setErr(null); setPaste(''); setRuns(null) }
  const load = (name: string, rows: Row[]) => {
    setErr(null)
    const d = detect(rows)
    const why = d ? null : unsupportedReason(rows)
    if (why) { setErr(why); return }
    if (!rows.some(r => r.cells.length > 1)) { setErr(`${name} has no tabular rows. Export the results table as CSV, TXT or XLSX (see the docs).`); return }
    const hi = d?.headerIndex ?? Math.max(0, rows.findIndex(r => r.cells.filter(Boolean).length > 2))
    setSrc({ name, rows }); setDet(d); setHeaderIndex(hi)
    setMapping(d?.mapping ?? guessMapping(rows[hi]?.cells ?? []))
    setDefaultTarget('')
    // Instrument exports carry the run time in their header ("Experiment Run End Time = 2010-10-20 ...").
    const stamp = rows.slice(0, 80).map(r => /run (end|start)[^=]*?(?:time)?\s*=?\s*(\d{4}-\d{2}-\d{2})/i.exec(r.cells.join(' '))?.[2]).find(Boolean)
    setRunDate(stamp ?? new Date().toLocaleDateString('en-CA'))
    setNumbered(d?.numbered ?? false)
    setPlateName(name.replace(/\.(csv|txt|tsv|xlsx?|rdml?|xml)$/i, '').replace(/[_-]+/g, ' ').slice(0, 60) || `Plate ${p.plates.length + 1}`)
  }
  const loadRun = (file: string, list: RdmlRun[], i: number) => {
    load(file, list[i].rows)
    if (list.length > 1) setPlateName(list[i].name.slice(0, 60))
    if (list[i].runDate) setRunDate(list[i].runDate)
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    if (f.size > 25_000_000) { setErr('That file is over 25 MB. Export only the results table (not amplification or raw data).'); return }
    setBusy(true)
    try {
      const got = await readFile(f)
      if (isRuns(got)) { setRuns({ file: f.name, list: got, i: 0 }); loadRun(f.name, got, 0) } else { setRuns(null); load(f.name, got) }
    } catch (e) { setErr(`Could not read ${f.name}: ${e instanceof Error ? e.message : String(e)}`) } finally { setBusy(false) }
  }

  const header = src?.rows[headerIndex]?.cells ?? []
  const parsed = useMemo(() => (src ? parseRows(src.rows, headerIndex, mapping, { defaultTarget: defaultTarget.trim() || undefined, numbered }) : null), [src, headerIndex, mapping, defaultTarget, numbered])
  const errors = parsed?.issues.filter(i => i.level === 'error') ?? []
  const warns = parsed?.issues.filter(i => i.level === 'warn') ?? []
  const missingReq = FIELDS.filter(f => f.required && mapping[f.id] === undefined)
  const preview: Plate | null = parsed ? { id: 'preview', name: plateName, format: parsed.format, instrument: det?.instrument ?? '', wells: parsed.wells } : null

  const commit = async () => {
    if (!parsed || !preview || !parsed.wells.length) return
    const plate: Plate = { ...preview, id: uuid(), name: plateName.trim() || `Plate ${p.plates.length + 1}`, runDate, fileName: src!.name }
    const plates = [...p.plates, plate]
    let settings = autoConfigure(plates, p.settings)
    // Wells omitted in the instrument software start excluded; they can be put back in QC.
    if (parsed.omittedReactions.length) settings = { ...settings, excluded: { ...settings.excluded, ...Object.fromEntries(parsed.omittedReactions.map(o => [wellKey(plate.id, o.well, o.target), true])) } }
    const next: Project = {
      ...p, plates, settings,
      meta: { ...p.meta, instrument: p.meta.instrument || det?.instrument || '' },
      imports: [...p.imports, { id: uuid(), fileName: src!.name, format: det ? FORMAT_LABEL[det.format] : 'Generic table', wells: parsed.wells.length, errors: errors.length, warnings: warns.length, plateId: plate.id, at: Date.now() }],
    }
    next.snapshots = [...p.snapshots, makeSnapshot(next, analyze(next.plates, next.settings), `Import: ${plate.name}`)]
    await saveProject(next)
    toast(`Imported ${parsed.wells.length} wells into ${plate.name}.`, { tone: 'ok' })
    reset(); onClose()
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title={src ? `Import ${src.name}` : 'Import a results export'} wide>
      {!src ? (
        <div className="stack">
          <div className={`drop${drag ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); void onFile(e.dataTransfer.files[0]) }}>
            <p><b>Drop a CSV, TXT, XLSX or RDML export here</b></p>
            <label className="btn primary">Choose file<input type="file" className="sr-only" accept=".csv,.txt,.tsv,.xls,.xlsx,.rdml,.rdm,.xml" onChange={e => void onFile(e.target.files?.[0])} /></label>
            <p className="muted small">CFX Maestro “Quantification Cq Results”, QuantStudio / Design & Analysis “Results”, LightCycler 480 text export, Rotor-Gene quantitation report, RDML from any instrument, or any table with well and Cq columns. <Link href="/docs">Export steps</Link></p>
            {busy && <p role="status"><span className="spinner" /> Reading</p>}
          </div>
          <details className="more">
            <summary>Or paste the table</summary>
            <textarea className="mono" rows={6} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Well\tSample\tTarget\tCq\nA1\tCtrl-1\tACTB\t18.12'} aria-label="Pasted table" />
            <button type="button" className="btn outline sm" disabled={!paste.trim()} onClick={() => load('Pasted table', parseDelimited(paste))}>Use pasted table</button>
          </details>
          <div>
            <p className="muted small">Example exports (synthetic, a few wells each) to see each format:</p>
            <div className="row gap-sm wrap">{EXAMPLES.map(([l, n, t]) => <button key={n} type="button" className="btn ghost sm" onClick={() => load(n, parseDelimited(t))}>{l}</button>)}</div>
          </div>
          {err && <p className="error" role="alert">{err}</p>}
        </div>
      ) : (
        <div className="stack import-grid">
          <div className="stack">
            <div className={`banner ${det ? 'ok' : 'warn'}`}>{det ? <>Detected <b>{FORMAT_LABEL[det.format]}</b>, header on line {src.rows[headerIndex].line}.</> : 'Format not recognised. Pick the header line and map the columns.'}</div>
            <div className="row gap wrap">
              {runs && runs.list.length > 1 && <label className="field"><span>Run in this file ({runs.list.length})</span><select value={runs.i} onChange={e => { const i = +e.target.value; setRuns({ ...runs, i }); loadRun(runs.file, runs.list, i) }}>
                {runs.list.map((r, i) => <option key={i} value={i}>{r.name} ({r.rows.length - 2} reactions)</option>)}
              </select></label>}
              <label className="field"><span>Header line</span><select value={headerIndex} onChange={e => { const i = +e.target.value; setHeaderIndex(i); setMapping(guessMapping(src.rows[i].cells)) }}>
                {src.rows.map((r, i) => (i < 80 || i === headerIndex) && r.cells.filter(Boolean).length > 1 && <option key={i} value={i}>Line {r.line}: {r.cells.filter(Boolean).slice(0, 4).join(', ').slice(0, 50)}</option>)}
              </select></label>
              <label className="field"><span>Plate name</span><input value={plateName} onChange={e => setPlateName(e.target.value)} /></label>
              <label className="field"><span>Run date</span><input type="date" value={runDate} onChange={e => setRunDate(e.target.value)} /></label>
            </div>
            <fieldset className="mapping">
              <legend>Column mapping</legend>
              {FIELDS.map(f => (
                <label key={f.id} className="field">
                  <span>{f.label}{f.required ? ' *' : ''}</span>
                  <select value={mapping[f.id] ?? ''} onChange={e => setMapping(m => { const n = { ...m }; if (e.target.value === '') delete n[f.id as Field]; else n[f.id as Field] = +e.target.value; return n })}>
                    <option value="">Not in file</option>
                    {header.map((h, i) => h && <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              ))}
            </fieldset>
            {mapping.target === undefined && <label className="field"><span>Target for every well (this file has no target column{det?.defaultTarget ? `; channel ${det.defaultTarget}` : ''})</span><input value={defaultTarget} onChange={e => setDefaultTarget(e.target.value)} placeholder="e.g. GAPDH" /></label>}
            <label className="check"><input type="checkbox" checked={numbered} onChange={e => setNumbered(e.target.checked)} /> Positions are numbered 1, 2, 3 (rotor or index), not A1 to H12</label>
            {missingReq.length > 0 && <p className="error small">Map the required column{missingReq.length > 1 ? 's' : ''}: {missingReq.map(f => f.label).join(', ')}.</p>}
          </div>
          <div className="stack">
            <h3 className="h5">Validation</h3>
            <p className="small"><b>{parsed?.wells.length ?? 0}</b> wells read · <span className={errors.length ? 'error' : 'muted'}>{errors.length} errors (rows skipped)</span> · <span className={warns.length ? 'warn-t' : 'muted'}>{warns.length} warnings</span></p>
            {parsed && parsed.issues.length > 0 && (
              <ul className="issues">{[...errors, ...warns].slice(0, 200).map((i, k) => <li key={k} className={i.level}><span className="ln">Line {i.line}</span>{i.msg}</li>)}{parsed.issues.length > 200 && <li className="muted">and {parsed.issues.length - 200} more</li>}</ul>
            )}
            {preview && preview.wells.length > 0 && <><h3 className="h5">Plate preview ({preview.format} wells)</h3><PlateMap plate={preview} colorBy="role" label="none" size="sm" /><p className="muted small">Roles, samples, targets and groups can be edited in the plate map after import.</p></>}
            <div className="row end gap">
              <button type="button" className="btn ghost" onClick={reset}>Choose another file</button>
              <button type="button" className="btn primary" disabled={!parsed?.wells.length || missingReq.length > 0} onClick={() => void commit()}>Import {parsed?.wells.length ?? 0} wells</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
