#!/usr/bin/env node
/**
 * Build data/africa_by_country.json from:
 * - data/africa_countries_centroids.json (country list + coordinates)
 * - data/british-museum-african-contested-objects.json (objects with origin_country)
 * - data/african_objects_all_countries.json (one or more objects per African country so every country has artefacts)
 * Optionally merge in data/africa_scraped.json (output of scraper) for counts/objects.
 *
 * Usage: node scripts/build_africa_by_country.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CENTROIDS_PATH = path.join(ROOT, 'data', 'africa_countries_centroids.json');
const CONTESTED_PATH = path.join(ROOT, 'data', 'british-museum-african-contested-objects.json');
const ALL_COUNTRIES_PATH = path.join(ROOT, 'data', 'african_objects_all_countries.json');
const SCRAPED_PATH = path.join(ROOT, 'data', 'africa_scraped.json');
const STEP3_AFRICA_PATH = path.join(ROOT, 'data', 'step3_africa_by_country.json');
const OUT_PATH = path.join(ROOT, 'data', 'africa_by_country.json');

const BM_AFRICA_TOTAL = 268000;

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  const centroids = loadJson(CENTROIDS_PATH);
  const contested = loadJson(CONTESTED_PATH);
  const allCountries = loadJson(ALL_COUNTRIES_PATH);
  const scraped = loadJson(SCRAPED_PATH);
  const step3Africa = loadJson(STEP3_AFRICA_PATH);

  if (!centroids || !centroids.countries) {
    console.error('Missing data/africa_countries_centroids.json');
    process.exit(1);
  }

  const countryByName = new Map();
  for (const c of centroids.countries) {
    countryByName.set(c.name, {
      name: c.name,
      code: c.code,
      coordinates: [c.lat, c.lon],
      count: 0,
      objects: [],
    });
  }

  // Normalize country name variants to our list
  const countryAliases = {
    "Côte d'Ivoire": "Ivory Coast",
    "Cote d'Ivoire": "Ivory Coast",
    "Ivory Coast (Côte d'Ivoire)": "Ivory Coast",
    "DR Congo": "Democratic Republic of the Congo",
    "Congo (Democratic Republic)": "Democratic Republic of the Congo",
    "Republic of the Congo": "Congo",
    "Congo (Republic)": "Congo",
  };

  function resolveCountry(name) {
    if (!name || typeof name !== 'string') return null;
    const trimmed = name.trim();
    if (countryByName.has(trimmed)) return trimmed;
    return countryAliases[trimmed] || null;
  }

  // Add contested objects (detailed contested/highlighted artefacts)
  if (contested && contested.objects) {
    for (const obj of contested.objects) {
      const country = resolveCountry(obj.origin_country) || resolveCountry(obj.origin_place?.split(',')[1]?.trim());
      if (country && countryByName.has(country)) {
        const entry = countryByName.get(country);
        entry.objects.push(obj);
        entry.count = entry.objects.length;
      }
    }
  }

  // Add objects for all African countries (so every country has at least one artefact)
  if (allCountries && allCountries.objects) {
    for (const obj of allCountries.objects) {
      const country = resolveCountry(obj.origin_country) || resolveCountry(obj.origin_place?.split(',')[0]?.trim());
      if (country && countryByName.has(country)) {
        const entry = countryByName.get(country);
        entry.objects.push(obj);
        entry.count = entry.objects.length;
      }
    }
  }

  // Merge scraped counts/objects if present
  if (scraped && scraped.countries) {
    for (const [cname, data] of Object.entries(scraped.countries)) {
      const country = resolveCountry(cname) || cname;
      if (countryByName.has(country)) {
        const entry = countryByName.get(country);
        if (data.count != null) entry.count = data.count;
        if (Array.isArray(data.objects)) entry.objects = [...entry.objects, ...data.objects];
      }
    }
  }

  // Merge step3.csv Africa data (stolen/BM artefacts by country)
  if (step3Africa && step3Africa.countries) {
    for (const [cname, data] of Object.entries(step3Africa.countries)) {
      const country = resolveCountry(cname) || cname;
      if (countryByName.has(country)) {
        const entry = countryByName.get(country);
        if (Array.isArray(data.objects)) entry.objects = [...entry.objects, ...data.objects];
        entry.count = entry.objects.length;
      }
    }
  }

  const countries = Object.fromEntries(
    Array.from(countryByName.entries()).map(([name, data]) => [
      name,
      {
        count: data.count,
        coordinates: data.coordinates,
        objects: data.objects,
      },
    ])
  );

  const totalWithData = Object.values(countries).reduce((s, c) => s + c.count, 0);
  const out = {
    source: "British Museum collection (place=Africa). Contested/highlighted objects from research; full counts from scraper or BM export.",
    bm_africa_search_total: BM_AFRICA_TOTAL,
    last_updated: new Date().toISOString().slice(0, 10),
    total_objects_in_dataset: totalWithData,
    countries,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log('Wrote', OUT_PATH);
  console.log('Countries:', Object.keys(countries).length, '| Objects in dataset:', totalWithData);
}

main();
