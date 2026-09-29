import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Download, Loader2} from 'lucide-react';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {analyze, decode, REACHES, type Dataset, type Result} from '@/lib/analysis';
import {DEFAULT_SETTINGS, areaText, cellMessage, periodError} from '@/lib/plain-language';
import {download, exportCSV, exportGeoJSON, exportSummary, printReport} from '@/lib/reports';
import RiverMap from './RiverMap';
import ResearchPanel from './ResearchPanel';

export default function Home() {
  const [bn, setBn] = useState(true);
  const [screen, setScreen] = useState<'map' | 'about'>('map');
  const [reach, setReach] = useState('sirajganj');
  const [data, setData] = useState<Dataset | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [years, setYears] = useState({before: 2020, after: 2025});
  const [loading, setLoading] = useState(true), [loadFailed, setLoadFailed] = useState(false), [retry, setRetry] = useState(0);
  const [error, setError] = useState<'period' | 'analysis' | 'report' | ''>('');
  const [updated, setUpdated] = useState(false), [compare, setCompare] = useState(false);
  const [cell, setCell] = useState<number | null>(null);
  const [liveOpen, setLiveOpen] = useState(false), [liveYear, setLiveYear] = useState('2024');
  const [liveBusy, setLiveBusy] = useState(false), [liveProgress, setLiveProgress] = useState(''), [liveError, setLiveError] = useState(false);
  const [addedYear, setAddedYear] = useState<number | null>(null);
  const liveAbort = useRef<AbortController | null>(null);
  const cache = useRef<Record<string, Dataset>>({});
  const t = (en: string, bangla: string) => bn ? bangla : en;
  const number = (n: number, digits = 0) => n.toLocaleString(bn ? 'bn-BD' : 'en-GB', {maximumFractionDigits: digits, useGrouping: false});

  useEffect(() => {document.documentElement.lang = bn ? 'bn' : 'en';}, [bn]);
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true); setLoadFailed(false); setError(''); setCell(null); setUpdated(false);
    setData(null); setResult(null); setYears({before: 2020, after: 2025}); setAddedYear(null);
    const load = async () => {
      try {
        let next = cache.current[reach];
        if (!next) {
          const response = await fetch(`${import.meta.env.BASE_URL}data/${reach}.json`, {signal: ac.signal});
          if (!response.ok) throw new Error('Study unavailable');
          next = await response.json() as Dataset;
        }
        const nextResult = analyze(next, DEFAULT_SETTINGS);
        if (ac.signal.aborted) return;
        cache.current[reach] = next; setData(next); setResult(nextResult); setLoading(false);
      } catch {if (!ac.signal.aborted) {setLoadFailed(true); setLoading(false);}}
    };
    void load();
    return () => ac.abort();
  }, [reach, retry]);
  useEffect(() => () => liveAbort.current?.abort(), []);

  const dirty = !!result && (years.before !== result.before.year || years.after !== result.after.year);
  const showChanges = (event: FormEvent) => {
    event.preventDefault();
    if (!data) return;
    if (periodError(years.before, years.after, bn)) {setError('period'); setUpdated(false); return;}
    try {setResult(analyze(data, {...DEFAULT_SETTINGS, ...years})); setCell(null); setError(''); setUpdated(true);}
    catch {setError('analysis'); setUpdated(false);}
  };
  const saveReport = () => {
    if (!data || !result) return;
    try {printReport(data, result, bn); setError('');} catch {setError('report');}
  };
  const availableYears = Array.from({length: new Date().getFullYear() - 2017}, (_, i) => 2018 + i).filter(year => !data?.periods.some(p => p.year === year));
  const openYear = () => {setLiveYear(String(availableYears.includes(2024) ? 2024 : availableYears.at(-1) ?? '')); setLiveError(false); setLiveOpen(true);};
  const closeYear = () => {liveAbort.current?.abort(); liveAbort.current = null; setLiveBusy(false); setLiveProgress(''); setLiveOpen(false);};
  const loadYear = async () => {
    if (!data || liveBusy || !availableYears.includes(Number(liveYear))) return;
    const ac = new AbortController(); liveAbort.current = ac;
    setLiveBusy(true); setLiveError(false); setLiveProgress('');
    try {
      const {fetchPeriod} = await import('@/lib/live-data');
      const period = await fetchPeriod(data, Number(liveYear), setLiveProgress, ac.signal);
      if (ac.signal.aborted) return;
      const next = {...data, periods: [...data.periods, period].sort((a, b) => a.year - b.year)};
      cache.current[data.id] = next; setData(next); setAddedYear(period.year); setLiveOpen(false);
    } catch {if (!ac.signal.aborted) setLiveError(true);}
    finally {if (liveAbort.current === ac) {liveAbort.current = null; setLiveBusy(false);}}
  };
  const errorText = error === 'period' ? periodError(years.before, years.after, bn)
    : error === 'analysis' ? t('We could not compare those photos. Please choose another pair of years.', 'এই ছবিগুলো তুলনা করা যায়নি। অন্য দুটি বছর বেছে নিন।')
    : error === 'report' ? t('Your browser blocked the report. Allow pop-ups for this page and try again.', 'ব্রাউজার প্রতিবেদনটি খুলতে দেয়নি। এই পেজে পপ-আপ চালু করে আবার চেষ্টা করুন।') : '';

  return <div className="simple-app">
    <a className="skip-link" href="#main-content">{t('Skip to content', 'মূল অংশে যান')}</a>
    <header className="site-header">
      <button className="brand" onClick={() => setScreen('map')} aria-label={t('BhanganWatch home', 'BhanganWatch মূল পাতা')}><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="30" height="30"/><span>BhanganWatch</span></button>
      <nav aria-label={t('Pages', 'পাতা')}><button className={screen === 'map' ? 'nav-link active' : 'nav-link'} aria-current={screen === 'map' ? 'page' : undefined} onClick={() => setScreen('map')}>{t('Map', 'মানচিত্র')}</button><button className={screen === 'about' ? 'nav-link active' : 'nav-link'} aria-current={screen === 'about' ? 'page' : undefined} onClick={() => setScreen('about')}>{t('About this app', 'অ্যাপ সম্পর্কে')}</button></nav>
      <button className="language-button" onClick={() => setBn(!bn)} lang={bn ? 'en' : 'bn'}>{bn ? 'English' : 'বাংলা'}</button>
    </header>
    <main id="main-content" className="page-width">
      {screen === 'map' ? <>
        <div className="page-intro"><h1>{t('See changes in the river', 'নদীর পরিবর্তন দেখুন')}</h1><p>{t('Pick an area and two years to compare.', 'এলাকা ও দুটি বছর বেছে নিয়ে ছবি তুলনা করুন।')}</p></div>
        <form className="choose-form" onSubmit={showChanges} aria-label={t('Choose an area and years', 'এলাকা ও বছর বেছে নিন')}>
          <div className="area-field"><label htmlFor="area">{t('Area', 'এলাকা')}</label><select id="area" value={reach} onChange={e => setReach(e.target.value)}>{REACHES.map(r => <option value={r.id} key={r.id}>{bn ? r.bn : r.name}</option>)}</select></div>
          {(['before', 'after'] as const).map((key, i) => <div key={key}><label htmlFor={key}>{i === 0 ? t('From year', 'আগের বছর') : t('To year', 'পরের বছর')}</label><select id={key} value={years[key]} disabled={loading || !data} onChange={e => {setYears({...years, [key]: Number(e.target.value)}); setError(''); setUpdated(false);}}>{(data?.periods ?? [{year: 2020}, {year: 2023}, {year: 2025}]).map(p => <option key={p.year} value={p.year}>{number(p.year)}</option>)}</select></div>)}
          <button className="primary-button show-button" disabled={loading || !data} type="submit">{t('Show changes', 'পরিবর্তন দেখুন')}</button>
        </form>
        <p className="availability-note">{t('Photos cover parts of Sirajganj and Fulchhari. They are from January–March, not today.', 'সিরাজগঞ্জ ও ফুলছড়ির কিছু অংশের ছবি আছে। ছবিগুলো জানুয়ারি–মার্চের, আজকের নয়।')}</p>
        {errorText && <p className="error-message" role="alert">{errorText}</p>}
        {dirty && <p className="update-note" role="status">{t('You changed the years. Press “Show changes” to update the map.', 'বছর বদলেছেন। মানচিত্র আপডেট করতে “পরিবর্তন দেখুন” চাপুন।')}</p>}
        <span className="sr-only" role="status">{updated && !dirty ? t('The map has been updated.', 'মানচিত্র আপডেট হয়েছে।') : ''}</span>
        {loading ? <div className="loading-box" role="status"><Loader2 className="spin" size={24}/><p>{t('Loading the photos…', 'ছবি লোড হচ্ছে…')}</p></div>
          : loadFailed ? <div className="loading-box" role="alert"><p>{t('The photos did not load. Check your connection and try again.', 'ছবি লোড হয়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।')}</p><button className="secondary-button" onClick={() => setRetry(v => v + 1)}>{t('Try again', 'আবার চেষ্টা করুন')}</button></div>
          : data && result && <>
            <section className="map-card" aria-labelledby="map-title">
              <div className="map-heading"><h2 id="map-title">{bn ? data.nameBn : data.name} <span>· {number(result.before.year)}–{number(result.after.year)}</span></h2><div className="view-switch" aria-label={t('Map view', 'মানচিত্রের ধরন')}><button aria-pressed={!compare} onClick={() => setCompare(false)}>{t('Changes', 'পরিবর্তন')}</button><button aria-pressed={compare} onClick={() => setCompare(true)}>{t('Compare photos', 'ছবি তুলনা')}</button></div></div>
              <RiverMap dataset={data} result={result} view={compare ? 'compare' : 'change'} onCell={setCell} bn={bn}/>
              <p className="map-help">{compare ? t('Move the slider to see the older and newer photos.', 'স্লাইডার সরিয়ে আগের ও পরের ছবি দেখুন।') : t('Red shows land before and water later. Tap a spot to learn more.', 'লাল অংশে আগে মাটি, পরে পানি দেখা যাচ্ছে। আরও জানতে কোনো জায়গায় চাপুন।')}</p>
            </section>
            <section className="result-summary" aria-labelledby="result-title"><div><h2 id="result-title">{t('What the photos show', 'ছবিতে যা দেখা যাচ্ছে')}</h2><p className="result-number">{areaText(result.area, bn)}</p><p>{t('This could be river erosion or a change in water level. We have not checked these places on the ground.', 'এটি নদীভাঙন বা পানির স্তর বদলের কারণে হতে পারে। জায়গাগুলো সরাসরি যাচাই করা হয়নি।')}</p></div><button className="secondary-button save-button" onClick={saveReport}><Download size={18}/>{t('Save a report', 'প্রতিবেদন রাখুন')}</button></section>
            <div className="plain-note"><strong>{t('Please keep in mind', 'মনে রাখুন')}</strong><p>{t('Some photos are unclear. A place without a red mark is not necessarily safe. This app cannot tell you whether your home is safe or give a current flood warning.', 'কিছু ছবি পরিষ্কার নয়। লাল চিহ্ন না থাকলেও নিরাপত্তা নিশ্চিত নয়। এই অ্যাপ বাড়ি নিরাপদ কি না বলতে পারে না, বা বর্তমান বন্যার সতর্কবার্তা দিতে পারে না।')}</p></div>
            <p className="help-line">{t('You can save the report to discuss the changes with your family or people in the area.', 'পরিবর্তনগুলো নিয়ে পরিবার বা এলাকার মানুষের সঙ্গে কথা বলতে প্রতিবেদনটি রাখতে পারেন।')}</p>
          </>}
      </> : <>
        <ResearchPanel bn={bn}/>
        <details className="research-details"><summary>{t('Research details and more options', 'গবেষণার তথ্য ও আরও অপশন')}</summary><div className="details-body">
          <p>{t('The normal map uses several photos from each year, not just one. The same settings are used for everyone.', 'সাধারণ মানচিত্রে প্রতিটি বছরের একাধিক ছবি ব্যবহার করা হয়। সবার জন্য একই সেটিংস রাখা হয়েছে।')}</p>
          <p className="technical-copy">{t('Method: at least two clear observations in each period; no earlier water detections; water in at least two-thirds of clear later observations. NDWI > 0.05. Vegetation filter: off. The grid is about 100 m per cell.', 'পদ্ধতি: প্রতি সময়ে অন্তত দুটি পরিষ্কার ছবি; আগের ছবিতে পানি শনাক্ত না হওয়া; পরের পরিষ্কার ছবির অন্তত দুই-তৃতীয়াংশে পানি পাওয়া। NDWI > 0.05। উদ্ভিদের ফিল্টার বন্ধ। প্রতিটি ঘর প্রায় ১০০ মিটার।')}</p>
          {data && result && <>
            <p><strong>{bn ? data.nameBn : data.name}</strong> · {number(result.before.year)}–{number(result.after.year)} · {t('Clear repeat photos cover', 'একাধিক পরিষ্কার ছবি আছে')} {number(result.coverage * 100, 1)}% {t('of this area. This is not an accuracy score.', 'এলাকার। এটি নির্ভুলতার হার নয়।')}</p>
            <p className="technical-copy">{t('Area shown in detail:', 'বিস্তারিত হিসাব:')} {number(result.area, 4)} km². {t('Study bounds:', 'এলাকার সীমানা:')} {data.bbox.join(', ')}.</p>
            <div className="download-row"><button className="secondary-button" onClick={() => exportCSV(data, result)}>CSV</button><button className="secondary-button" onClick={() => exportGeoJSON(data, result)}>GeoJSON</button><button className="secondary-button" onClick={() => exportSummary(data, result)}>{t('Result JSON', 'ফলাফলের JSON')}</button><button className="secondary-button" onClick={() => download(`BhanganWatch-${data.id}-observations.json`, JSON.stringify(data))}>{t('Photo data', 'ছবির তথ্য')}</button></div>
            <p className="small-note">{t('Research downloads include a WorldPop 2020 population estimate. It is an old model, not a count of people who lost their homes.', 'গবেষণার ডাউনলোডে WorldPop-এর ২০২০ সালের জনসংখ্যার অনুমান আছে। এটি পুরোনো মডেল, ঘর হারানো মানুষের সংখ্যা নয়।')}</p>
            <button className="text-button" onClick={openYear} disabled={!availableYears.length}>{t('Load photos from another year', 'অন্য বছরের ছবি আনুন')}</button>
            {addedYear && <p role="status">{t(`${addedYear} is ready. Go to the map and select that year.`, `${number(addedYear)} সালের ছবি এসেছে। মানচিত্রে ফিরে বছরটি বেছে নিন।`)}</p>}
            <details><summary>{t('Photo dates and sources', 'ছবির তারিখ ও উৎস')}</summary><ul className="source-list">{data.periods.flatMap(p => p.observations.map(o => <li key={o.id}><a href={o.source} target="_blank" rel="noreferrer">{o.date} · {o.id}</a></li>))}</ul></details>
            <p className="small-note">{t('Prepared data use bilinear reflectance resampling. Years loaded in the browser use nearest overview samples. Scene-specific scale/offset and SCL classes 4, 5, 6 are used. These methods can differ at edges.', 'প্রস্তুত তথ্যের রিফ্লেক্ট্যান্সে বিলিনিয়ার রিস্যাম্পলিং করা হয়েছে। ব্রাউজারে আনা বছরে ওভারভিউ থেকে কাছের নমুনা নেওয়া হয়। দৃশ্যের স্কেল/অফসেট ও SCL ৪, ৫, ৬ ব্যবহার করা হয়। সীমানার কাছে ফল কিছুটা আলাদা হতে পারে।')}</p>
            <p className="small-note">{data.provenance.license}</p>
          </>}
        </div></details>
        <button className="secondary-button back-button" onClick={() => setScreen('map')}>{t('Back to the map', 'মানচিত্রে ফিরে যান')}</button>
      </>}
    </main>
    <footer className="site-footer page-width"><span>BhanganWatch · Rafiull Bari</span><span>{t('Student project · Bangladesh', 'শিক্ষার্থী প্রকল্প · বাংলাদেশ')}</span></footer>
    <Dialog open={cell !== null} onOpenChange={open => {if (!open) setCell(null);}}><DialogContent showCloseButton={false} className="plain-dialog"><DialogHeader><DialogTitle>{t('About this spot', 'এই জায়গা সম্পর্কে')}</DialogTitle><DialogDescription>{t('This is one small part of the satellite image, not a house or land boundary.', 'এটি ছবির একটি ছোট ঘর। কোনো বাড়ি বা জমির সীমানা নয়।')}</DialogDescription></DialogHeader>{cell !== null && data && result && <>
      <p className="cell-answer">{cellMessage(result.mask[cell], bn)}</p>
      {[result.before, result.after].map(p => <div className="cell-year" key={p.year}><strong>{number(p.year)}</strong><ul>{p.observations.map(o => {const value = decode(o.ndwi)[cell]; return <li key={o.id}><span>{new Date(o.date + 'T00:00:00Z').toLocaleDateString(bn ? 'bn-BD' : 'en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'})}</span><span>{value === -32768 ? t('Not clear', 'স্পষ্ট নয়') : value / 1000 > result.settings.threshold ? t('Looks like water', 'পানির মতো দেখা যাচ্ছে') : t('Looks like land', 'মাটির মতো দেখা যাচ্ছে')}</span></li>;})}</ul></div>)}
      <p className="small-note">{t('Photos can be wrong or unclear. This does not tell us whether the place is safe today.', 'ছবি ভুল বা অস্পষ্ট হতে পারে। এখান থেকে আজ জায়গাটি নিরাপদ কি না জানা যায় না।')}</p>
    </>}<button className="secondary-button" onClick={() => setCell(null)}>{t('Close', 'বন্ধ করুন')}</button></DialogContent></Dialog>
    <Dialog open={liveOpen} onOpenChange={open => {if (!open) closeYear();}}><DialogContent showCloseButton={false} className="plain-dialog"><DialogHeader><DialogTitle>{t('Load another year', 'অন্য বছরের ছবি আনুন')}</DialogTitle><DialogDescription>{t('This downloads public satellite data. It uses internet data and may take a few minutes.', 'এতে স্যাটেলাইটের তথ্য ডাউনলোড হবে। ইন্টারনেট ডেটা লাগবে, আর কয়েক মিনিট সময় নিতে পারে।')}</DialogDescription></DialogHeader><label htmlFor="extra-year">{t('Year', 'বছর')}</label><select id="extra-year" value={liveYear} onChange={e => setLiveYear(e.target.value)} disabled={liveBusy}>{availableYears.map(y => <option value={y} key={y}>{number(y)}</option>)}</select>
      {liveBusy && <p className="fetch-status" role="status"><Loader2 size={20} className="spin"/>{t('Finding and loading clear photos…', 'পরিষ্কার ছবি খুঁজে আনা হচ্ছে…')}</p>}
      {liveProgress && <details><summary>{t('Download details', 'ডাউনলোডের বিস্তারিত')}</summary><p className="technical-copy">{liveProgress}</p></details>}
      {liveError && <p role="alert" className="error-message">{t('We could not get enough clear photos. Try another year or try again later.', 'যথেষ্ট পরিষ্কার ছবি পাওয়া যায়নি। অন্য বছর বেছে নিন, বা পরে আবার চেষ্টা করুন।')}</p>}
      <div className="dialog-actions"><button className="secondary-button" onClick={closeYear}>{liveBusy ? t('Cancel download', 'ডাউনলোড বন্ধ করুন') : t('Close', 'বন্ধ করুন')}</button><button className="primary-button" disabled={liveBusy || !availableYears.length} onClick={() => void loadYear()}>{t('Load photos', 'ছবি আনুন')}</button></div>
      <p className="small-note">{t('Extra years stay available until you reload this page. Download the photo data if you want to keep a copy.', 'পেজ রিলোড করার আগ পর্যন্ত নতুন বছরের তথ্য থাকবে। কপি রাখতে ছবির তথ্য ডাউনলোড করুন।')}</p>
    </DialogContent></Dialog>
  </div>;
}
