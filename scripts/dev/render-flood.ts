import {readFileSync, writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {analyzeFlood, FLOOD, USUAL_WATER, NO_DATA, type FloodStudy} from '../../src/lib/flood';
import {decodeUint8} from '../../src/lib/codec';
const [file, out] = process.argv.slice(2);
const s: FloodStudy = JSON.parse(readFileSync(file, 'utf8')); const r = analyzeFlood(s);
const W = s.width, H = s.height, png = new PNG({width: W * 3, height: H});
const panels = [decodeUint8(s.reference.scenes[0].vv), decodeUint8(s.event.vv)];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  panels.forEach((v, k) => {const g = Math.max(0, Math.min(255, (v[i] - 60) * 2)); png.data.set([g, g, g, 255], ((y * W * 3) + k * W + x) * 4);});
  const m = r.mask[i], c = m === FLOOD ? [37, 99, 235] : m === USUAL_WATER ? [15, 42, 68] : m === NO_DATA ? [255, 0, 255] : [235, 230, 210];
  png.data.set([...c, 255], ((y * W * 3) + 2 * W + x) * 4);
}
writeFileSync(out, PNG.sync.write(png)); console.log(r.floodedKm2, r.usualKm2, r.coverage);
