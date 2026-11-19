import {readFileSync} from 'node:fs';
import {decode, NODATA, type Dataset} from '../../src/lib/analysis';
const d: Dataset = JSON.parse(readFileSync(process.argv[2], 'utf8')); const n = d.width * d.height;
for (const p of d.periods) {
  const c = new Uint8Array(n); for (const o of p.observations) {const v = decode(o.ndwi); let k = 0; for (let i = 0; i < n; i++) if (v[i] !== NODATA) {c[i]++; k++;} console.log(p.year, o.date, (k / n).toFixed(2));}
  let lt2 = 0; for (let i = 0; i < n; i++) if (c[i] < 2) lt2++; console.log(p.year, 'cells <2 clear', (lt2 / n).toFixed(2));
}
