import {lazy, Suspense, useEffect, useState} from 'react';
import {Loader2} from 'lucide-react';
import FloodScreen from './FloodScreen';
import NowScreen from './NowScreen';
import ResearchPanel from './ResearchPanel';

const ErosionScreen = lazy(() => import('./ErosionScreen'));
type Screen = 'now' | 'flood' | 'erosion' | 'about';
const screenFromHash = (): Screen => {const s = location.hash.slice(1).split('?')[0]; return s === 'now' || s === 'erosion' || s === 'about' ? s : 'flood';};
const store = {
  get: (k: string) => {try {return localStorage.getItem(k);} catch {return null;}},
  set: (k: string, v: string) => {try {localStorage.setItem(k, v);} catch {/* private mode */}},
};

export default function App() {
  const [bn, setBn] = useState(() => store.get('bw-lang') !== 'en');
  const [screen, setScreen] = useState<Screen>(screenFromHash);
  const t = (en: string, bangla: string) => bn ? bangla : en;

  useEffect(() => {document.documentElement.lang = bn ? 'bn' : 'en'; store.set('bw-lang', bn ? 'bn' : 'en');}, [bn]);
  useEffect(() => {
    const onHash = () => setScreen(screenFromHash());
    addEventListener('hashchange', onHash); return () => removeEventListener('hashchange', onHash);
  }, []);
  const go = (s: Screen, query = '') => {if (s !== screen || query) {history.pushState(null, '', `#${s}${query}`); setScreen(s); scrollTo({top: 0});}};
  const tab = (s: Screen, en: string, bangla: string) =>
    <button className={screen === s ? 'nav-link active' : 'nav-link'} aria-current={screen === s ? 'page' : undefined} onClick={() => go(s)}>{t(en, bangla)}</button>;

  return <div className="simple-app">
    <a className="skip-link" href="#main-content" onClick={e => {e.preventDefault(); document.getElementById('main-content')?.focus();}}>{t('Skip to content', 'মূল অংশে যান')}</a>
    <header className="site-header">
      <button className="brand" onClick={() => go('flood')} aria-label={t('BhanganWatch home', 'BhanganWatch মূল পাতা')}><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="30" height="30"/><span>BhanganWatch</span></button>
      <nav aria-label={t('Pages', 'পাতা')}>{tab('now', 'Now', 'এখন')}{tab('flood', 'Floods', 'বন্যা')}{tab('erosion', 'River erosion', 'নদীভাঙন')}{tab('about', 'About', 'সম্পর্কে')}</nav>
      <button className="language-button" onClick={() => setBn(!bn)} lang={bn ? 'en' : 'bn'}>{bn ? 'English' : 'বাংলা'}</button>
    </header>
    <main id="main-content" tabIndex={-1} className="page-width">
      {screen === 'now' && <NowScreen bn={bn} onCheckHere={() => go('flood', '?here=1')}/>}
      {screen === 'flood' && <FloodScreen bn={bn}/>}
      {screen === 'erosion' && <Suspense fallback={<div className="loading-box"><Loader2 className="spin" size={24}/></div>}><ErosionScreen bn={bn}/></Suspense>}
      {screen === 'about' && <><ResearchPanel bn={bn}/><button className="secondary-button back-button" onClick={() => go('flood')}>{t('Back to the flood map', 'বন্যার মানচিত্রে ফিরে যান')}</button></>}
    </main>
    <footer className="site-footer page-width"><span>BhanganWatch · Rafiull Bari</span><span>{t('Student project · Bangladesh · Free and open source', 'শিক্ষার্থী প্রকল্প · বাংলাদেশ · বিনামূল্যে ও উন্মুক্ত')}</span></footer>
  </div>;
}
