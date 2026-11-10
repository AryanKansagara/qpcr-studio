import { analyze, blankMeta, defaultSettings, groupOf, type Analysis, type Plate, type Settings } from './engine/qpcr.ts'
import { SAMPLES } from './engine/sample.ts'
import { getDefaults, getProjects, saveProject, uuid, type Project, type Snapshot } from './store.ts'

const REF_NAMES = /^(actb|gapdh|hprt1?|b2m|rplp0|tbp|ppia|ywhaz|ubc|18s|rn18s|rpl13a|rpl32|rps18|sdha|hmbs|gusb|pgk1|tubb|tuba1a|eef1a1|pum1|ipo8|tfrc|alas1|rpl19|cyclophilin|beta.?actin)$/i
const CONTROL_NAMES = /^(ctrl|control|vehicle|veh|wt|wild.?type|untreated|mock|dmso|pbs|naive|baseline|sham|nt|scr|scramble|sincontrol|sictrl)/i

export function settingsFromDefaults(): Settings {
  const d = getDefaults()
  return { ...defaultSettings(), method: d.method, test: d.test, posthoc: d.posthoc, outlier: d.outlier, sdThreshold: d.sdThreshold, ntcWindow: d.ntcWindow, tmTolerance: d.tmTolerance }
}

/** Fills reference candidates and the control group when they are not set yet. */
export function autoConfigure(plates: Plate[], s: Settings): Settings {
  const wells = plates.flatMap(p => p.wells)
  const targets = [...new Set(wells.filter(w => w.role === 'unknown').map(w => w.target).filter(Boolean))]
  const out = { ...s }
  if (!out.candidates.length) out.candidates = targets.filter(t => REF_NAMES.test(t))
  if (!out.refs.length) out.refs = out.candidates.slice(0, 2)
  const groups = [...new Set(wells.filter(w => w.role === 'unknown' && w.sample).map(w => groupOf(w.sample, out, wells)))]
  if (!out.control || !groups.includes(out.control)) out.control = groups.find(g => CONTROL_NAMES.test(g)) ?? groups[0] ?? ''
  return out
}

export async function createBlankProject(name: string) {
  const d = getDefaults()
  const p: Project = {
    id: uuid(), name, createdAt: Date.now(), updatedAt: Date.now(), plates: [], settings: settingsFromDefaults(),
    meta: { ...blankMeta(), instrument: d.instrument }, registry: { status: 'running', owner: d.owner, tags: '', started: new Date().toISOString().slice(0, 10) },
    snapshots: [], imports: [],
  }
  return saveProject(p)
}

export async function createSampleProject(id: string) {
  const def = SAMPLES.find(s => s.id === id)!
  const existing = getProjects().find(p => p.sampleId === id)
  if (existing) return existing
  const { plates, settings, meta } = def.build()
  // Plate ids are unique per project so exclusions never collide across projects.
  const fresh = plates.map(p => ({ ...p, id: uuid() }))
  const p: Project = {
    id: uuid(), name: def.name, createdAt: Date.now(), updatedAt: Date.now(), plates: fresh, settings, meta,
    registry: { status: 'analysed', owner: 'Synthetic lab', tags: id === 'expression' ? 'inflammation, THP-1' : 'assay validation', started: fresh[0].runDate ?? '' },
    snapshots: [], imports: [], sampleId: id,
  }
  p.snapshots = [makeSnapshot(p, analyze(p.plates, p.settings), `Run ${fresh[0].runDate}: as imported`)]
  return saveProject(p)
}

const cache = new WeakMap<Plate[], WeakMap<Settings, Analysis>>()
/** Memoised on the identity of plates and settings, which change on every save. */
export function analysisOf(p: Project): Analysis {
  let m = cache.get(p.plates)
  if (!m) cache.set(p.plates, (m = new WeakMap()))
  let a = m.get(p.settings)
  if (!a) m.set(p.settings, (a = analyze(p.plates, p.settings)))
  return a
}

export function makeSnapshot(p: Project, a: Analysis, label: string): Snapshot {
  const st = a.stability
  return {
    id: uuid(), label, createdAt: Date.now(), plates: p.plates.map(x => x.name), method: p.settings.method, refs: [...p.settings.refs],
    efficiencies: Object.fromEntries(Object.values(a.efficiencies).map(e => [e.target, e.e])),
    stability: st ? st.genes.map(g => ({ gene: g, m: st.genorm.m[g], nf: st.normfinder?.stability[g] ?? null, bk: st.bestkeeper[g].sd })) : [],
    results: a.targets.flatMap(t => t.comparisons.map(c => ({ target: c.target, group: c.group, vs: c.vs, fold: c.fold, lo: c.foldLo, hi: c.foldHi, p: c.p, test: c.test }))),
    counts: { wells: a.counts.wells, excluded: a.counts.excluded, contamFail: a.counts.contamFail, meltFlags: a.counts.meltFlags },
  }
}
