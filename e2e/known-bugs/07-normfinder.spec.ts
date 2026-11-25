import { refStability } from '../../src/engine/qpcr.ts'
import { expect, test } from '../fixtures'

// log2 quantities, samples x genes; groups of 3 and 4. Andersen et al. 2004 as implemented in Bioconductor NormqPCR, stabMeasureRho.R:
// rho = mean over groups of |d| + sqrt(var). Expected values from a separate transcription of that R function.
const X = [[0, 1, 2, 5], [1, 2.1, 2.8, 6.4], [2, 2.9, 4.3, 7.1], [4, 2.2, 3, 6], [5, 3.1, 4.1, 6.8], [6.2, 3.9, 4.8, 8.1], [4.7, 3, 3.6, 6.5]]
const RHO = { A: 1.2059344611578522, B: 0.394941923991191, C: 0.5723844792884736, D: 0.6207852677120436 }

test('#7 NormFinder matches stabMeasureRho with unequal groups', () => {
  const genes = Object.keys(RHO), s = X.map((_, i) => `s${i}`)
  const L = (x: string, g: string) => X[+x.slice(1)][genes.indexOf(g)]
  const nf = refStability(genes, s, new Map(s.map((x, i) => [x, i < 3 ? 'g1' : 'g2'])), L, (x, g) => 30 - L(x, g), 'g1').normfinder!
  for (const [g, v] of Object.entries(RHO)) expect(nf.stability[g]).toBeCloseTo(v, 8)
})
