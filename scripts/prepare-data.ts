/**
 * Builds the prepared datasets in public/data from public satellite archives (Microsoft Planetary Computer)
 * and WorldPop 2020. Uses exactly the same fetch/analysis code as the app.
 *
 *   npm run prepare-data                 # everything
 *   npm run prepare-data -- erosion      # only erosion reaches
 *   npm run prepare-data -- flood feni   # only one flood area
 */
import {mkdir, writeFile, readFile, stat} from 'node:fs/promises';
import {PNG} from 'pngjs';
import jpeg from 'jpeg-js';
import {fromArrayBuffer} from 'geotiff';
import {EROSION_AREAS, EROSION_YEARS, FLOOD_AREAS, type Area} from '../src/lib/areas';
import {makeGrid, type Grid} from '../src/lib/grid';
import {encodeUint16} from '../src/lib/codec';
import {buildFloodStudy, EROSION_CELL_M, fetchS2Year, floodGrid, listRadarPasses, photoGrid} from '../src/lib/sources';
import {analyze, type Dataset, type Period} from '../src/lib/analysis';
import {analyzeFlood} from '../src/lib/flood';
import type {PngDecoder} from '../src/lib/pc';

const OUT = new URL('../public/data/', import.meta.url), CACHE = new URL('./.cache/', import.meta.url);
const WORLDPOP = 'https://data.worldpop.org/GIS/Population/Global_2000_2020_Constrained/2020/BSGM/BGD/bgd_ppp_2020_constrained.tif';
const decode: PngDecoder = async bytes => {const p = PNG.sync.read(Buffer.from(bytes)); return {width: p.width, height: p.height, rgba: p.data};};
const log = (m: string) => console.log('  ' + m);
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * 864e5).toISOString().slice(0, 10);

let worldpop: Awaited<ReturnType<typeof loadWorldPop>> | undefined;
async function loadWorldPop() {
  await mkdir(CACHE, {recursive: true});
  const file = new URL('worldpop-bgd-2020.tif', CACHE);
  if (!await stat(file).catch(() => null)) {
    console.log('Downloading WorldPop 2020 (Bangladesh, ~15 MB)…');
    const r = await fetch(WORLDPOP); if (!r.ok) throw new Error(`WorldPop HTTP ${r.status}`);
    await writeFile(file, Buffer.from(await r.arrayBuffer()));
  }
  const buf = await readFile(file);
  const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return tiff.getImage();
}
/** People per grid cell: sum WorldPop pixels whose centres fall in each cell. */
async function population(grid: Grid): Promise<string> {
  worldpop ??= await loadWorldPop();
  const img = worldpop, [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution(); // ry is negative
  const [w, s, e, n] = grid.bbox;
  const x0 = Math.floor((w - ox) / rx), x1 = Math.ceil((e - ox) / rx), y0 = Math.floor((n - oy) / ry), y1 = Math.ceil((s - oy) / ry);
  const [data] = await img.readRasters({window: [x0, y0, x1, y1]}) as unknown as [Float32Array];
  const nodata = Number(img.getGDALNoData() ?? -99999), out = new Float64Array(grid.width * grid.height), ww = x1 - x0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const v = data[(y - y0) * ww + (x - x0)]; if (!(v > 0) || v === nodata) continue;
    const lng = ox + (x + .5) * rx, lat = oy + (y + .5) * ry;
    if (lng < w || lng >= e || lat <= s || lat > n) continue;
    const col = Math.floor((lng - w) / (e - w) * grid.width), row = Math.floor((n - lat) / (n - s) * grid.height);
    out[row * grid.width + col] += v;
  }
  return encodeUint16(Uint16Array.from(out, v => Math.min(65535, Math.round(v))));
}

async function mosaicJpeg(urls: string[], file: URL) {
  let base: {width: number; height: number; data: Buffer} | undefined;
  for (const url of urls) {
    const r = await fetch(url); if (!r.ok) continue;
    const p = PNG.sync.read(Buffer.from(await r.arrayBuffer()));
    if (!base) {base = {width: p.width, height: p.height, data: Buffer.alloc(p.width * p.height * 4)}; }
    for (let i = 0; i < p.width * p.height; i++) if (base.data[i * 4 + 3] === 0 && p.data[i * 4 + 3] > 0) p.data.copy(base.data, i * 4, i * 4, i * 4 + 4);
  }
  if (!base) throw new Error('No photo could be downloaded');
  for (let i = 0; i < base.width * base.height; i++) if (base.data[i * 4 + 3] === 0) base.data.set([220, 228, 216, 255], i * 4);
  await writeFile(file, jpeg.encode(base, 82).data);
}

async function erosion(area: Area) {
  console.log(`Erosion · ${area.name}`);
  const grid = makeGrid(area.bbox, EROSION_CELL_M, 400), periods: Period[] = [];
  for (const year of EROSION_YEARS) {
    const {observations, photoUrls} = await fetchS2Year(grid, year, decode, log);
    const name = `${area.id}-${year}.jpg`;
    await mosaicJpeg(photoUrls, new URL(name, OUT));
    periods.push({year, image: `/data/${name}`, observations});
    log(`${year}: ${observations.length} observations, photo ${photoGrid(grid).width}×${photoGrid(grid).height}`);
  }
  const data: Dataset = {
    id: area.id, name: area.name, nameBn: area.bn, bbox: grid.bbox, width: grid.width, height: grid.height, periods,
    population: await population(grid),
    provenance: {
      created: new Date().toISOString(),
      method: `Sentinel-2 L2A NDWI (B03, B08; baseline offset removed), averaged to ~${EROSION_CELL_M} m; clear = SCL 4, 5 or 6 (modal class per cell).`,
      license: 'Contains modified Copernicus Sentinel data, processed by Microsoft Planetary Computer. Population: WorldPop 2020 constrained estimate (CC BY 4.0).',
    },
  };
  const r = analyze(data, {before: 2020, after: 2025, threshold: .05, minClear: 2, afterFraction: 2 / 3});
  log(`2020→2025: ${r.area.toFixed(2)} km² land→water, ${r.newLand.toFixed(2)} km² new land, coverage ${(r.coverage * 100).toFixed(0)}%, people ${r.people}`);
  await writeFile(new URL(`${area.id}.json`, OUT), JSON.stringify(data));
}

async function flood(area: Area) {
  if (!area.example) return;
  console.log(`Flood · ${area.name} · ${area.example.date}`);
  const passes = await listRadarPasses(area.bbox, shift(area.example.date, -6), shift(area.example.date, 6));
  if (!passes.length) throw new Error('No radar pass near that date');
  const day = Date.parse(area.example.date);
  const pass = passes.sort((a, b) => Math.abs(Date.parse(a.date) - day) - Math.abs(Date.parse(b.date) - day) || b.coverage - a.coverage)[0];
  log(`Using pass ${pass.date} (${pass.orbit}, ${Math.round(pass.coverage * 100)}% coverage); candidates: ${passes.map(p => p.date).join(', ')}`);
  const study = await buildFloodStudy({id: area.id, name: area.name, nameBn: area.bn, bbox: area.bbox}, pass, decode, log, undefined, await population(floodGrid(area.bbox)));
  const r = analyzeFlood(study);
  log(`Grid ${study.width}×${study.height}; threshold ${r.threshold.toFixed(1)} dB (refs ${r.referenceThresholds.map(t => t.toFixed(1)).join(', ')}); flooded ${r.floodedKm2.toFixed(1)} km², usual water ${r.usualKm2.toFixed(1)} km², people ${r.people}`);
  await writeFile(new URL(`flood-${area.id}.json`, OUT), JSON.stringify(study));
}

const [kind, only] = process.argv.slice(2);
await mkdir(OUT, {recursive: true});
if (!kind || kind === 'erosion') for (const a of EROSION_AREAS) if (!only || a.id === only) await erosion(a);
if (!kind || kind === 'flood') for (const a of FLOOD_AREAS) if (!only || a.id === only) await flood(a);
