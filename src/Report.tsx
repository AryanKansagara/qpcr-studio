import { useEffect, useMemo } from 'react'
import { methodsText, miqe } from './engine/qpcr.ts'
import { foldFigure } from './figure.ts'
import { CatLegend, PlateMap, roleLegend } from './PlateMap.tsx'
import { analysisOf } from './projectData.ts'
import { useProjects } from './store.ts'
import { fmtCq, fmtFold, fmtP, Link, NotFound } from './ui.tsx'

export default function Report({ id }: { id: string }) {
  const list = useProjects()
  const p = list?.find(x => x.id === id)
  useEffect(() => { if (p) document.title = `QC report · ${p.name}` }, [p?.name])
  const a = useMemo(() => (p ? analysisOf(p) : null), [p])
  if (list === null) return <div className="boot" role="status"><span className="spinner" /> Loading</div>
  if (!p || !a) return <NotFound />
  const checklist = miqe(p.plates, p.settings, p.meta, a)
  const fig = foldFigure(a.targets, { kind: 'bar', groups: a.groups, control: a.control, bg: '#ffffff', caption: true })
  const flagged = a.replicates.filter(r => r.flag !== 'ok')
  return (
    <div className="report">
      <div className="report-bar no-print">
        <Link href={`/app/p/${p.id}/qc`} className="btn ghost sm">Back to the experiment</Link>
        <button type="button" className="btn primary sm" onClick={() => print()}>Print or save as PDF</button>
      </div>
      <article className="report-page">
        <header className="report-head">
          <div><p className="eyebrow">Run QC report</p><h1>{p.name}</h1><p className="small">{p.plates.map(x => `${x.name}${x.runDate ? ` (${x.runDate})` : ''}`).join('; ')} · {p.meta.instrument || p.plates[0]?.instrument} · generated {new Date().toLocaleString()}</p></div>
          {p.sampleId && <span className="badge synthetic">Synthetic data</span>}
        </header>
        <section>
          <h2>Summary</h2>
          <table className="vt compact"><tbody>
            <tr><th>Wells analysed / excluded</th><td>{a.counts.wells} / {a.counts.excluded}</td><th>Method</th><td>{p.settings.method === 'pfaffl' ? 'Pfaffl, efficiency-corrected' : 'Livak ΔΔCq'}</td></tr>
            <tr><th>Replicate flags</th><td>{a.counts.outliers}</td><th>Reference genes</th><td>{p.settings.refs.join(' + ') || 'none'}</td></tr>
            <tr><th>NTC / NRT failures</th><td>{a.counts.contamFail}</td><th>Control group</th><td>{a.control}</td></tr>
            <tr><th>Melt flags</th><td>{a.counts.meltFlags}</td><th>MIQE items covered</th><td>{checklist.filter(i => i.status === 'pass').length} of {checklist.length}</td></tr>
          </tbody></table>
        </section>
        {p.plates.map(pl => (
          <section key={pl.id} className="avoid-break">
            <h2>Plate map · {pl.name}</h2>
            <PlateMap plate={pl} settings={p.settings} colorBy="role" flagged={new Set(a.replicates.filter(r => r.plateId === pl.id).flatMap(r => r.wells.filter(w => w.auto).map(w => w.well)))} label="cq" size={pl.format === 384 ? 'sm' : 'md'} />
            <CatLegend items={roleLegend()} />
          </section>
        ))}
        <section className="avoid-break">
          <h2>Flagged replicates</h2>
          {flagged.length ? <table className="vt compact"><thead><tr><th>Sample</th><th>Target</th><th>Wells</th><th>Mean</th><th>SD</th><th>Flag</th></tr></thead>
            <tbody>{flagged.map(r => <tr key={r.plateId + r.sample + r.target}><td>{r.sample}</td><td><i>{r.target}</i></td><td>{r.wells.map(w => `${w.well} ${fmtCq(w.cq)}${w.excluded ? ' (excl.)' : ''}`).join(', ')}</td><td>{fmtCq(r.mean)}</td><td>{r.sd?.toFixed(2) ?? '–'}</td><td>{r.flag}</td></tr>)}</tbody></table> : <p>None.</p>}
        </section>
        <section className="avoid-break">
          <h2>Controls and melt</h2>
          <ul className="checks">{a.contamination.map(c => <li key={c.plateId + c.well + c.target} className={c.status === 'pass' ? 'ok' : c.status === 'fail' ? 'bad' : 'info'}><b>{c.role.toUpperCase()} {c.well} · {c.target}</b> {c.cq === null ? 'Undetermined.' : c.note}</li>)}
            {a.melt.map(m => <li key={'m' + m.plateId + m.well} className="info"><b>Tm {m.well} · {m.target}</b> {m.tm.toFixed(1)} °C vs assay median {m.median.toFixed(1)} °C.</li>)}
            {!a.contamination.length && <li className="info">No NTC or NRT wells.</li>}</ul>
        </section>
        {a.curves.length > 0 && <section className="avoid-break"><h2>Standard curves</h2><table className="vt compact"><thead><tr><th>Target</th><th>Slope</th><th>Efficiency</th><th>R²</th><th>Range</th><th>Notes</th></tr></thead><tbody>{a.curves.map(c => <tr key={c.target}><td><i>{c.target}</i></td><td>{c.slope.toFixed(3)}</td><td>{(c.efficiency * 100).toFixed(1)}%</td><td>{c.r2.toFixed(4)}</td><td>{c.decades.toFixed(1)} log</td><td>{c.warnings.join(' ') || 'OK'}</td></tr>)}</tbody></table></section>}
        {a.stability && <section className="avoid-break"><h2>Reference-gene stability</h2><table className="vt compact"><thead><tr><th>Gene</th><th>geNorm M</th><th>NormFinder</th><th>BestKeeper ±Cq</th><th>Treatment shift</th></tr></thead><tbody>{a.stability.genorm.ranking.map(g => <tr key={g}><td><i>{g}</i></td><td>{a.stability!.genorm.m[g].toFixed(3)}</td><td>{a.stability!.normfinder?.stability[g].toFixed(3) ?? '–'}</td><td>{a.stability!.bestkeeper[g].sd.toFixed(2)}</td><td>{a.stability!.shift[g] ? a.stability!.shift[g].diff.toFixed(2) : '–'}</td></tr>)}</tbody></table>
          {a.stability.genorm.v.length > 0 && <p className="small">Pairwise variation: {a.stability.genorm.v.map(v => `${v.label} ${v.v.toFixed(3)}`).join(', ')}.</p>}</section>}
        {a.targets.length > 0 && <section className="avoid-break"><h2>Results</h2><div className="fig" dangerouslySetInnerHTML={{ __html: fig }} />
          <table className="vt compact"><thead><tr><th>Target</th><th>Comparison</th><th>Fold</th><th>95% CI</th><th>p</th><th>Test</th></tr></thead><tbody>{a.targets.flatMap(t => t.comparisons.map(c => <tr key={t.target + c.group + c.vs}><td><i>{t.target}</i></td><td>{c.group} vs {c.vs}</td><td>{fmtFold(c.fold)}</td><td>{fmtFold(c.foldLo)} to {fmtFold(c.foldHi)}</td><td>{fmtP(c.p)} {c.stars}</td><td>{c.test}</td></tr>))}</tbody></table></section>}
        <section className="avoid-break"><h2>MIQE checklist</h2><table className="vt compact"><tbody>{checklist.map(i => <tr key={i.id}><td>{i.status === 'pass' ? 'Covered' : i.status === 'warn' ? 'Check' : 'Missing'}</td><th>{i.label}</th><td>{i.detail}</td></tr>)}</tbody></table></section>
        <section><h2>Methods</h2><p className="methods">{methodsText(p.plates, p.settings, p.meta, a)}</p></section>
        <footer className="small muted">qPCR Studio · analysis computed in the browser. {p.sampleId ? 'Synthetic data for demonstration.' : ''}</footer>
      </article>
    </div>
  )
}
