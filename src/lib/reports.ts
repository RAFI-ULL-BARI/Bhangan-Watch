/** Downloads (CSV, GeoJSON, JSON) and the printable one-page report. */
import {cellBounds, cellCenter, cellAreaKm2, gridAreaKm2, type Grid} from './grid';
import {decodeUint16} from './codec';
import {ERODED, NEW_LAND, type Dataset, type Result} from './analysis';
import {FLOOD, type FloodResult, type FloodStudy} from './flood';
import {EROSION_PALETTE, FLOOD_PALETTE, composite, maskCanvas, radarCanvas} from './render';
import {decodeUint8} from './codec';
import {areaText, floodAreaText, longDate, peopleText, year} from './plain-language';
import {dhakaLongDate} from './live-layers';

export function download(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = Object.assign(document.createElement('a'), {href: url, download: filename});
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const classes = (mask: Uint8Array, wanted: Record<number, string>) => {
  const out: [number, string][] = []; mask.forEach((m, i) => {if (wanted[m]) out.push([i, wanted[m]]);}); return out;
};
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

function cellsCSV(grid: Grid, cells: [number, string][], population?: string) {
  const pop = population ? decodeUint16(population) : null, km2 = cellAreaKm2(grid);
  return ['latitude,longitude,class,cell_area_km2' + (pop ? ',worldpop_2020_people' : ''),
    ...cells.map(([i, c]) => {const [lat, lng] = cellCenter(grid, i); return `${r6(lat)},${r6(lng)},${c},${km2.toFixed(5)}${pop ? ',' + pop[i] : ''}`;})].join('\n');
}
function cellsGeoJSON(grid: Grid, cells: [number, string][], properties: object, population?: string) {
  const pop = population ? decodeUint16(population) : null;
  return JSON.stringify({type: 'FeatureCollection', properties, features: cells.map(([i, c]) => {
    const [w, s, e, n] = cellBounds(grid, i).map(r6);
    return {type: 'Feature', properties: {class: c, ...(pop ? {worldpop_2020_people: pop[i]} : {})}, geometry: {type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}};
  })});
}

// ----- erosion -----
const EROSION_CLASSES = {[ERODED]: 'land_to_water', [NEW_LAND]: 'water_to_land'};
export const exportCSV = (d: Dataset, r: Result) => download(`BhanganWatch-${d.id}-${r.before.year}-${r.after.year}.csv`, cellsCSV(d, classes(r.mask, EROSION_CLASSES), d.population), 'text/csv');
export const exportGeoJSON = (d: Dataset, r: Result) => download(`BhanganWatch-${d.id}-${r.before.year}-${r.after.year}.geojson`, cellsGeoJSON(d, classes(r.mask, EROSION_CLASSES), {area: d.name, before: r.before.year, after: r.after.year, settings: r.settings}, d.population), 'application/geo+json');
export const exportSummary = (d: Dataset, r: Result) => download(`BhanganWatch-${d.id}-${r.before.year}-${r.after.year}-summary.json`, JSON.stringify({
  area: d.name, bbox: d.bbox, grid: {width: d.width, height: d.height, cell_km2: cellAreaKm2(d)}, settings: r.settings,
  before: {year: r.before.year, observations: r.before.observations.map(o => ({date: o.date, id: o.id, source: o.source}))},
  after: {year: r.after.year, observations: r.after.observations.map(o => ({date: o.date, id: o.id, source: o.source}))},
  land_to_water_km2: r.area, water_to_land_km2: r.newLand, clear_coverage: r.coverage, worldpop_2020_people_in_land_to_water: r.people, provenance: d.provenance,
}, null, 2));

// ----- floods -----
const FLOOD_CLASSES = {[FLOOD]: 'flood_water'};
export const exportFloodCSV = (s: FloodStudy, r: FloodResult) => download(`BhanganWatch-flood-${s.id}-${s.event.date}.csv`, cellsCSV(s, classes(r.mask, FLOOD_CLASSES), s.population), 'text/csv');
export const exportFloodGeoJSON = (s: FloodStudy, r: FloodResult) => download(`BhanganWatch-flood-${s.id}-${s.event.date}.geojson`, cellsGeoJSON(s, classes(r.mask, FLOOD_CLASSES), {area: s.name, date: s.event.date, threshold_db: r.threshold, method: s.provenance.method}, s.population), 'application/geo+json');

// ----- printable report -----
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]!));

interface ReportContent {title: string; subtitle: string; image: Promise<string>; legend: [string, string][]; findings: string[]; cautions: string[]; sources: string[]}

function openReport(c: ReportContent, bn: boolean) {
  // Open the window synchronously (inside the click) so pop-up blockers allow it, then fill it in.
  const win = window.open('', '_blank');
  if (!win) throw new Error('Pop-up blocked');
  const body = (img: string) => `<!doctype html><html lang="${bn ? 'bn' : 'en'}"><head><meta charset="utf-8"><title>${esc(c.title)}</title>
<style>body{font-family:'Noto Sans Bengali',Arial,sans-serif;color:#1f3328;max-width:760px;margin:24px auto;padding:0 18px;line-height:1.6}h1{font-size:24px;margin:0}
.sub{color:#58685d;margin:4px 0 16px}img{width:100%;border:1px solid #ccd6c9;border-radius:6px}.legend{display:flex;gap:18px;flex-wrap:wrap;font-size:14px;margin:8px 0 14px}
.legend span:before{content:'';display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:6px;vertical-align:-1px;background:var(--c)}
.box{background:#eef3e9;border-radius:6px;padding:10px 14px;margin:10px 0}.caution{border-left:3px solid #c9a64a;background:#fff8e6;padding:10px 14px}
small{color:#58685d;display:block;margin-top:14px;overflow-wrap:anywhere}button{font:inherit;padding:8px 16px;margin:12px 0}@media print{button{display:none}}</style></head>
<body><button onclick="print()">${bn ? 'প্রিন্ট / PDF হিসেবে রাখুন' : 'Print / save as PDF'}</button><h1>${esc(c.title)}</h1><p class="sub">${esc(c.subtitle)}</p>
${img ? `<img src="${img}" alt="">` : ''}<div class="legend">${c.legend.map(([col, t]) => `<span style="--c:${col}">${esc(t)}</span>`).join('')}</div>
${c.findings.map(f => `<p class="box">${esc(f)}</p>`).join('')}<div class="caution">${c.cautions.map(f => `<p>${esc(f)}</p>`).join('')}</div>
<small>${c.sources.map(esc).join('<br>')}<br>${bn ? 'তৈরি' : 'Made'}: ${new Date().toLocaleString(bn ? 'bn-BD' : 'en-GB')} · BhanganWatch</small></body></html>`;
  win.document.write(body('')); win.document.close();
  c.image.then(img => {win.document.open(); win.document.write(body(img)); win.document.close();}).catch(() => {});
}

export function printReport(d: Dataset, r: Result, bn: boolean) {
  const overlay = maskCanvas(d.width, d.height, r.mask, EROSION_PALETTE);
  const photo = r.after.image.startsWith('/data/') ? `${import.meta.env.BASE_URL}${r.after.image.slice(1)}` : r.after.image;
  openReport({
    title: bn ? `নদীর পরিবর্তন: ${d.nameBn}` : `River changes: ${d.name}`,
    subtitle: `${year(r.before.year, bn)} → ${year(r.after.year, bn)} · ${bn ? 'জানুয়ারি–মার্চের স্যাটেলাইট ছবি' : 'January–March satellite photos'}`,
    image: composite(photo, overlay),
    legend: [['#e14c31', bn ? 'আগে মাটি, পরে পানি' : 'Land before, water later'], ['#deaa34', bn ? 'আগে পানি, পরে মাটি (নতুন চর)' : 'Water before, land later (new char)']],
    findings: [areaText(r.area, bn, gridAreaKm2(d)), peopleText(r.people, bn, false)].filter(Boolean),
    cautions: bn
      ? ['পানির স্তর বদলায়, আর মেঘ বা ফসলের কারণে ছবি ভুল হতে পারে। লাল চিহ্ন মানেই জমি চিরতরে হারিয়েছে, তা নয়। চিহ্ন না থাকলেও জায়গা নিরাপদ নয়।', 'জায়গাগুলো সরাসরি যাচাই করা হয়নি।']
      : ['Water levels change, and clouds or crops can make photos wrong. A red mark does not prove land is lost for good. No mark does not mean a place is safe.', 'These places have not been checked on the ground.'],
    sources: [d.provenance.license, d.provenance.method],
  }, bn);
}

export function printFloodReport(s: FloodStudy, r: FloodResult, bn: boolean) {
  const overlay = maskCanvas(s.width, s.height, r.mask, FLOOD_PALETTE);
  openReport({
    title: bn ? `বন্যার পানি: ${s.nameBn}` : `Floodwater: ${s.name}`,
    subtitle: `${bn ? 'স্যাটেলাইট রাডারের ছবি' : 'Satellite radar photo'} · ${(s.event.time ? dhakaLongDate(s.event.time, bn) : longDate(s.event.date, bn))}`,
    image: composite(radarCanvas(s.width, s.height, decodeUint8(s.event.vv)), overlay),
    legend: [['#1e6eff', bn ? 'বন্যার পানি (স্বাভাবিকের বাইরে)' : 'Floodwater (not usually there)'], ['#0c2648', bn ? 'সাধারণত পানি থাকে' : 'Usually water']],
    findings: [floodAreaText(r.floodedKm2, bn, gridAreaKm2(s)), peopleText(r.people, bn, true)].filter(Boolean),
    cautions: bn
      ? ['এটি একটি নির্দিষ্ট দিনের ছবি, এখনকার অবস্থা নয়। গাছপালা, ঘরবাড়ি বা শহরের মাঝে পানি থাকলে ছবিতে ধরা না-ও পড়তে পারে।', 'বন্যার সতর্কবার্তার জন্য বন্যা পূর্বাভাস ও সতর্কীকরণ কেন্দ্র (ffwc.gov.bd) দেখুন বা ১০৯০ নম্বরে ফোন করুন। জরুরি প্রয়োজনে ৯৯৯।']
      : ['This is one day’s photo, not the situation now. Water among trees, homes or in towns may not show up.', 'For flood warnings use the Flood Forecasting and Warning Centre (ffwc.gov.bd) or call 1090. In an emergency call 999.'],
    sources: [s.provenance.license, s.provenance.method],
  }, bn);
}
