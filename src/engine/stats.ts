// Small numerical statistics library: distributions, tests and post-hoc procedures used by the qPCR engine.

export const sum = (x: number[]) => x.reduce((a, b) => a + b, 0)
export const mean = (x: number[]) => (x.length ? sum(x) / x.length : NaN)
export function variance(x: number[]) {
  if (x.length < 2) return NaN
  const m = mean(x)
  return sum(x.map(v => (v - m) ** 2)) / (x.length - 1)
}
export const sd = (x: number[]) => Math.sqrt(variance(x))
export function median(x: number[]) {
  if (!x.length) return NaN
  const s = [...x].sort((a, b) => a - b)
  const h = s.length >> 1
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2
}

// ---------- Special functions ----------

const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
export function lnGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  z -= 1
  let x = 0.99999999999980993
  for (let i = 0; i < 8; i++) x += LANCZOS[i] / (z + i + 1)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

function betacf(a: number, b: number, x: number) {
  const tiny = 1e-300
  let c = 1, d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny
    d = 1 / d; h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-14) break
  }
  return h
}

/** Regularised incomplete beta I_x(a, b). */
export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}

export function normCdf(z: number) {
  // Abramowitz-Stegun 7.1.26 is too coarse for tails; use erfc via continued expansion (W. J. Cody style rational approx).
  const t = 1 / (1 + 0.5 * Math.abs(z) / Math.SQRT2)
  const y = t * Math.exp(-(z * z) / 2 - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))))
  return z >= 0 ? 1 - y / 2 : y / 2
}
export const normPdf = (z: number) => Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI)

/** Student t CDF. */
export function tCdf(t: number, df: number) {
  if (!isFinite(df)) return normCdf(t)
  const x = df / (df + t * t)
  const p = 0.5 * ibeta(x, df / 2, 0.5)
  return t >= 0 ? 1 - p : p
}
/** Two-sided p-value for a t statistic. */
export const tTwoSided = (t: number, df: number) => Math.min(1, 2 * (1 - tCdf(Math.abs(t), df)))

/** Generic monotone inverse by bisection. */
function invert(f: (x: number) => number, target: number, lo: number, hi: number) {
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < target) lo = mid
    else hi = mid
    if (hi - lo < 1e-10) break
  }
  return (lo + hi) / 2
}
export const tQuantile = (p: number, df: number) => invert(t => tCdf(t, df), p, -1e3, 1e3)

/** Upper tail of the F distribution. */
export function fSurvival(f: number, d1: number, d2: number) {
  if (!(f > 0)) return 1
  return ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2)
}

// ---------- Quadrature over the studentised scale s = sqrt(chi2_df / df) ----------

function simpson(f: (x: number) => number, a: number, b: number, n: number) {
  if (n % 2) n++
  const h = (b - a) / n
  let s = f(a) + f(b)
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2)
  return (s * h) / 3
}

function overS(df: number, g: (s: number) => number) {
  if (!isFinite(df) || df > 2000) return g(1)
  const w = 1 / Math.sqrt(2 * df)
  const lo = Math.max(1e-9, 1 - 12 * w), hi = 1 + 12 * w + (df < 6 ? 12 : 0)
  const lc = Math.log(2) + (df / 2) * Math.log(df / 2) - lnGamma(df / 2)
  return simpson(s => Math.exp(lc + (df - 1) * Math.log(s) - (df * s * s) / 2) * g(s), lo, hi, 240)
}

/** P(studentised range of k means < q) with df error degrees of freedom. */
export function ptukey(q: number, k: number, df: number) {
  if (q <= 0) return 0
  const inner = (s: number) => k * simpson(z => normPdf(z) * Math.max(0, normCdf(z) - normCdf(z - q * s)) ** (k - 1), -8, 8, 160)
  return Math.min(1, overS(df, inner))
}
export const qtukey = (p: number, k: number, df: number) => invert(q => ptukey(q, k, df), p, 0, 60)

/**
 * P(max_i |T_i| < c) for Dunnett comparisons of each treatment against one control.
 * lambda_i = sqrt(n_i / (n_i + n_0)) gives the one-factor correlation structure, so unequal group sizes are handled.
 */
export function pdunnett(c: number, lambdas: number[], df: number) {
  const inner = (s: number) => simpson(z => {
    let p = normPdf(z)
    for (const l of lambdas) {
      const r = Math.sqrt(1 - l * l)
      p *= normCdf((c * s - l * z) / r) - normCdf((-c * s - l * z) / r)
    }
    return p
  }, -8, 8, 160)
  return Math.min(1, overS(df, inner))
}
export const qdunnett = (p: number, lambdas: number[], df: number) => invert(c => pdunnett(c, lambdas, df), p, 0, 60)

// ---------- Tests ----------

export interface TwoGroup { diff: number; se: number; df: number; stat: number; p: number; lo: number; hi: number }

/** Welch two-sample t-test of mean(a) - mean(b) with a 95% CI. */
export function welch(a: number[], b: number[], conf = 0.95): TwoGroup {
  const va = variance(a) / a.length, vb = variance(b) / b.length
  const se = Math.sqrt(va + vb)
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1))
  const diff = mean(a) - mean(b)
  const stat = diff / se
  const tc = tQuantile(1 - (1 - conf) / 2, df)
  return { diff, se, df, stat, p: se > 0 ? tTwoSided(stat, df) : diff === 0 ? 1 : 0, lo: diff - tc * se, hi: diff + tc * se }
}

/** Mann-Whitney U (two-sided). Exact when there are no ties and both groups have 12 or fewer values. */
export function mannWhitney(a: number[], b: number[]) {
  const all = [...a.map(v => ({ v, g: 0 })), ...b.map(v => ({ v, g: 1 }))].sort((x, y) => x.v - y.v)
  const ranks = new Array(all.length)
  let ties = false, tieTerm = 0
  for (let i = 0; i < all.length;) {
    let j = i
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++
    const t = j - i + 1
    if (t > 1) { ties = true; tieTerm += t ** 3 - t }
    for (let k = i; k <= j; k++) ranks[k] = (i + j) / 2 + 1
    i = j + 1
  }
  const n1 = a.length, n2 = b.length
  const r1 = sum(all.map((x, i) => (x.g === 0 ? ranks[i] : 0)))
  const u = r1 - (n1 * (n1 + 1)) / 2
  if (!ties && n1 <= 12 && n2 <= 12) {
    // counts[m][n][u]: ways to get U = u; built by the standard recursion.
    const dist = uDistribution(n1, n2)
    const total = sum(dist)
    const lower = sum(dist.slice(0, Math.floor(u) + 1)) / total
    const upper = sum(dist.slice(Math.ceil(u))) / total
    return { u, p: Math.min(1, 2 * Math.min(lower, upper)), exact: true }
  }
  const N = n1 + n2
  const mu = (n1 * n2) / 2
  const sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - tieTerm / (N * (N - 1))))
  const z = sigma > 0 ? (Math.abs(u - mu) - 0.5) / sigma : 0
  return { u, p: Math.min(1, 2 * (1 - normCdf(Math.max(0, z)))), exact: false }
}

function uDistribution(n1: number, n2: number): number[] {
  const memo = new Map<string, number[]>()
  const f = (m: number, n: number): number[] => {
    if (m === 0 || n === 0) return [1]
    const key = m + ',' + n
    const hit = memo.get(key)
    if (hit) return hit
    // Largest value belongs to group 1 (adds n to U) or group 2 (adds 0).
    const a = f(m - 1, n), b = f(m, n - 1)
    const out = new Array(m * n + 1).fill(0)
    a.forEach((c, i) => (out[i + n] += c))
    b.forEach((c, i) => (out[i] += c))
    memo.set(key, out)
    return out
  }
  return f(n1, n2)
}

export interface Anova { f: number; df1: number; df2: number; p: number; mse: number }
export function anova(groups: number[][]): Anova {
  const all = groups.flat()
  const gm = mean(all)
  const ssb = sum(groups.map(g => g.length * (mean(g) - gm) ** 2))
  const ssw = sum(groups.map(g => sum(g.map(v => (v - mean(g)) ** 2))))
  const df1 = groups.length - 1, df2 = all.length - groups.length
  const mse = ssw / df2
  const f = ssb / df1 / mse
  return { f, df1, df2, p: mse > 0 ? fSurvival(f, df1, df2) : ssb > 0 ? 0 : 1, mse }
}

/** Grubbs two-sided test for a single outlier. Returns the index, G and the critical G. */
export function grubbs(x: number[], alpha = 0.05) {
  const n = x.length
  if (n < 3) return null
  const m = mean(x), s = sd(x)
  if (!(s > 0)) return null
  let idx = 0
  x.forEach((v, i) => { if (Math.abs(v - m) > Math.abs(x[idx] - m)) idx = i })
  const g = Math.abs(x[idx] - m) / s
  const t = tQuantile(1 - alpha / (2 * n), n - 2)
  const crit = ((n - 1) / Math.sqrt(n)) * Math.sqrt((t * t) / (n - 2 + t * t))
  return { index: idx, g, crit, outlier: g > crit }
}

export function linreg(x: number[], y: number[]) {
  const mx = mean(x), my = mean(y)
  const sxx = sum(x.map(v => (v - mx) ** 2))
  const sxy = sum(x.map((v, i) => (v - mx) * (y[i] - my)))
  const syy = sum(y.map(v => (v - my) ** 2))
  const slope = sxy / sxx
  const intercept = my - slope * mx
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1
  return { slope, intercept, r2 }
}

export function pearson(x: number[], y: number[]) {
  const mx = mean(x), my = mean(y)
  const sxy = sum(x.map((v, i) => (v - mx) * (y[i] - my)))
  const d = Math.sqrt(sum(x.map(v => (v - mx) ** 2)) * sum(y.map(v => (v - my) ** 2)))
  return d > 0 ? sxy / d : 0
}

export const stars = (p: number | null) => p === null || !isFinite(p) ? '' : p < 0.0001 ? '****' : p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns'

/** Deterministic PRNG for synthetic data. */
export function rng(seed: number) {
  let a = seed >>> 0
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u())
  return { u, normal }
}
