/**
 * River-erosion analysis from Sentinel-2 dry-season water index (NDWI) observations.
 *
 * Per ~100 m cell, a cell is "land that became water" when:
 *  - each period has at least `minClear` clear (cloud-free) observations,
 *  - no clear observation in the earlier period detected water, and
 *  - at least `afterFraction` of clear observations in the later period detected water.
 * Water = NDWI > threshold. Using several photos per year guards against one odd day.
 */
import {cellAreaKm2, cellAt as gridCellAt, type BBox} from './grid';
import {decodeInt16, decodeUint16} from './codec';
import {EROSION_AREAS} from './areas';

export interface Observation {id: string; date: string; source: string; /** base64 Int16 NDWI×1000, -32768 = not clear */ ndwi: string}
export interface Period {year: number; /** true-colour picture of the area for this year */ image: string; observations: Observation[]}
export interface Dataset {
  id: string; name: string; nameBn: string;
  bbox: BBox; width: number; height: number;
  periods: Period[];
  /** base64 Uint16 WorldPop 2020 people per cell (estimate) */
  population?: string;
  provenance: {created: string; method: string; license: string};
}
export interface Settings {before: number; after: number; threshold: number; minClear: number; afterFraction: number}

/** Cell classes. */
export const LAND = 0, ERODED = 1, UNCLEAR = 2, WATER = 3, NEW_LAND = 4;
export type CellClass = typeof LAND | typeof ERODED | typeof UNCLEAR | typeof WATER | typeof NEW_LAND;

export interface Result {
  settings: Settings;
  before: Period; after: Period;
  mask: Uint8Array;
  /** km² of land that became water */
  area: number;
  /** km² of water that became land (new char land) */
  newLand: number;
  /** fraction of cells with enough clear photos in both periods */
  coverage: number;
  /** WorldPop 2020 estimate of people living in cells that became water */
  people: number | null;
}

export const REACHES = EROSION_AREAS.map(({id, name, bn}) => ({id, name, bn}));

export const NODATA = -32768;
export const decode = decodeInt16;

interface Tally {clear: Uint16Array; water: Uint16Array}
function tally(period: Period, n: number, threshold: number): Tally {
  const clear = new Uint16Array(n), water = new Uint16Array(n), t = threshold * 1000;
  for (const o of period.observations) {
    const v = decode(o.ndwi);
    if (v.length !== n) throw new Error(`Observation ${o.id} does not match the grid`);
    for (let i = 0; i < n; i++) if (v[i] !== NODATA) {clear[i]++; if (v[i] > t) water[i]++;}
  }
  return {clear, water};
}

export function analyze(data: Dataset, settings: Settings): Result {
  const before = data.periods.find(p => p.year === settings.before), after = data.periods.find(p => p.year === settings.after);
  if (!before || !after) throw new Error('Missing period');
  if (before.year >= after.year) throw new Error('The earlier year must come first');
  const n = data.width * data.height, a = tally(before, n, settings.threshold), b = tally(after, n, settings.threshold);
  const mask = new Uint8Array(n), people = data.population ? decodeUint16(data.population) : null;
  let eroded = 0, grown = 0, covered = 0, affected = 0;
  for (let i = 0; i < n; i++) {
    if (a.clear[i] < settings.minClear || b.clear[i] < settings.minClear) {mask[i] = UNCLEAR; continue;}
    covered++;
    const wasLand = a.water[i] === 0, wasWater = a.water[i] / a.clear[i] >= settings.afterFraction;
    const isWater = b.water[i] / b.clear[i] >= settings.afterFraction, isLand = b.water[i] === 0;
    if (wasLand && isWater) {mask[i] = ERODED; eroded++; if (people) affected += people[i];}
    else if (wasWater && isLand) {mask[i] = NEW_LAND; grown++;}
    else if (wasWater && isWater) mask[i] = WATER;
    else mask[i] = LAND;
  }
  const km2 = cellAreaKm2(data);
  return {settings, before, after, mask, area: eroded * km2, newLand: grown * km2, coverage: covered / n, people: people ? Math.round(affected) : null};
}

export const cellAt = (data: Dataset, lat: number, lng: number) => gridCellAt(data, lat, lng);
