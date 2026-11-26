# qPCR Studio

From raw qPCR instrument exports to publication-ready relative expression, with the right statistics.

Live: https://qpcr-studio.vercel.app

## The pain

Most grad students and postdocs still analyse qPCR in Excel: a sheet per plate, ΔΔCt formulas copied by hand, GAPDH chosen by habit, t-tests run on fold changes, NTCs at Cq 35 unnoticed, and a methods section written from memory. qPCR Studio does each of those steps with the reasoning shown.

## Features

- **Imports**: Bio-Rad CFX Maestro (Quantification Cq Results), Thermo QuantStudio / Design & Analysis (Results, TXT or XLSX), Roche LightCycler 480 text export, Qiagen Rotor-Gene quantitation report, RDML 1.0 to 1.4 from any instrument, and generic CSV. Format detection, column mapping and a validation report with line numbers.
- **Plate-map editor**: 96 and 384 wells; select by click, range, drag, row or column; assign sample, target, group and role (sample, NTC, NRT, standard, calibrator); paste layouts from a spreadsheet.
- **QC**: technical-replicate SD or Grubbs outlier flags with override, NTC and no-RT contamination windows, primer-dimer detection from Tm, melt-curve consistency, MIQE checklist.
- **Standard curves**: slope, efficiency, R² and dynamic range per assay; copy efficiencies between experiments.
- **Reference genes**: geNorm M with stepwise exclusion and pairwise V, a NormFinder-style model, BestKeeper-style spread and the treatment shift of each candidate, with a one-click recommendation.
- **Quantification**: Livak ΔΔCq or Pfaffl efficiency-corrected ratios generalised to the geometric mean of several references; inter-plate calibration.
- **Statistics on ΔCq**: Welch t, one-way ANOVA with Dunnett or Tukey (simultaneous CIs), or Mann-Whitney with Holm; CIs back-transformed to fold change.
- **Outputs**: colour-blind-safe bar or dot plots as SVG/PNG, results CSV and XLSX workbook, an auto-written methods paragraph and a printable run QC report.
- **Workspace**: experiment registry, snapshots per run with a compare view (including reference-gene stability across runs), local-first storage in IndexedDB and optional account sync.

Sample experiments are synthetic and labelled as such.

## Tested against real exports

The importers are checked against public example files: QuantStudio text, spreadsheet and Design & Analysis 2 exports and a CFX Maestro CSV from the [Allotropy](https://github.com/Benchling-Open-Source/allotropy) test data (MIT), LightCycler 480 and CFX samples from the Bioconductor packages HTqPCR and ReadqPCR, and RDML files from the [RDML consortium](https://github.com/RDML-consortium/rdmlpython) and the R package [RDML](https://github.com/kablag/RDML). Short excerpts are in `src/engine/realFixtures.ts`. On the QuantStudio 7 Flex standard-curve example the fitted slope, intercept, R² and efficiency match the values the instrument wrote in the same file.

Known gaps: no public Rotor-Gene quantitation report was found, so that layout follows the user guide only; QuantStudio genotyping exports and raw fluorescence exports are rejected with an explanation rather than analysed; Design & Analysis 2 keeps standard quantities off the Results sheet, so they are read from sample names and need a check.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests (node --test)
npm run build
npm run test:e2e # Playwright on the production build (npx playwright install chromium once; E2E_PORT picks the port)
```

Optional sync needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`; without them everything works locally.
