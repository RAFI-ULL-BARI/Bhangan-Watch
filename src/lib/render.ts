/** Browser-only helpers that turn grids into pictures. */
import {fromDb} from './flood';

export type Palette = Record<number, [number, number, number, number] | undefined>;

export const EROSION_PALETTE: Palette = {1: [225, 76, 49, 225], 4: [222, 170, 52, 170]};
export const FLOOD_PALETTE: Palette = {1: [30, 110, 255, 215], 2: [12, 38, 72, 170]};

export function maskCanvas(width: number, height: number, mask: Uint8Array, palette: Palette): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!, img = ctx.createImageData(width, height);
  for (let i = 0; i < mask.length; i++) {const c = palette[mask[i]]; if (c) img.data.set(c, i * 4);}
  ctx.putImageData(img, 0, 0); return canvas;
}

/** Grey radar picture: dark = smooth (water), bright = rough (land, trees, buildings). */
export function radarCanvas(width: number, height: number, vv: Uint8Array): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!, img = ctx.createImageData(width, height), lo = fromDb(-24), hi = fromDb(-2);
  for (let i = 0; i < vv.length; i++) {
    if (!vv[i]) continue;
    const g = Math.max(0, Math.min(255, Math.round((vv[i] - lo) / (hi - lo) * 255)));
    img.data.set([g, g, g, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0); return canvas;
}

export const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => resolve(im); im.onerror = reject; im.src = src;
});

/** Background picture with the coloured mask on top, as a JPEG data URL (for reports). */
export async function composite(background: string | HTMLCanvasElement, overlay: HTMLCanvasElement, maxWidth = 900): Promise<string> {
  const bg = typeof background === 'string' ? await loadImage(background) : background;
  const w = maxWidth, h = Math.round(bg.height * w / bg.width);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#dce6d8'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bg, 0, 0, w, h);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(overlay, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', .85);
}
