import { groupOf, type Analysis, type Meta, type Settings } from './engine/qpcr.ts'
import { setSettings } from './Project.tsx'
import { saveProject, type Project, type Registry } from './store.ts'
import { STATUS_LABEL } from './Workspace.tsx'

export default function Setup({ p, a }: { p: Project; a: Analysis }) {
  const s = p.settings
  const set = (patch: Partial<Settings>) => void setSettings(p, patch)
  const setMeta = (patch: Partial<Meta>) => void saveProject({ ...p, meta: { ...p.meta, ...patch } })
  const setReg = (patch: Partial<Registry>) => void saveProject({ ...p, registry: { ...p.registry, ...patch } })
  const allWells = p.plates.flatMap(x => x.wells)
  const targets = [...new Set(allWells.filter(w => w.role !== 'empty').map(w => w.target).filter(Boolean))]
  const samples = [...new Set(allWells.filter(w => w.role === 'unknown' || w.role === 'calibrator').map(w => w.sample).filter(Boolean))]
  const groups = a.groups
  const num = (v: string, d: number) => (isFinite(+v) && v !== '' ? +v : d)

  return (
    <div className="stack-lg setup">
      <div className="card pad stack">
        <h2 className="h4">Quantification</h2>
        <div className="row gap wrap">
          <label className="field"><span>Method</span><select value={s.method} onChange={e => set({ method: e.target.value as Settings['method'] })}><option value="pfaffl">Pfaffl: efficiency-corrected</option><option value="livak">Livak ΔΔCq: assumes 100%</option></select></label>
          <label className="field"><span>Control group</span><select value={a.control} onChange={e => set({ control: e.target.value })}>{groups.map(g => <option key={g}>{g}</option>)}</select></label>
          <label className="field"><span>Inter-run calibrator sample</span><select value={s.calibrator} onChange={e => set({ calibrator: e.target.value })}><option value="">None</option>{samples.map(x => <option key={x}>{x}</option>)}</select></label>
        </div>
        {s.calibrator && p.plates.length < 2 && <p className="muted small">The calibrator is applied once there are two or more plates.</p>}
        <h3 className="h5">Amplification efficiency per assay</h3>
        <p className="muted small">Leave blank to use the standard curve on these plates, or 100% if there is none. Values are in percent.</p>
        <div className="table-wrap"><table className="vt compact"><thead><tr><th>Target</th><th>Entered (%)</th><th>In use</th><th>Source</th></tr></thead>
          <tbody>{targets.map(t => <tr key={t}><th scope="row"><i>{t}</i></th>
            <td><input type="number" className="short" min={50} max={150} step={0.1} aria-label={`${t} efficiency percent`} defaultValue={s.efficiencies[t] ?? ''} onBlur={e => { const v = e.target.value; const eff = { ...s.efficiencies }; if (v === '') delete eff[t]; else eff[t] = +v; set({ efficiencies: eff }) }} /></td>
            <td className="num">{a.efficiencies[t] ? `${(a.efficiencies[t].e * 100).toFixed(1)}%` : '–'}</td><td className="small muted">{a.efficiencies[t]?.source === 'manual' ? 'entered' : a.efficiencies[t]?.source === 'curve' ? 'standard curve' : 'assumed 100%'}</td></tr>)}</tbody></table></div>
      </div>

      <div className="card pad stack">
        <h2 className="h4">Statistics and QC rules</h2>
        <div className="row gap wrap">
          <label className="field"><span>Test</span><select value={s.test} onChange={e => set({ test: e.target.value as Settings['test'] })}><option value="parametric">Welch t (2 groups) / ANOVA</option><option value="nonparametric">Mann-Whitney U vs control</option></select></label>
          <label className="field"><span>Post-hoc (3+ groups)</span><select value={s.posthoc} onChange={e => set({ posthoc: e.target.value as Settings['posthoc'] })} disabled={s.test !== 'parametric'}><option value="dunnett">Dunnett vs control</option><option value="tukey">Tukey HSD (all pairs)</option></select></label>
          <label className="field"><span>Outlier rule</span><select value={s.outlier} onChange={e => set({ outlier: e.target.value as Settings['outlier'] })}><option value="sd">Replicate SD threshold</option><option value="grubbs">Grubbs test</option><option value="none">None (manual only)</option></select></label>
          <label className="field"><span>SD threshold (cycles)</span><input type="number" className="short" min={0.05} step={0.05} defaultValue={s.sdThreshold} onBlur={e => set({ sdThreshold: num(e.target.value, s.sdThreshold) })} /></label>
          <label className="field"><span>NTC window (cycles)</span><input type="number" className="short" min={1} step={0.5} defaultValue={s.ntcWindow} onBlur={e => set({ ntcWindow: num(e.target.value, s.ntcWindow) })} /></label>
          <label className="field"><span>Tm tolerance (°C)</span><input type="number" className="short" min={0.1} step={0.1} defaultValue={s.tmTolerance} onBlur={e => set({ tmTolerance: num(e.target.value, s.tmTolerance) })} /></label>
        </div>
        {s.test === 'nonparametric' && <p className="warn-t small">With 3 replicates per group, the smallest possible two-sided Mann-Whitney p is 0.10, so nothing can reach 0.05. Use it only with 4 or more per group.</p>}
      </div>

      <div className="card pad stack">
        <h2 className="h4">Samples and biological groups</h2>
        <p className="muted small">Groups are taken from the export (Biological Set Name, group column) or guessed from names like “Treated-2”. Override here.</p>
        <div className="table-wrap"><table className="vt compact"><thead><tr><th>Sample</th><th>Group</th></tr></thead>
          <tbody>{samples.map(x => <tr key={x}><th scope="row">{x}</th><td><input list="setup-groups" aria-label={`Group for ${x}`} defaultValue={groupOf(x, s, allWells)} key={groupOf(x, s, allWells)} onBlur={e => { const v = e.target.value.trim(); if (v && v !== groupOf(x, s, allWells)) set({ groups: { ...s.groups, [x]: v } }) }} /></td></tr>)}</tbody></table></div>
        <datalist id="setup-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
        {groups.length > 1 && <label className="field"><span>Group order in figures</span><input defaultValue={groups.join(', ')} key={groups.join()} onBlur={e => set({ groupOrder: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} /></label>}
      </div>

      <div className="card pad stack">
        <h2 className="h4">MIQE details</h2>
        <p className="muted small">Used for the checklist and the methods paragraph.</p>
        <div className="row gap wrap">
          <label className="field grow"><span>Instrument</span><input defaultValue={p.meta.instrument} onBlur={e => setMeta({ instrument: e.target.value })} placeholder="Bio-Rad CFX96 Touch" /></label>
          <label className="field"><span>Chemistry</span><select value={p.meta.chemistry} onChange={e => setMeta({ chemistry: e.target.value as Meta['chemistry'] })}><option value="">Not set</option><option value="SYBR">SYBR Green / intercalating dye</option><option value="probe">Hydrolysis probe (TaqMan)</option></select></label>
          <label className="field grow"><span>Organism / sample type</span><input defaultValue={p.meta.organism} onBlur={e => setMeta({ organism: e.target.value })} /></label>
        </div>
        <label className="field"><span>RNA quality</span><input defaultValue={p.meta.rnaQuality} onBlur={e => setMeta({ rnaQuality: e.target.value })} placeholder="RIN 8.5 to 9.4 (Bioanalyzer); A260/280 2.0" /></label>
        <label className="field"><span>Reverse transcription</span><input defaultValue={p.meta.rtProtocol} onBlur={e => setMeta({ rtProtocol: e.target.value })} placeholder="1 µg total RNA, iScript, random hexamers + oligo(dT), 20 µL" /></label>
        <h3 className="h5">Primers</h3>
        <div className="table-wrap"><table className="vt compact primers"><thead><tr><th>Target</th><th>Forward 5′–3′</th><th>Reverse 5′–3′</th><th>Amplicon</th></tr></thead>
          <tbody>{targets.map(t => { const pr = p.meta.primers[t] ?? { fwd: '', rev: '', amplicon: '' }; const up = (k: keyof typeof pr, v: string) => setMeta({ primers: { ...p.meta.primers, [t]: { ...pr, [k]: v.trim() } } }); return <tr key={t}><th scope="row"><i>{t}</i></th>
            <td><input className="mono" aria-label={`${t} forward primer`} defaultValue={pr.fwd} onBlur={e => up('fwd', e.target.value)} /></td>
            <td><input className="mono" aria-label={`${t} reverse primer`} defaultValue={pr.rev} onBlur={e => up('rev', e.target.value)} /></td>
            <td><input className="short" aria-label={`${t} amplicon length`} defaultValue={pr.amplicon} onBlur={e => up('amplicon', e.target.value)} placeholder="120 bp" /></td></tr> })}</tbody></table></div>
        <label className="field"><span>Notes</span><textarea rows={3} defaultValue={p.meta.notes} onBlur={e => setMeta({ notes: e.target.value })} /></label>
      </div>

      <div className="card pad stack">
        <h2 className="h4">Registry</h2>
        <div className="row gap wrap">
          <label className="field"><span>Status</span><select value={p.registry.status} onChange={e => setReg({ status: e.target.value as Registry['status'] })}>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field"><span>Owner</span><input defaultValue={p.registry.owner} onBlur={e => setReg({ owner: e.target.value })} /></label>
          <label className="field"><span>Started</span><input type="date" defaultValue={p.registry.started} onBlur={e => setReg({ started: e.target.value })} /></label>
          <label className="field grow"><span>Tags</span><input defaultValue={p.registry.tags} onBlur={e => setReg({ tags: e.target.value })} placeholder="project, cell line, notebook page" /></label>
        </div>
      </div>
    </div>
  )
}
