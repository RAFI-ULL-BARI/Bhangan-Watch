/**
 * Near-real-time map layers from free public services that browsers may call directly (CORS allowed):
 *  - NASA GIBS: IMERG rain every 30 minutes, MODIS/VIIRS daily flood maps, VIIRS daily true-colour photo
 *  - Copernicus GloFAS: GFM flood maps from every Sentinel-1 radar pass (20 m), and river flood forecasts
 * Each layer knows how to find its newest available time, so the app can say how fresh it is.
 */

export const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
export const GLOFAS_WMS = 'https://ows.globalfloods.eu/glofas-ows/ows.py';

export type LayerId = 'rain' | 'radar' | 'nasa' | 'forecast' | 'photo';

export interface LegendItem {color: string; en: string; bn: string}
export interface LayerInfo {
  id: LayerId; en: string; bn: string;
  what: {en: string; bn: string};
  source: string; sourceUrl: string;
  legend: LegendItem[];
}

export const LAYERS: LayerInfo[] = [
  {
    id: 'rain', en: 'Rain now', bn: 'এখনকার বৃষ্টি',
    what: {en: 'Rain measured from space every 30 minutes (about 10 km detail). Heavy rain upstream or in the hills can bring a flash flood within hours.', bn: 'মহাকাশ থেকে প্রতি ৩০ মিনিটে মাপা বৃষ্টি (প্রায় ১০ কিমি মাপের)। উজানে বা পাহাড়ে ভারী বৃষ্টি হলে কয়েক ঘণ্টার মধ্যে আকস্মিক বন্যা আসতে পারে।'},
    source: 'NASA GPM IMERG (Early Run), via NASA GIBS', sourceUrl: 'https://gpm.nasa.gov/data/imerg',
    legend: [
      {color: '#00963a', en: 'Light', bn: 'হালকা'},
      {color: '#f5e000', en: 'Moderate (1–4 mm/h)', bn: 'মাঝারি (১–৪ মিমি/ঘণ্টা)'},
      {color: '#ff2626', en: 'Heavy (4–15 mm/h)', bn: 'ভারী (৪–১৫ মিমি/ঘণ্টা)'},
      {color: '#7a0000', en: 'Very heavy (15+ mm/h)', bn: 'অতি ভারী (১৫+ মিমি/ঘণ্টা)'},
    ],
  },
  {
    id: 'radar', en: 'Radar flood map', bn: 'রাডারে বন্যা',
    what: {en: 'Copernicus Global Flood Monitoring maps floodwater automatically from every Sentinel-1 radar pass, at 20 m detail, through cloud and rain. Shows the last 3 days.', bn: 'Copernicus Global Flood Monitoring প্রতিটি Sentinel-1 রাডার ছবি থেকে স্বয়ংক্রিয়ভাবে বন্যার পানি চিহ্নিত করে—২০ মিটার মাপে, মেঘ ও বৃষ্টির মধ্য দিয়েও। গত ৩ দিনের ছবি দেখানো হয়।'},
    source: 'Copernicus Emergency Management Service – GloFAS Global Flood Monitoring', sourceUrl: 'https://global-flood.emergency.copernicus.eu/',
    legend: [{color: '#e84c78', en: 'Floodwater seen by radar', bn: 'রাডারে দেখা বন্যার পানি'}],
  },
  {
    id: 'nasa', en: 'NASA daily flood map', bn: 'নাসার দৈনিক বন্যা',
    what: {en: 'NASA maps water every day from optical satellites (about 250 m detail), combining two days to see past clouds. Grey means clouds hid the ground.', bn: 'নাসা প্রতিদিন অপটিক্যাল স্যাটেলাইট দিয়ে পানি চিহ্নিত করে (প্রায় ২৫০ মিটার মাপে), মেঘ এড়াতে দুই দিনের ছবি মিলিয়ে। ধূসর মানে মেঘের কারণে মাটি দেখা যায়নি।'},
    source: 'NASA LANCE MODIS/VIIRS NRT Global Flood Product, via NASA GIBS', sourceUrl: 'https://www.earthdata.nasa.gov/data/instruments/modis/near-real-time-data/nrt-global-flood-products',
    legend: [
      {color: '#fa1e24', en: 'Flood', bn: 'বন্যা'},
      {color: '#ffff00', en: 'Floods here most years', bn: 'প্রায় প্রতি বছর বন্যা হয়'},
      {color: '#32d2f5', en: 'Usual water', bn: 'সাধারণ পানি'},
      {color: '#afafaf', en: 'Cloud / no data', bn: 'মেঘ / তথ্য নেই'},
    ],
  },
  {
    id: 'forecast', en: 'River forecast', bn: 'নদীর পূর্বাভাস',
    what: {en: 'GloFAS forecasts river flow for the next 15 days from weather forecasts. Coloured rivers and triangles show where a flood is likely. It is a global model; FFWC gives the official forecast for Bangladesh.', bn: 'GloFAS আবহাওয়ার পূর্বাভাস থেকে আগামী ১৫ দিনের নদীপ্রবাহের পূর্বাভাস দেয়। রঙিন নদী ও ত্রিভুজ দেখায় কোথায় বন্যার সম্ভাবনা। এটি একটি বৈশ্বিক মডেল; বাংলাদেশের সরকারি পূর্বাভাস দেয় FFWC।'},
    source: 'Copernicus Emergency Management Service – Global Flood Awareness System (GloFAS)', sourceUrl: 'https://global-flood.emergency.copernicus.eu/',
    legend: [
      {color: '#f5e600', en: 'Higher than usual (2-year flood)', bn: 'স্বাভাবিকের চেয়ে বেশি (২ বছরে একবারের বন্যা)'},
      {color: '#e50000', en: 'Serious (5-year flood)', bn: 'গুরুতর (৫ বছরে একবারের বন্যা)'},
      {color: '#9b30c8', en: 'Severe (20-year flood)', bn: 'ভয়াবহ (২০ বছরে একবারের বন্যা)'},
    ],
  },
  {
    id: 'photo', en: 'Today’s satellite photo', bn: 'আজকের স্যাটেলাইট ছবি',
    what: {en: 'A natural-colour photo of the whole country, taken once a day around midday. White is cloud. Muddy brown water in fields can be floodwater.', bn: 'প্রতিদিন দুপুরের দিকে তোলা পুরো দেশের প্রাকৃতিক রঙের ছবি। সাদা অংশ মেঘ। মাঠে ঘোলা বাদামি পানি বন্যার পানি হতে পারে।'},
    source: 'NASA/NOAA VIIRS (NOAA-20) Corrected Reflectance, via NASA GIBS', sourceUrl: 'https://www.earthdata.nasa.gov/data/instruments/viirs',
    legend: [],
  },
];

// ---------- finding the newest time ----------

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => iso(new Date(Date.parse(date.slice(0, 10) + 'T00:00:00Z') + n * 864e5));

/** Last value of a WMTS DescribeDomains `<Domain>start/end/period</Domain>` (or a comma list). */
export function lastFromDomain(xml: string): string | null {
  const m = xml.match(/<Domain>([^<]+)<\/Domain>/);
  if (!m) return null;
  const last = m[1].split(',').pop()!.trim();
  return last.includes('/') ? last.split('/')[1] : last;
}

export async function gibsLatest(layer: string, matrix: string, signal?: AbortSignal, now = new Date()): Promise<string | null> {
  const from = addDays(iso(now), -4), to = addDays(iso(now), 1);
  const r = await fetch(`${GIBS}/1.0.0/${layer}/default/${matrix}/all/${from}--${to}.xml`, {signal});
  return r.ok ? lastFromDomain(await r.text()) : null;
}

/** Default (newest) time of each named layer in the GloFAS WMS capabilities. */
export function glofasDefaults(capabilities: string, names: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const name of names) {
    const at = capabilities.indexOf(`<Name>${name}</Name>`);
    const block = at < 0 ? '' : capabilities.slice(at, at + 4000);
    out[name] = block.match(/<Dimension name="time"[^>]*default="([^"]+)"/)?.[1] ?? null;
  }
  return out;
}

export interface LiveTimes {rain: string | null; nasa: string | null; photo: string | null; radar: string | null; forecast: string | null}

export async function latestTimes(signal?: AbortSignal): Promise<LiveTimes> {
  const safe = <T,>(p: Promise<T>) => p.catch(() => null);
  const [rain, nasa, photo, caps] = await Promise.all([
    safe(gibsLatest('IMERG_Precipitation_Rate_30min', 'GoogleMapsCompatible_Level6', signal)),
    safe(gibsLatest('MODIS_Combined_Flood_2-Day', 'GoogleMapsCompatible_Level9', signal)),
    safe(gibsLatest('VIIRS_NOAA20_CorrectedReflectance_TrueColor', 'GoogleMapsCompatible_Level9', signal)),
    safe(fetch(`${GLOFAS_WMS}?service=WMS&request=GetCapabilities&version=1.3.0`, {signal}).then(r => r.ok ? r.text() : '')),
  ]);
  const g = caps ? glofasDefaults(caps, ['gfm_observed_flood_extent_group_layer', 'FloodSummary1_30']) : {};
  return {rain, nasa, photo, radar: g.gfm_observed_flood_extent_group_layer ?? null, forecast: g.FloodSummary1_30 ?? null};
}

// ---------- tile sources ----------

export const gibsTiles = (layer: string, time: string, level: 6 | 9, ext: 'png' | 'jpg') =>
  `${GIBS}/${layer}/default/${time}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.${ext}`;

/** IMERG times step every 30 minutes; `stepsBack` moves back from the newest. */
export const rainTime = (latest: string, stepsBack: number) =>
  new Date(Date.parse(latest) - stepsBack * 30 * 60e3).toISOString().replace('.000Z', 'Z');

/** GloFAS time values are written like 2026-11-18T00:00:00. */
export const glofasDay = (date: string) => `${date.slice(0, 10)}T00:00:00`;

// ---------- friendly times ----------

export const DHAKA = 'Asia/Dhaka';
export function ago(time: string, bn: boolean, now = Date.now()): string {
  const hours = Math.max(0, (now - Date.parse(time.length <= 10 ? time + 'T12:00:00Z' : time)) / 36e5);
  const n = (v: number) => v.toLocaleString(bn ? 'bn-BD' : 'en-GB');
  if (hours < 1) return bn ? 'এক ঘণ্টার কম আগে' : 'less than an hour ago';
  if (hours < 36) return bn ? `প্রায় ${n(Math.round(hours))} ঘণ্টা আগে` : `about ${n(Math.round(hours))} hour${Math.round(hours) === 1 ? '' : 's'} ago`;
  return bn ? `প্রায় ${n(Math.round(hours / 24))} দিন আগে` : `about ${n(Math.round(hours / 24))} days ago`;
}
export const dhakaTime = (time: string, bn: boolean) =>
  new Date(time).toLocaleString(bn ? 'bn-BD' : 'en-GB', {timeZone: DHAKA, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'});
export const dhakaDay = (date: string, bn: boolean) =>
  new Date(date.slice(0, 10) + 'T12:00:00Z').toLocaleDateString(bn ? 'bn-BD' : 'en-GB', {timeZone: 'UTC', day: 'numeric', month: 'short'});
/** Calendar date in Bangladesh for a UTC timestamp (a 23:55 UTC pass is the next morning in Dhaka). */
export const dhakaLongDate = (time: string, bn: boolean) =>
  new Date(time).toLocaleDateString(bn ? 'bn-BD' : 'en-GB', {timeZone: DHAKA, day: 'numeric', month: 'long', year: 'numeric'});
