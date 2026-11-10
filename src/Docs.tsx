import { CFX_CSV, GENERIC_CSV, LC480_TXT, QUANTSTUDIO_TXT, ROTORGENE_CSV } from './engine/fixtures.ts'
import { Code, download, Link } from './ui.tsx'

const REVIEWED = 'November 9, 2026'

const INSTRUMENTS = [
  {
    id: 'cfx', name: 'Bio-Rad CFX Maestro (CFX96 / CFX384 / CFX Opus)', file: 'example_cfx_quantification_cq_results.csv', text: CFX_CSV,
    steps: ['Open the run (.pcrd) in CFX Maestro and check the baseline and threshold on the Quantification tab.', 'Set Content (Unkn, Std, NTC, NRT), sample names, targets and Biological Set Name in the Plate Setup if you have not already.', 'Choose Export > Export All Data Sheets > CSV (or right-click the Quantification Data table > Export to CSV).', 'Import the file ending in “Quantification Cq Results.csv”.'],
    notes: 'Recognised columns: Well, Fluor, Target, Content, Sample, Biological Set Name, Cq, Starting Quantity (SQ). Cq “NaN” is read as no amplification. Content codes like “Unkn-01” and “Std-02” map to Sample and Standard. Melt peaks are in a separate “Melt Curve Peak Results” file; copy its Melt Temperature column into the Cq file (or a generic CSV) to run Tm checks.',
  },
  {
    id: 'qs', name: 'Thermo Fisher QuantStudio (Design & Analysis 2, QuantStudio Real-Time PCR Software)', file: 'example_quantstudio_results.txt', text: QUANTSTUDIO_TXT,
    steps: ['Analyse the run, then open Export (Actions > Export in Design & Analysis; File > Export in the older QuantStudio software).', 'Select the Results content. Choose .xlsx or .txt.', 'Import the file; for .xlsx the “Results” sheet is read.'],
    notes: 'Header lines starting with “*” are read for the instrument type. The table under [Results] is parsed until the next [section]. Recognised columns: Well Position, Sample Name, Target Name, Task (UNKNOWN, STANDARD, NTC), CT or Cq, Quantity, Tm1. “Undetermined” is read as no amplification.',
  },
  {
    id: 'lc', name: 'Roche LightCycler 480 (LightCycler 480 SW 1.5)', file: 'example_lc480_abs_quant.txt', text: LC480_TXT,
    steps: ['Run Abs Quant / 2nd Derivative Max (or Fit Points) analysis.', 'Right-click the results table and choose Export, saving as a text file.', 'One export covers one filter combination. Enter the target name in the import step, or assign targets in the plate map.'],
    notes: 'Recognised columns: Pos, Name, Cp, Standard, Concentration, and Tm1 from a Tm Calling export. Wells with a value in Standard become standards. Names starting with NTC, H2O or water become NTCs.',
  },
  {
    id: 'rg', name: 'Qiagen Rotor-Gene Q (Rotor-Gene Q Series Software)', file: 'example_rotorgene_quantitation.csv', text: ROTORGENE_CSV,
    steps: ['Open the Quantitation analysis for the channel (e.g. Cycling A.Green).', 'Export the quantitation results table to CSV or Excel from the report or export menu.', 'In the import, tick “Positions are numbered” and enter the target name.'],
    notes: 'Recognised columns: No., Name, Type (Unknown, Standard, NTC, Negative Control), Ct, Given Conc. Rotor positions are shown on a 96-well grid in reading order.',
  },
  {
    id: 'generic', name: 'Generic CSV, TSV or XLSX (any instrument)', file: 'example_generic.csv', text: GENERIC_CSV,
    steps: ['One row per well (and per target for multiplex wells).', 'Columns: well (A1 to P24, or a number), cq; optional sample, target, role, group, tm, dilution or quantity.', 'Roles accepted: Sample/Unknown, NTC, NRT, Standard/Std, Calibrator. Without a role column, a quantity marks a standard and sample names starting with NTC mark NTCs.'],
    notes: 'Cq values of Undetermined, NaN, N/A, “-” or empty are read as no amplification. Decimal commas and semicolon-separated files are handled.',
  },
]

export default function Docs() {
  return (
    <section className="page narrow docs">
      <p className="eyebrow">Docs · reviewed {REVIEWED}</p>
      <h1>Getting your data out of the instrument</h1>
      <p className="muted">qPCR Studio reads the results table your instrument software already exports: one Cq per well. Files are parsed in your browser. Column layouts follow each vendor’s current user guide and public example exports; if your software version names a column differently, map it in the import step.</p>
      <nav className="toc" aria-label="On this page">{INSTRUMENTS.map(i => <a key={i.id} href={`#${i.id}`}>{i.name.split(' (')[0]}</a>)}<a href="#calc">Calculations</a><a href="#stability">Reference stability</a><a href="#stats">Statistics</a><a href="#rules">QC rules</a><a href="#data">Your data</a></nav>
      {INSTRUMENTS.map(i => (
        <article key={i.id} id={i.id} className="doc-block">
          <h2>{i.name}</h2>
          <ol>{i.steps.map(s => <li key={s}>{s}</li>)}</ol>
          <p className="small">{i.notes}</p>
          <details className="more"><summary>Example layout (synthetic)</summary><Code code={i.text} label={i.file} /></details>
          <button type="button" className="btn ghost sm" onClick={() => download(i.file, i.text, 'text/plain')}>Download example</button>
        </article>
      ))}

      <article id="calc" className="doc-block">
        <h2>Calculations</h2>
        <p><b>Technical replicates</b> are averaged per plate, sample and target after exclusions. Samples measured on several plates are averaged after inter-run calibration.</p>
        <p><b>Livak (ΔΔCq).</b> ΔCq = Cq(target) − mean Cq(references); ΔΔCq = ΔCq(sample) − mean ΔCq(control); fold change = 2^−ΔΔCq. Assumes every assay is 100% efficient.</p>
        <p><b>Pfaffl, generalised to several references.</b> Each Cq becomes a log2 relative quantity, −Cq × log2(1 + E), using the assay’s efficiency. The normaliser is the mean of these over the reference genes (the log of their geometric mean). With one reference this is exactly ratio = E_target^ΔCq_target / E_ref^ΔCq_ref.</p>
        <p><b>Standard curves.</b> Cq is regressed on log10 quantity over every included standard well. E = 10^(−1/slope) − 1; a slope of −3.32 is 100%. Warnings: E outside 90 to 110%, R² below 0.98, or under 3 decades of range.</p>
        <p><b>Inter-run calibration.</b> When a calibrator sample is set and there are two or more plates, each plate’s Cq for a target is shifted by (calibrator mean on that plate − calibrator mean across plates). Calibrator samples are excluded from statistics.</p>
      </article>

      <article id="stability" className="doc-block">
        <h2>Reference-gene stability</h2>
        <p><b>geNorm</b> (Vandesompele et al., Genome Biology 2002). For each gene, M is the mean standard deviation of its log2 ratio with every other candidate across samples. The least stable gene is removed and M recomputed until two remain. Pairwise variation V(n/n+1) is the SD of the log2 ratio between normalisers built from the top n and n+1 genes; below 0.15, n genes are enough. Recommendation: the top-ranked genes whose M is below 0.5, never fewer than two.</p>
        <p><b>NormFinder-style</b> (after Andersen et al., Cancer Research 2004). On log2 quantities, residuals from a two-way gene × sample model give each gene’s intragroup variance (bias-corrected); group-mean deviations give intergroup variation, shrunk towards zero by the estimated common variance γ². Stability combines the two, averaged over groups. This follows the published model but is an independent implementation, so values can differ slightly from the NormFinder Excel add-in or R script.</p>
        <p><b>BestKeeper-style</b> (after Pfaffl et al., Biotechnology Letters 2004). For each candidate: mean Cq, mean absolute deviation of raw Cq (BestKeeper’s ±Cq; above 1 suggests instability), CV, and Pearson r with the BestKeeper index (geometric mean of candidate Cq per sample).</p>
        <p><b>Treatment shift.</b> The Cq difference of each candidate between each group and control (Welch test). A reference that moves with treatment biases every fold change, however low its M.</p>
      </article>

      <article id="stats" className="doc-block">
        <h2>Statistics</h2>
        <p>Tests run on the log-scale values (ΔCq, or efficiency-corrected log2 quantities), never on fold changes, because fold changes are skewed and bounded at zero.</p>
        <ul>
          <li><b>Two groups:</b> Welch’s t-test (no equal-variance assumption). The 95% CI of the difference is back-transformed: fold CI = 2^(lower) to 2^(upper).</li>
          <li><b>Three or more groups:</b> one-way ANOVA, then Dunnett vs the control (default) or Tukey HSD for all pairs. CIs are simultaneous (Dunnett or Tukey critical values) and back-transformed.</li>
          <li><b>Nonparametric:</b> Mann-Whitney U vs control, exact when there are no ties and n ≤ 12 per group, Holm-adjusted across comparisons. With n = 3 per group the smallest possible p is 0.10.</li>
          <li>Stars: * p &lt; 0.05, ** p &lt; 0.01, *** p &lt; 0.001, **** p &lt; 0.0001. Each group needs at least two biological replicates.</li>
          <li>Distribution functions (t, F, studentised range, Dunnett’s multivariate t) are computed numerically in the browser and checked against published tables in the test suite.</li>
        </ul>
      </article>

      <article id="rules" className="doc-block">
        <h2>QC rules and defaults</h2>
        <ul>
          <li><b>Outlier replicate:</b> with 3+ technical replicates, if the SD exceeds 0.3 cycles the well furthest from the median is flagged and excluded. Alternative: Grubbs test at alpha 0.05 (at n = 3 Grubbs can only flag extreme wells). Every flag can be overridden.</li>
          <li><b>NTC:</b> fails if it amplifies within 5 cycles of the latest sample for that assay (about 3% of the signal or more). Late NTC signal is noted. A Tm more than 2 °C from the product suggests primer-dimer and downgrades a failure to a warning.</li>
          <li><b>No-RT:</b> fails within 5 cycles of the matching RT+ sample; the estimated gDNA share (2^−gap) is shown.</li>
          <li><b>Melt:</b> any well with Tm more than ±1 °C from the assay median.</li>
          <li><b>MIQE:</b> a subset of the essential items from Bustin et al., Clinical Chemistry 2009, and MIQE 2.0 (2025): design, RNA quality, RT, primers and amplicons, efficiency, controls, specificity, instrument, replicates, reference validation and statistics.</li>
        </ul>
        <p className="muted small">Thresholds can be changed per experiment in Setup, and defaults for new experiments in <Link href="/settings">Settings</Link>.</p>
      </article>

      <article id="data" className="doc-block">
        <h2>Where your data lives</h2>
        <p>Everything is stored in this browser (IndexedDB). Signing in is optional: it syncs experiments, plate maps, settings, MIQE details and snapshots to your account so you can open them on another device. The original export files are never uploaded, only the parsed wells; experiments over 3 MB keep their wells on this device and sync everything else. From the account menu you can export everything as JSON, delete your cloud data, or delete your account.</p>
      </article>
    </section>
  )
}
