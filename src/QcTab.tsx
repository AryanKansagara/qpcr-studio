import { useMemo, useState } from 'react'
import { miqe, wellKey, type Analysis, type Curve, type Replicate } from './engine/qpcr.ts'
import { setSettings, useFigColours } from './Project.tsx'
import { getProjects, saveProject, type Project } from './store.ts'
import { fmtCq, fmtP, Link, toast } from './ui.tsx'

/** Toggle a well: manual exclusion for normal wells, re-inclusion for auto-flagged ones. */
export function toggleWell(p: Project, plateId: string, well: string, auto: boolean) {
  const k = wellKey(plateId, well)
  const cur = p.settings.excluded[k]
  const excluded = cur === true || (auto && cur !== false)
  const next = { ...p.settings.excluded }
  if (excluded) { if (auto) next[k] = false; else delete next[k] } else { if (auto) delete next[k]; else next[k] = true }
  void setSettings(p, { excluded: next })
  toast(`${well} ${excluded ? 'included' : 'excluded'}.`, { undo: () => void setSettings(p, { excluded: p.settings.excluded }) })
}

const FLAG_TEXT: Record<Replicate['flag'], string> = { ok: 'OK', 'high-sd': 'High SD', outlier: 'Outlier excluded', partial: 'Partial amplification', 'no-amp': 'No amplification' }

export default function QcTab({ p, a }: { p: Project; a: Analysis }) {
  const flagged = a.replicates.filter(r => r.flag !== 'ok')
  const [onlyFlagged, setOnlyFlagged] = useState(flagged.length > 0)
  const reps = (onlyFlagged ? flagged : a.replicates).slice().sort((x, y) => (x.flag === 'ok' ? 1 : 0) - (y.flag === 'ok' ? 1 : 0) || x.target.localeCompare(y.target) || x.sample.localeCompare(y.sample))
  const checklist = useMemo(() => miqe(p.plates, p.settings, p.meta, a), [p, a])
  const plateName = (id: string) => p.plates.find(x => x.id === id)?.name ?? ''
  const multi = p.plates.length > 1
  return (
    <div className="stack-lg">
      <div className="tiles">
        <Tile label="Wells analysed" value={a.counts.wells} />
        <Tile label="Wells excluded" value={a.counts.excluded} tone={a.counts.excluded ? 'warn' : undefined} />
        <Tile label="Replicate flags" value={a.counts.outliers} tone={a.counts.outliers ? 'warn' : 'ok'} />
        <Tile label="NTC / NRT failures" value={a.counts.contamFail} tone={a.counts.contamFail ? 'bad' : 'ok'} />
        <Tile label="Melt flags" value={a.counts.meltFlags} tone={a.counts.meltFlags ? 'warn' : 'ok'} />
        <Tile label="MIQE items covered" value={`${checklist.filter(i => i.status === 'pass').length}/${checklist.length}`} />
      </div>

      <div className="card pad">
        <div className="row between wrap gap">
          <div><h2 className="h4">Technical replicates</h2><p className="muted small">Rule: {p.settings.outlier === 'sd' ? `SD above ${p.settings.sdThreshold} cycles flags the well furthest from the median (needs 3+ replicates)` : p.settings.outlier === 'grubbs' ? 'Grubbs test, alpha 0.05 (at n = 3 it can only flag extreme wells)' : 'no automatic flagging'}. Click a Cq to exclude or restore it.</p></div>
          <label className="check"><input type="checkbox" checked={onlyFlagged} onChange={e => setOnlyFlagged(e.target.checked)} /> Flagged only ({flagged.length})</label>
        </div>
        <div className="table-wrap">
          <table className="vt compact">
            <thead><tr>{multi && <th>Plate</th>}<th>Sample</th><th>Target</th><th>Wells (Cq)</th><th className="num">Mean</th><th className="num">SD</th><th>Status</th></tr></thead>
            <tbody>
              {reps.map(r => (
                <tr key={r.plateId + r.sample + r.target} className={r.flag !== 'ok' ? 'flagged' : ''}>
                  {multi && <td className="small">{plateName(r.plateId)}</td>}
                  <th scope="row">{r.sample}<div className="muted small">{r.group}</div></th><td><i>{r.target}</i></td>
                  <td><div className="cq-chips">{r.wells.map(w => (
                    <button key={w.well} type="button" className={`cq-chip${w.excluded ? ' out' : ''}${w.auto ? ' auto' : ''}`} disabled={w.cq === null} aria-pressed={!w.excluded} aria-label={`${w.well} Cq ${fmtCq(w.cq)}${w.excluded ? ', excluded' : ''}. Toggle.`} onClick={() => toggleWell(p, r.plateId, w.well, w.auto)}>
                      <small>{w.well}</small>{fmtCq(w.cq)}
                    </button>))}
                  </div></td>
                  <td className="num">{fmtCq(r.mean)}</td><td className="num">{r.sd === null ? '–' : r.sd.toFixed(2)}</td>
                  <td><span className={`tag ${r.flag === 'ok' ? 'ok' : r.flag === 'no-amp' ? 'bad' : 'warn'}`}>{FLAG_TEXT[r.flag]}</span></td>
                </tr>
              ))}
              {!reps.length && <tr><td colSpan={7} className="muted center">No flagged replicates.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card pad">
        <h2 className="h4">NTC and no-RT controls</h2>
        <p className="muted small">An NTC fails when it amplifies within {p.settings.ntcWindow} cycles of the latest sample for that assay; a no-RT fails within {p.settings.ntcWindow} cycles of the matching RT+ sample. A Tm more than 2 °C from the product suggests primer-dimer.</p>
        {a.contamination.length ? (
          <ul className="checks">{a.contamination.map(c => (
            <li key={c.plateId + c.well + c.target} className={c.status === 'pass' ? 'ok' : c.status === 'fail' ? 'bad' : 'info'}>
              <b>{c.role.toUpperCase()} {c.well} · <i>{c.target}</i>{multi ? ` · ${plateName(c.plateId)}` : ''}</b> {c.cq === null ? 'Undetermined.' : `Cq ${c.cq.toFixed(2)}${c.tm != null ? `, Tm ${c.tm.toFixed(1)} °C` : ''}.`} {c.cq !== null && c.note}
            </li>))}
          </ul>
        ) : <p className="warn-t small">No NTC or NRT wells on these plates. Mark them in the plate map so contamination can be checked.</p>}
      </div>

      <div className="card pad">
        <h2 className="h4">Melt curve consistency</h2>
        <p className="muted small">Wells whose Tm is more than ±{p.settings.tmTolerance} °C from the assay median. A second product or primer-dimer shows up here.</p>
        {a.melt.length ? (
          <table className="vt compact"><thead><tr><th>Well</th><th>Sample</th><th>Target</th><th className="num">Tm</th><th className="num">Assay median</th><th className="num">Δ</th></tr></thead>
            <tbody>{a.melt.map(m => <tr key={m.plateId + m.well}><th scope="row">{m.well}</th><td>{m.sample}</td><td><i>{m.target}</i></td><td className="num">{m.tm.toFixed(1)}</td><td className="num">{m.median.toFixed(1)}</td><td className="num warn-t">{m.delta > 0 ? '+' : ''}{m.delta.toFixed(1)}</td></tr>)}</tbody></table>
        ) : <p className={p.plates.some(x => x.wells.some(w => w.tm != null)) ? 'fav-t small' : 'muted small'}>{p.plates.some(x => x.wells.some(w => w.tm != null)) ? 'Every well sits within tolerance of its assay Tm.' : 'No Tm values imported. Include the melt peak column (or import a Tm column) for SYBR assays.'}</p>}
      </div>

      <Curves p={p} a={a} />

      <div className="card pad" id="miqe">
        <h2 className="h4">MIQE checklist</h2>
        <p className="muted small">Derived from the plates and the details in <Link href={`/app/p/${p.id}/setup`}>Setup</Link>. Based on the essential items in Bustin et al., Clin Chem 2009 (MIQE) and the 2025 MIQE 2.0 update; not a substitute for the full checklist.</p>
        <ul className="miqe">{checklist.map(i => <li key={i.id} className={i.status}><span className="miqe-dot" aria-hidden="true" /><div><b>{i.label}</b> <span className="muted small">{i.section}</span><div className="small">{i.detail}</div></div><span className={`tag ${i.status === 'pass' ? 'ok' : i.status === 'warn' ? 'warn' : 'bad'}`}>{i.status === 'pass' ? 'Covered' : i.status === 'warn' ? 'Check' : 'Missing'}</span></li>)}</ul>
      </div>
    </div>
  )
}

const Tile = ({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) => <div className={`tile ${tone ?? ''}`}><b>{value}</b><span>{label}</span></div>

function Curves({ p, a }: { p: Project; a: Analysis }) {
  const others = getProjects().filter(x => x.id !== p.id)
  const [dest, setDest] = useState('')
  if (!a.curves.length) return (
    <div className="card pad"><h2 className="h4">Standard curves</h2><p className="muted small">No standards on these plates. Efficiencies come from {Object.values(a.efficiencies).some(e => e.source === 'manual') ? 'values entered in Setup' : 'the 100% assumption'}; run a dilution series (for example the synthetic validation experiment) to measure them.</p></div>
  )
  const copy = async () => {
    const d = getProjects().find(x => x.id === dest)
    if (!d) return
    const eff = { ...d.settings.efficiencies, ...Object.fromEntries(a.curves.map(c => [c.target, +(c.efficiency * 100).toFixed(1)])) }
    await saveProject({ ...d, settings: { ...d.settings, efficiencies: eff } })
    toast(`Efficiencies copied to ${d.name}.`, { tone: 'ok' })
  }
  return (
    <div className="card pad">
      <div className="row between wrap gap">
        <div><h2 className="h4">Standard curves</h2><p className="muted small">Cq against log10 quantity. E = 10^(-1/slope) - 1; acceptable 90 to 110% with R² ≥ 0.98 over at least 3 decades.</p></div>
        {others.length > 0 && <div className="row gap-sm"><label className="field inline"><span>Use in</span><select value={dest} onChange={e => setDest(e.target.value)}><option value="">Choose experiment</option>{others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label><button type="button" className="btn ghost sm" disabled={!dest} onClick={() => void copy()}>Copy efficiencies</button></div>}
      </div>
      <div className="curve-grid">{a.curves.map(c => <CurveCard key={c.target} c={c} manual={p.settings.efficiencies[c.target]} />)}</div>
    </div>
  )
}

function CurveCard({ c, manual }: { c: Curve; manual?: number }) {
  const cols = useFigColours()
  const W = 260, H = 170, L = 34, R = 8, T = 10, B = 26
  const xs = c.points.map(p => p.log10q), ys = c.points.map(p => p.cq)
  const x0 = Math.min(...xs) - 0.3, x1 = Math.max(...xs) + 0.3, y0 = Math.floor(Math.min(...ys) - 1), y1 = Math.ceil(Math.max(...ys) + 1)
  const X = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R), Y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B)
  const ok = !c.warnings.length
  return (
    <figure className={`curve ${ok ? '' : 'warn'}`}>
      <figcaption><i>{c.target}</i> <span className={`tag ${ok ? 'ok' : 'warn'}`}>E {(c.efficiency * 100).toFixed(1)}%</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${c.target} standard curve, slope ${c.slope.toFixed(3)}, efficiency ${(c.efficiency * 100).toFixed(1)}%, R² ${c.r2.toFixed(4)}`}>
        <line x1={L} x2={L} y1={T} y2={H - B} stroke={cols.grid} /><line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={cols.grid} />
        {[y0, (y0 + y1) / 2, y1].map(v => <text key={v} x={L - 4} y={Y(v) + 4} fontSize="10" textAnchor="end" fill={cols.muted}>{Math.round(v)}</text>)}
        {[...new Set(xs)].map(v => <text key={v} x={X(v)} y={H - 10} fontSize="10" textAnchor="middle" fill={cols.muted}>{v.toFixed(0)}</text>)}
        <line x1={X(x0)} x2={X(x1)} y1={Y(c.intercept + c.slope * x0)} y2={Y(c.intercept + c.slope * x1)} stroke="#0072B2" strokeWidth="1.5" />
        {c.points.map((p, i) => <circle key={i} cx={X(p.log10q)} cy={Y(p.cq)} r="3" fill="#E69F00" stroke={cols.ink} strokeWidth="0.6" />)}
      </svg>
      <dl className="curve-stats"><div><dt>Slope</dt><dd>{c.slope.toFixed(3)}</dd></div><div><dt>R²</dt><dd>{c.r2.toFixed(4)}</dd></div><div><dt>Range</dt><dd>{c.decades.toFixed(1)} log</dd></div><div><dt>n</dt><dd>{c.n}</dd></div></dl>
      {c.warnings.map(w => <p key={w} className="warn-t small">{w}</p>)}
      {manual ? <p className="muted small">Overridden by {manual}% entered in Setup.</p> : null}
    </figure>
  )
}

// ---------- Reference genes ----------

export function RefsTab({ p, a }: { p: Project; a: Analysis }) {
  const cols = useFigColours()
  const targets = [...new Set(p.plates.flatMap(x => x.wells.filter(w => w.role === 'unknown').map(w => w.target)).filter(Boolean))]
  const st = a.stability
  const setCand = (g: string, on: boolean) => {
    const candidates = on ? [...p.settings.candidates, g] : p.settings.candidates.filter(x => x !== g)
    void setSettings(p, { candidates, refs: p.settings.refs.filter(r => candidates.includes(r) || !on) })
  }
  const setRef = (g: string, on: boolean) => void setSettings(p, { refs: on ? [...p.settings.refs, g] : p.settings.refs.filter(x => x !== g), candidates: on && !p.settings.candidates.includes(g) ? [...p.settings.candidates, g] : p.settings.candidates })
  const rec = st?.genorm.recommended ?? []
  const same = rec.length > 0 && rec.length === p.settings.refs.length && rec.every(g => p.settings.refs.includes(g))
  const maxM = st ? Math.max(1, ...Object.values(st.genorm.m)) : 1
  return (
    <div className="stack-lg">
      <div className="card pad">
        <h2 className="h4">Candidates and normalisers</h2>
        <p className="muted small">Candidates are evaluated for stability. Normalisers are the genes whose geometric mean is used for ΔCq.</p>
        <div className="table-wrap"><table className="vt compact"><thead><tr><th>Gene</th><th>Candidate</th><th>Use to normalise</th></tr></thead>
          <tbody>{targets.map(g => <tr key={g}><th scope="row"><i>{g}</i></th><td><input type="checkbox" aria-label={`${g} is a candidate`} checked={p.settings.candidates.includes(g)} onChange={e => setCand(g, e.target.checked)} /></td><td><input type="checkbox" aria-label={`Normalise to ${g}`} checked={p.settings.refs.includes(g)} onChange={e => setRef(g, e.target.checked)} /></td></tr>)}</tbody></table></div>
      </div>
      {!st ? <div className="card pad"><p className="muted">Mark at least two candidates to evaluate stability (three for pairwise variation and NormFinder).</p></div> : <>
        <div className={`card pad recommend ${same ? 'ok' : ''}`}>
          <div className="row between wrap gap">
            <div>
              <h2 className="h4">Recommendation</h2>
              <p>geNorm ranks <b>{st.genorm.ranking.join(' > ')}</b> (most to least stable){st.normfinder ? <>; NormFinder ranks <b>{st.normfinder.ranking.join(' > ')}</b></> : ''}. Use the geometric mean of <b>{rec.join(' + ')}</b>.</p>
              {Object.entries(st.shift).filter(([, s]) => Math.abs(s.diff) >= 0.5).map(([g, s]) => <p key={g} className="warn-t small"><i>{g}</i> shifts {s.diff > 0 ? '+' : ''}{s.diff.toFixed(2)} Cq in {s.groupA} vs {s.groupB} (Welch p = {fmtP(s.p)}). A reference gene that responds to treatment biases every fold change.</p>)}
            </div>
            {same ? <span className="tag ok">In use</span> : <button type="button" className="btn primary sm" onClick={() => { const prev = p.settings.refs; void setSettings(p, { refs: rec }); toast(`Normalising to ${rec.join(' + ')}.`, { undo: () => void setSettings(p, { refs: prev }) }) }}>Use {rec.join(' + ')}</button>}
          </div>
        </div>
        <div className="grid-2">
          <div className="card pad">
            <h3 className="h5">geNorm M</h3>
            <p className="muted small">Mean pairwise variation of each gene with all others, over {st.samples} samples. Below 0.5 is stable for homogeneous samples (cell lines), below 1.0 for tissues.</p>
            <svg viewBox={`0 0 320 ${st.genes.length * 30 + 26}`} className="hbar" role="img" aria-label="geNorm M values">
              <line x1={72 + (0.5 / maxM) * 200} x2={72 + (0.5 / maxM) * 200} y1="0" y2={st.genes.length * 30} stroke={cols.muted} strokeDasharray="3 3" />
              {st.genorm.ranking.map((g, i) => { const m = st.genorm.m[g]; const w = (m / maxM) * 200; return <g key={g} transform={`translate(0 ${i * 30})`}><text x="64" y="18" textAnchor="end" fontSize="12" fontStyle="italic" fill={cols.ink}>{g}</text><rect x="72" y="5" width={w} height="18" rx="2" fill={m < 0.5 ? '#009E73' : m < 1 ? '#E69F00' : '#D55E00'} /><text x={78 + Math.max(w, (0.5 / maxM) * 200 + 4)} y="18" fontSize="11" fill={cols.ink}>{m.toFixed(3)}</text></g> })}
              <text x={72 + (0.5 / maxM) * 200} y={st.genes.length * 30 + 16} fontSize="10" textAnchor="middle" fill={cols.muted}>0.5</text>
            </svg>
            {st.genorm.v.length > 0 && <>
              <h3 className="h5">Pairwise variation</h3>
              <ul className="vlist">{st.genorm.v.map(v => <li key={v.label}><b>{v.label}</b> {v.v.toFixed(3)} <span className={v.v < 0.15 ? 'fav-t' : 'warn-t'}>{v.v < 0.15 ? `< 0.15: ${v.label.slice(1).split('/')[0]} genes are enough` : '≥ 0.15: adding the next gene changes the normaliser'}</span></li>)}</ul>
              {st.genorm.v.every(v => v.v >= 0.15) && <p className="muted small">No V below 0.15. Here that comes from adding an unstable gene, not from too few genes: check its M and treatment shift before including it.</p>}
            </>}
          </div>
          <div className="card pad">
            <h3 className="h5">NormFinder-style stability</h3>
            {st.normfinder ? <>
              <p className="muted small">Model-based: combines intragroup variance with intergroup variation (shrunk towards zero), across {st.normfinder.groups} group{st.normfinder.groups === 1 ? '' : 's'}. Lower is better.{st.normfinder.note ? ' ' + st.normfinder.note : ''}</p>
              <table className="vt compact"><thead><tr><th>Rank</th><th>Gene</th><th className="num">Stability</th></tr></thead><tbody>{st.normfinder.ranking.map((g, i) => <tr key={g}><td>{i + 1}</td><th scope="row"><i>{g}</i></th><td className="num">{st.normfinder!.stability[g].toFixed(3)}</td></tr>)}</tbody></table>
            </> : <p className="muted small">Needs three or more candidates.</p>}
            <h3 className="h5">BestKeeper-style spread</h3>
            <p className="muted small">Raw Cq mean absolute deviation (BestKeeper’s ±Cq; above 1 is unstable), CV and correlation with the BestKeeper index.</p>
            <table className="vt compact"><thead><tr><th>Gene</th><th className="num">Mean Cq</th><th className="num">±Cq</th><th className="num">CV %</th><th className="num">r</th><th className="num">Treatment shift</th></tr></thead>
              <tbody>{st.genes.map(g => { const b = st.bestkeeper[g], s = st.shift[g]; return <tr key={g}><th scope="row"><i>{g}</i></th><td className="num">{b.mean.toFixed(2)}</td><td className={`num ${b.sd > 1 ? 'warn-t' : ''}`}>{b.sd.toFixed(2)}</td><td className="num">{b.cv.toFixed(2)}</td><td className="num">{b.r.toFixed(2)}</td><td className={`num ${s && Math.abs(s.diff) >= 0.5 ? 'warn-t' : ''}`}>{s ? `${s.diff > 0 ? '+' : ''}${s.diff.toFixed(2)}` : '–'}</td></tr> })}</tbody></table>
          </div>
        </div>
        <details className="card pad more">
          <summary>geNorm stepwise exclusion</summary>
          <table className="vt compact"><thead><tr><th>Step</th>{st.genes.map(g => <th key={g} className="num"><i>{g}</i></th>)}</tr></thead>
            <tbody>{st.genorm.steps.map((s, i) => <tr key={i}><td>{i + 1}</td>{st.genes.map(g => <td key={g} className="num">{s.m[g] !== undefined ? s.m[g].toFixed(3) : '–'}</td>)}</tr>)}</tbody></table>
          <p className="muted small">Methods: <Link href="/docs#stability">how stability is computed</Link>.</p>
        </details>
      </>}
    </div>
  )
}
