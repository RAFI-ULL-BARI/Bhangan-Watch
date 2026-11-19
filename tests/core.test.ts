import {describe, expect, it} from 'vitest';
import {boxAround, cellAreaKm2, cellAt, cellCenter, coverage, makeGrid, type Grid} from '../src/lib/grid';
import {decodeInt16, decodeUint8, encodeInt16, encodeUint8} from '../src/lib/codec';
import {analyze, ERODED, LAND, NEW_LAND, NODATA, UNCLEAR, WATER, type Dataset} from '../src/lib/analysis';
import {analyzeFlood, DRY, FLOOD, fromDb, NO_DATA, toDb, USUAL_WATER, waterThreshold, type FloodStudy} from '../src/lib/flood';
import {DEFAULT_SETTINGS, areaText, periodError} from '../src/lib/plain-language';
import {referenceSeason} from '../src/lib/sources';

const grid: Grid = {bbox: [90, 24, 90.1, 24.1], width: 10, height: 10};

describe('grid', () => {
  it('maps points to cells, row 0 at the north edge', () => {
    expect(cellAt(grid, 24.099, 90.001)).toBe(0);
    expect(cellAt(grid, 24.001, 90.099)).toBe(99);
    expect(cellAt(grid, 25, 90.05)).toBeNull();
    const [lat, lng] = cellCenter(grid, 0);
    expect(cellAt(grid, lat, lng)).toBe(0);
  });
  it('estimates cell area and builds sensible grids', () => {
    expect(cellAreaKm2(grid)).toBeGreaterThan(1); // ~1.13 × 1.11 km cells
    expect(cellAreaKm2(grid)).toBeLessThan(1.4);
    const g = makeGrid([89.6, 24.4, 89.8, 24.6], 100);
    expect(g.width).toBeGreaterThan(190); expect(g.height).toBeGreaterThan(200);
    expect(makeGrid([88, 22, 92, 26], 10, 400).width).toBeLessThanOrEqual(400);
  });
  it('makes a box of the requested size around a point', () => {
    const b = boxAround(24.5, 90, 16);
    expect(makeGrid(b, 1000).width).toBe(16);
  });
  it('measures footprint coverage', () => {
    expect(coverage([0, 0, 1, 1], {type: 'Polygon', coordinates: [[[-1, -1], [2, -1], [2, 2], [-1, 2], [-1, -1]]]})).toBe(1);
    expect(coverage([0, 0, 1, 1], {type: 'Polygon', coordinates: [[[-1, -1], [.5, -1], [.5, 2], [-1, 2], [-1, -1]]]})).toBe(.5);
  });
});

describe('codec', () => {
  it('round-trips typed arrays', () => {
    const a = Int16Array.from([NODATA, -1000, 0, 50, 1000]);
    expect([...decodeInt16(encodeInt16(a))]).toEqual([...a]);
    const b = Uint8Array.from({length: 70000}, (_, i) => i % 256);
    expect(decodeUint8(encodeUint8(b))).toEqual(b);
  });
});

function erosionData(before: number[][], after: number[][]): Dataset {
  const obs = (vals: number[][], y: number) => vals.map((v, k) => ({id: `${y}-${k}`, date: `${y}-02-0${k + 1}`, source: '', ndwi: encodeInt16(Int16Array.from(v))}));
  return {id: 't', name: 't', nameBn: 't', bbox: [90, 24, 90.004, 24.001], width: 4, height: 1,
    periods: [{year: 2020, image: '', observations: obs(before, 2020)}, {year: 2025, image: '', observations: obs(after, 2025)}],
    provenance: {created: '', method: '', license: ''}};
}

describe('erosion analysis', () => {
  it('classifies land→water, water→land, steady water, unclear', () => {
    const N = NODATA;
    // cells: [eroded, new land, water both, unclear]
    const d = erosionData([[-300, 400, 400, N], [-200, 300, 300, N]], [[300, -300, 400, 400], [400, -200, 400, 400], [200, -100, 300, 400]]);
    const r = analyze(d, {...DEFAULT_SETTINGS, before: 2020, after: 2025});
    expect([...r.mask]).toEqual([ERODED, NEW_LAND, WATER, UNCLEAR]);
    expect(r.coverage).toBe(.75);
    expect(r.area).toBeGreaterThan(0);
  });
  it('needs water in two-thirds of later photos and none earlier', () => {
    const d = erosionData([[-300], [-300]].map(v => [...v, 0, 0, 0]), [[300, 0, 0, 0], [-300, 0, 0, 0], [-300, 0, 0, 0]]);
    expect(analyze(d, DEFAULT_SETTINGS).mask[0]).toBe(LAND);
  });
  it('rejects a reversed period', () => {
    expect(() => analyze(erosionData([[0, 0, 0, 0]], [[0, 0, 0, 0]]), {...DEFAULT_SETTINGS, before: 2025, after: 2020})).toThrow();
    expect(periodError(2025, 2020, false)).not.toBe('');
    expect(periodError(2020, 2025, false)).toBe('');
  });
});

describe('flood analysis', () => {
  it('converts dB both ways', () => {
    expect(toDb(fromDb(-15))).toBeCloseTo(-15, 0);
  });
  it('finds a threshold between water and land, kept in range', () => {
    const v = new Uint8Array(2000);
    for (let i = 0; i < 2000; i++) v[i] = fromDb(i < 800 ? -21 + (i % 5) * .5 : -9 + (i % 7) * .5);
    const t = waterThreshold(v);
    expect(t).toBeGreaterThanOrEqual(-18); expect(t).toBeLessThanOrEqual(-13);
    expect(waterThreshold(new Uint8Array(10))).toBe(-15);
  });
  it('separates floodwater from usual water and drops speckle', () => {
    const w = 6, h = 6, n = w * h, wet = fromDb(-22), dry = fromDb(-8);
    const ev = new Uint8Array(n).fill(dry), ref = new Uint8Array(n).fill(dry);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) ev[y * w + x] = wet;    // a 3×3 flooded block
    for (let y = 0; y < 6; y++) {ev[y * w + 5] = wet; ref[y * w + 5] = wet;}        // a river on the east edge
    ev[5 * w + 2] = wet;                                                          // one isolated wet cell (noise)
    ev[5 * w + 0] = 0;                                                            // no data
    const scene = (v: Uint8Array, date: string) => ({id: date, date, orbit: 'a', source: '', vv: encodeUint8(v)});
    const study: FloodStudy = {id: 't', name: 't', nameBn: 't', bbox: [90, 24, 90.006, 24.006], width: w, height: h,
      reference: {season: '', scenes: [scene(ref, '2024-01-10'), scene(ref, '2024-02-10')]}, event: scene(ev, '2024-07-04'),
      provenance: {created: '', method: '', license: ''}};
    const r = analyzeFlood(study);
    expect(r.mask[0]).toBe(FLOOD);
    expect(r.mask[w * 2 + 5]).toBe(USUAL_WATER);
    expect(r.mask[5 * w + 2]).toBe(DRY);
    expect(r.mask[5 * w]).toBe(NO_DATA);
    expect([...r.mask].filter(m => m === FLOOD).length).toBe(9);
    expect(r.hasReference).toBe(true);
  });
  it('uses the dry season before the event', () => {
    expect(referenceSeason('2024-07-04').year).toBe(2024);
    expect(referenceSeason('2025-02-10').year).toBe(2024);
  });
});

describe('plain language', () => {
  it('describes small and large areas relatably', () => {
    expect(areaText(.5, false)).toContain('football fields');
    expect(areaText(20, false, 400)).toContain('5% of the area');
    expect(areaText(0, false)).toContain('Almost no');
  });
});
