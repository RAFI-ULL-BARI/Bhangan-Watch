# BhanganWatch · বন্যা ও নদীভাঙন

**See where floodwater and riverbank erosion show up in free satellite photos of Bangladesh, in Bangla and English.**

BhanganWatch is a small, free web app for ordinary people, volunteers and local organisations. It runs entirely in the browser and works on a phone. It has no server, no account and no tracking.

## What it does

### 🌊 Floods (বন্যা)
- Uses **Sentinel-1 radar**, which sees through monsoon clouds and rain.
- Compares a chosen day with the **dry season (January–March)** of the same year. It marks
  - **blue**: water that is not usually there (likely floodwater)
  - **navy**: usual water (rivers, beels, haors)
- Pick a place with a past flood (Sunamganj 2022, Feni 2024, Kurigram and Sirajganj 2024) or **📍 around my location**. Then choose any satellite pass from the last four months; the newest is usually a few days old.
- Tap any spot to see what each photo showed there. **Show my location** tells you what the photo showed where you are standing.
- **Save a report**: a printable one-page report with a map. **Share** gives a link that opens the same place and date.
- Shows the WorldPop 2020 estimate of how many people live where the water is (for the prepared areas), with a clear warning that it is a model.
- Points people to the official warning services: FFWC (ffwc.gov.bd), **1090**, and **999** for emergencies.

### 🏞️ River erosion (নদীভাঙন)
- Uses **Sentinel-2** optical photos from the dry season of several years (2020, 2023, 2025, plus any year from 2018 that you download).
- Marks land that turned into river (red) and new char land (gold) along the Jamuna at Sirajganj and Fulchhari.
- Offers CSV, GeoJSON and JSON downloads for researchers.

## How it works

| | Floods | Erosion |
|---|---|---|
| Satellite | Sentinel-1 RTC (VV radar) | Sentinel-2 L2A (green and near-infrared) |
| Grid | ~60 m | ~100 m |
| Water test | per-scene Otsu threshold, kept within −18…−13 dB | NDWI > 0.05 on clear pixels (scene classes 4, 5, 6) |
| Comparison | water on the day, not water in at least half of the dry-season scenes; isolated cells dropped | no water in any clear earlier photo and water in at least ⅔ of clear later photos; ≥ 2 clear photos in each period |

Satellite scenes come from **Microsoft Planetary Computer**. Its data API crops, resamples and scales each scene on the server, so a whole area arrives as a small PNG (about 80 KB per scene). This lets a phone run a fresh flood check in about 10–20 seconds. The same code (`src/lib/sources.ts`) is used by the app and by the data-prep script.

**Known limits.** Radar cannot see water under trees, among homesteads or in towns, so flooding there is often missed. Feni in August 2024 is a clear example. Wind can roughen water; wet mud and smooth sand can look like water. In and after the monsoon, haors and low fields fill every year, so blue can be normal seasonal water. Photos are from one day and are not a live view. This app is **not** a warning service.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the analysis code
npm run build      # static site in dist/
```

The site is fully static, so `dist/` can be hosted anywhere. Pushing to `main` builds and deploys it to **GitHub Pages** through `.github/workflows/deploy.yml`. To turn this on, go to *Settings → Pages → Source: GitHub Actions*.

### Rebuilding the prepared data

`public/data/` holds the instant-loading examples. To rebuild them from the satellite archives:

```bash
npm run prepare-data                # everything (≈ 5 minutes)
npm run prepare-data -- flood feni  # one flood example
npm run prepare-data -- erosion     # erosion reaches only
```

Places, example dates and boxes are listed in `src/lib/areas.ts`. If you are behind a proxy, run Node with `NODE_USE_ENV_PROXY=1`.

## Project layout

```
src/
  App.tsx              header, tabs, language
  FloodScreen.tsx      flood map
  ErosionScreen.tsx    erosion map
  RiverMap.tsx         Leaflet map with overlay, compare slider and location pin
  ResearchPanel.tsx    About page and research papers
  lib/
    flood.ts           flood analysis (Sentinel-1)
    analysis.ts        erosion analysis (Sentinel-2)
    sources.ts         turns satellite scenes into gridded observations (browser + Node)
    pc.ts              Planetary Computer STAC search and crop client
    live-data.ts       browser downloads (loaded on demand)
    plain-language.ts  all the wording, in Bangla and English
    reports.ts         printable report and downloads
    grid.ts, codec.ts, render.ts, areas.ts
scripts/prepare-data.ts  builds public/data
tests/                   unit tests
```

## Data and credits

- Contains modified **Copernicus Sentinel** data (ESA), processed by **Microsoft Planetary Computer**.
- Population: **WorldPop** 2020 constrained estimate for Bangladesh (CC BY 4.0).
- Base map © **OpenStreetMap** contributors.
- Research that shaped the project is listed on the app's About page (Freihardt & Frey 2023; Rahman 2022; Alam & Ahamed 2023; Islam & Mitra 2024).

Student project by Rafiull Bari, Bangladesh.
