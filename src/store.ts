import { useSyncExternalStore } from 'react'
import type { Meta, Plate, Settings } from './engine/qpcr.ts'

export interface ImportMeta { id: string; fileName: string; format: string; wells: number; errors: number; warnings: number; plateId: string; at: number }

export interface SnapResult { target: string; group: string; vs: string; fold: number; lo: number; hi: number; p: number | null; test: string }
export interface Snapshot {
  id: string
  label: string
  createdAt: number
  plates: string[]
  method: Settings['method']
  refs: string[]
  efficiencies: Record<string, number>
  stability: { gene: string; m: number; nf: number | null; bk: number }[]
  results: SnapResult[]
  counts: { wells: number; excluded: number; contamFail: number; meltFlags: number }
}

export type Status = 'planned' | 'running' | 'analysed' | 'published'
export interface Registry { status: Status; owner: string; tags: string; started: string }

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  plates: Plate[]
  settings: Settings
  meta: Meta
  registry: Registry
  snapshots: Snapshot[]
  imports: ImportMeta[]
  sampleId?: string
  /** True when the wells were too large to sync and this device has no copy. */
  dataMissing?: boolean
}

// ---------- Tiny IndexedDB wrapper (falls back to memory in private modes) ----------

let dbp: Promise<IDBDatabase | null> | null = null
function db(): Promise<IDBDatabase | null> {
  return dbp ??= new Promise(res => {
    try {
      const req = indexedDB.open('qpcr-studio', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('projects', { keyPath: 'id' })
      req.onsuccess = () => res(req.result)
      req.onerror = () => res(null)
    } catch { res(null) }
  })
}
const mem = new Map<string, Project>()

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  if (!d) throw new Error('no-idb')
  return new Promise((res, rej) => {
    const r = fn(d.transaction('projects', mode).objectStore('projects'))
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
const idbAll = async () => { try { return await tx('readonly', s => s.getAll()) as Project[] } catch { return [...mem.values()] } }
const idbPut = async (p: Project) => { try { await tx('readwrite', s => s.put(p)) } catch { mem.set(p.id, p) } }
const idbDel = async (id: string) => { try { await tx('readwrite', s => s.delete(id)) } catch { mem.delete(id) } }

// ---------- In-memory list with subscribers ----------

let projects: Project[] = []
let loaded = false
const subs = new Set<() => void>()
const emit = () => { projects = [...projects]; subs.forEach(f => f()) }
const changeHooks = new Set<(p: Project) => void>()
export const onProjectChange = (f: (p: Project) => void) => { changeHooks.add(f); return () => changeHooks.delete(f) }

export async function loadProjects() {
  projects = (await idbAll()).sort((a, b) => b.updatedAt - a.updatedAt)
  loaded = true
  emit()
}
export const useProjects = () => useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f) }, () => (loaded ? projects : null))
export const getProjects = () => projects
export const getProject = (id: string) => projects.find(p => p.id === id)

export async function saveProject(p: Project, opts: { touch?: boolean; silent?: boolean } = {}) {
  const next = opts.touch === false ? p : { ...p, updatedAt: Date.now() }
  const i = projects.findIndex(x => x.id === p.id)
  if (i >= 0) projects[i] = next
  else projects.unshift(next)
  projects.sort((a, b) => b.updatedAt - a.updatedAt)
  emit()
  await idbPut(next)
  if (!opts.silent) changeHooks.forEach(f => f(next))
  return next
}

/** Deletes locally; returns an undo function. */
export async function deleteProject(id: string): Promise<() => Promise<void>> {
  const p = getProject(id)
  projects = projects.filter(x => x.id !== id)
  emit()
  await idbDel(id)
  addTombstone(id)
  return async () => { if (p) { removeTombstone(id); await saveProject(p) } }
}

export const uuid = () => crypto.randomUUID()

// Tombstones stop a project deleted offline from coming back on the next sync.
const TOMB = 'qpcr-studio.tombstones'
export const tombstones = (): string[] => { try { return JSON.parse(localStorage.getItem(TOMB) ?? '[]') } catch { return [] } }
const addTombstone = (id: string) => localStorage.setItem(TOMB, JSON.stringify([...new Set([...tombstones(), id])]))
const removeTombstone = (id: string) => localStorage.setItem(TOMB, JSON.stringify(tombstones().filter(x => x !== id)))
export const clearTombstones = (ids: string[]) => localStorage.setItem(TOMB, JSON.stringify(tombstones().filter(x => !ids.includes(x))))

// ---------- App defaults (settings page) ----------

export interface Defaults { method: Settings['method']; test: Settings['test']; posthoc: Settings['posthoc']; outlier: Settings['outlier']; sdThreshold: number; ntcWindow: number; tmTolerance: number; figure: 'bar' | 'dot'; owner: string; instrument: string }
const DEF_KEY = 'qpcr-studio.defaults'
export const BASE_DEFAULTS: Defaults = { method: 'pfaffl', test: 'parametric', posthoc: 'dunnett', outlier: 'sd', sdThreshold: 0.3, ntcWindow: 5, tmTolerance: 1, figure: 'bar', owner: '', instrument: '' }
export function getDefaults(): Defaults {
  try { return { ...BASE_DEFAULTS, ...JSON.parse(localStorage.getItem(DEF_KEY) ?? '{}') } } catch { return BASE_DEFAULTS }
}
export const setDefaults = (d: Defaults) => localStorage.setItem(DEF_KEY, JSON.stringify(d))
export const resetDefaults = () => localStorage.removeItem(DEF_KEY)
