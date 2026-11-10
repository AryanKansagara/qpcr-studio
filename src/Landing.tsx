import { useMemo, useState } from 'react'
import { analyze, wellKey } from './engine/qpcr.ts'
import { SAMPLES } from './engine/sample.ts'
import { foldFigure } from './figure.ts'
import { CqLegend, PlateMap } from './PlateMap.tsx'
import { fmtFold, fmtP, go, Link } from './ui.tsx'

const REF_SETS = [
  { id: 'best', label: 'ACTB + HPRT1', note: 'geNorm best pair', refs: ['ACTB', 'HPRT1'] },
  { id: 'gapdh', label: 'GAPDH only', note: 'the Excel default', refs: ['GAPDH'] },
  { id: 'all', label: 'All three', note: 'geometric mean', refs: ['ACTB', 'GAPDH', 'HPRT1'] },
]

function Hero() {
  const sample = useMemo(() => SAMPLES[0].build(), [])
  const plate = sample.plates[0]
  const [refSet, setRefSet] = useState('best')
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const settings = useMemo(() => ({ ...sample.settings, refs: REF_SETS.find(r => r.id === refSet)!.refs, excluded: overrides }), [sample, refSet, overrides])
  const a = useMemo(() => analyze(sample.plates, settings), [sample, settings])
  const flagged = useMemo(() => new Set(a.replicates.flatMap(r => r.wells.filter(w => w.auto).map(w => w.well))), [a])
  const outlier = a.replicates.find(r => r.flag === 'outlier')
  const outWell = outlier?.wells.find(w => w.auto)
  const outKey = outWell ? wellKey(plate.id, outWell.well) : ''
  const outIn = outKey && overrides[outKey] === false
  const pulse = useMemo(() => new Set(outWell && !outIn ? [outWell.well] : []), [outWell, outIn])
  const svg = useMemo(() => foldFigure(a.targets.filter(t => t.target !== 'GAPDH' && t.target !== 'ACTB' && t.target !== 'HPRT1'), { kind: 'bar', groups: a.groups, control: a.control, ink: '#f5f2ee', muted: '#a8a5a0', grid: '#363534', width: 300 }), [a])
  const toggle = (well: string) => {
    const w = plate.wells.find(x => x.well === well)
    if (!w || w.role !== 'unknown') return
    const k = wellKey(plate.id, well)
    const isAuto = flagged.has(well)
    setOverrides(o => {
      const n = { ...o }
      const excluded = o[k] === true || (isAuto && o[k] !== false)
      if (excluded) { if (isAuto) n[k] = false; else delete n[k] } else { if (isAuto) delete n[k]; else n[k] = true }
      return n
    })
  }
  const contam = a.contamination.find(c => c.status === 'fail')

  return (
    <section className="hero dark-band">
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="eyebrow light">qPCR analysis for the bench</p>
          <h1>From raw Cq to a figure you can defend.</h1>
          <p className="lede">Import the export from your CFX, QuantStudio, LightCycler or Rotor-Gene. qPCR Studio checks your reference genes, corrects for primer efficiency, flags outlier replicates and contaminated NTCs, runs the right statistics on ΔCq values and writes your methods paragraph.</p>
          <div className="row gap wrap">
            <Link href="/app?sample=expression" className="btn primary lg">Open the sample experiment</Link>
            <Link href="/app?import=1" className="btn outline-light lg">Import your plate</Link>
          </div>
          <p className="hero-note">Runs in your browser. No account needed. Sample data is synthetic.</p>
        </div>

        <div className="hero-demo" aria-label="Live demo on a synthetic 96-well plate">
          <div className="demo-head">
            <div><span className="demo-dot" />Live: synthetic THP-1 plate · 96 wells</div>
            <span className="tag">real engine</span>
          </div>
          <div className="demo-body">
            <div className="demo-plate">
              <PlateMap plate={plate} settings={settings} colorBy="cq" flagged={flagged} pulse={pulse} onWell={toggle} label="none" size="sm" />
              <CqLegend wells={plate.wells} />
              <p className="demo-hint">{outWell ? <>Well <b>{outWell.well}</b> ({outlier!.sample}, IL6) is {outIn ? 'back in the mean' : 'flagged and excluded'}. <button type="button" className="linkish" onClick={() => toggle(outWell.well)}>{outIn ? 'Exclude it' : 'Put it back'}</button></> : 'Click any sample well to exclude it.'}</p>
            </div>
            <div className="demo-chart">
              <div className="seg dark" role="group" aria-label="Reference genes">
                {REF_SETS.map(r => <button key={r.id} type="button" aria-pressed={refSet === r.id} onClick={() => setRefSet(r.id)} title={r.note}>{r.label}</button>)}
              </div>
              <div className="fig" dangerouslySetInnerHTML={{ __html: svg }} />
              <ul className="demo-stats">
                {a.targets.filter(t => t.target === 'IL6' || t.target === 'CCL2').map(t => {
                  const c = t.comparisons[0]
                  return c && <li key={t.target}><i>{t.target}</i><b>{fmtFold(c.fold)}×</b><span>95% CI {fmtFold(c.foldLo)} to {fmtFold(c.foldHi)}</span><span className={c.p! < 0.05 ? 'sig' : 'ns'}>p = {fmtP(c.p)} {c.stars}</span></li>
                })}
              </ul>
              {refSet === 'gapdh' && <p className="demo-warn">GAPDH rises with treatment here (geNorm M {a.stability?.genorm.m.GAPDH.toFixed(2)}), so normalising to it hides part of the IL6 induction.</p>}
              {contam && <p className="demo-warn red">NTC {contam.well} ({contam.target}) amplified at Cq {contam.cq?.toFixed(1)}: flagged as contamination.</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const PAINS = [
  ['“Better ways than Excel to analyse qPCR data?”', 'A spreadsheet per plate, formulas copied by hand, melt curves checked by eye.'],
  ['“How should I run stats on ΔΔCt?”', 'Tests run on fold changes instead of ΔCq, so variance is skewed and p-values drift.'],
  ['“An alternative to 2^-ΔΔCt?”', 'Livak assumes 100% efficiency. Real primers sit at 90 to 105%.'],
  ['“Reference gene on every plate?”', 'Plates differ. Without a calibrator, inter-run shifts look like biology.'],
  ['“Validating qPCR reference genes”', 'GAPDH is chosen by habit, then quietly responds to the treatment.'],
  ['“High housekeeping Ct values”', 'Late references, noisy triplicates and NTCs at Cq 35 slip into the mean unnoticed.'],
]

const FEATURES = [
  ['Instrument imports', 'Bio-Rad CFX Maestro, QuantStudio and Design & Analysis, LightCycler 480, Rotor-Gene and any CSV. Format detection, column mapping and a validation report with line numbers.'],
  ['Plate-map editor', '96 and 384 wells. Drag to select, assign sample, target, group and role, or paste the layout straight from your spreadsheet.'],
  ['Replicate QC', 'Technical replicate SD or Grubbs flags with one-click override. NTC and no-RT checks, and Tm consistency from the melt curve.'],
  ['Reference stability', 'geNorm M and pairwise V, a NormFinder-style model with intergroup variation, BestKeeper-style spread, and the treatment shift of each candidate.'],
  ['Efficiency-corrected', 'Standard curves give slope, E, R² and dynamic range. Pfaffl ratios generalised to the geometric mean of several reference genes.'],
  ['Statistics done right', 'Welch t, one-way ANOVA with Tukey or Dunnett, or Mann-Whitney, all on ΔCq. Confidence intervals back-transformed to fold change.'],
  ['Publication output', 'Colour-blind-safe bar or dot plots with CIs and stars as SVG or PNG, a results table in CSV or XLSX and a methods paragraph to paste.'],
  ['Run history', 'An experiment registry, snapshots of every run and a compare view that tracks reference-gene stability across runs.'],
]

export function Landing() {
  return (
    <>
      <Hero />
      <section className="band">
        <div className="wrap">
          <p className="eyebrow">Why this exists</p>
          <h2 className="display">The questions on r/labrats every week</h2>
          <p className="muted maxw">Paraphrased threads from grad students, postdocs and research associates who analyse qPCR in Excel. Each one is a step qPCR Studio does for you, with the reasoning shown.</p>
          <div className="pain-grid">
            {PAINS.map(([q, a]) => <article key={q} className="pain"><h3>{q}</h3><p>{a}</p></article>)}
          </div>
        </div>
      </section>
      <section className="band alt">
        <div className="wrap">
          <p className="eyebrow">What it does</p>
          <h2 className="display">Every step between the instrument and the figure</h2>
          <div className="feat-grid">
            {FEATURES.map(([t, d], i) => <article key={t} className="feat"><span className="feat-n">{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></article>)}
          </div>
        </div>
      </section>
      <section className="band">
        <div className="wrap flow">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="display">Import, check, normalise, report</h2>
          </div>
          <ol className="steps">
            <li><b>Export from the instrument.</b> The docs page lists the exact menus for each software version.</li>
            <li><b>Map and validate.</b> qPCR Studio detects the format, maps the columns and lists every problem by line number.</li>
            <li><b>Review QC.</b> Outlier replicates, NTCs within the cycle window, Tm shifts and MIQE gaps, each with a reason.</li>
            <li><b>Choose references with evidence.</b> Stability ranks from three methods, and how much each candidate moves with treatment.</li>
            <li><b>Ship the figure.</b> SVG, results table, methods text and a printable QC report for your lab notebook.</li>
          </ol>
        </div>
      </section>
      <section className="band cta dark-band">
        <div className="wrap center">
          <h2 className="display light">Try it on the synthetic plate, then on yours</h2>
          <p className="lede">Your data stays in this browser unless you choose to sign in and sync.</p>
          <div className="row gap center-x wrap">
            <button type="button" className="btn primary lg" onClick={() => go('/app?sample=expression')}>Open the sample</button>
            <Link href="/docs" className="btn outline-light lg">Read the export guide</Link>
          </div>
        </div>
      </section>
    </>
  )
}
