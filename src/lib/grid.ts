/** Geographic grid helpers. bbox is always [west, south, east, north] in degrees (WGS84). */
export type BBox = [number, number, number, number];
export interface Grid {bbox: BBox; width: number; height: number}

const M_PER_DEG = 111_320;

export const metresPerDegLng = (lat: number) => M_PER_DEG * Math.cos(lat * Math.PI / 180);

/** Choose a grid of roughly `cellMetres` cells, never larger than `maxPx` on a side. */
export function makeGrid(bbox: BBox, cellMetres: number, maxPx = 400): Grid {
  const lat = (bbox[1] + bbox[3]) / 2;
  const wm = (bbox[2] - bbox[0]) * metresPerDegLng(lat), hm = (bbox[3] - bbox[1]) * M_PER_DEG;
  const scale = Math.max(1, Math.max(wm, hm) / cellMetres / maxPx);
  return {bbox, width: Math.max(1, Math.round(wm / cellMetres / scale)), height: Math.max(1, Math.round(hm / cellMetres / scale))};
}

/** A square-ish box of `sizeKm` around a point. */
export function boxAround(lat: number, lng: number, sizeKm: number): BBox {
  const dLat = sizeKm * 500 / M_PER_DEG, dLng = sizeKm * 500 / metresPerDegLng(lat);
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return [r(lng - dLng), r(lat - dLat), r(lng + dLng), r(lat + dLat)];
}

/** Index of the cell containing the point, or null when outside the grid. Row 0 is the north edge. */
export function cellAt(grid: Grid, lat: number, lng: number): number | null {
  const [w, s, e, n] = grid.bbox;
  if (lng < w || lng >= e || lat <= s || lat > n) return null;
  const col = Math.min(grid.width - 1, Math.floor((lng - w) / (e - w) * grid.width));
  const row = Math.min(grid.height - 1, Math.floor((n - lat) / (n - s) * grid.height));
  return row * grid.width + col;
}

export function cellCenter(grid: Grid, index: number): [number, number] {
  const [w, s, e, n] = grid.bbox, col = index % grid.width, row = Math.floor(index / grid.width);
  return [n - (row + .5) * (n - s) / grid.height, w + (col + .5) * (e - w) / grid.width];
}

export function cellBounds(grid: Grid, index: number): BBox {
  const [w, s, e, n] = grid.bbox, col = index % grid.width, row = Math.floor(index / grid.width);
  const dx = (e - w) / grid.width, dy = (n - s) / grid.height;
  return [w + col * dx, n - (row + 1) * dy, w + (col + 1) * dx, n - row * dy];
}

/** Area of one cell in km² (cells are equal-angle; the latitude change across a study area is negligible). */
export function cellAreaKm2(grid: Grid): number {
  const [w, s, e, n] = grid.bbox, lat = (s + n) / 2;
  return ((e - w) * metresPerDegLng(lat) / grid.width) * ((n - s) * M_PER_DEG / grid.height) / 1e6;
}

/** Fraction of the box covered by a GeoJSON (Multi)Polygon, estimated on a 12×12 sample. */
export function coverage(bbox: BBox, geometry: {type: string; coordinates: unknown}): number {
  const polys = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []) as number[][][][];
  let inside = 0;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
    const x = bbox[0] + (i + .5) / 12 * (bbox[2] - bbox[0]), y = bbox[1] + (j + .5) / 12 * (bbox[3] - bbox[1]);
    if (polys.some(rings => inRing(rings[0], x, y) && !rings.slice(1).some(h => inRing(h, x, y)))) inside++;
  }
  return inside / 144;
}
function inRing(ring: number[][], x: number, y: number) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export const gridAreaKm2 = (grid: Grid) => cellAreaKm2(grid) * grid.width * grid.height;
