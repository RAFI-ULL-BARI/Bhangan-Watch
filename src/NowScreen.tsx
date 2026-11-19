import {useEffect, useRef, useState} from 'react';
import type * as Leaflet from 'leaflet';
import {ExternalLink, Loader2, LocateFixed, Minus, Plus, RefreshCw} from 'lucide-react';
import {
  LAYERS, GLOFAS_WMS, addDays, ago, dhakaDay, dhakaTime, gibsTiles, glofasDay, latestTimes, rainTime,
  type LayerId, type LiveTimes,
} from '@/lib/live-layers';

const BANGLADESH: Leaflet.LatLngBoundsExpression = [[20.6, 88.0], [26.7, 92.7]];
const RAIN_STEPS = 24; // 12 hours of half-hour steps

export default function NowScreen({bn, onCheckHere}: {bn: boolean; onCheckHere: () => void}) {
  const t = (en: string, bangla: string) => bn ? bangla : en;
  const root = useRef<HTMLDivElement>(null), map = useRef<Leaflet.Map | null>(null), lib = useRef<typeof Leaflet | null>(null);
  const overlay = useRef<Leaflet.Layer[]>([]), pin = useRef<Leaflet.Layer | null>(null);
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState<LayerId>('rain');
  const [times, setTimes] = useState<LiveTimes | null>(null), [timesFailed, setTimesFailed] = useState(false), [reload, setReload] = useState(0);
  const [rainBack, setRainBack] = useState(0);
  const [tileErrors, setTileErrors] = useState(0);
  const [geo, setGeo] = useState<'' | 'asking' | 'failed'>('');
  const info = LAYERS.find(l => l.id === layer)!;

  useEffect(() => {
    let cancelled = false, resize: ResizeObserver | undefined;
    import('leaflet').then(L => {
      if (cancelled || !root.current) return;
      lib.current = L;
      const m = L.map(root.current, {zoomControl: false, scrollWheelZoom: false, zoomSnap: .25, minZoom: 5, maxZoom: 15}); map.current = m;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(m);
      L.control.scale({imperial: false, position: 'bottomleft'}).addTo(m);
      m.fitBounds(BANGLADESH, {animate: false});
      resize = new ResizeObserver(() => m.invalidateSize()); resize.observe(root.current); setReady(true);
    });
    return () => {cancelled = true; resize?.disconnect(); map.current?.remove(); map.current = null;};
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    setTimes(null); setTimesFailed(false);
    latestTimes(ac.signal).then(v => {if (!ac.signal.aborted) {setTimes(v); setTimesFailed(!v.rain && !v.nasa && !v.radar && !v.forecast && !v.photo);}})
      .catch(() => {if (!ac.signal.aborted) setTimesFailed(true);});
    return () => ac.abort();
  }, [reload]);

  // Swap the overlay when the layer, its time or the rain slider changes.
  useEffect(() => {
    const L = lib.current, m = map.current;
    if (!ready || !L || !m || !times) return;
    overlay.current.forEach(o => m.removeLayer(o)); overlay.current = []; setTileErrors(0);
    const add = (o: Leaflet.TileLayer) => {o.on('tileerror', () => setTileErrors(n => n + 1)); o.addTo(m); overlay.current.push(o);};
    const nasaCredit = 'NASA GIBS', cems = 'Copernicus EMS / GloFAS';
    if (layer === 'rain' && times.rain)
      add(L.tileLayer(gibsTiles('IMERG_Precipitation_Rate_30min', rainTime(times.rain, rainBack), 6, 'png'), {maxNativeZoom: 6, maxZoom: 19, opacity: .75, attribution: `${nasaCredit} · GPM IMERG`}));
    if (layer === 'nasa' && times.nasa)
      add(L.tileLayer(gibsTiles('MODIS_Combined_Flood_2-Day', times.nasa, 9, 'png'), {maxNativeZoom: 9, maxZoom: 19, opacity: .85, attribution: `${nasaCredit} · LANCE NRT Flood`}));
    if (layer === 'photo' && times.photo)
      add(L.tileLayer(gibsTiles('VIIRS_NOAA20_CorrectedReflectance_TrueColor', times.photo, 9, 'jpg'), {maxNativeZoom: 9, maxZoom: 19, attribution: `${nasaCredit} · VIIRS`}));
    const wms = (layers: string, time: string, opacity = 1) => L.tileLayer.wms(GLOFAS_WMS, {layers, styles: '', format: 'image/png', transparent: true, version: '1.3.0', opacity, attribution: cems, time} as Leaflet.WMSOptions);
    if (layer === 'radar' && times.radar)
      [2, 1, 0].forEach(back => add(wms('gfm_observed_flood_extent_group_layer', glofasDay(addDays(times.radar!, -back)))));
    if (layer === 'forecast' && times.forecast) {
      add(wms('FloodSummary1_30', glofasDay(times.forecast), .9));
      add(wms('reportingPoints', glofasDay(times.forecast)));
    }
  }, [ready, times, layer, rainBack]);

  const locate = () => {
    if (!('geolocation' in navigator)) {setGeo('failed'); return;}
    setGeo('asking');
    navigator.geolocation.getCurrentPosition(pos => {
      const L = lib.current, m = map.current; setGeo('');
      if (!L || !m) return;
      const here: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      pin.current?.remove();
      pin.current = L.layerGroup([
        L.circleMarker(here, {radius: 14, color: '#fff', weight: 3, fillColor: '#f2b705', fillOpacity: .35, interactive: false}),
        L.circleMarker(here, {radius: 6, color: '#fff', weight: 2, fillColor: '#f2b705', fillOpacity: 1, interactive: false}),
      ]).addTo(m);
      m.setView(here, 10);
    }, () => setGeo('failed'), {enableHighAccuracy: false, timeout: 15000, maximumAge: 300000});
  };

  const freshness = (() => {
    if (!times) return '';
    switch (layer) {
      case 'rain': {
        if (!times.rain) return '';
        const at = rainTime(times.rain, rainBack);
        return t(`Rain at ${dhakaTime(at, false)} (Bangladesh time) · ${ago(at, false)}`, `${dhakaTime(at, true)}-এর বৃষ্টি (বাংলাদেশ সময়) · ${ago(at, true)}`);
      }
      case 'radar': return times.radar ? t(`Radar passes from ${dhakaDay(addDays(times.radar, -2), false)} to ${dhakaDay(times.radar, false)}`, `${dhakaDay(addDays(times.radar, -2), true)} থেকে ${dhakaDay(times.radar, true)} পর্যন্ত রাডারের ছবি`) : '';
      case 'nasa': return times.nasa ? t(`Water seen up to ${dhakaDay(times.nasa, false)}`, `${dhakaDay(times.nasa, true)} পর্যন্ত দেখা পানি`) : '';
      case 'forecast': return times.forecast ? t(`Forecast made on ${dhakaDay(times.forecast, false)}, for the next 15 days`, `${dhakaDay(times.forecast, true)} তারিখে তৈরি, আগামী ১৫ দিনের পূর্বাভাস`) : '';
      case 'photo': return times.photo ? t(`Photo from ${dhakaDay(times.photo, false)}`, `${dhakaDay(times.photo, true)} তারিখের ছবি`) : '';
    }
  })();
  const missing = times && !times[layer];

  return <>
    <div className="page-intro"><h1>{t('What is happening now', 'এখন কী হচ্ছে')}</h1><p>{t('The newest rain, flood and river information from satellites, for the whole country. Each layer says how old it is.', 'পুরো দেশের জন্য স্যাটেলাইট থেকে পাওয়া সর্বশেষ বৃষ্টি, বন্যা ও নদীর তথ্য। প্রতিটি স্তরে লেখা আছে তথ্যটি কতটা পুরোনো।')}</p></div>

    <div className="layer-picker" role="radiogroup" aria-label={t('What to show', 'কী দেখাবে')}>
      {LAYERS.map(l => <button key={l.id} role="radio" aria-checked={layer === l.id} className={layer === l.id ? 'active' : ''} onClick={() => setLayer(l.id)}>{bn ? l.bn : l.en}</button>)}
    </div>

    <section className="map-card" aria-labelledby="now-title">
      <div className="map-heading"><h2 id="now-title">{bn ? info.bn : info.en} <span>{freshness && `· ${freshness}`}</span></h2>
        <button className="secondary-button refresh" onClick={() => setReload(r => r + 1)} aria-label={t('Check for newer data', 'নতুন তথ্য আছে কি না দেখুন')}><RefreshCw size={17}/>{t('Refresh', 'রিফ্রেশ')}</button></div>
      <div className="map-shell">
        <div ref={root} className="river-map" role="application" aria-label={t('Map of Bangladesh', 'বাংলাদেশের মানচিত্র')}/>
        <div className="map-controls"><button aria-label={t('Zoom in', 'বড় করুন')} onClick={() => map.current?.zoomIn()}><Plus size={19}/></button><button aria-label={t('Zoom out', 'ছোট করুন')} onClick={() => map.current?.zoomOut()}><Minus size={19}/></button><button aria-label={t('Show my location', 'আমার অবস্থান দেখান')} onClick={locate}><LocateFixed size={19}/></button></div>
        {!times && !timesFailed && <p className="map-status" role="status"><Loader2 size={18} className="spin"/>{t('Checking for the newest data…', 'সর্বশেষ তথ্য খোঁজা হচ্ছে…')}</p>}
        {(timesFailed || missing) && <p className="map-error" role="alert">{t('This layer could not be loaded right now. Check your connection, or try again later.', 'এই স্তরটি এখন লোড করা যায়নি। ইন্টারনেট সংযোগ দেখুন, অথবা পরে আবার চেষ্টা করুন।')}</p>}
        {!missing && tileErrors > 8 && <p className="map-error" role="alert">{t('Some parts of this layer did not load. The service may be busy.', 'এই স্তরের কিছু অংশ লোড হয়নি। সেবাটি হয়তো ব্যস্ত।')}</p>}
      </div>
      {layer === 'rain' && times?.rain && <div className="rain-slider"><label htmlFor="rain-back">{t('Go back in time', 'আগের সময়ে যান')}: {rainBack === 0 ? t('newest', 'সর্বশেষ') : t(`${rainBack / 2} hours earlier`, `${(rainBack / 2).toLocaleString('bn-BD')} ঘণ্টা আগে`)}</label>
        <input id="rain-back" type="range" min={0} max={RAIN_STEPS} step={1} value={RAIN_STEPS - rainBack} onChange={e => setRainBack(RAIN_STEPS - Number(e.target.value))}/></div>}
      {info.legend.length > 0 && <ul className="map-legend">{info.legend.map(i => <li key={i.en}><span style={{background: i.color}}/>{bn ? i.bn : i.en}</li>)}
        {layer === 'radar' && <li><span className="dashed"/>{t('Edge of each radar photo', 'প্রতিটি রাডার ছবির সীমানা')}</li>}
        {layer === 'forecast' && <li className="hint">{t('Darker = more likely. Numbers on triangles = chance in %.', 'গাঢ় রং = সম্ভাবনা বেশি। ত্রিভুজের সংখ্যা = সম্ভাবনা (%)।')}</li>}</ul>}
      <p className="map-help no-key">{bn ? info.what.bn : info.what.en}</p>
      {geo && <p className={geo === 'asking' ? 'small-note now-geo' : 'error-message now-geo'} role="status">{geo === 'asking' ? t('Finding your location…', 'আপনার অবস্থান খোঁজা হচ্ছে…') : t('Your location could not be found. Allow location for this site, or zoom in by hand.', 'আপনার অবস্থান পাওয়া যায়নি। এই সাইটের জন্য অবস্থান চালু করুন, অথবা নিজে বড় করে দেখুন।')}</p>}
    </section>

    <div className="now-actions">
      <button className="primary-button" onClick={onCheckHere}><LocateFixed size={18}/>{t('Check flooding around me in detail', 'আমার আশপাশের বন্যা বিস্তারিত দেখুন')}</button>
      <p className="small-note">{t('Opens the detailed radar map (60 m) for the newest pass over your area, with a comparison to the dry season.', 'আপনার এলাকার সর্বশেষ রাডার ছবি থেকে বিস্তারিত মানচিত্র (৬০ মিটার) খুলবে, শুকনো মৌসুমের সঙ্গে তুলনাসহ।')}</p>
    </div>

    <div className="plain-note"><strong>{t('Official river levels and warnings', 'সরকারি নদীর পানির স্তর ও সতর্কবার্তা')}</strong>
      <p>{t('The Flood Forecasting and Warning Centre measures river levels at stations across Bangladesh every day and issues the official flood warnings. Its data cannot be shown inside this app, so please check it directly:', 'বন্যা পূর্বাভাস ও সতর্কীকরণ কেন্দ্র (FFWC) প্রতিদিন সারা দেশের স্টেশনে নদীর পানির স্তর মাপে এবং সরকারি বন্যা সতর্কবার্তা দেয়। এর তথ্য এই অ্যাপে দেখানো যায় না, তাই সরাসরি দেখুন:')}</p>
      <p className="link-row"><a className="secondary-button" href="https://www.ffwc.gov.bd" target="_blank" rel="noreferrer"><ExternalLink size={17}/>{t('FFWC river levels', 'FFWC নদীর পানির স্তর')}</a><a className="secondary-button" href="tel:1090">{t('Call 1090 (free)', '১০৯০-এ ফোন করুন (বিনা খরচে)')}</a></p>
    </div>
    <p className="small-note sources-line">{t('Sources', 'উৎস')}: {LAYERS.map((l, i) => <span key={l.id}>{i ? ' · ' : ''}<a href={l.sourceUrl} target="_blank" rel="noreferrer">{l.source}</a></span>)}</p>
  </>;
}
