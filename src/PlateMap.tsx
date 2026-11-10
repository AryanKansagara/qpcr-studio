import { useRef, type CSSProperties } from 'react'
import { plateDims, ROLE_LABEL, wellKey, wellName, type Plate, type Settings, type Well } from './engine/qpcr.ts'
import { OKABE_ITO } from './figure.ts'
import { fmtCq } from './ui.tsx'

// Viridis stops: perceptually uniform and colour-vision safe.
const VIRIDIS = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']
function lerp(a: string, b: string, t: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map(i => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('')
}
export function viridis(t: number) {
  const x = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1)
  const i = Math.min(VIRIDIS.length - 2, Math.floor(x))
  return lerp(VIRIDIS[i], VIRIDIS[i + 1], x - i)
}
export const cqRange = (wells: Well[]) => {
  const v = wells.filter(w => w.cq !== null && w.role !== 'empty').map(w => w.cq!)
  return v.length ? { lo: Math.floor(Math.min(...v)), hi: Math.ceil(Math.max(...v)) } : { lo: 15, hi: 40 }
}

export type ColorBy = 'cq' | 'target' | 'group' | 'role'
const ROLE_COL: Record<string, string> = { unknown: '#0072B2', ntc: '#D55E00', nrt: '#CC79A7', standard: '#009E73', calibrator: '#E69F00', empty: 'transparent' }

interface Props {
  plate: Plate
  settings?: Settings
  colorBy: ColorBy
  selected?: Set<string>
  flagged?: Set<string>
  pulse?: Set<string>
  groupOf?: (sample: string) => string
  onWell?: (well: string, e: React.MouseEvent | React.KeyboardEvent) => void
  onRange?: (wells: string[], additive: boolean) => void
  label?: 'cq' | 'target' | 'none'
  size?: 'sm' | 'md'
}

export function PlateMap({ plate, settings, colorBy, selected, flagged, pulse, groupOf, onWell, onRange, label = 'cq', size = 'md' }: Props) {
  const { rows, cols } = plateDims(plate.format)
  const byWell = new Map<string, Well[]>()
  for (const w of plate.wells) byWell.set(w.well, [...(byWell.get(w.well) ?? []), w])
  const { lo, hi } = cqRange(plate.wells)
  const targets = [...new Set(plate.wells.map(w => w.target).filter(Boolean))]
  const groups = groupOf ? [...new Set(plate.wells.filter(w => w.role === 'unknown').map(w => groupOf(w.sample)))] : []
  const drag = useRef<{ start: string; additive: boolean } | null>(null)

  const colour = (ws: Well[]) => {
    const w = ws[0]
    if (!w || w.role === 'empty') return 'transparent'
    if (colorBy === 'role') return ROLE_COL[w.role]
    if (colorBy === 'target') return OKABE_ITO[targets.indexOf(w.target) % OKABE_ITO.length]
    if (colorBy === 'group') return w.role === 'unknown' && groupOf ? OKABE_ITO[groups.indexOf(groupOf(w.sample)) % OKABE_ITO.length] : ROLE_COL[w.role]
    return w.cq === null ? 'transparent' : viridis(1 - (w.cq - lo) / Math.max(1, hi - lo))
  }
  const rect = (a: string, b: string) => {
    const pa = { r: a.charCodeAt(0) - 65, c: +a.slice(1) - 1 }, pb = { r: b.charCodeAt(0) - 65, c: +b.slice(1) - 1 }
    const out: string[] = []
    for (let r = Math.min(pa.r, pb.r); r <= Math.max(pa.r, pb.r); r++) for (let c = Math.min(pa.c, pb.c); c <= Math.max(pa.c, pb.c); c++) out.push(wellName(r, c))
    return out
  }

  return (
    <div className={`plate p${plate.format} ${size}`} style={{ '--cols': cols } as CSSProperties} onMouseLeave={() => (drag.current = null)}>
      <div className="plate-grid" role="grid" aria-label={`${plate.format}-well plate ${plate.name}`}>
        <div className="pl-corner" />
        {Array.from({ length: cols }, (_, c) => (
          <button key={c} type="button" className="pl-head" tabIndex={-1} disabled={!onRange} onClick={e => onRange?.(Array.from({ length: rows }, (_, r) => wellName(r, c)), e.shiftKey || e.metaKey)}>{c + 1}</button>
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <div className="pl-row" role="row" key={r}>
            <button type="button" className="pl-head" tabIndex={-1} disabled={!onRange} onClick={e => onRange?.(Array.from({ length: cols }, (_, c) => wellName(r, c)), e.shiftKey || e.metaKey)}>{String.fromCharCode(65 + r)}</button>
            {Array.from({ length: cols }, (_, c) => {
              const name = wellName(r, c)
              const ws = byWell.get(name) ?? []
              const w = ws[0]
              const key = wellKey(plate.id, name)
              const excluded = !!settings && (settings.excluded[key] === true || (flagged?.has(name) && settings.excluded[key] !== false))
              const bg = colour(ws)
              const dark = colorBy === 'cq' ? w?.cq != null && (1 - (w.cq - lo) / Math.max(1, hi - lo)) < 0.6 : bg !== 'transparent' && bg !== '#F0E442' && bg !== '#E69F00' && bg !== '#56B4E9'
              const text = !w ? '' : label === 'cq' ? (w.cq === null ? (w.role === 'empty' ? '' : '–') : w.cq.toFixed(1)) : label === 'target' ? w.target.slice(0, 4) : ''
              const desc = !w ? `${name} empty` : `${name}: ${ws.map(x => `${x.target || 'no target'} ${fmtCq(x.cq)}`).join(', ')}; ${w.sample || 'no sample'}; ${ROLE_LABEL[w.role]}${excluded ? '; excluded' : ''}${flagged?.has(name) ? '; flagged' : ''}`
              return (
                <button
                  key={c} type="button" role="gridcell" title={desc} aria-label={desc}
                  aria-selected={selected?.has(name) || undefined}
                  className={`well${!w || w.role === 'empty' ? ' empty' : ''}${w?.cq === null && w?.role !== 'empty' ? ' undet' : ''}${dark ? ' on-dark' : ''}${selected?.has(name) ? ' sel' : ''}${excluded ? ' excl' : ''}${pulse?.has(name) ? ' pulse' : ''}${w?.role === 'ntc' || w?.role === 'nrt' ? ' ctl' : ''}${ws.length > 1 ? ' multi' : ''}`}
                  style={{ '--w': bg } as CSSProperties}
                  onMouseDown={e => { if (onRange && e.button === 0) drag.current = { start: name, additive: e.shiftKey || e.metaKey } }}
                  onMouseEnter={() => { if (drag.current && drag.current.start !== name) onRange?.(rect(drag.current.start, name), drag.current.additive) }}
                  onMouseUp={() => { drag.current = null }}
                  onClick={e => onWell?.(name, e)}
                >
                  <span>{size === 'md' ? text : ''}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function CqLegend({ wells }: { wells: Well[] }) {
  const { lo, hi } = cqRange(wells)
  return (
    <div className="cq-legend" aria-hidden="true">
      <span>Cq {lo}</span>
      <i style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(t => viridis(1 - t)).join(',')})` }} />
      <span>{hi}</span>
      <span className="lg-und"><b /> Undetermined</span>
    </div>
  )
}

export function CatLegend({ items }: { items: { label: string; colour: string }[] }) {
  return <div className="cat-legend">{items.map(i => <span key={i.label}><b style={{ background: i.colour }} />{i.label}</span>)}</div>
}
export const roleLegend = () => (['unknown', 'standard', 'ntc', 'nrt', 'calibrator'] as const).map(r => ({ label: ROLE_LABEL[r], colour: ROLE_COL[r] }))
