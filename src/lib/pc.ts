/**
 * Minimal client for Microsoft Planetary Computer (STAC search + the data API's bbox crop).
 * Works in browsers and in Node; the caller provides a PNG decoder for its platform.
 * The data API crops, resamples and scales scenes server-side, so a whole area arrives as one small PNG.
 */
import {coverage, type BBox, type Grid} from './grid';

export const PC_API = 'https://planetarycomputer.microsoft.com/api';

export interface StacItem {
  id: string;
  collection: string;
  geometry: {type: string; coordinates: unknown};
  properties: Record<string, unknown> & {datetime: string};
}
export interface Raster {width: number; height: number; rgba: Uint8ClampedArray | Uint8Array}
export type PngDecoder = (bytes: ArrayBuffer) => Promise<Raster>;

async function getJson(url: string, init: RequestInit, signal?: AbortSignal, tries = 3): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, {...init, signal});
      if (r.ok) return await r.json();
      if (r.status < 500 && r.status !== 429) throw new Error(`HTTP ${r.status} for ${url}`);
      if (attempt >= tries) throw new Error(`HTTP ${r.status} for ${url}`);
    } catch (e) {
      if (signal?.aborted || attempt >= tries || (e instanceof Error && e.message.startsWith('HTTP 4'))) throw e;
    }
    await new Promise(res => setTimeout(res, 800 * attempt));
  }
}

export async function search(collection: string, bbox: BBox, datetime: string, opts: {query?: object; signal?: AbortSignal; max?: number} = {}): Promise<StacItem[]> {
  const items: StacItem[] = [];
  let body: object | null = {collections: [collection], bbox, datetime, limit: 100, ...(opts.query ? {query: opts.query} : {})};
  let url = `${PC_API}/stac/v1/search`;
  while (body && items.length < (opts.max ?? 400)) {
    const page = await getJson(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)}, opts.signal);
    items.push(...page.features);
    const next = (page.links ?? []).find((l: any) => l.rel === 'next');
    body = next?.body ?? null; url = next?.href ?? url;
  }
  return items;
}

export const itemCoverage = (item: StacItem, bbox: BBox) => coverage(bbox, item.geometry);
export const itemDate = (item: StacItem) => item.properties.datetime.slice(0, 10);

export function cropUrl(item: StacItem, grid: Grid, params: Record<string, string>, format = 'png'): string {
  const [w, s, e, n] = grid.bbox;
  const q = new URLSearchParams({collection: item.collection, item: item.id, ...params});
  return `${PC_API}/data/v1/item/bbox/${w},${s},${e},${n}/${grid.width}x${grid.height}.${format}?${q}`;
}

/** Fetch one grey (+alpha) band. Returns the 0–255 grey value and a validity flag per cell. */
export async function fetchBand(url: string, decode: PngDecoder, signal?: AbortSignal): Promise<{value: Uint8Array; valid: Uint8Array}> {
  let bytes: ArrayBuffer | null = null;
  for (let attempt = 1; !bytes; attempt++) {
    try {
      const r = await fetch(url, {signal});
      if (r.ok) bytes = await r.arrayBuffer();
      else if (r.status === 404 || r.status === 204) return {value: new Uint8Array(0), valid: new Uint8Array(0)}; // no data in the box
      else if (attempt >= 3 || (r.status < 500 && r.status !== 429)) throw new Error(`HTTP ${r.status}`);
    } catch (e) {if (signal?.aborted || attempt >= 3) throw e;}
    if (!bytes) await new Promise(res => setTimeout(res, 1000 * attempt));
  }
  const img = await decode(bytes);
  const n = img.width * img.height, value = new Uint8Array(n), valid = new Uint8Array(n);
  for (let i = 0; i < n; i++) {value[i] = img.rgba[i * 4]; valid[i] = img.rgba[i * 4 + 3] > 127 ? 1 : 0;}
  return {value, valid};
}

/** Group scenes that were captured on the same pass (same date and orbit) — neighbouring frames tile one area. */
export function groupPasses(items: StacItem[], key: (i: StacItem) => string = i => `${itemDate(i)}|${i.properties['sat:relative_orbit'] ?? i.properties['sat:orbit_state'] ?? ''}`) {
  const groups = new Map<string, StacItem[]>();
  for (const i of items) groups.set(key(i), [...(groups.get(key(i)) ?? []), i]);
  return [...groups.values()];
}

/** Run async jobs with a small concurrency limit (polite to the free API, and kind to slow phone connections). */
export async function pool<T, R>(items: T[], limit: number, job: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (next < items.length) {const i = next++; out[i] = await job(items[i], i);}
  }));
  return out;
}
