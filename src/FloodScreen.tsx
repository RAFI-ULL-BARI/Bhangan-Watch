import {useEffect, useMemo, useRef, useState, type FormEvent} from 'react';
import {Download, Loader2, LocateFixed, Share2} from 'lucide-react';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {FLOOD_AREAS, type Area} from '@/lib/areas';
import {analyzeFlood, cellReadings, type FloodResult, type FloodStudy} from '@/lib/flood';
import {boxAround, cellAt, gridAreaKm2, type BBox} from '@/lib/grid';
import {decodeUint8} from '@/lib/codec';
import {floodAreaText, floodCellMessage, longDate, num, peopleText, shortDate} from '@/lib/plain-language';
import {download, exportFloodCSV, exportFloodGeoJSON, printFloodReport} from '@/lib/reports';
import {FLOOD_PALETTE, radarCanvas} from '@/lib/render';
import type {RadarPass} from '@/lib/live-data';
import {ago, dhakaLongDate, dhakaTime} from '@/lib/live-layers';
import RiverMap from './RiverMap';

const HERE = 'here', EXAMPLE = 'example';
const HERE_SIZE_KM = 16;
type Place = {area: Area; here?: [number, number]};

/** Read `#flood?area=…&date=…` or `#flood?lat=…&lng=…&date=…` so links can be shared. */
function linkParams() {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const lat = Number(q.get('lat')), lng = Number(q.get('lng'));
  return {area: q.get('area'), date: q.get('date'), askHere: q.get('here') === '1', here: q.has('lat') && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] as [number, number] : null};
}
const hereArea = ([lat, lng]: [number, number]): Area => ({id: HERE, name: 'Around your location', bn: 'আপনার অবস্থানের আশপাশ', bbox: boxAround(lat, lng, HERE_SIZE_KM)});
const inBox = (b: BBox, [lat, lng]: [number, number]) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];

export default function FloodScreen({bn}: {bn: boolean}) {
  const t = (en: string, bangla: string) => bn ? bangla : en;
  const initial = useMemo(linkParams, []);
  const [place, setPlace] = useState<Place>(() => initial.here ? {area: hereArea(initial.here), here: initial.here} : {area: FLOOD_AREAS.find(a => a.id === initial.area) ?? FLOOD_AREAS[0]});
  const [choice, setChoice] = useState<string>(initial.askHere ? '' : initial.date && initial.date !== place.area.example?.date ? initial.date : place.area.example ? EXAMPLE : '');
  const [passes, setPasses] = useState<RadarPass[] | null>(null), [passError, setPassError] = useState(false);
  const [study, setStudy] = useState<FloodStudy | null>(null), [result, setResult] = useState<FloodResult | null>(null);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState<'' | 'load' | 'report' | 'none'>('');
  const [geo, setGeo] = useState<'idle' | 'asking' | 'denied' | 'unavailable'>('idle'), [me, setMe] = useState<[number, number] | null>(initial.here);
  const [compare, setCompare] = useState(false), [cell, setCell] = useState<number | null>(null), [shared, setShared] = useState(false);
  const job = useRef<AbortController | null>(null), autoRun = useRef(true);

  // Recent radar passes for the chosen place (the list behind the date menu).
  useEffect(() => {
    const ac = new AbortController();
    setPasses(null); setPassError(false);
    import('@/lib/live-data').then(({findRadarPasses}) => findRadarPasses(place.area.bbox, 120, ac.signal))
      .then(list => {if (!ac.signal.aborted) setPasses(list);})
      .catch(() => {if (!ac.signal.aborted) {setPasses([]); setPassError(true);}});
    return () => ac.abort();
  }, [place.area.bbox.join()]);

  useEffect(() => () => job.current?.abort(), []);

  const run = async (target = place, which = choice) => {
    job.current?.abort();
    const ac = new AbortController(); job.current = ac;
    setBusy(true); setError(''); setProgress(''); setCell(null);
    try {
      let next: FloodStudy;
      if (which === EXAMPLE) {
        const r = await fetch(`${import.meta.env.BASE_URL}data/flood-${target.area.id}.json`, {signal: ac.signal});
        if (!r.ok) throw new Error('missing');
        next = await r.json();
      } else {
        const live = await import('@/lib/live-data');
        let pass = passes?.find(p => p.date === which);
        if (!pass) {
          const day = new Date(which + 'T00:00:00Z'), after = new Date(day.getTime() + 864e5).toISOString().slice(0, 10);
          const {listRadarPasses} = await import('@/lib/sources');
          pass = (await listRadarPasses(target.area.bbox, which, after, ac.signal)).find(p => p.date === which);
        }
        if (!pass) {setError('none'); return;}
        next = await live.loadFloodStudy({id: target.area.id, name: target.area.name, nameBn: target.area.bn, bbox: target.area.bbox}, pass, m => setProgress(p => (p ? p + '\n' : '') + m), ac.signal);
      }
      if (ac.signal.aborted) return;
      setStudy(next); setResult(analyzeFlood(next));
      const q = target.here ? `lat=${target.here[0].toFixed(4)}&lng=${target.here[1].toFixed(4)}` : `area=${target.area.id}`;
      history.replaceState(null, '', `#flood?${q}&date=${next.event.date}`);
    } catch {if (!ac.signal.aborted) setError('load');}
    finally {if (job.current === ac) {job.current = null; setBusy(false);}}
  };

  // Show something useful straight away: the example (or a shared link's date).
  useEffect(() => {if (initial.askHere) locate(true); else if (autoRun.current && choice) {autoRun.current = false; void run();}}, []);

  const choosePlace = (id: string) => {
    if (id === HERE) {locate(true); return;}
    const area = FLOOD_AREAS.find(a => a.id === id)!;
    setPlace({area}); setChoice(area.example ? EXAMPLE : '');
  };
  const locate = (asPlace: boolean) => {
    if (!('geolocation' in navigator)) {setGeo('unavailable'); return;}
    setGeo('asking');
    navigator.geolocation.getCurrentPosition(pos => {
      const here: [number, number] = [Math.round(pos.coords.latitude * 1e4) / 1e4, Math.round(pos.coords.longitude * 1e4) / 1e4];
      setMe(here); setGeo('idle');
      if (asPlace) {setPlace({area: hereArea(here), here}); setChoice('');}
    }, err => setGeo(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'), {enableHighAccuracy: true, timeout: 15000, maximumAge: 300000});
  };
  const submit = (e: FormEvent) => {e.preventDefault(); if (choice) void run();};
  // "Around my location": as soon as the list of passes arrives, show the latest one.
  useEffect(() => {if (place.here && !choice && passes?.length) {setChoice(passes[0].date); void run(place, passes[0].date);}}, [passes, place.here]);

  const share = async () => {
    if (!study) return;
    const url = location.href, text = t(`Floodwater seen by satellite: ${study.name}, ${study.event.time ? dhakaLongDate(study.event.time, false) : longDate(study.event.date, false)}`, `স্যাটেলাইটে দেখা বন্যার পানি: ${study.nameBn}, ${study.event.time ? dhakaLongDate(study.event.time, true) : longDate(study.event.date, true)}`);
    try {
      if (navigator.share) await navigator.share({title: 'BhanganWatch', text, url});
      else {await navigator.clipboard.writeText(`${text}\n${url}`); setShared(true); setTimeout(() => setShared(false), 4000);}
    } catch {/* the person closed the share sheet */}
  };
  const saveReport = () => {if (study && result) try {printFloodReport(study, result, bn); setError('');} catch {setError('report');}};

  const pictures = useMemo(() => {
    if (!study) return null;
    const ref = study.reference.scenes[0];
    return {
      before: ref ? radarCanvas(study.width, study.height, decodeUint8(ref.vv)).toDataURL() : '',
      after: radarCanvas(study.width, study.height, decodeUint8(study.event.vv)).toDataURL(),
      beforeDate: ref?.date,
    };
  }, [study]);
  const myCell = study && result && me && inBox(study.bbox, me) ? cellAt(study, me[0], me[1]) : null;
  const dateOptions = [
    ...(place.area.example ? [{value: EXAMPLE, label: `${bn ? place.area.example.bn : place.area.example.en} · ${shortDate(place.area.example.date, bn)}`}] : []),
    ...(passes ?? []).map((p, i) => ({value: p.date, label: `${dhakaLongDate(p.time, bn)}${i === 0 ? ` (${t('latest', 'সর্বশেষ')}, ${ago(p.time, bn)})` : ''}`})),
    ...(choice && choice !== EXAMPLE && !passes?.some(p => p.date === choice) ? [{value: choice, label: longDate(choice, bn)}] : []),
  ];
  const errorText = error === 'load' ? t('The satellite photo did not load. Check your connection and try again.', 'স্যাটেলাইটের ছবি লোড হয়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।')
    : error === 'none' ? t('There is no satellite photo of this place for that date. Choose another date.', 'এই তারিখে এই জায়গার স্যাটেলাইট ছবি নেই। অন্য তারিখ বেছে নিন।')
    : error === 'report' ? t('Your browser blocked the report. Allow pop-ups for this page and try again.', 'ব্রাউজার প্রতিবেদনটি খুলতে দেয়নি। এই পেজে পপ-আপ চালু করে আবার চেষ্টা করুন।') : '';
  const geoText = geo === 'asking' ? t('Finding your location…', 'আপনার অবস্থান খোঁজা হচ্ছে…')
    : geo === 'denied' ? t('Location permission was turned off. Allow location for this site in your browser settings, or pick a place from the list.', 'অবস্থানের অনুমতি বন্ধ আছে। ব্রাউজারের সেটিংসে এই সাইটের জন্য অবস্থান চালু করুন, অথবা তালিকা থেকে জায়গা বেছে নিন।')
    : geo === 'unavailable' ? t('Your location could not be found. Try again outdoors, or pick a place from the list.', 'আপনার অবস্থান পাওয়া যায়নি। বাইরে গিয়ে আবার চেষ্টা করুন, অথবা তালিকা থেকে জায়গা বেছে নিন।') : '';

  return <>
    <div className="page-intro"><h1>{t('See where floodwater is', 'কোথায় বন্যার পানি, দেখুন')}</h1><p>{t('Satellite radar sees through clouds and rain. Blue shows water that is not usually there.', 'স্যাটেলাইট রাডার মেঘ ও বৃষ্টির মধ্য দিয়েও দেখতে পারে। নীল রঙে দেখা যাবে যেখানে সাধারণত পানি থাকে না।')}</p></div>
    <form className="choose-form flood-form" onSubmit={submit} aria-label={t('Choose a place and a date', 'জায়গা ও তারিখ বেছে নিন')}>
      <div className="area-field"><label htmlFor="flood-area">{t('Place', 'জায়গা')}</label>
        <select id="flood-area" value={place.here ? HERE : place.area.id} onChange={e => choosePlace(e.target.value)}>
          <option value={HERE}>{t('📍 Around my location', '📍 আমার অবস্থানের আশপাশ')}</option>
          {FLOOD_AREAS.map(a => <option key={a.id} value={a.id}>{bn ? a.bn : a.name}</option>)}
        </select></div>
      <div className="date-field"><label htmlFor="flood-date">{t('Satellite photo', 'স্যাটেলাইট ছবি')}</label>
        <select id="flood-date" value={choice} onChange={e => setChoice(e.target.value)} disabled={!dateOptions.length}>
          {!dateOptions.length && <option value="">{passes === null ? t('Looking for photos…', 'ছবি খোঁজা হচ্ছে…') : t('No recent photos', 'সাম্প্রতিক ছবি নেই')}</option>}
          {dateOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select></div>
      <button className="primary-button show-button" type="submit" disabled={!choice || busy}>{busy ? <Loader2 size={18} className="spin"/> : null}{t('Show flooding', 'বন্যা দেখুন')}</button>
    </form>
    <p className="availability-note">{passError ? t('Could not get the list of recent photos. The example still works.', 'সাম্প্রতিক ছবির তালিকা পাওয়া যায়নি। উদাহরণটি দেখা যাবে।')
      : t('A radar satellite passes every 6–12 days; photos appear here a few days later. This is not a live view.', 'রাডার স্যাটেলাইট প্রতি ৬–১২ দিনে একবার ছবি তোলে; কয়েক দিন পর এখানে আসে। এটি সরাসরি দৃশ্য নয়।')}</p>
    {geoText && <p className={geo === 'asking' ? 'update-note' : 'error-message'} role={geo === 'asking' ? 'status' : 'alert'}>{geoText}</p>}
    {errorText && <p className="error-message" role="alert">{errorText}</p>}

    {busy && <div className="loading-box" role="status"><Loader2 className="spin" size={24}/><p>{choice === EXAMPLE ? t('Loading the photos…', 'ছবি লোড হচ্ছে…') : t('Downloading satellite radar photos (about 0.5 MB)…', 'স্যাটেলাইট রাডারের ছবি আনা হচ্ছে (প্রায় ০.৫ মেগাবাইট)…')}</p>
      {progress && <details><summary>{t('Download details', 'ডাউনলোডের বিস্তারিত')}</summary><p className="technical-copy" style={{whiteSpace: 'pre-line'}}>{progress}</p></details>}</div>}

    {!busy && study && result && pictures && <>
      <section className="map-card" aria-labelledby="flood-title">
        <div className="map-heading"><h2 id="flood-title">{bn ? study.nameBn : study.name} <span>· {study.event.time ? dhakaLongDate(study.event.time, bn) : longDate(study.event.date, bn)}</span></h2><div className="view-switch" role="group" aria-label={t('Map view', 'মানচিত্রের ধরন')}><button aria-pressed={!compare} onClick={() => setCompare(false)}>{t('Floodwater', 'বন্যার পানি')}</button><button aria-pressed={compare} onClick={() => setCompare(true)} disabled={!pictures.before}>{t('Radar photos', 'রাডারের ছবি')}</button></div></div>
        {study.event.time && <p className="photo-age" role="status">{t(`Radar photo taken ${dhakaTime(study.event.time, false)} (Bangladesh time) · ${ago(study.event.time, false)}`, `রাডারের ছবি তোলা হয়েছে ${dhakaTime(study.event.time, true)} (বাংলাদেশ সময়) · ${ago(study.event.time, true)}`)}</p>}
        <RiverMap bbox={study.bbox} width={study.width} height={study.height} mask={result.mask} palette={FLOOD_PALETTE}
          before={pictures.before} after={pictures.after} labels={[pictures.beforeDate ? shortDate(pictures.beforeDate, bn) + t(' (dry)', ' (শুকনো)') : '', shortDate(study.event.date, bn)]}
          view={compare ? 'compare' : 'change'} marker={me} onPick={(lat, lng) => setCell(cellAt(study, lat, lng))} bn={bn}
          attribution="Contains modified Copernicus Sentinel-1 data / Microsoft Planetary Computer"/>
        {compare ? <p className="map-help no-key">{t('Dark means smooth water; bright means land, trees or buildings. Move the slider to compare the dry season with the chosen day.', 'গাঢ় অংশ মানে মসৃণ পানি; উজ্জ্বল মানে মাটি, গাছ বা ঘরবাড়ি। শুকনো মৌসুম আর বেছে নেওয়া দিনের তুলনা করতে স্লাইডার সরান।')}</p>
          : <ul className="map-legend"><li><span style={{background: '#1e6eff'}}/>{t('Floodwater', 'বন্যার পানি')}</li><li><span style={{background: '#0c2648'}}/>{t('Usually water (river, beel, haor)', 'সাধারণত পানি থাকে (নদী, বিল, হাওর)')}</li><li className="hint">{t('Tap a spot to learn more.', 'আরও জানতে কোনো জায়গায় চাপুন।')}</li></ul>}
        <div className="locate-row">
          <button className="secondary-button" onClick={() => locate(false)}><LocateFixed size={18}/>{t('Show my location on the map', 'মানচিত্রে আমার অবস্থান দেখান')}</button>
          {me && (myCell !== null
            ? <p className="my-spot" role="status"><strong>{t('At your location:', 'আপনার অবস্থানে:')}</strong> {floodCellMessage(result.mask[myCell], bn)}</p>
            : <p className="small-note" role="status">{t('Your location is outside this area. Choose “Around my location” to check it.', 'আপনার অবস্থান এই এলাকার বাইরে। দেখতে “আমার অবস্থানের আশপাশ” বেছে নিন।')}</p>)}
        </div>
      </section>
      <section className="result-summary" aria-labelledby="flood-result-title"><div>
        <h2 id="flood-result-title">{t('What the satellite saw', 'স্যাটেলাইটে যা দেখা গেছে')}</h2>
        <p className="result-number">{floodAreaText(result.floodedKm2, bn, gridAreaKm2(study))}</p>
        {peopleText(result.people, bn, true) && <p>{peopleText(result.people, bn, true)}</p>}
        {result.coverage < .97 && <p>{t(`This photo covers ${num(result.coverage * 100, bn)}% of the area.`, `এই ছবিতে এলাকার ${num(result.coverage * 100, bn)}% আছে।`)}</p>}
        {!result.hasReference && <p>{t('No dry-season photos were found to compare with, so rivers and ponds may also be shown as floodwater.', 'তুলনার জন্য শুকনো মৌসুমের ছবি পাওয়া যায়নি, তাই নদী-পুকুরও বন্যার পানি হিসেবে দেখা যেতে পারে।')}</p>}
      </div><div className="result-actions">
        <button className="secondary-button save-button" onClick={saveReport}><Download size={18}/>{t('Save a report', 'প্রতিবেদন রাখুন')}</button>
        <button className="secondary-button save-button" onClick={() => void share()}><Share2 size={18}/>{shared ? t('Link copied', 'লিংক কপি হয়েছে') : t('Share', 'শেয়ার করুন')}</button>
      </div></section>
      <div className="plain-note"><strong>{t('Please keep in mind', 'মনে রাখুন')}</strong>
        <p>{t('This photo is from one day and may be several days old. Water among trees, around homes or in towns often does not show up, so a place without blue can still be flooded.', 'এই ছবি একটি নির্দিষ্ট দিনের, কয়েক দিন পুরোনোও হতে পারে। গাছপালা, ঘরবাড়ির আশপাশ বা শহরের পানি অনেক সময় ছবিতে ধরা পড়ে না, তাই নীল না থাকলেও সেখানে বন্যা থাকতে পারে।')}</p>
        <p>{t('Blue means “more water than in the dry season”. During and after the monsoon, haors, beels and low fields fill up every year, so blue can be normal seasonal water, not a disaster.', 'নীল মানে “শুকনো মৌসুমের চেয়ে বেশি পানি”। বর্ষায় ও বর্ষার পরে প্রতি বছর হাওর, বিল ও নিচু জমিতে পানি জমে, তাই নীল অংশ স্বাভাবিক মৌসুমি পানিও হতে পারে, দুর্যোগ নয়।')}</p>
        <p>{t('For flood warnings, check the Flood Forecasting and Warning Centre (', 'বন্যার সতর্কবার্তার জন্য বন্যা পূর্বাভাস ও সতর্কীকরণ কেন্দ্র (')}<a href="https://www.ffwc.gov.bd" target="_blank" rel="noreferrer">ffwc.gov.bd</a>{t(') or call ', ') দেখুন, অথবা ')}<a href="tel:1090">1090</a>{t(' (free). In an emergency call ', ' নম্বরে ফোন করুন (বিনা খরচে)। জরুরি প্রয়োজনে ')}<a href="tel:999">999</a>{t('.', ' নম্বরে ফোন করুন।')}</p>
      </div>
      <details className="research-details"><summary>{t('Research details and downloads', 'গবেষণার তথ্য ও ডাউনলোড')}</summary><div className="details-body">
        <p className="technical-copy">{study.provenance.method}</p>
        <p className="technical-copy">{t('Water threshold on this day:', 'এই দিনের পানির সীমা:')} {num(result.threshold, bn, 1)} dB · {t('dry-season scenes:', 'শুকনো মৌসুমের ছবি:')} {study.reference.scenes.map(s => s.date).join(', ') || '—'} · {t('floodwater', 'বন্যার পানি')} {num(result.floodedKm2, bn, 2)} km² · {t('usual water', 'সাধারণ পানি')} {num(result.usualKm2, bn, 2)} km² · {t('grid', 'গ্রিড')} {study.width}×{study.height}.</p>
        <div className="download-row"><button className="secondary-button" onClick={() => exportFloodCSV(study, result)}>CSV</button><button className="secondary-button" onClick={() => exportFloodGeoJSON(study, result)}>GeoJSON</button><button className="secondary-button" onClick={() => download(`BhanganWatch-flood-${study.id}-${study.event.date}-data.json`, JSON.stringify(study))}>{t('Radar data', 'রাডারের তথ্য')}</button></div>
        <ul className="source-list">{[...study.reference.scenes, study.event].map(s => <li key={s.id}><a href={s.source} target="_blank" rel="noreferrer">{s.date} · {s.id}</a></li>)}</ul>
        <p className="small-note">{study.provenance.license}{study.population ? ' Population: WorldPop 2020 constrained estimate (CC BY 4.0).' : ''}</p>
      </div></details>
    </>}

    <Dialog open={cell !== null} onOpenChange={open => {if (!open) setCell(null);}}><DialogContent showCloseButton={false} className="plain-dialog"><DialogHeader><DialogTitle>{t('About this spot', 'এই জায়গা সম্পর্কে')}</DialogTitle><DialogDescription>{t('This is one small square (about 60 m) of the satellite image, not a house or land boundary.', 'এটি ছবির একটি ছোট ঘর (প্রায় ৬০ মিটার)। কোনো বাড়ি বা জমির সীমানা নয়।')}</DialogDescription></DialogHeader>
      {cell !== null && study && result && <>
        <p className="cell-answer">{floodCellMessage(result.mask[cell], bn)}</p>
        <div className="cell-year"><ul>{cellReadings(study, result, cell).map(r => <li key={r.date + r.reference}><span>{shortDate(r.date, bn)} {r.reference ? t('(dry season)', '(শুকনো মৌসুম)') : ''}</span><span>{r.water === null ? t('Not in photo', 'ছবিতে নেই') : r.water ? t('Looks like water', 'পানির মতো দেখা যাচ্ছে') : t('No open water', 'খোলা পানি নেই')}</span></li>)}</ul></div>
        <p className="small-note">{t('Photos can be wrong. This does not tell us whether the place is safe today.', 'ছবি ভুল হতে পারে। এখান থেকে আজ জায়গাটি নিরাপদ কি না জানা যায় না।')}</p>
      </>}
      <button className="secondary-button" onClick={() => setCell(null)}>{t('Close', 'বন্ধ করুন')}</button></DialogContent></Dialog>
  </>;
}
