/**
 * Flood mapping from Sentinel-1 radar (VV backscatter, terrain-corrected).
 *
 * Calm water reflects the radar beam away from the satellite, so it looks very dark. Radar sees
 * through cloud and rain, which is what makes it usable during the monsoon when optical photos are blank.
 *
 *  1. Each scene gets its own water threshold: Otsu's method on its histogram, kept within −18…−13 dB
 *     (wind can roughen water and shift its darkness from about −24 to −14 dB).
 *  2. "Usual water" = water in at least half of the dry-season (Jan–Mar) reference scenes — rivers, ponds, haors.
 *  3. "Flood water" = water on the chosen day that is not usual water. Isolated single cells are dropped as noise.
 */
import {cellAreaKm2, type BBox} from './grid';
import {decodeUint16, decodeUint8} from './codec';

export interface RadarScene {
  id: string; date: string; orbit: string; source: string;
  /** acquisition time (UTC, ISO); missing in older prepared files */
  time?: string;
  /** base64 Uint8 per cell: 0 = no data, otherwise dB = −30 + v × 35 / 255 */
  vv: string;
}
export interface FloodStudy {
  id: string; name: string; nameBn: string;
  bbox: BBox; width: number; height: number;
  reference: {season: string; scenes: RadarScene[]};
  event: RadarScene;
  population?: string;
  provenance: {created: string; method: string; license: string};
}

export const DRY = 0, FLOOD = 1, USUAL_WATER = 2, NO_DATA = 3;

export interface FloodResult {
  mask: Uint8Array;
  threshold: number;
  referenceThresholds: number[];
  floodedKm2: number;
  usualKm2: number;
  /** fraction of cells with a radar value on the chosen day */
  coverage: number;
  hasReference: boolean;
  people: number | null;
}

export const toDb = (v: number) => -30 + v * 35 / 255;
export const fromDb = (db: number) => Math.max(1, Math.min(255, Math.round((db + 30) * 255 / 35)));
export const MIN_DB = -18, MAX_DB = -13;

/** Otsu threshold (in dB) over cells in −25…−5 dB, clamped to the plausible water range. */
export function waterThreshold(v: Uint8Array): number {
  const lo = fromDb(-25), hi = fromDb(-5), hist = new Float64Array(256);
  let total = 0;
  for (let i = 0; i < v.length; i++) if (v[i] >= lo && v[i] <= hi) {hist[v[i]]++; total++;}
  if (total < 50) return -15;
  let sum = 0; for (let t = lo; t <= hi; t++) sum += t * hist[t];
  let w0 = 0, sum0 = 0, best = -1, bestT = fromDb(-15);
  for (let t = lo; t < hi; t++) {
    w0 += hist[t]; sum0 += t * hist[t];
    const w1 = total - w0; if (w0 === 0 || w1 === 0) continue;
    const between = w0 * w1 * (sum0 / w0 - (sum - sum0) / w1) ** 2;
    if (between > best) {best = between; bestT = t + .5;}
  }
  return Math.max(MIN_DB, Math.min(MAX_DB, toDb(bestT)));
}

export function analyzeFlood(study: FloodStudy): FloodResult {
  const n = study.width * study.height, ev = decodeUint8(study.event.vv);
  if (ev.length !== n) throw new Error('Scene does not match the grid');
  const threshold = waterThreshold(ev);
  const refs = study.reference.scenes.map(s => decodeUint8(s.vv)).filter(r => r.length === n);
  const refCuts = refs.map(r => waterThreshold(r));
  const seen = new Uint8Array(n), wet = new Uint8Array(n);
  refs.forEach((r, k) => {for (let i = 0; i < n; i++) if (r[i]) {seen[i]++; if (toDb(r[i]) < refCuts[k]) wet[i]++;}});

  const water = new Uint8Array(n);
  for (let i = 0; i < n; i++) water[i] = ev[i] && toDb(ev[i]) < threshold ? 1 : 0;
  const mask = new Uint8Array(n), w = study.width, h = study.height;
  let flooded = 0, usual = 0, valid = 0, affected = 0;
  const people = study.population ? decodeUint16(study.population) : null;
  for (let i = 0; i < n; i++) {
    if (!ev[i]) {mask[i] = NO_DATA; continue;}
    valid++;
    const usualWater = seen[i] > 0 && wet[i] * 2 >= seen[i];
    if (!water[i]) {mask[i] = DRY; continue;}
    if (usualWater) {mask[i] = USUAL_WATER; usual++; continue;}
    // Drop speckle: keep a flood cell only when at least two neighbours are also water.
    const x = i % w, y = (i - x) / w; let nb = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && water[yy * w + xx]) nb++;
    }
    if (nb < 2) {mask[i] = DRY; continue;}
    mask[i] = FLOOD; flooded++; if (people) affected += people[i];
  }
  const km2 = cellAreaKm2(study);
  return {mask, threshold, referenceThresholds: refCuts, floodedKm2: flooded * km2, usualKm2: usual * km2, coverage: valid / n, hasReference: refs.length > 0, people: people ? Math.round(affected) : null};
}

/** What one cell looked like on each scene, for the "about this spot" panel. */
export function cellReadings(study: FloodStudy, result: FloodResult, cell: number) {
  const refs = study.reference.scenes.filter(s => decodeUint8(s.vv).length === study.width * study.height);
  return [...refs.map((s, k) => ({s, t: result.referenceThresholds[k], reference: true})), {s: study.event, t: result.threshold, reference: false}].map(({s, t, reference}) => {
    const v = decodeUint8(s.vv)[cell];
    return {date: s.date, reference, water: v ? toDb(v) < t : null};
  });
}
