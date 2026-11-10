import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { methodsText, miqe, type Analysis, type Settings } from './engine/qpcr.ts'
import { resultsCsv, resultsXlsx, samplesCsv, slug } from './exports.ts'
import { foldFigure, svgToPng } from './figure.ts'
import { analysisOf, makeSnapshot } from './projectData.ts'
import { saveProject, useProjects, type Project, type Snapshot } from './store.ts'
import { deleteSnapshotCloud } from './sync.ts'
import { CopyButton, download, Empty, fmtDate, fmtFold, fmtP, go, Link, NotFound, SyntheticBadge, toast, useDark, isTyping } from './ui.tsx'

const PlateTab = lazy(() => import('./PlateTab.tsx'))
const QcTab = lazy(() => import('./QcTab.tsx'))
const RefsTab = lazy(() => import('./QcTab.tsx').then(m => ({ default: m.RefsTab })))
const SetupTab = lazy(() => import('./Setup.tsx'))

const TABS = [['results', 'Results'], ['plate', 'Plates'], ['qc', 'QC'], ['refs', 'Reference genes'], ['history', 'History'], ['setup', 'Setup']] as const

export const setSettings = (p: Project, patch: Partial<Settings>) => saveProject({ ...p, settings: { ...p.settings, ...patch } })

export default function ProjectView({ id, tab }: { id: string; tab: string }) {
  const list = useProjects()
  const p = list?.find(x => x.id === id)
  useEffect(() => { if (p) document.title = `${p.name} · qPCR Studio` }, [p?.name])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      const i = Number(e.key) - 1
      if (i >= 0 && i < TABS.length) go(`/app/p/${id}/${TABS[i][0]}`, { keepScroll: true })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [id])
  if (list === null) return <div className="boot" role="status"><span className="spinner" /> Loading</div>
  if (!p) return <NotFound />
  const a = analysisOf(p)
  const active = TABS.some(t => t[0] === tab) ? tab : 'results'
  const issues = a.counts.contamFail + a.counts.outliers + a.counts.meltFlags
  return (
    <section className="page wide">
      <div className="proj-head">
        <div>
          <p className="eyebrow"><Link href="/app">Experiments</Link> / {p.registry.status}</p>
          <h1 className="proj-title">
            <input aria-label="Experiment name" size={Math.min(48, Math.max(8, p.name.length + 1))} defaultValue={p.name} key={p.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== p.name) void saveProject({ ...p, name: v }) }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
            {p.sampleId && <SyntheticBadge />}
          </h1>
          <p className="muted small">{p.plates.length} plate{p.plates.length === 1 ? '' : 's'} · {a.counts.wells} wells · {a.samples.length} samples · {p.settings.method === 'pfaffl' ? 'Pfaffl (efficiency-corrected)' : 'Livak ΔΔCq'} · refs {p.settings.refs.join(' + ') || 'not set'}</p>
        </div>
        <div className="row gap-sm wrap">
          <button type="button" className="btn ghost sm" disabled={!p.plates.length} onClick={() => { void saveProject({ ...p, snapshots: [...p.snapshots, makeSnapshot(p, a, `Snapshot ${new Date().toLocaleDateString()}`)] }); toast('Snapshot saved to History.', { tone: 'ok' }) }}>Save snapshot</button>
          <Link href={`/app/p/${p.id}/report`} className="btn outline sm">Printable QC report</Link>
        </div>
      </div>
      {p.dataMissing && <div className="banner warn">The wells for this experiment were too large to sync and are not on this device. Settings, metadata and snapshots are here; re-import the plate to analyse.</div>}
      <nav className="tabs" aria-label="Experiment sections">
        {TABS.map(([k, l], i) => <Link key={k} href={`/app/p/${p.id}/${k}`} aria-current={active === k ? 'page' : undefined} title={`Shortcut: ${i + 1}`}>{l}{k === 'qc' && issues > 0 && <span className="count">{issues}</span>}</Link>)}
      </nav>
      <Suspense fallback={<div className="boot" role="status"><span className="spinner" /> Loading</div>}>
        {!p.plates.length && active !== 'plate' && active !== 'setup' ? (
          <Empty title="No plates in this experiment yet">
            <p className="muted">Import a results export from your instrument, then check the plate map.</p>
            <div className="row gap center-x wrap"><Link href={`/app/p/${p.id}/plate?import=1`} className="btn primary">Import a plate</Link><Link href="/docs" className="btn outline">How to export</Link></div>
          </Empty>
        ) : <>
          {active === 'results' && <Results p={p} a={a} />}
          {active === 'plate' && <PlateTab p={p} a={a} />}
          {active === 'qc' && <QcTab p={p} a={a} />}
          {active === 'refs' && <RefsTab p={p} a={a} />}
          {active === 'history' && <History p={p} />}
          {active === 'setup' && <SetupTab p={p} a={a} />}
        </>}
      </Suspense>
    </section>
  )
}

export function useFigColours() {
  const dark = useDark()
  return dark ? { ink: '#f5f2ee', muted: '#a8a5a0', grid: '#363534' } : { ink: '#171615', muted: '#807d78', grid: '#dddad4' }
}

function Results({ p, a }: { p: Project; a: Analysis }) {
  const [kind, setKind] = useState<'bar' | 'dot'>(() => (localStorage.getItem('qpcr-studio.fig') as 'bar' | 'dot') || 'bar')
  const [hidden, setHidden] = useState<string[]>([])
  const cols = useFigColours()
  const shown = a.targets.filter(t => !hidden.includes(t.target))
  const opts = { kind, groups: a.groups, control: a.control }
  const svg = useMemo(() => foldFigure(shown, { ...opts, ...cols, width: 360 }), [shown, kind, cols, a])
  const exportSvg = () => foldFigure(shown, { ...opts, bg: '#ffffff', title: p.name, caption: true })
  const methods = useMemo(() => methodsText(p.plates, p.settings, p.meta, a), [p, a])
  const checklist = useMemo(() => miqe(p.plates, p.settings, p.meta, a), [p, a])
  const missing = checklist.filter(i => i.status !== 'pass').length
  const fails = a.contamination.filter(c => c.status === 'fail')
  const name = slug(p.name)

  return (
    <div className="stack-lg">
      {(a.warnings.length > 0 || fails.length > 0) && (
        <div className="banner warn" role="status">
          <ul>
            {fails.map(c => <li key={c.plateId + c.well}><b>{c.role.toUpperCase()} {c.well} ({c.target})</b>: {c.note} <Link href={`/app/p/${p.id}/qc`}>Review</Link></li>)}
            {a.warnings.map(w => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}
      <div className="card pad">
        <div className="row between wrap gap">
          <div>
            <h2 className="h4">Relative expression vs {a.control || 'control'}</h2>
            <p className="muted small">Normalised to {p.settings.refs.join(' + ') || '(no reference)'}{p.settings.method === 'pfaffl' ? ', efficiency-corrected' : ', assuming 100% efficiency'}. Statistics on ΔCq.</p>
          </div>
          <div className="row gap-sm wrap">
            <div className="seg" role="group" aria-label="Plot type">
              {(['bar', 'dot'] as const).map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); localStorage.setItem('qpcr-studio.fig', k) }}>{k === 'bar' ? 'Bar' : 'Dot'}</button>)}
            </div>
            <button type="button" className="btn ghost sm" onClick={() => download(`${name}-figure.svg`, exportSvg(), 'image/svg+xml')}>SVG</button>
            <button type="button" className="btn ghost sm" onClick={async () => download(`${name}-figure.png`, await svgToPng(exportSvg()))}>PNG</button>
          </div>
        </div>
        {a.targets.length > 1 && (
          <div className="chips" role="group" aria-label="Targets shown">
            {a.targets.map(t => <label key={t.target} className="chip"><input type="checkbox" checked={!hidden.includes(t.target)} onChange={e => setHidden(h => e.target.checked ? h.filter(x => x !== t.target) : [...h, t.target])} /><i>{t.target}</i></label>)}
          </div>
        )}
        {shown.length ? <div className="fig main-fig" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="muted">{a.targets.length ? 'Select a target to plot.' : 'No targets of interest to plot yet: choose reference genes in Setup.'}</p>}
        <p className="muted small">Bars show the group mean; dots are biological replicates; whiskers are the 95% CI of the fold change vs {a.control} (for the control, the 95% CI of its mean). Colours are Okabe-Ito, distinguishable with common colour-vision deficiencies.</p>
      </div>

      <div className="card pad">
        <div className="row between wrap gap">
          <h2 className="h4">Statistics</h2>
          <div className="row gap-sm wrap">
            <button type="button" className="btn ghost sm" onClick={() => download(`${name}-results.csv`, resultsCsv(a))}>Results CSV</button>
            <button type="button" className="btn ghost sm" onClick={() => download(`${name}-samples.csv`, samplesCsv(a, p))}>Per-sample CSV</button>
            <button type="button" className="btn primary sm" onClick={async () => download(`${name}-results.xlsx`, await resultsXlsx(a, p))}>XLSX workbook</button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="vt">
            <thead><tr><th>Target</th><th>Comparison</th><th className="num">n</th><th className="num">Fold change</th><th className="num">95% CI</th><th className="num">p</th><th></th><th>Test</th></tr></thead>
            <tbody>
              {a.targets.flatMap(t => t.comparisons.length ? t.comparisons.map((c, i) => (
                <tr key={t.target + c.group + c.vs}>
                  {i === 0 && <th scope="row" rowSpan={t.comparisons.length}><i>{t.target}</i>{t.omnibus && t.omnibus.test !== 'Welch t' && <div className="muted small">ANOVA p = {fmtP(t.omnibus.p)}</div>}</th>}
                  <td>{c.group} vs {c.vs}</td><td className="num">{c.na} v {c.nb}</td>
                  <td className="num strong">{fmtFold(c.fold)}</td><td className="num">{fmtFold(c.foldLo)} to {fmtFold(c.foldHi)}</td>
                  <td className="num">{fmtP(c.p)}</td><td className={c.stars === 'ns' ? 'muted' : 'sig'}>{c.stars}</td><td className="small muted">{c.test}</td>
                </tr>
              )) : [<tr key={t.target}><th scope="row"><i>{t.target}</i></th><td colSpan={7} className="muted small">{t.note}</td></tr>])}
            </tbody>
          </table>
        </div>
        <details className="more">
          <summary>Per-sample values</summary>
          <div className="table-wrap">
            <table className="vt compact">
              <thead><tr><th>Sample</th><th>Group</th>{a.targets.map(t => <th key={t.target} className="num"><i>{t.target}</i> {p.settings.method === 'livak' ? 'ΔCq' : 'ΔCq*'}</th>)}{a.targets.map(t => <th key={t.target + 'f'} className="num"><i>{t.target}</i> rel.</th>)}</tr></thead>
              <tbody>{a.samples.map(s => (
                <tr key={s}><th scope="row">{s}</th><td>{a.targets[0]?.samples.find(x => x.sample === s)?.group ?? ''}</td>
                  {a.targets.map(t => { const v = t.samples.find(x => x.sample === s); return <td key={t.target} className="num">{v ? v.dcq.toFixed(2) : '–'}</td> })}
                  {a.targets.map(t => { const v = t.samples.find(x => x.sample === s); return <td key={t.target + 'f'} className="num">{v ? fmtFold(2 ** v.log2rel) : '–'}</td> })}
                </tr>))}
              </tbody>
            </table>
          </div>
          {p.settings.method === 'pfaffl' && <p className="muted small">ΔCq* is the efficiency-corrected difference in log2 units: Cq × log2(1 + E) for the target minus the mean of the same for the references.</p>}
        </details>
      </div>

      <div className="card pad">
        <div className="row between wrap gap"><h2 className="h4">Methods paragraph</h2><CopyButton text={methods} label="Copy text" /></div>
        <p className="methods">{methods}</p>
        <p className="muted small">{missing ? <>{missing} MIQE item{missing === 1 ? '' : 's'} need attention. <Link href={`/app/p/${p.id}/qc#miqe`}>See the checklist</Link> or add details in <Link href={`/app/p/${p.id}/setup`}>Setup</Link>.</> : 'All MIQE checklist items are covered.'}</p>
      </div>
    </div>
  )
}

// ---------- History and compare ----------

function History({ p }: { p: Project }) {
  const snaps = p.snapshots
  const [a, setA] = useState(snaps.length > 1 ? snaps[snaps.length - 2].id : snaps[0]?.id ?? '')
  const [b, setB] = useState(snaps[snaps.length - 1]?.id ?? '')
  const sa = snaps.find(s => s.id === a), sb = snaps.find(s => s.id === b)
  const del = (s: Snapshot) => {
    const prev = p.snapshots
    void saveProject({ ...p, snapshots: prev.filter(x => x.id !== s.id) })
    void deleteSnapshotCloud(s.id)
    toast(`Deleted “${s.label}”.`, { undo: () => void saveProject({ ...p, snapshots: prev }) })
  }
  if (!snaps.length) return <Empty title="No snapshots yet"><p className="muted">A snapshot is saved on every import. Use “Save snapshot” to record the current analysis (for example after changing reference genes).</p></Empty>
  return (
    <div className="stack-lg">
      <div className="card pad">
        <h2 className="h4">Runs and snapshots</h2>
        <div className="table-wrap">
          <table className="vt">
            <thead><tr><th>Label</th><th>Saved</th><th>Plates</th><th>Method / refs</th><th className="num">Excluded</th><th className="num">NTC fails</th><th></th></tr></thead>
            <tbody>{[...snaps].reverse().map(s => (
              <tr key={s.id}>
                <th scope="row"><input className="inline-edit" aria-label="Snapshot label" defaultValue={s.label} onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.label) void saveProject({ ...p, snapshots: p.snapshots.map(x => x.id === s.id ? { ...x, label: v } : x) }) }} /></th>
                <td className="small">{fmtDate(s.createdAt)}</td><td className="small">{s.plates.join(', ')}</td>
                <td className="small">{s.method === 'pfaffl' ? 'Pfaffl' : 'Livak'} / {s.refs.join(' + ')}</td>
                <td className="num">{s.counts.excluded}</td><td className="num">{s.counts.contamFail}</td>
                <td><button type="button" className="btn danger-ghost sm" onClick={() => del(s)}>Delete</button></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>
      <StabilityTrend snaps={snaps} />
      {snaps.length > 1 && sa && sb && (
        <div className="card pad">
          <div className="row between wrap gap">
            <h2 className="h4">Compare</h2>
            <div className="row gap-sm wrap">
              <label className="field inline"><span>From</span><select value={a} onChange={e => setA(e.target.value)}>{snaps.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
              <label className="field inline"><span>To</span><select value={b} onChange={e => setB(e.target.value)}>{snaps.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            </div>
          </div>
          <Compare a={sa} b={sb} />
        </div>
      )}
    </div>
  )
}

function Compare({ a, b }: { a: Snapshot; b: Snapshot }) {
  const keys = [...new Set([...a.results, ...b.results].map(r => `${r.target}|${r.group}|${r.vs}`))]
  const genes = [...new Set([...a.stability, ...b.stability].map(s => s.gene))]
  const changes: string[] = []
  if (a.refs.join() !== b.refs.join()) changes.push(`Reference genes changed from ${a.refs.join(' + ') || 'none'} to ${b.refs.join(' + ') || 'none'}.`)
  if (a.method !== b.method) changes.push(`Method changed from ${a.method} to ${b.method}.`)
  if (a.counts.excluded !== b.counts.excluded) changes.push(`Excluded wells: ${a.counts.excluded} to ${b.counts.excluded}.`)
  return (
    <div className="stack">
      {changes.length > 0 && <ul className="change-list">{changes.map(c => <li key={c}>{c}</li>)}</ul>}
      <div className="table-wrap">
        <table className="vt compact">
          <thead><tr><th>Target · comparison</th><th className="num">Fold (from)</th><th className="num">Fold (to)</th><th className="num">Change</th><th className="num">p (from)</th><th className="num">p (to)</th></tr></thead>
          <tbody>{keys.map(k => {
            const [t, g, v] = k.split('|')
            const x = a.results.find(r => `${r.target}|${r.group}|${r.vs}` === k), y = b.results.find(r => `${r.target}|${r.group}|${r.vs}` === k)
            const flip = x && y && (x.p! < 0.05) !== (y.p! < 0.05)
            return <tr key={k} className={flip ? 'flip' : ''}><th scope="row"><i>{t}</i> {g} vs {v}</th><td className="num">{x ? fmtFold(x.fold) : '–'}</td><td className="num">{y ? fmtFold(y.fold) : '–'}</td><td className="num">{x && y ? `${y.fold / x.fold >= 1 ? '+' : ''}${((y.fold / x.fold - 1) * 100).toFixed(0)}%` : ''}</td><td className="num">{fmtP(x?.p)}</td><td className="num">{fmtP(y?.p)}{flip && <span className="tag warn">significance changed</span>}</td></tr>
          })}</tbody>
        </table>
      </div>
      {genes.length > 0 && (
        <div className="table-wrap">
          <table className="vt compact">
            <thead><tr><th>Candidate</th><th className="num">geNorm M (from)</th><th className="num">geNorm M (to)</th><th className="num">NormFinder (from)</th><th className="num">NormFinder (to)</th></tr></thead>
            <tbody>{genes.map(g => { const x = a.stability.find(s => s.gene === g), y = b.stability.find(s => s.gene === g); return <tr key={g}><th scope="row"><i>{g}</i></th><td className="num">{x?.m.toFixed(3) ?? '–'}</td><td className="num">{y?.m.toFixed(3) ?? '–'}</td><td className="num">{x?.nf?.toFixed(3) ?? '–'}</td><td className="num">{y?.nf?.toFixed(3) ?? '–'}</td></tr> })}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StabilityTrend({ snaps }: { snaps: Snapshot[] }) {
  const cols = useFigColours()
  const genes = [...new Set(snaps.flatMap(s => s.stability.map(x => x.gene)))]
  if (!genes.length) return null
  const W = 640, H = 220, L = 44, R = 110, T = 16, B = 36
  const max = Math.max(0.6, ...snaps.flatMap(s => s.stability.map(x => x.m))) * 1.1
  const X = (i: number) => L + (snaps.length === 1 ? (W - L - R) / 2 : (i / (snaps.length - 1)) * (W - L - R))
  const Y = (m: number) => T + (1 - m / max) * (H - T - B)
  const pal = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00']
  return (
    <div className="card pad">
      <h2 className="h4">Reference-gene stability across runs</h2>
      <p className="muted small">geNorm M per candidate for each snapshot. Lower is more stable; 0.5 is the usual ceiling for homogeneous samples, 1.0 for heterogeneous ones.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="trend" role="img" aria-label="geNorm M per gene across snapshots">
        {[0.5, 1].filter(v => v < max).map(v => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={cols.grid} strokeDasharray="3 3" /><text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill={cols.muted}>{v}</text></g>)}
        <line x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} stroke={cols.muted} />
        {snaps.map((s, i) => <text key={s.id} x={X(i)} y={H - 14} textAnchor="middle" fontSize="11" fill={cols.muted}>{s.label.length > 18 ? s.label.slice(0, 17) + '…' : s.label}</text>)}
        {genes.map((g, gi) => {
          const pts = snaps.map((s, i) => { const v = s.stability.find(x => x.gene === g); return v ? [X(i), Y(v.m)] : null }).filter(Boolean) as number[][]
          const last = pts[pts.length - 1]
          return <g key={g}>
            <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={pal[gi % pal.length]} strokeWidth="2" />
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" fill={pal[gi % pal.length]} />)}
            {last && <text x={last[0] + 10} y={last[1] + 4} fontSize="12" fontStyle="italic" fill={cols.ink}>{g}</text>}
          </g>
        })}
      </svg>
    </div>
  )
}
