#!/usr/bin/env node
/**
 * Parse data/step3.csv and keep only rows from African countries (findspot or production).
 * Output: data/step3_africa_by_country.json (countries with count + objects) for use in build.
 * Focus: African countries and artefacts from each country (stolen/held at BM).
 *
 * Usage: node scripts/parse_step3_africa.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'data', 'step3.csv');
const CENTROIDS_PATH = path.join(ROOT, 'data', 'africa_countries_centroids.json');
const OUT_PATH = path.join(ROOT, 'data', 'step3_africa_by_country.json');

const AFRICAN_COUNTRY_NAMES = [
  'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cameroon', 'Cape Verde',
  'Central African Republic', 'Chad', 'Comoros', 'Congo', 'Democratic Republic of the Congo',
  'Djibouti', 'Egypt', 'Equatorial Guinea', 'Eritrea', 'Eswatini', 'Ethiopia', 'Gabon', 'Gambia',
  'Ghana', 'Guinea', 'Guinea-Bissau', 'Ivory Coast', 'Kenya', 'Lesotho', 'Liberia', 'Libya',
  'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Mauritius', 'Morocco', 'Mozambique', 'Namibia',
  'Niger', 'Nigeria', 'Rwanda', 'São Tomé and Príncipe', 'Senegal', 'Seychelles', 'Sierra Leone',
  'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda',
  'Zambia', 'Zimbabwe'
];

const COUNTRY_ALIASES = {
  "Republic of the Congo": "Congo",
  "Congo (Republic)": "Congo",
  "DR Congo": "Democratic Republic of the Congo",
  "Democratic Republic of Congo": "Democratic Republic of the Congo",
  "Côte d'Ivoire": "Ivory Coast",
  "Cote d'Ivoire": "Ivory Coast",
  "Ivory Coast (Côte d'Ivoire)": "Ivory Coast",
  "Swaziland": "Eswatini",
};

function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === ',' || ch === ';') && !inQuotes) {
      out.push(cur.trim().replace(/^\s+|\s+$/g, ''));
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim().replace(/^\s+|\s+$/g, ''));
  return out;
}

function normalizeCountry(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t === 'None') return null;
  if (COUNTRY_ALIASES[t]) return COUNTRY_ALIASES[t];
  if (AFRICAN_COUNTRY_NAMES.includes(t)) return t;
  for (const name of AFRICAN_COUNTRY_NAMES) {
    if (t.includes(name)) return name;
  }
  const lower = t.toLowerCase();
  if (lower.includes('egypt')) return 'Egypt';
  if (lower.includes('nigeria')) return 'Nigeria';
  if (lower.includes('south africa')) return 'South Africa';
  if (lower.includes('morocco')) return 'Morocco';
  if (lower.includes('algeria')) return 'Algeria';
  if (lower.includes('tunisia')) return 'Tunisia';
  if (lower.includes('sudan')) return 'Sudan';
  if (lower.includes('kenya')) return 'Kenya';
  if (lower.includes('tanzania')) return 'Tanzania';
  if (lower.includes('ghana')) return 'Ghana';
  if (lower.includes('ethiopia')) return 'Ethiopia';
  if (lower.includes('madagascar')) return 'Madagascar';
  if (lower.includes('congo')) return 'Democratic Republic of the Congo';
  if (lower.includes('senegal')) return 'Senegal';
  if (lower.includes('guinea')) return 'Guinea';
  if (lower.includes('angola')) return 'Angola';
  if (lower.includes('namibia')) return 'Namibia';
  if (lower.includes('zimbabwe')) return 'Zimbabwe';
  if (lower.includes('zambia')) return 'Zambia';
  if (lower.includes('mali')) return 'Mali';
  if (lower.includes('uganda')) return 'Uganda';
  if (lower.includes('libya')) return 'Libya';
  if (lower.includes('somalia')) return 'Somalia';
  if (lower.includes('liberia')) return 'Liberia';
  if (lower.includes('mauritania')) return 'Mauritania';
  if (lower.includes('sierra leone')) return 'Sierra Leone';
  if (lower.includes('togo')) return 'Togo';
  if (lower.includes('benin')) return 'Benin';
  if (lower.includes('burkina')) return 'Burkina Faso';
  if (lower.includes('cameroon')) return 'Cameroon';
  if (lower.includes('niger') && !lower.includes('nigeria')) return 'Niger';
  if (lower.includes('malawi')) return 'Malawi';
  if (lower.includes('rwanda')) return 'Rwanda';
  if (lower.includes('botswana')) return 'Botswana';
  if (lower.includes('lesotho')) return 'Lesotho';
  if (lower.includes('gambia')) return 'Gambia';
  if (lower.includes('gabon')) return 'Gabon';
  if (lower.includes('chad')) return 'Chad';
  if (lower.includes('central african')) return 'Central African Republic';
  if (lower.includes('equatorial guinea')) return 'Equatorial Guinea';
  if (lower.includes('eritrea')) return 'Eritrea';
  if (lower.includes('djibouti')) return 'Djibouti';
  if (lower.includes('mauritius')) return 'Mauritius';
  if (lower.includes('seychelles')) return 'Seychelles';
  if (lower.includes('comoros')) return 'Comoros';
  if (lower.includes('cape verde')) return 'Cape Verde';
  if (lower.includes('guinea-bissau')) return 'Guinea-Bissau';
  if (lower.includes('são tomé') || lower.includes('sao tome')) return 'São Tomé and Príncipe';
  if (lower.includes('eswatini') || lower.includes('swaziland')) return 'Eswatini';
  if (lower.includes('south sudan')) return 'South Sudan';
  return null;
}

function museumRefToUrl(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const clean = ref.replace(/\s/g, '').replace(/,/g, '-').replace(/﻿/g, '');
  if (!clean) return null;
  return 'https://www.britishmuseum.org/collection/object/' + encodeURIComponent(clean);
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('Missing data/step3.csv');
    process.exit(1);
  }

  const centroids = fs.existsSync(CENTROIDS_PATH)
    ? JSON.parse(fs.readFileSync(CENTROIDS_PATH, 'utf8'))
    : { countries: [] };
  const countryCoords = new Map();
  (centroids.countries || []).forEach(c => countryCoords.set(c.name, [c.lat, c.lon]));

  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = parseCSVLine(lines[0]);
  const idx = {};
  header.forEach((h, i) => { idx[h.replace(/^\uFEFF/, '')] = i; });
  const get = (row, key) => {
    const i = idx[key] ?? idx[key.replace(/^\uFEFF/, '')];
    return i !== undefined ? (row[i] || '').trim() : '';
  };

  const byCountry = {};
  let skipped = 0;
  let totalAfrica = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    const findspotContinent = get(row, 'findspot_continent').toLowerCase();
    const productionContinent = get(row, 'production_continent').toLowerCase();
    const findspotCountry = get(row, 'findspot_country');
    const productionCountry = get(row, 'production_country');

    let country = null;
    let place = '';

    if (findspotContinent === 'africa' || productionContinent === 'africa') {
      place = get(row, 'findspot_place') || get(row, 'production_place') || '';
      country = normalizeCountry(findspotCountry) || normalizeCountry(productionCountry);
      if (!country && findspotContinent === 'africa') country = normalizeCountry(findspotCountry);
      if (!country && productionContinent === 'africa') country = normalizeCountry(productionCountry);
    }
    if (!country) {
      const c1 = normalizeCountry(findspotCountry);
      const c2 = normalizeCountry(productionCountry);
      if (c1) { country = c1; place = get(row, 'findspot_place') || place; }
      if (c2) { country = c2; place = get(row, 'production_place') || place; }
    }

    if (!country || !AFRICAN_COUNTRY_NAMES.includes(country)) {
      skipped++;
      continue;
    }

    totalAfrica++;
    const museumNumber = get(row, 'Museum number');
    const objectType = get(row, 'object_type').replace(/^\uFEFF/, '') || 'object';
    const acquisitionDate = get(row, 'acquisition_date');
    const year = acquisitionDate && /^\d{4}$/.test(acquisitionDate) ? parseInt(acquisitionDate, 10) : null;

    if (!byCountry[country]) byCountry[country] = { count: 0, objects: [] };
    byCountry[country].count += 1;
    byCountry[country].objects.push({
      object_name: (objectType + (museumNumber ? ' (' + museumNumber + ')' : '')).slice(0, 120),
      origin_place: place || country,
      origin_country: country,
      origin_coordinates: countryCoords.get(country) || null,
      year_acquired: year,
      type: objectType,
      museum_ref: museumNumber || null,
      object_url: museumRefToUrl(museumNumber),
      history: 'British Museum collection (step3.csv). Findspot/production: Africa. Acquisition: ' + (get(row, 'aqusition_way') || '—') + (get(row, 'aqusition_name') ? ' (' + get(row, 'aqusition_name') + ')' : ''),
      image_url: null,
    });
  }

  const result = {
    source: 'step3.csv — African countries only (findspot_continent or production_continent = Africa, or country in Africa)',
    parsed_at: new Date().toISOString(),
    total_africa_rows: totalAfrica,
    rows_skipped: skipped,
    countries: byCountry,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log('Wrote', OUT_PATH);
  console.log('African artefacts:', totalAfrica, '| Countries:', Object.keys(byCountry).length);
  Object.entries(byCountry)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .forEach(([name, d]) => console.log(' ', name + ':', d.count));
}

main();
