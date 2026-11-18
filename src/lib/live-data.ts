/** Browser-side downloads, loaded on demand so the first page stays small. */
import type {Dataset, Period} from './analysis';
import type {PngDecoder} from './pc';
import {buildFloodStudy, fetchS2Year, listRadarPasses, type Progress, type RadarPass} from './sources';
import {loadImage} from './render';
import type {BBox} from './grid';

export const browserDecode: PngDecoder = async bytes => {
  const bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/png'}), {premultiplyAlpha: 'none', colorSpaceConversion: 'none'});
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
  ctx.drawImage(bitmap, 0, 0); bitmap.close();
  return {width: canvas.width, height: canvas.height, rgba: ctx.getImageData(0, 0, canvas.width, canvas.height).data};
};

/** Layer several partial tiles into one picture (the first URL wins where they overlap). */
async function mosaic(urls: string[]): Promise<string> {
  const images = (await Promise.allSettled(urls.map(loadImage))).flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
  if (!images.length) return '';
  const canvas = document.createElement('canvas'); canvas.width = images[0].width; canvas.height = images[0].height;
  const ctx = canvas.getContext('2d')!;
  for (const im of [...images].reverse()) ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .82);
}

export async function fetchPeriod(data: Dataset, year: number, progress: Progress, signal: AbortSignal): Promise<Period> {
  const {observations, photoUrls} = await fetchS2Year(data, year, browserDecode, progress, signal);
  progress('Making the photo…');
  return {year, observations, image: await mosaic(photoUrls)};
}

export const findRadarPasses = (bbox: BBox, days: number, signal?: AbortSignal) => {
  const to = new Date(), from = new Date(Date.now() - days * 864e5);
  return listRadarPasses(bbox, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10), signal);
};

export const loadFloodStudy = (area: {id: string; name: string; nameBn: string; bbox: BBox}, pass: RadarPass, progress: Progress, signal: AbortSignal) =>
  buildFloodStudy(area, pass, browserDecode, progress, signal);

export type {RadarPass};
