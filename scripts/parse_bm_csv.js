#!/usr/bin/env node
/**
 * Parse a British Museum (or Museum Data Service) CSV export and group objects by country.
 * CSV should have a column for production place (e.g. "Production place", "place", "production_place")
 * and optionally "Object name", "Museum number", "Object URL".
 *
 * Usage: node scripts/parse_bm_csv.js path/to/downloaded.csv
 * Output: data/africa_scraped.json (same format as scraper). Then run build_africa_by_country.js to merge.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'data', 'africa_scraped.json');

const COUNTRY_MATCH = [
  'Algeria','Angola','Benin','Botswana','Burkina Faso','Burundi','Cameroon','Cape Verde',
  'Central African Republic','Chad','Comoros','Congo','Democratic Republic of the Congo',
  'Djibouti','Egypt','Equatorial Guinea','Eritrea','Eswatini','Ethiopia','Gabon','Gambia',
  'Ghana','Guinea','Guinea-Bissau','Ivory Coast','Kenya','Lesotho','Liberia','Libya',
  'Madagascar','Malawi','Mali','Mauritania','Mauritius','Morocco','Mozambique','Namibia',
  'Niger','Nigeria','Rwanda','São Tomé and Príncipe','Senegal','Seychelles','Sierra Leone',
  'Somalia','South Africa','South Sudan','Sudan','Tanzania','Togo','Tunisia','Uganda',
  'Zambia','Zimbabwe'
];

function extractCountryFromPlace(placeText) {
  if (!placeText || typeof placeText !== 'string') return null;
  const t = placeText.trim();
  for (const c of COUNTRY_MATCH) {
    if (t.includes(c)) return c;
  }
  const lower = t.toLowerCase();
  const map = {
    'nigeria': 'Nigeria', 'egypt': 'Egypt', 'ghana': 'Ghana', 'ethiopia': 'Ethiopia',
    'kenya': 'Kenya', 'tanzania': 'Tanzania', 'south africa': 'South Africa',
    'morocco': 'Morocco', 'algeria': 'Algeria', 'tunisia': 'Tunisia', 'sudan': 'Sudan',
    'eritrea': 'Eritrea', 'libya': 'Libya', 'madagascar': 'Madagascar',
    'côte d\'ivoire': 'Ivory Coast', 'cote d\'ivoire': 'Ivory Coast',
  };
  for (const [k, v] of Object.entries(map)) {
    if (lower.includes(k)) return v;
  }
  if (lower.includes('congo')) return 'Democratic Republic of the Congo';
  return null;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === ',' || ch === ';') && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function main() {
  const csvPath = process.argv[2];
  if (!csvPath || !fs.existsSync(csvPath)) {
    console.error('Usage: node scripts/parse_bm_csv.js path/to/bm_africa_export.csv');
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    console.error('CSV has no data rows');
    process.exit(1);
  }

  const header = parseCsvLine(lines[0]);
  const nameIdx = header.findIndex(h => /object\s*name|title|name/i.test(h));
  const placeIdx = header.findIndex(h => /production\s*place|place|provenance|location/i.test(h));
  const numIdx = header.findIndex(h => /museum\s*number|number|id|reference/i.test(h));
  const urlIdx = header.findIndex(h => /url|link|object\s*url/i.test(h));

  if (placeIdx < 0) {
    console.error('No "Production place" or "place" column found. Columns:', header.join(', '));
    process.exit(1);
  }

  const byCountry = {};
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const placeText = cells[placeIdx] || '';
    const country = extractCountryFromPlace(placeText);
    if (!country) {
      skipped++;
      continue;
    }
    if (!byCountry[country]) byCountry[country] = { count: 0, objects: [] };
    byCountry[country].count += 1;
    byCountry[country].objects.push({
      object_name: nameIdx >= 0 ? (cells[nameIdx] || '') : 'Object',
      museum_ref: numIdx >= 0 ? (cells[numIdx] || '') : null,
      object_url: urlIdx >= 0 ? (cells[urlIdx] || null) : null,
      origin_place: placeText || null,
      origin_country: country,
    });
  }

  const result = {
    source: 'Parsed from CSV export (British Museum / Museum Data Service)',
    parsed_at: new Date().toISOString(),
    file: path.basename(csvPath),
    rows_parsed: lines.length - 1,
    rows_skipped_no_country: skipped,
    countries: byCountry,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log('Wrote', OUT_PATH);
  console.log('Countries:', Object.keys(byCountry).length, '| Objects:', Object.values(byCountry).reduce((s, c) => s + c.count, 0), '| Skipped:', skipped);
}

main();
