import type {BBox} from './grid';

export interface Area {
  id: string; name: string; bn: string; bbox: BBox;
  /** a past flood shown instantly from prepared data */
  example?: {date: string; en: string; bn: string};
}

/** Flood-prone places with a prepared past-flood example. Anyone can also check the area around their own location. */
export const FLOOD_AREAS: Area[] = [
  {id: 'sunamganj', name: 'Sunamganj town', bn: 'সুনামগঞ্জ শহর', bbox: [91.30, 24.98, 91.50, 25.16], example: {date: '2022-06-18', en: 'June 2022 flash flood', bn: 'জুন ২০২২-এর আকস্মিক বন্যা'}},
  {id: 'feni', name: 'Feni', bn: 'ফেনী', bbox: [91.30, 22.92, 91.50, 23.10], example: {date: '2024-08-28', en: 'August 2024 flood', bn: 'আগস্ট ২০২৪-এর বন্যা'}},
  {id: 'kurigram', name: 'Chilmari, Kurigram (Brahmaputra)', bn: 'চিলমারী, কুড়িগ্রাম (ব্রহ্মপুত্র)', bbox: [89.62, 25.48, 89.82, 25.66], example: {date: '2024-07-04', en: 'July 2024 monsoon flood', bn: 'জুলাই ২০২৪-এর বর্ষার বন্যা'}},
  {id: 'sirajganj', name: 'Sirajganj (Jamuna)', bn: 'সিরাজগঞ্জ (যমুনা)', bbox: [89.65, 24.36, 89.83, 24.52], example: {date: '2024-07-04', en: 'July 2024 monsoon flood', bn: 'জুলাই ২০২৪-এর বর্ষার বন্যা'}},
];

/** River reaches with prepared erosion photos. */
export const EROSION_AREAS: Area[] = [
  {id: 'sirajganj', name: 'Sirajganj (Jamuna)', bn: 'সিরাজগঞ্জ (যমুনা)', bbox: [89.65, 24.36, 89.83, 24.52]},
  {id: 'fulchhari', name: 'Fulchhari, Gaibandha (Jamuna)', bn: 'ফুলছড়ি, গাইবান্ধা (যমুনা)', bbox: [89.56, 25.12, 89.72, 25.26]},
];
export const EROSION_YEARS = [2020, 2023, 2025];
