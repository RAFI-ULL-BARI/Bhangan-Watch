import {useEffect, useMemo, useRef, useState} from 'react';
import type * as Leaflet from 'leaflet';
import {Crosshair, Minus, Plus} from 'lucide-react';
import type {BBox} from '@/lib/grid';
import {maskCanvas, type Palette} from '@/lib/render';

const assetUrl = (url: string) => url.startsWith('/data/') ? `${import.meta.env.BASE_URL}${url.slice(1)}` : url;
export type MapView = 'change' | 'compare';

export interface MapProps {
  bbox: BBox; width: number; height: number;
  mask: Uint8Array; palette: Palette;
  /** pictures for the compare slider (and, for `after`, the change view when `photoUnderChanges` is set) */
  before: string; after: string;
  labels: [string, string];
  photoUnderChanges?: boolean;
  view: MapView;
  marker?: [number, number] | null;
  onPick: (lat: number, lng: number) => void;
  attribution: string;
  bn: boolean;
}

export default function RiverMap({bbox, width, height, mask, palette, before, after, labels, photoUnderChanges, view, marker, onPick, attribution, bn}: MapProps) {
  const root = useRef<HTMLDivElement>(null), map = useRef<Leaflet.Map | null>(null), library = useRef<typeof Leaflet | null>(null);
  const layers = useRef<Leaflet.Layer[]>([]), laterImage = useRef<Leaflet.ImageOverlay | null>(null), pin = useRef<Leaflet.Layer | null>(null);
  const [ready, setReady] = useState(false), [swipe, setSwipe] = useState(50), [failed, setFailed] = useState(false);
  const pick = useRef(onPick); pick.current = onPick;
  const t = (en: string, bangla: string) => bn ? bangla : en;
  const bounds = useMemo<Leaflet.LatLngBoundsExpression>(() => [[bbox[1], bbox[0]], [bbox[3], bbox[2]]], [bbox[0], bbox[1], bbox[2], bbox[3]]);
  const changes = useMemo(() => maskCanvas(width, height, mask, palette).toDataURL(), [width, height, mask, palette]);

  useEffect(() => {
    let cancelled = false, resize: ResizeObserver | undefined;
    import('leaflet').then(L => {
      if (cancelled || !root.current) return;
      library.current = L;
      const m = L.map(root.current, {zoomControl: false, scrollWheelZoom: false, zoomSnap: .25, minZoom: 6, maxZoom: 17}); map.current = m;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(m);
      L.control.scale({imperial: false, position: 'bottomleft'}).addTo(m);
      m.on('click', (e: Leaflet.LeafletMouseEvent) => pick.current(e.latlng.lat, e.latlng.lng));
      resize = new ResizeObserver(() => m.invalidateSize()); resize.observe(root.current); setReady(true);
    }).catch(() => {if (!cancelled) setFailed(true);});
    return () => {cancelled = true; resize?.disconnect(); map.current?.remove(); map.current = null;};
  }, []);

  useEffect(() => {
    if (ready && map.current) map.current.fitBounds(bounds, {padding: [12, 12], animate: false});
  }, [ready, bounds]);

  useEffect(() => {
    const L = library.current, m = map.current;
    if (!ready || !L || !m) return;
    layers.current.forEach(layer => m.removeLayer(layer)); layers.current = []; laterImage.current = null; setFailed(false);
    const add = (layer: Leaflet.Layer) => {layer.addTo(m); layers.current.push(layer);};
    const image = (url: string, className = '') => L.imageOverlay(assetUrl(url), bounds, {attribution, className}).on('error', () => setFailed(true));
    if (view === 'compare') {
      add(image(before));
      const later = image(after); add(later); laterImage.current = later;
    } else if (photoUnderChanges) add(image(after));
    add(L.rectangle(bounds, {weight: 1.5, color: '#fff', opacity: .9, fill: false, dashArray: '5 5', interactive: false}));
    if (view === 'change') add(L.imageOverlay(changes, bounds, {className: 'change-raster', interactive: false}));
  }, [ready, bounds, changes, before, after, view, photoUnderChanges, attribution]);

  useEffect(() => {
    const L = library.current, m = map.current;
    if (!ready || !L || !m) return;
    pin.current?.remove(); pin.current = null;
    if (marker) {
      pin.current = L.layerGroup([
        L.circleMarker(marker, {radius: 14, color: '#fff', weight: 3, fillColor: '#f2b705', fillOpacity: .35, interactive: false}),
        L.circleMarker(marker, {radius: 6, color: '#fff', weight: 2, fillColor: '#f2b705', fillOpacity: 1, interactive: false}),
      ]).addTo(m);
    }
  }, [ready, marker?.[0], marker?.[1]]);

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
  }, [ready, swipe, view, before, after, bounds]);

  return <div className="map-shell">
    <div ref={root} className="river-map" role="application" aria-label={t('Map of the selected area. Tap a spot to learn more.', 'নির্বাচিত এলাকার মানচিত্র। আরও জানতে কোনো জায়গায় চাপুন।')}/>
    {failed && <p className="map-error" role="alert">{t('Part of the map did not load. You can still read the result below.', 'মানচিত্রের কিছু অংশ লোড হয়নি। নিচে ফলাফল পড়তে পারবেন।')}</p>}
    <div className="map-controls"><button aria-label={t('Zoom in', 'বড় করুন')} onClick={() => map.current?.zoomIn()}><Plus size={19}/></button><button aria-label={t('Zoom out', 'ছোট করুন')} onClick={() => map.current?.zoomOut()}><Minus size={19}/></button><button aria-label={t('Show the whole area', 'পুরো এলাকা দেখুন')} onClick={() => map.current?.fitBounds(bounds, {padding: [12, 12]})}><Crosshair size={19}/></button></div>
    {view === 'compare' && <><div className="swipe-line" style={{left: `${swipe}%`}}><span>↔</span></div><span className="photo-year earlier">{labels[0]}</span><span className="photo-year later">{labels[1]}</span><div className="swipe-control"><input type="range" min="5" max="95" value={swipe} onChange={e => setSwipe(Number(e.target.value))} aria-label={t('Move to compare the photos', 'ছবি তুলনা করতে সরান')}/></div></>}
  </div>;
}
