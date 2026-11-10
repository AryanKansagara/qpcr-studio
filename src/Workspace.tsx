import { useEffect, useMemo, useState } from 'react'
import { SAMPLES } from './engine/sample.ts'
import { createBlankProject, createSampleProject } from './projectData.ts'
import { deleteProject, saveProject, useProjects, type Status } from './store.ts'
import { Empty, fmtDate, go, Link, Modal, SyntheticBadge, toast } from './ui.tsx'

export const STATUS_LABEL: Record<Status, string> = { planned: 'Planned', running: 'Running', analysed: 'Analysed', published: 'Published' }

export default function Workspace() {
  const list = useProjects()
  const [naming, setNaming] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | Status>('')
  useEffect(() => {
    const sp = new URLSearchParams(location.search)
    if (sp.get('import') === '1') { history.replaceState({}, '', '/app'); setNaming(true) }
    const s = sp.get('sample'), tab = sp.get('tab')
    if (s && SAMPLES.some(x => x.id === s)) void createSampleProject(s).then(p => go(`/app/p/${p.id}${tab ? '/' + tab : ''}`, { replace: true }))
  }, [])

  const rows = useMemo(() => (list ?? []).filter(p => (!status || p.registry.status === status) && (!q || `${p.name} ${p.registry.tags} ${p.registry.owner} ${p.plates.map(x => x.wells.map(w => w.target)).flat().join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [list, q, status])

  const create = async (name: string) => { const p = await createBlankProject(name || 'Untitled experiment'); go(`/app/p/${p.id}/plate?import=1`) }
  const sample = async (id: string) => { const p = await createSampleProject(id); go(`/app/p/${p.id}`) }

  if (list === null) return <div className="boot" role="status"><span className="spinner" /> Loading</div>
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Experiment registry</p>
          <h1>Experiments</h1>
          <p className="muted">One entry per experiment. Each keeps its plates, plate maps, analysis settings, MIQE details and a snapshot of every run.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setNaming(true)}>New experiment</button>
      </div>

      {list.length === 0 ? (
        <Empty title="No experiments yet" icon={<EmptyArt />}>
          <p className="muted">Open the synthetic THP-1 plate to see the full workflow, or import an export from your instrument.</p>
          <div className="row gap center-x wrap">
            <button type="button" className="btn primary" onClick={() => void sample('expression')}>Try the sample</button>
            <button type="button" className="btn outline" onClick={() => setNaming(true)}>Import your data</button>
          </div>
        </Empty>
      ) : (
        <>
          <div className="row gap wrap filters">
            <label className="field grow"><span className="sr-only">Search</span><input type="search" placeholder="Search name, gene, owner or tag" value={q} onChange={e => setQ(e.target.value)} /></label>
            <label className="field"><span className="sr-only">Status</span><select value={status} onChange={e => setStatus(e.target.value as Status | '')}><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <div className="table-wrap card">
            <table className="vt registry">
              <thead><tr><th>Experiment</th><th>Status</th><th>Targets</th><th className="num">Plates</th><th className="num">Runs saved</th><th>Owner</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map(p => {
                  const targets = [...new Set(p.plates.flatMap(x => x.wells.map(w => w.target)).filter(Boolean))]
                  return (
                    <tr key={p.id}>
                      <th scope="row"><Link href={`/app/p/${p.id}`} className="strong-link">{p.name}</Link> {p.sampleId && <SyntheticBadge />}{p.registry.tags && <div className="muted small">{p.registry.tags}</div>}</th>
                      <td>
                        <select className={`status-sel st-${p.registry.status}`} aria-label={`Status of ${p.name}`} value={p.registry.status} onChange={e => void saveProject({ ...p, registry: { ...p.registry, status: e.target.value as Status } })}>
                          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td className="small genes">{targets.length ? targets.slice(0, 6).join(', ') + (targets.length > 6 ? ` +${targets.length - 6}` : '') : <span className="muted">No plates yet</span>}</td>
                      <td className="num">{p.plates.length}</td>
                      <td className="num">{p.snapshots.length}</td>
                      <td className="small">{p.registry.owner || <span className="muted">–</span>}</td>
                      <td className="small">{fmtDate(p.updatedAt)}</td>
                      <td className="row-actions">
                        <Link href={`/app/p/${p.id}/report`} className="btn ghost sm">QC report</Link>
                        <button type="button" className="btn danger-ghost sm" onClick={async () => { const undo = await deleteProject(p.id); toast(`Deleted ${p.name}.`, { undo: () => void undo() }) }}>Delete</button>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && <tr><td colSpan={8} className="muted center">No experiments match.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="samples">
        <h2 className="h4">Synthetic experiments</h2>
        <div className="proj-grid">
          {SAMPLES.map(s => (
            <button key={s.id} type="button" className="card sample-card" onClick={() => void sample(s.id)}>
              <strong>{s.name}</strong> <SyntheticBadge />
              <span className="muted small">{s.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <Modal open={naming} onClose={() => setNaming(false)} title="New experiment">
        <form onSubmit={e => { e.preventDefault(); void create(String(new FormData(e.currentTarget).get('name') ?? '').trim()) }} className="stack">
          <label className="field"><span>Experiment name</span><input name="name" autoFocus placeholder="IL6 induction, compound X, 24 h" /></label>
          <p className="muted small">Next you will import a results export (CSV, TXT or XLSX) from your instrument, then check the plate map.</p>
          <div className="row end gap"><button type="button" className="btn ghost" onClick={() => setNaming(false)}>Cancel</button><button className="btn primary">Create and import</button></div>
        </form>
      </Modal>
    </section>
  )
}

const EmptyArt = () => (
  <svg className="empty-art" viewBox="0 0 120 80" aria-hidden="true">
    {Array.from({ length: 24 }, (_, i) => <circle key={i} cx={14 + (i % 8) * 13} cy={18 + Math.floor(i / 8) * 22} r="5" className={`ea-w ea-${(i * 7) % 5}`} />)}
  </svg>
)
