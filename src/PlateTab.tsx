import { useEffect, useMemo, useState } from 'react'
import { parseLayout } from './engine/parse.ts'
import { groupOf, plateDims, ROLE_LABEL, ROLES, wellKey, wellName, type Analysis, type Plate, type Role, type Well } from './engine/qpcr.ts'
import { ImportWizard } from './Import.tsx'
import { CatLegend, CqLegend, PlateMap, roleLegend, type ColorBy } from './PlateMap.tsx'
import { OKABE_ITO } from './figure.ts'
import { setSettings } from './Project.tsx'
import { saveProject, type Project } from './store.ts'
import { ask, fmtCq, fmtDate, isTyping, toast } from './ui.tsx'

type LayoutField = 'sample' | 'target' | 'group' | 'role' | 'cq'

export default function PlateTab({ p, a }: { p: Project; a: Analysis }) {
  const [importing, setImporting] = useState(false)
  const [plateId, setPlateId] = useState(p.plates[p.plates.length - 1]?.id ?? '')
  const [colorBy, setColorBy] = useState<ColorBy>('role')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const plate = p.plates.find(x => x.id === plateId) ?? p.plates[0]
  useEffect(() => {
    if (new URLSearchParams(location.search).get('import') === '1') { history.replaceState({}, '', location.pathname); setImporting(true) }
  }, [])
  useEffect(() => { if (!p.plates.some(x => x.id === plateId) && p.plates.length) setPlateId(p.plates[p.plates.length - 1].id) }, [p.plates, plateId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      if (e.key === 'Escape') setSel(new Set())
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && plate) { e.preventDefault(); setSel(new Set(plate.wells.map(w => w.well))) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [plate])

  const allWells = p.plates.flatMap(x => x.wells)
  const gOf = (s: string) => groupOf(s, p.settings, allWells)
  const flagged = useMemo(() => new Set(a.replicates.filter(r => r.plateId === plate?.id).flatMap(r => r.wells.filter(w => w.auto).map(w => w.well))), [a, plate])

  const updatePlate = (next: Plate, msg: string) => {
    const prev = p.plates
    void saveProject({ ...p, plates: p.plates.map(x => (x.id === next.id ? next : x)) })
    toast(msg, { undo: () => void saveProject({ ...p, plates: prev }) })
  }

  if (!plate) return (
    <div className="card pad center stack">
      <h2 className="h4">Add your first plate</h2>
      <p className="muted">Import a results export. The format is detected and you can fix the mapping before anything is saved.</p>
      <div><button type="button" className="btn primary" onClick={() => setImporting(true)}>Import a plate</button></div>
      <ImportWizard open={importing} onClose={() => setImporting(false)} p={p} />
    </div>
  )

  const onWell = (well: string, e: React.MouseEvent | React.KeyboardEvent) => {
    if (e.shiftKey && anchor) {
      const pa = { r: anchor.charCodeAt(0) - 65, c: +anchor.slice(1) - 1 }, pb = { r: well.charCodeAt(0) - 65, c: +well.slice(1) - 1 }
      const n = new Set(sel)
      for (let r = Math.min(pa.r, pb.r); r <= Math.max(pa.r, pb.r); r++) for (let c = Math.min(pa.c, pb.c); c <= Math.max(pa.c, pb.c); c++) n.add(wellName(r, c))
      setSel(n)
      return
    }
    setAnchor(well)
    if (e.metaKey || e.ctrlKey) { const n = new Set(sel); if (n.has(well)) n.delete(well); else n.add(well); setSel(n) }
    else setSel(sel.size === 1 && sel.has(well) ? new Set() : new Set([well]))
  }
  const onRange = (ws: string[], additive: boolean) => setSel(prev => new Set(additive ? [...prev, ...ws] : ws))

  const selWells = plate.wells.filter(w => sel.has(w.well))
  const common = (f: keyof Well) => { const v = [...new Set(selWells.map(w => String(w[f] ?? '')))]; return v.length === 1 ? v[0] : '' }

  const assign = (patch: Partial<Well>) => {
    const existing = new Set(plate.wells.map(w => w.well))
    const created: Well[] = [...sel].filter(w => !existing.has(w)).map(w => ({ well: w, sample: '', target: '', role: 'unknown', cq: null }))
    const wells = [...plate.wells, ...created].map(w => (sel.has(w.well) ? { ...w, ...patch } : w))
    if (patch.group !== undefined) {
      const samples = new Set(wells.filter(w => sel.has(w.well)).map(w => w.sample))
      const groups = Object.fromEntries(Object.entries(p.settings.groups).filter(([k]) => !samples.has(k)))
      void setSettings({ ...p, plates: p.plates.map(x => (x.id === plate.id ? { ...plate, wells } : x)) }, { groups })
      return
    }
    updatePlate({ ...plate, wells }, `Updated ${sel.size} well${sel.size === 1 ? '' : 's'}.`)
  }
  const exclude = (on: boolean) => {
    const next = { ...p.settings.excluded }
    for (const w of sel) { const k = wellKey(plate.id, w); if (on) next[k] = true; else if (flagged.has(w)) next[k] = false; else delete next[k] }
    const prev = p.settings.excluded
    void setSettings(p, { excluded: next })
    toast(`${on ? 'Excluded' : 'Included'} ${sel.size} well${sel.size === 1 ? '' : 's'}.`, { undo: () => void setSettings(p, { excluded: prev }) })
  }

  const groups = [...new Set(plate.wells.filter(w => w.role === 'unknown').map(w => gOf(w.sample)))]
  const targets = [...new Set(plate.wells.map(w => w.target).filter(Boolean))]
  const lastImport = [...p.imports].reverse().find(i => i.plateId === plate.id)

  return (
    <div className="stack-lg">
      <div className="card pad">
        <div className="row between wrap gap">
          <div className="row gap-sm wrap">
            {p.plates.length > 1 && <label className="field inline"><span>Plate</span><select value={plate.id} onChange={e => { setPlateId(e.target.value); setSel(new Set()) }}>{p.plates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
            <label className="field inline"><span>Colour by</span><select value={colorBy} onChange={e => setColorBy(e.target.value as ColorBy)}><option value="role">Role</option><option value="cq">Cq</option><option value="target">Target</option><option value="group">Group</option></select></label>
          </div>
          <div className="row gap-sm wrap">
            <button type="button" className="btn primary sm" onClick={() => setImporting(true)}>Import plate</button>
            <button type="button" className="btn ghost sm" onClick={async () => {
              const fresh: Plate = { id: crypto.randomUUID(), name: `Plate ${p.plates.length + 1}`, format: 96, instrument: p.meta.instrument, runDate: new Date().toISOString().slice(0, 10), wells: [] }
              await saveProject({ ...p, plates: [...p.plates, fresh] }); setPlateId(fresh.id); setSel(new Set())
            }}>Blank plate map</button>
          </div>
        </div>
        <div className="plate-meta row gap wrap small">
          <label className="field inline"><span>Name</span><input defaultValue={plate.name} key={plate.id + plate.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== plate.name) void saveProject({ ...p, plates: p.plates.map(x => x.id === plate.id ? { ...x, name: v } : x) }) }} /></label>
          <label className="field inline"><span>Format</span><select value={plate.format} onChange={e => void saveProject({ ...p, plates: p.plates.map(x => x.id === plate.id ? { ...x, format: +e.target.value as 96 | 384 } : x) })} disabled={plate.format === 384 && plate.wells.some(w => { const r = w.well.charCodeAt(0) - 65; return r > 7 || +w.well.slice(1) > 12 })}><option value={96}>96-well</option><option value={384}>384-well</option></select></label>
          <span className="muted">{plate.instrument}{plate.runDate ? ` · run ${plate.runDate}` : ''}{lastImport ? ` · ${lastImport.fileName} (${lastImport.errors} errors, ${lastImport.warnings} warnings, imported ${fmtDate(lastImport.at)})` : ''}</span>
        </div>
        <div className="plate-wrap">
          <PlateMap plate={plate} settings={p.settings} colorBy={colorBy} selected={sel} flagged={flagged} groupOf={gOf} onWell={onWell} onRange={onRange} label={colorBy === 'target' ? 'target' : 'cq'} size={plate.format === 384 ? 'sm' : 'md'} />
        </div>
        {colorBy === 'cq' ? <CqLegend wells={plate.wells} /> : colorBy === 'role' ? <CatLegend items={roleLegend()} /> : <CatLegend items={(colorBy === 'target' ? targets : groups).map((x, i) => ({ label: x, colour: OKABE_ITO[i % OKABE_ITO.length] }))} />}
        <p className="muted small">Click a well, shift-click for a range, drag across wells, or click a row letter or column number. Cmd/Ctrl-click adds wells; Esc clears. Hatched wells are excluded; outlined wells are NTC or NRT.</p>
      </div>

      <div className="grid-2">
        <div className="card pad stack">
          <h2 className="h4">{sel.size ? `${sel.size} well${sel.size === 1 ? '' : 's'} selected` : 'Edit wells'}</h2>
          {!sel.size ? <p className="muted small">Select wells on the plate to assign sample, target, group and role.</p> : (
            <form key={[...sel].join()} className="stack" onSubmit={e => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              const patch: Partial<Well> = {}
              for (const k of ['sample', 'target', 'group'] as const) { const v = String(f.get(k) ?? ''); if (v !== common(k)) patch[k] = v.trim() }
              const role = String(f.get('role') ?? '')
              if (role && role !== common('role')) patch.role = role as Role
              const q = String(f.get('quantity') ?? '')
              if (q !== common('quantity')) patch.quantity = q === '' ? null : +q
              if (Object.keys(patch).length) assign(patch)
            }}>
              <div className="row gap wrap">
                <label className="field"><span>Sample</span><input name="sample" defaultValue={common('sample')} placeholder={selWells.length > 1 && !common('sample') ? 'mixed' : ''} list="dl-samples" /></label>
                <label className="field"><span>Target</span><input name="target" defaultValue={common('target')} placeholder={selWells.length > 1 && !common('target') ? 'mixed' : ''} list="dl-targets" /></label>
              </div>
              <div className="row gap wrap">
                <label className="field"><span>Biological group</span><input name="group" defaultValue={common('group')} placeholder={common('sample') ? gOf(common('sample')) : 'from sample name'} list="dl-groups" /></label>
                <label className="field"><span>Role</span><select name="role" defaultValue={common('role')}><option value="">{selWells.length ? 'mixed' : 'Sample'}</option>{ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
                <label className="field"><span>Std quantity</span><input name="quantity" type="number" step="any" min="0" defaultValue={common('quantity')} className="short" /></label>
              </div>
              <datalist id="dl-samples">{[...new Set(allWells.map(w => w.sample).filter(Boolean))].map(s => <option key={s} value={s} />)}</datalist>
              <datalist id="dl-targets">{[...new Set(allWells.map(w => w.target).filter(Boolean))].map(s => <option key={s} value={s} />)}</datalist>
              <datalist id="dl-groups">{[...new Set(allWells.filter(w => w.sample).map(w => gOf(w.sample)))].map(s => <option key={s} value={s} />)}</datalist>
              <div className="row gap-sm wrap">
                <button className="btn primary sm">Apply</button>
                <button type="button" className="btn ghost sm" onClick={() => exclude(true)}>Exclude from analysis</button>
                <button type="button" className="btn ghost sm" onClick={() => exclude(false)}>Include</button>
                <button type="button" className="btn danger-ghost sm" onClick={() => assign({ role: 'empty' })}>Mark empty</button>
              </div>
              {selWells.length > 0 && selWells.length <= 6 && <ul className="sel-list small">{selWells.map(w => <li key={w.well + w.target}><b>{w.well}</b> {w.sample || '–'} · <i>{w.target || '–'}</i> · {ROLE_LABEL[w.role]} · Cq {fmtCq(w.cq)}{w.tm != null ? ` · Tm ${w.tm}` : ''}</li>)}</ul>}
            </form>
          )}
        </div>
        <PasteLayout plate={plate} onApply={(field, map) => {
          const existing = new Set(plate.wells.map(w => w.well))
          const created: Well[] = [...map.keys()].filter(w => !existing.has(w)).map(w => ({ well: w, sample: '', target: '', role: 'unknown', cq: null }))
          const wells = [...plate.wells, ...created].map(w => {
            const v = map.get(w.well)
            if (v === undefined) return w
            if (field === 'cq') { const n = Number(v.replace(',', '.')); return { ...w, cq: /^(undetermined|nan|n\/a|-)$/i.test(v) ? null : isFinite(n) ? n : w.cq } }
            if (field === 'role') { const r = ROLES.find(x => x === v.toLowerCase() || ROLE_LABEL[x].toLowerCase() === v.toLowerCase()) ?? (/ntc/i.test(v) ? 'ntc' : /nrt|rt-/i.test(v) ? 'nrt' : /std|standard/i.test(v) ? 'standard' : 'unknown'); return { ...w, role: r } }
            return { ...w, [field]: v }
          })
          updatePlate({ ...plate, wells }, `Pasted ${map.size} ${field} values.`)
        }} />
      </div>

      <div className="card pad danger-zone">
        <h2 className="h4">Remove this plate</h2>
        <p className="muted small">Removes {plate.name} and its wells from the experiment. Snapshots are kept.</p>
        <button type="button" className="btn danger-ghost sm" onClick={async () => {
          if (!(await ask('Remove plate?', `${plate.name} and its ${plate.wells.length} wells are removed from this experiment. You can undo for a few seconds.`, 'Remove plate'))) return
          const prev = p.plates
          await saveProject({ ...p, plates: prev.filter(x => x.id !== plate.id) })
          toast(`Removed ${plate.name}.`, { undo: () => void saveProject({ ...p, plates: prev }) })
        }}>Remove plate</button>
      </div>
      <ImportWizard open={importing} onClose={() => setImporting(false)} p={p} />
    </div>
  )
}

function PasteLayout({ plate, onApply }: { plate: Plate; onApply(field: LayoutField, m: Map<string, string>): void }) {
  const [text, setText] = useState('')
  const [field, setField] = useState<LayoutField>('sample')
  const map = useMemo(() => parseLayout(text), [text])
  const { rows, cols } = plateDims(plate.format)
  const outside = [...map.keys()].filter(w => w.charCodeAt(0) - 65 >= rows || +w.slice(1) > cols)
  return (
    <div className="card pad stack">
      <h2 className="h4">Paste a layout from your spreadsheet</h2>
      <p className="muted small">Copy a block shaped like the plate ({rows} rows × {cols} columns), with or without the A–{String.fromCharCode(64 + rows)} and 1–{cols} labels, and paste it here.</p>
      <label className="field"><span>Fills</span><select value={field} onChange={e => setField(e.target.value as LayoutField)}><option value="sample">Sample names</option><option value="target">Targets</option><option value="group">Biological groups</option><option value="role">Roles (Sample, NTC, NRT, Standard)</option><option value="cq">Cq values</option></select></label>
      <textarea className="mono" rows={6} value={text} onChange={e => setText(e.target.value)} aria-label="Pasted plate layout" placeholder={'\t1\t2\t3\nA\tVehicle-1\tVehicle-1\tVehicle-1\nB\tTreated-1\tTreated-1\tTreated-1'} />
      <p className="small muted">{map.size ? `${map.size} wells will be filled${outside.length ? `; ${outside.length} fall outside a ${plate.format}-well plate` : ''}.` : 'Nothing pasted yet.'}</p>
      <div><button type="button" className="btn outline sm" disabled={!map.size || outside.length > 0} onClick={() => { onApply(field, map); setText('') }}>Apply to plate</button></div>
    </div>
  )
}
