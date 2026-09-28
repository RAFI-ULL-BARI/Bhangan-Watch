import {useEffect, useRef, useState} from 'react';
import type * as Leaflet from 'leaflet';
import type {Dataset, Result} from '@/lib/analysis';
import {cellAt} from '@/lib/analysis';
import {Crosshair, Minus, Plus} from 'lucide-react';
const assetUrl = (url: string) => url.startsWith('/data/') ? `${import.meta.env.BASE_URL}${url.slice(1)}` : url;
export type MapView = 'change' | 'compare';

export default function RiverMap({dataset, result, view, onCell, bn}: {dataset: Dataset; result: Result; view: MapView; onCell: (n: number | null) => void; bn: boolean}) {
  const root = useRef<HTMLDivElement>(null), map = useRef<Leaflet.Map | null>(null), library = useRef<typeof Leaflet | null>(null);
  const layers = useRef<Leaflet.Layer[]>([]), laterImage = useRef<Leaflet.ImageOverlay | null>(null);
  const [ready, setReady] = useState(false), [swipe, setSwipe] = useState(50), [failed, setFailed] = useState(false);
  const click = useRef(onCell), currentData = useRef(dataset); click.current = onCell; currentData.current = dataset;
  const t = (en: string, bangla: string) => bn ? bangla : en;
  useEffect(() => {
    let cancelled = false, resize: ResizeObserver | undefined;
    import('leaflet').then(L => {
      if (cancelled || !root.current) return;
      library.current = L;
      const m = L.map(root.current, {zoomControl: false, scrollWheelZoom: false, zoomSnap: .25, minZoom: 7, maxZoom: 16}); map.current = m;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(m);
      L.control.scale({imperial: false, position: 'bottomleft'}).addTo(m);
      m.on('click', (e: Leaflet.LeafletMouseEvent) => click.current(cellAt(currentData.current, e.latlng.lat, e.latlng.lng)));
      resize = new ResizeObserver(() => m.invalidateSize()); resize.observe(root.current); setReady(true);
    }).catch(() => {if (!cancelled) setFailed(true);});
    return () => {cancelled = true; resize?.disconnect(); map.current?.remove(); map.current = null;};
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.fitBounds([[dataset.bbox[1], dataset.bbox[0]], [dataset.bbox[3], dataset.bbox[2]]], {padding: [12, 12], animate: false});
  }, [ready, dataset.id]);
  useEffect(() => {
    const L = library.current, m = map.current;
    if (!ready || !L || !m) return;
    layers.current.forEach(layer => m.removeLayer(layer)); layers.current = []; laterImage.current = null; setFailed(false);
    const bounds: Leaflet.LatLngBoundsExpression = [[dataset.bbox[1], dataset.bbox[0]], [dataset.bbox[3], dataset.bbox[2]]];
    const add = (layer: Leaflet.Layer) => {layer.addTo(m); layers.current.push(layer);};
    const image = (url: string) => L.imageOverlay(assetUrl(url), bounds, {attribution: 'Contains modified Copernicus Sentinel data / Element 84'}).on('error', () => setFailed(true));
    if (view === 'compare') add(image(result.before.image));
    const after = image(result.after.image); add(after); laterImage.current = after;
    add(L.rectangle(bounds, {weight: 1, color: '#fff', opacity: .8, fill: false, dashArray: '5 5', interactive: false}));
    if (view === 'change') {
      const canvas = document.createElement('canvas'); canvas.width = dataset.width; canvas.height = dataset.height;
      const ctx = canvas.getContext('2d')!; const pixels = ctx.createImageData(dataset.width, dataset.height);
      for (let i = 0; i < result.mask.length; i++) if (result.mask[i] === 1) pixels.data.set([225, 76, 49, 218], i * 4);
      ctx.putImageData(pixels, 0, 0); add(L.imageOverlay(canvas.toDataURL(), bounds, {className: 'change-raster'}));
    }
  }, [ready, dataset, result, view]);
  useEffect(() => {
    const m = map.current, image = laterImage.current;
    if (!m || !image) return;
    const clip = () => {
      const element = image.getElement(); if (!element || !root.current) return;
      if (view !== 'compare') {element.style.clipPath = ''; return;}
      const a = element.getBoundingClientRect(), b = root.current.getBoundingClientRect();
      const left = Math.max(0, Math.min(100, (b.left + b.width * swipe / 100 - a.left) / a.width * 100));
      element.style.clipPath = `inset(0 0 0 ${left}%)`;
    };
    clip(); image.on('load', clip); m.on('move zoomend resize', clip);
    return () => {image.off('load', clip); m.off('move zoomend resize', clip);};
  }, [ready, swipe, view, result, dataset]);
  return <div className="map-shell">
    <div ref={root} className="river-map" aria-label={t('Map of the selected area', 'নির্বাচিত এলাকার মানচিত্র')}/>
    {failed && <p className="map-error" role="alert">{t('Part of the map did not load. You can still read the result below.', 'মানচিত্রের কিছু অংশ লোড হয়নি। নিচে ফলাফল পড়তে পারবেন।')}</p>}
    <div className="map-controls"><button aria-label={t('Zoom in', 'বড় করুন')} onClick={() => map.current?.zoomIn()}><Plus size={19}/></button><button aria-label={t('Zoom out', 'ছোট করুন')} onClick={() => map.current?.zoomOut()}><Minus size={19}/></button><button aria-label={t('Show the whole area', 'পুরো এলাকা দেখুন')} onClick={() => map.current?.fitBounds([[dataset.bbox[1], dataset.bbox[0]], [dataset.bbox[3], dataset.bbox[2]]], {padding: [12, 12]})}><Crosshair size={19}/></button></div>
    {view === 'compare' && <><div className="swipe-line" style={{left: `${swipe}%`}}><span>↔</span></div><span className="photo-year earlier">{result.before.year.toLocaleString(bn ? 'bn-BD' : 'en', {useGrouping: false})}</span><span className="photo-year later">{result.after.year.toLocaleString(bn ? 'bn-BD' : 'en', {useGrouping: false})}</span><div className="swipe-control"><input type="range" min="5" max="95" value={swipe} onChange={e => setSwipe(Number(e.target.value))} aria-label={t('Move to compare the photos', 'ছবি তুলনা করতে সরান')}/></div></>}
  </div>;
}
