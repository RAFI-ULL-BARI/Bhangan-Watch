/** Wording shown to people. Every sentence exists in Bangla and English, in plain words. */
import {ERODED, LAND, NEW_LAND, UNCLEAR, WATER, type Settings} from './analysis';
import {DRY, FLOOD, NO_DATA, USUAL_WATER} from './flood';

export const DEFAULT_SETTINGS: Settings = {before: 2020, after: 2025, threshold: .05, minClear: 2, afterFraction: 2 / 3};

export const num = (n: number, bn: boolean, digits = 0) =>
  n.toLocaleString(bn ? 'bn-BD' : 'en-GB', {maximumFractionDigits: digits, minimumFractionDigits: 0});
export const year = (y: number, bn: boolean) => y.toLocaleString(bn ? 'bn-BD' : 'en', {useGrouping: false});
export const longDate = (iso: string, bn: boolean) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString(bn ? 'bn-BD' : 'en-GB', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'});
export const shortDate = (iso: string, bn: boolean) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString(bn ? 'bn-BD' : 'en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'});

const FOOTBALL_FIELD_KM2 = .00714; // 105 m × 68 m
const km2 = (area: number, bn: boolean) => num(area, bn, area < 10 ? 1 : 0);
const fields = (area: number, bn: boolean) => {
  const f = area / FOOTBALL_FIELD_KM2, rounded = f > 100 ? Math.round(f / 10) * 10 : Math.round(f);
  return num(rounded, bn);
};

/** Football fields for small areas; the share of the mapped area for big ones (thousands of fields means nothing). */
const compare = (area: number, total: number, bn: boolean) => area < 3 || !total
  ? (bn ? `প্রায় ${fields(area, bn)}টি ফুটবল মাঠের সমান` : `about the size of ${fields(area, bn)} football fields`)
  : (bn ? `মানচিত্রের এলাকার প্রায় ${num(Math.max(1, Math.round(area / total * 100)), bn)}%` : `about ${num(Math.max(1, Math.round(area / total * 100)), bn)}% of the area on the map`);

export function areaText(area: number, bn: boolean, total = 0): string {
  if (area < .05) return bn ? 'স্পষ্টভাবে মাটি থেকে পানি হয়েছে—এমন জায়গা প্রায় পাওয়া যায়নি।' : 'Almost no place clearly changed from land to water.';
  return bn
    ? `প্রায় ${km2(area, bn)} বর্গকিলোমিটার জায়গা আগে মাটি ছিল, পরে পানি দেখা যাচ্ছে—${compare(area, total, bn)}।`
    : `About ${km2(area, bn)} km² looked like land before and water later — ${compare(area, total, bn)}.`;
}

export function floodAreaText(area: number, bn: boolean, total = 0): string {
  if (area < .05) return bn ? 'এই দিনের ছবিতে স্বাভাবিকের বাইরে প্রায় কোনো পানি দেখা যায়নি।' : 'Almost no extra water showed up in this photo.';
  return bn
    ? `প্রায় ${km2(area, bn)} বর্গকিলোমিটার জায়গায় স্বাভাবিকের বাইরে পানি দেখা গেছে—${compare(area, total, bn)}।`
    : `About ${km2(area, bn)} km² was under water that is not usually there — ${compare(area, total, bn)}.`;
}

export function peopleText(people: number | null, bn: boolean, flood: boolean): string {
  if (people === null || people < 10) return '';
  const rounded = people > 1000 ? Math.round(people / 100) * 100 : Math.round(people / 10) * 10;
  return flood
    ? (bn ? `২০২০ সালের অনুমান অনুযায়ী, এই পানির জায়গায় প্রায় ${num(rounded, bn)} জন মানুষ থাকতেন। এটি আনুমানিক হিসাব, ক্ষতিগ্রস্ত মানুষের গণনা নয়।` : `By a 2020 estimate, about ${num(rounded, bn)} people lived where this water is. This is a rough model, not a count of people affected.`)
    : (bn ? `২০২০ সালের অনুমান অনুযায়ী, এই জায়গায় প্রায় ${num(rounded, bn)} জন মানুষ থাকতেন। এটি আনুমানিক হিসাব।` : `By a 2020 estimate, about ${num(rounded, bn)} people lived in these places. This is a rough model.`);
}

export function cellMessage(value: number, bn: boolean): string {
  switch (value) {
    case ERODED: return bn ? 'আগে এখানে মাটি দেখা যেত, পরে পানি। এটি নদীভাঙন হতে পারে।' : 'This looked like land before and water later. It may be river erosion.';
    case NEW_LAND: return bn ? 'আগে এখানে পানি ছিল, পরে মাটি (নতুন চর) দেখা যাচ্ছে।' : 'This was water before and looks like land later (new char land).';
    case WATER: return bn ? 'দুই সময়েই এখানে পানি দেখা গেছে।' : 'This looked like water in both periods.';
    case UNCLEAR: return bn ? 'এখানে যথেষ্ট পরিষ্কার ছবি নেই, তাই কিছু বলা যাচ্ছে না।' : 'There are not enough clear photos here to say anything.';
    case LAND: default: return bn ? 'এখানে মাটি থেকে পানিতে স্পষ্ট পরিবর্তন দেখা যায়নি।' : 'No clear change from land to water was seen here.';
  }
}

export function floodCellMessage(value: number, bn: boolean): string {
  switch (value) {
    case FLOOD: return bn ? 'এই দিনে এখানে পানি দেখা গেছে, যা শুকনো মৌসুমে থাকে না। এটি বন্যার পানি হতে পারে।' : 'There was water here on this day that is not there in the dry season. It may be floodwater.';
    case USUAL_WATER: return bn ? 'এখানে সাধারণত পানি থাকে (নদী, পুকুর, বিল বা হাওর)।' : 'There is usually water here (a river, pond, beel or haor).';
    case NO_DATA: return bn ? 'এই দিনের ছবিতে এই জায়গা নেই।' : 'This place is not in the photo for this day.';
    case DRY: default: return bn ? 'এই ছবিতে এখানে খোলা পানি দেখা যায়নি। তবে গাছপালা বা ঘরবাড়ির মাঝে পানি থাকলে ছবিতে ধরা না-ও পড়তে পারে।' : 'No open water was seen here in this photo. Water among trees or buildings may not show up.';
  }
}

export function periodError(before: number, after: number, bn: boolean): string {
  if (before < after) return '';
  return before === after
    ? (bn ? 'দুটি আলাদা বছর বেছে নিন।' : 'Please choose two different years.')
    : (bn ? '“আগের বছর” অবশ্যই “পরের বছর”-এর আগে হতে হবে।' : 'The “From year” must be earlier than the “To year”.');
}
