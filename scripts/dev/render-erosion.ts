import {readFileSync, writeFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {analyze, ERODED, NEW_LAND, WATER, UNCLEAR, type Dataset} from '../../src/lib/analysis';
const d: Dataset = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const r = analyze(d, {before: 2020, after: 2025, threshold: .05, minClear: 2, afterFraction: 2 / 3});
const png = new PNG({width: d.width, height: d.height});
r.mask.forEach((m, i) => png.data.set(m === ERODED ? [225, 76, 49, 255] : m === NEW_LAND ? [214, 170, 60, 255] : m === WATER ? [40, 90, 140, 255] : m === UNCLEAR ? [200, 200, 200, 255] : [235, 240, 225, 255], i * 4));
writeFileSync(process.argv[3], PNG.sync.write(png));
