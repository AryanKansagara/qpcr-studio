import { useState } from 'react'
import { BASE_DEFAULTS, getDefaults, resetDefaults, setDefaults, type Defaults } from './store.ts'
import { setTheme, toast, useDark } from './ui.tsx'
import { useSync } from './sync.ts'

export default function Settings() {
  const [d, setD] = useState<Defaults>(getDefaults)
  const dark = useDark()
  const s = useSync()
  const save = (patch: Partial<Defaults>) => { const n = { ...d, ...patch }; setD(n); setDefaults(n) }
  const num = (v: string, f: number) => (v !== '' && isFinite(+v) ? +v : f)
  return (
    <section className="page narrow">
      <p className="eyebrow">Settings</p>
      <h1>Settings</h1>
      <div className="card pad stack">
        <h2 className="h4">Defaults for new experiments</h2>
        <div className="row gap wrap">
          <label className="field"><span>Method</span><select value={d.method} onChange={e => save({ method: e.target.value as Defaults['method'] })}><option value="pfaffl">Pfaffl (efficiency-corrected)</option><option value="livak">Livak ΔΔCq</option></select></label>
          <label className="field"><span>Test</span><select value={d.test} onChange={e => save({ test: e.target.value as Defaults['test'] })}><option value="parametric">Welch t / ANOVA</option><option value="nonparametric">Mann-Whitney U</option></select></label>
          <label className="field"><span>Post-hoc</span><select value={d.posthoc} onChange={e => save({ posthoc: e.target.value as Defaults['posthoc'] })}><option value="dunnett">Dunnett vs control</option><option value="tukey">Tukey HSD</option></select></label>
          <label className="field"><span>Outlier rule</span><select value={d.outlier} onChange={e => save({ outlier: e.target.value as Defaults['outlier'] })}><option value="sd">Replicate SD</option><option value="grubbs">Grubbs</option><option value="none">None</option></select></label>
        </div>
        <div className="row gap wrap">
          <label className="field"><span>SD threshold (cycles)</span><input type="number" step={0.05} min={0.05} value={d.sdThreshold} onChange={e => save({ sdThreshold: num(e.target.value, BASE_DEFAULTS.sdThreshold) })} /></label>
          <label className="field"><span>NTC window (cycles)</span><input type="number" step={0.5} min={1} value={d.ntcWindow} onChange={e => save({ ntcWindow: num(e.target.value, BASE_DEFAULTS.ntcWindow) })} /></label>
          <label className="field"><span>Tm tolerance (°C)</span><input type="number" step={0.1} min={0.1} value={d.tmTolerance} onChange={e => save({ tmTolerance: num(e.target.value, BASE_DEFAULTS.tmTolerance) })} /></label>
        </div>
        <div className="row gap wrap">
          <label className="field grow"><span>Your name (registry owner)</span><input value={d.owner} onChange={e => save({ owner: e.target.value })} placeholder="A. Researcher" /></label>
          <label className="field grow"><span>Default instrument</span><input value={d.instrument} onChange={e => save({ instrument: e.target.value })} placeholder="Bio-Rad CFX96 Touch" /></label>
        </div>
        <p className="muted small">Saved as you type. Existing experiments keep their own settings (Setup tab).</p>
      </div>
      <div className="card pad stack">
        <h2 className="h4">Appearance</h2>
        <div className="seg" role="group" aria-label="Theme">
          <button type="button" aria-pressed={!dark} onClick={() => setTheme('light')}>Light</button>
          <button type="button" aria-pressed={dark} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </div>
      <div className="card pad stack">
        <h2 className="h4">Data and sync</h2>
        <p className="muted small">{s.user ? `Signed in as ${s.user.email}. Use the account menu to sync, export everything as JSON, or delete cloud data or your account.` : 'Signed out. Everything is stored in this browser. Sign in from the account menu to sync across devices.'}</p>
        <p className="muted small">Keyboard: 1 to 6 switch experiment tabs, Esc clears a plate selection, Cmd/Ctrl+A selects the whole plate, Cmd/Ctrl+Z undoes the last destructive action.</p>
        <div><button type="button" className="btn ghost sm" onClick={() => { resetDefaults(); setD(getDefaults()); toast('Defaults restored.') }}>Restore default settings</button></div>
      </div>
    </section>
  )
}
