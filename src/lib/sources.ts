/** Turn Planetary Computer scenes into the app's gridded observations. Shared by the browser and the data-prep script. */
import {cropUrl, fetchBand, groupPasses, itemCoverage, itemDate, pool, search, PC_API, type PngDecoder, type StacItem} from './pc';
import {encodeInt16, encodeUint8} from './codec';
import {coverage, makeGrid, type BBox, type Grid} from './grid';
import type {Observation} from './analysis';
import type {FloodStudy, RadarScene} from './flood';

export type Progress = (message: string) => void;
const itemLink = (i: StacItem) => `${PC_API}/stac/v1/collections/${i.collection}/items/${i.id}`;
const passCoverage = (items: StacItem[], bbox: BBox) => coverage(bbox, {type: 'MultiPolygon', coordinates: items.flatMap(i => i.geometry.type === 'Polygon' ? [i.geometry.coordinates] : i.geometry.coordinates as unknown[])});

// ---------- Sentinel-2 (optical, for river erosion) ----------

export const EROSION_CELL_M = 100;
const CLEAR_SCL = new Set([4, 5, 6]); // vegetation, bare soil, water — everything else is cloud, shadow, haze or no data

function ndwiExpression(item: StacItem) {
  // From processing baseline 04.00 (Jan 2022) L2A values carry a +1000 offset; remove it before taking the ratio.
  const baseline = parseFloat(String(item.properties['s2:processing_baseline'] ?? '0'));
  return baseline >= 4 ? '(B03-B08)/(B03+B08-2000)' : '(B03-B08)/(B03+B08)';
}

export async function fetchS2Year(grid: Grid, year: number, decode: PngDecoder, progress: Progress = () => {}, signal?: AbortSignal, maxDates = 6) {
  progress(`Searching Sentinel-2 scenes for January–March ${year}…`);
  const items = await search('sentinel-2-l2a', grid.bbox, `${year}-01-01/${year}-03-31`, {query: {'eo:cloud_cover': {lt: 40}}, signal});
  const passes = groupPasses(items, itemDate)
    .map(g => ({items: g.filter(i => itemCoverage(i, grid.bbox) > .02), cloud: Math.max(...g.map(i => Number(i.properties['eo:cloud_cover'])))}))
    .filter(p => p.items.length && passCoverage(p.items, grid.bbox) >= .6)
    .sort((a, b) => a.cloud - b.cloud);
  progress(`${items.length} scenes found; ${passes.length} cover the area. Reading the clearest ${Math.min(maxDates, passes.length)}…`);
  const chosen = passes.slice(0, maxDates + 3); // a few spares in case some turn out cloudy over this exact box
  const n = grid.width * grid.height;
  const observations: (Observation & {clear: number})[] = [];
  let done = 0;
  await pool(chosen, 2, async pass => {
    if (observations.length >= maxDates) return;
    const ndwi = new Int16Array(n).fill(-32768);
    for (const item of pass.items) {
      const [w, scl] = await Promise.all([
        fetchBand(cropUrl(item, grid, {expression: ndwiExpression(item), asset_as_band: 'true', rescale: '-1,1', resampling: 'average'}), decode, signal),
        fetchBand(cropUrl(item, grid, {assets: 'SCL', resampling: 'mode'}), decode, signal),
      ]);
      if (w.value.length !== n || scl.value.length !== n) continue;
      for (let i = 0; i < n; i++)
        if (ndwi[i] === -32768 && w.valid[i] && scl.valid[i] && CLEAR_SCL.has(scl.value[i])) ndwi[i] = Math.round((w.value[i] / 255 * 2 - 1) * 1000);
    }
    let clear = 0; for (let i = 0; i < n; i++) if (ndwi[i] !== -32768) clear++;
    progress(`Scene ${++done}/${chosen.length}: ${itemDate(pass.items[0])} — ${Math.round(clear / n * 100)}% clear`);
    if (clear / n >= .25) observations.push({id: pass.items.map(i => i.id).join('+'), date: itemDate(pass.items[0]), source: itemLink(pass.items[0]), ndwi: encodeInt16(ndwi), clear});
  });
  if (observations.length < 2) throw new Error(`Only ${observations.length} clear observation(s) for ${year}`);
  // Keep the clearest `maxDates` (two downloads run at once, so one extra can arrive), then put them in date order.
  const kept = [...observations].sort((a, b) => b.clear - a.clear).slice(0, maxDates);
  const photoItems = chosen.find(p => p.items.some(i => kept[0].id.split('+').includes(i.id)))!.items;
  return {
    observations: kept.sort((a, b) => a.date.localeCompare(b.date)).map(({clear: _c, ...o}) => o),
    /** URLs of true-colour crops (one per tile of the clearest pass) to be layered into one picture */
    photoUrls: photoItems.map(i => cropUrl(i, photoGrid(grid), {assets: 'visual'}, 'png')),
  };
}

/** A sharper grid for display pictures (about 4× the analysis grid, ≤ 1000 px). */
export const photoGrid = (grid: Grid): Grid => {
  const s = Math.min(4, 1000 / Math.max(grid.width, grid.height));
  return {bbox: grid.bbox, width: Math.round(grid.width * s), height: Math.round(grid.height * s)};
};

// ---------- Sentinel-1 (radar, for floods) ----------

export const FLOOD_CELL_M = 60;
export const floodGrid = (bbox: BBox) => makeGrid(bbox, FLOOD_CELL_M, 360);
const S1_PARAMS = {expression: '10*log10(vv)', asset_as_band: 'true', rescale: '-30,5', resampling: 'average'};

export interface RadarPass {date: string; /** acquisition time (UTC, ISO) */ time: string; orbit: string; items: StacItem[]; coverage: number}

export async function listRadarPasses(bbox: BBox, from: string, to: string, signal?: AbortSignal): Promise<RadarPass[]> {
  const items = await search('sentinel-1-rtc', bbox, `${from}/${to}`, {signal});
  return groupPasses(items)
    .map(g => ({date: itemDate(g[0]), time: g[0].properties.datetime, orbit: String(g[0].properties['sat:orbit_state'] ?? ''), items: g.filter(i => itemCoverage(i, bbox) > .02), coverage: passCoverage(g, bbox)}))
    .filter(p => p.items.length && p.coverage >= .5)
    .sort((a, b) => b.date.localeCompare(a.date) || b.coverage - a.coverage);
}

async function readPass(pass: RadarPass, grid: Grid, decode: PngDecoder, signal?: AbortSignal): Promise<RadarScene> {
  const n = grid.width * grid.height, v = new Uint8Array(n);
  for (const item of pass.items) {
    const b = await fetchBand(cropUrl(item, grid, S1_PARAMS), decode, signal);
    if (b.value.length !== n) continue;
    for (let i = 0; i < n; i++) if (!v[i] && b.valid[i]) v[i] = Math.max(1, b.value[i]);
  }
  return {id: pass.items.map(i => i.id).join('+'), date: pass.date, time: pass.time, orbit: pass.orbit, source: itemLink(pass.items[0]), vv: encodeUint8(v)};
}

/** Dry-season (January–March) passes before the event, preferring the same orbit direction. */
export function referenceSeason(eventDate: string) {
  const year = Number(eventDate.slice(0, 4)) - (Number(eventDate.slice(5, 7)) <= 4 ? 1 : 0);
  return {year, from: `${year}-01-01`, to: `${year}-03-31`};
}

export async function buildFloodStudy(
  area: {id: string; name: string; nameBn: string; bbox: BBox}, event: RadarPass,
  decode: PngDecoder, progress: Progress = () => {}, signal?: AbortSignal, population?: string,
): Promise<FloodStudy> {
  const grid = floodGrid(area.bbox), season = referenceSeason(event.date);
  progress(`Finding dry-season radar scenes (January–March ${season.year})…`);
  const dry = await listRadarPasses(area.bbox, season.from, season.to, signal);
  const same = dry.filter(p => p.orbit === event.orbit && p.coverage >= .8), pickFrom = same.length >= 2 ? same : dry.filter(p => p.coverage >= .8).length >= 2 ? dry.filter(p => p.coverage >= .8) : dry;
  // Spread the picks across the season rather than taking four neighbouring dates.
  const sorted = [...pickFrom].sort((a, b) => a.date.localeCompare(b.date));
  const refs = sorted.length <= 4 ? sorted : [0, 1, 2, 3].map(k => sorted[Math.round(k * (sorted.length - 1) / 3)]);
  progress(`Reading ${refs.length} dry-season scene(s) and the scene from ${event.date}…`);
  let done = 0;
  const scenes = await pool([event, ...refs], 2, async p => {const s = await readPass(p, grid, decode, signal); progress(`Read ${++done}/${refs.length + 1}: ${p.date}`); return s;});
  return {
    id: area.id, name: area.name, nameBn: area.nameBn, bbox: grid.bbox, width: grid.width, height: grid.height,
    reference: {season: `${season.year}-01/${season.year}-03`, scenes: scenes.slice(1)},
    event: scenes[0],
    ...(population ? {population} : {}),
    provenance: {
      created: new Date().toISOString(),
      method: `Sentinel-1 RTC VV, averaged to ~${FLOOD_CELL_M} m; per-scene Otsu water threshold within −18…−13 dB; usual water = water in ≥ half of dry-season scenes.`,
      license: 'Contains modified Copernicus Sentinel data, processed by Microsoft Planetary Computer (Sentinel-1 RTC).',
    },
  };
}
