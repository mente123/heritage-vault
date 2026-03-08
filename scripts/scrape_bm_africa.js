#!/usr/bin/env node
/**
 * Scrape British Museum collection search (place=Africa) to get objects by country.
 * The BM site is behind Cloudflare; run with: npx playwright install chromium && node scripts/scrape_bm_africa.js
 * First run may require headed mode to pass Cloudflare: HEADED=1 node scripts/scrape_bm_africa.js
 *
 * Output: data/africa_scraped.json (country -> { count, objects[] })
 * Then run: node scripts/build_africa_by_country.js to merge into africa_by_country.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'data', 'africa_scraped.json');
const SEARCH_URL = 'https://www.britishmuseum.org/collection/search?place=Africa&view=list';
const MAX_PAGES = 50;   // limit pages to avoid endless run (each page ~24 results)
const DELAY_MS = 2000; // delay between pages

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
  if (t.toLowerCase().includes('nigeria')) return 'Nigeria';
  if (t.toLowerCase().includes('egypt')) return 'Egypt';
  if (t.toLowerCase().includes('ghana')) return 'Ghana';
  if (t.toLowerCase().includes('ethiopia')) return 'Ethiopia';
  if (t.toLowerCase().includes('kenya')) return 'Kenya';
  if (t.toLowerCase().includes('tanzania')) return 'Tanzania';
  if (t.toLowerCase().includes('south africa')) return 'South Africa';
  if (t.toLowerCase().includes('morocco')) return 'Morocco';
  if (t.toLowerCase().includes('algeria')) return 'Algeria';
  if (t.toLowerCase().includes('tunisia')) return 'Tunisia';
  if (t.toLowerCase().includes('sudan')) return 'Sudan';
  if (t.toLowerCase().includes('eritrea')) return 'Eritrea';
  if (t.toLowerCase().includes('libya')) return 'Libya';
  if (t.toLowerCase().includes('madagascar')) return 'Madagascar';
  if (t.toLowerCase().includes('congo')) return 'Democratic Republic of the Congo';
  return null;
}

async function run() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('Install Playwright first: npx playwright install chromium');
    process.exit(1);
  }

  const headless = process.env.HEADED !== '1';
  const browser = await playwright.chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const byCountry = {};
  const seenIds = new Set();
  let pageNum = 1;

  try {
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);

    const noResults = await page.locator('text=Your search returned no results').count() > 0;
    if (noResults) {
      console.log('Search returned no results (Cloudflare or changed page structure). Try HEADED=1 to solve captcha in browser.');
      await browser.close();
      fs.writeFileSync(OUT_PATH, JSON.stringify({ countries: byCountry, note: 'No results; run with HEADED=1' }, null, 2));
      return;
    }

    while (pageNum <= MAX_PAGES) {
      const items = await page.locator('[data-facet="place"] a, .search-result-item, a[href*="/collection/object/"]').all();
      const rows = await page.locator('.search-result-item, [class*="result"]').all();
      let extracted = 0;

      for (const row of rows) {
        try {
          const link = row.locator('a[href*="/collection/object/"]').first();
          const href = await link.getAttribute('href').catch(() => null);
          if (!href) continue;
          const id = href.replace(/.*\/object\//, '').replace(/\/$/, '');
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          const name = await link.textContent().then(t => t?.trim()).catch(() => '') || 'Object';
          let placeText = '';
          const placeEl = row.locator('[class*="place"], [data-facet="place"], .production-place').first();
          if (await placeEl.count() > 0) placeText = await placeEl.textContent().then(t => t?.trim()).catch(() => '') || '';

          const country = extractCountryFromPlace(placeText) || 'Unknown';
          if (!byCountry[country]) byCountry[country] = { count: 0, objects: [] };
          byCountry[country].count += 1;
          byCountry[country].objects.push({
            object_name: name,
            object_url: href.startsWith('http') ? href : 'https://www.britishmuseum.org' + href,
            museum_ref: id,
            origin_place: placeText || null,
            origin_country: country,
          });
          extracted++;
        } catch (_) {}
      }

      console.log('Page', pageNum, 'extracted', extracted, 'objects');
      if (extracted === 0) break;

      const nextBtn = page.locator('a[rel="next"], .pagination a:has-text("Next"), button:has-text("Next")').first();
      if (await nextBtn.count() === 0) break;
      await nextBtn.click();
      await page.waitForTimeout(DELAY_MS);
      pageNum++;
    }
  } catch (err) {
    console.error(err);
  }

  await browser.close();

  const result = {
    source: 'British Museum collection search (place=Africa)',
    scraped_at: new Date().toISOString(),
    pages_scraped: pageNum,
    countries: byCountry,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log('Wrote', OUT_PATH);
  console.log('Countries with data:', Object.keys(byCountry).length);
}

run();
