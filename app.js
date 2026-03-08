(function () {
  'use strict';

  const DATA_URL = 'data/africa_by_country.json';


  const COLOR_PALETTE = [
    '#8b2942', '#2d5a4a', '#b85c38', '#0d5c6b', '#c9a227', '#6b5b6b',
    '#4a7c59', '#9c4a6a', '#3d6b7a', '#8f5e35', '#5c4d6d', '#2c6b4a',
  ];

  let data = { countries: {}, bm_africa_search_total: 268000 };
  let map = null;
  let clusterGroup = null;
  let originLayer = null;
  let countryList = [];
  let allObjects = [];
  let selectedCountryName = null;

  function getCountryColor(countryName) {
    let h = 0;
    for (let i = 0; i < countryName.length; i++) h = (h << 5) - h + countryName.charCodeAt(i);
    return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function cleanHistory(text) {
    if (text == null || typeof text !== 'string') return '';
    return text
      .replace(/\s*\(step3\.csv\)\s*/gi, ' ')
      .replace(/\s*step3\.csv\s*/gi, ' ')
      .replace(/\s*British Museum collection \(step3\.csv\)\.\s*/gi, 'British Museum collection. ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildCountryList() {
    const countries = data.countries || {};
    countryList = Object.entries(countries)
      .map(function (entry) {
        const name = entry[0];
        const c = entry[1];
        const objs = c.objects || [];
        const count = objs.length > 0 ? objs.length : (c.count || 0);
        return {
          name,
          count: count,
          coordinates: c.coordinates || null,
          objects: objs,
        };
      })
      .filter(function (c) { return c.coordinates && c.coordinates.length >= 2; })
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }); });
    allObjects = [];
    countryList.forEach(function (c) {
      (c.objects || []).forEach(function (obj) {
        allObjects.push(Object.assign({}, obj, { origin_country: c.name }));
      });
    });
  }

  function renderCountriesList() {
    const el = document.getElementById('origins-list');
    if (!el) return;
    const totalInDataset = allObjects.length;
    el.innerHTML =
      '<p class="panel-note">Dataset: <strong>step3.csv</strong> (African artefacts by country).</p>' +
      '<p class="panel-total">Total: <strong>' + totalInDataset.toLocaleString() + '</strong> artefacts</p>' +
      countryList.map(function (country) {
        const count = country.count || 0;
        const color = getCountryColor(country.name);
        return (
          '<div class="country-block" data-country="' + escapeHtml(country.name) + '">' +
            '<div class="origin-card country-card" style="border-left: 3px solid ' + color + '">' +
              '<h4>' + escapeHtml(country.name) + '</h4>' +
              '<span class="count">' + count.toLocaleString() + ' object' + (count !== 1 ? 's' : '') + '</span>' +
            '</div>' +
            '<div class="country-artefacts" aria-hidden="true"></div>' +
          '</div>'
        );
      }).join('');

    el.querySelectorAll('.country-card').forEach(function (card) {
      card.addEventListener('click', function () {
        const block = this.closest('.country-block');
        const name = block.getAttribute('data-country');
        const artefactsWrap = block.querySelector('.country-artefacts');
        if (!artefactsWrap) return;

        const isCurrentlyOpen = artefactsWrap.classList.contains('is-open');

        if (isCurrentlyOpen) {
          artefactsWrap.classList.remove('is-open');
          artefactsWrap.setAttribute('aria-hidden', 'true');
          return;
        }

        document.querySelectorAll('.country-artefacts').forEach(function (w) {
          if (w !== artefactsWrap) {
            w.classList.remove('is-open');
            w.setAttribute('aria-hidden', 'true');
            w.innerHTML = '';
          }
        });

        const country = countryList.find(function (c) { return c.name === name; });
        if (country) {
          fillCountryArtefacts(artefactsWrap, country);
          artefactsWrap.classList.add('is-open');
          artefactsWrap.setAttribute('aria-hidden', 'false');
        }

        selectedCountryName = name;
        if (country && country.coordinates && map) {
          map.setView(country.coordinates, 5);
          if (originLayer) map.removeLayer(originLayer);
          originLayer = L.circle(country.coordinates, {
            radius: 300000,
            color: getCountryColor(country.name),
            fillColor: getCountryColor(country.name),
            fillOpacity: 0.08,
            weight: 1,
          }).addTo(map);
        }
      });
    });
  }

  function selectCountry(name) {
    var block = null;
    document.querySelectorAll('.country-block').forEach(function (b) {
      if (b.getAttribute('data-country') === name) block = b;
    });
    if (!block) return;
    const card = block.querySelector('.country-card');
    const artefactsWrap = block.querySelector('.country-artefacts');
    if (!card || !artefactsWrap) return;
    document.querySelectorAll('.country-artefacts').forEach(function (w) {
      if (w !== artefactsWrap) { w.classList.remove('is-open'); w.setAttribute('aria-hidden', 'true'); w.innerHTML = ''; }
    });
    const country = countryList.find(function (c) { return c.name === name; });
    if (country) {
      fillCountryArtefacts(artefactsWrap, country);
      artefactsWrap.classList.add('is-open');
      artefactsWrap.setAttribute('aria-hidden', 'false');
    }
    block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function simpleDescription(obj) {
    const parts = [];
    if (obj.type) parts.push(obj.type);
    if (obj.year_acquired != null) parts.push('Acquired ' + obj.year_acquired);
    if (obj.history) {
      var short = cleanHistory(obj.history);
      parts.push(short.length > 120 ? short.slice(0, 117) + '…' : short);
    }
    return parts.length ? parts.join(' · ') : '—';
  }

  function fillCountryArtefacts(container, country) {
    if (!container) return;
    const objs = country && country.objects ? country.objects : [];
    container.innerHTML =
      '<h5 class="country-artefacts-title" role="button" tabindex="0" title="Click to close">' + escapeHtml(country.name) + ' — ' + (country.count || 0).toLocaleString() + ' artefacts <span class="artefacts-close-hint">▼ close</span></h5>' +
      (objs.length
        ? objs.map(function (obj, idx) {
            const name = obj.object_name || 'Object';
            const simple = simpleDescription(obj);
            const descHtml = buildArtefactDescriptionHtml(obj);
            return (
              '<div class="artefact-row" data-index="' + idx + '">' +
                '<button type="button" class="artefact-name" aria-expanded="false">' + escapeHtml(name) + '</button>' +
                '<p class="artefact-simple-desc">' + escapeHtml(simple) + '</p>' +
                '<div class="artefact-description" hidden>' + descHtml + '</div>' +
              '</div>'
            );
          }).join('')
        : '<p class="count">No artefacts in this dataset for ' + escapeHtml(country.name) + '.</p>');

    container.classList.add('artefact-list-wrap');
    var titleEl = container.querySelector('.country-artefacts-title');
    if (titleEl) {
      function closeDropdown() {
        container.classList.remove('is-open');
        container.setAttribute('aria-hidden', 'true');
      }
      titleEl.addEventListener('click', closeDropdown);
      titleEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeDropdown(); } });
    }
    container.querySelectorAll('.artefact-row').forEach(function (row) {
      const btn = row.querySelector('.artefact-name');
      const desc = row.querySelector('.artefact-description');
      if (!btn || !desc) return;
      btn.addEventListener('click', function () {
        const isOpen = !desc.hidden;
        desc.hidden = isOpen;
        btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
        btn.classList.toggle('is-open', !isOpen);
      });
    });
  }

  function buildArtefactDescriptionHtml(obj) {
    const year = obj.year_acquired != null ? obj.year_acquired : '';
    return (
      (year ? '<p class="artefact-meta">Acquired ' + escapeHtml(String(year)) + (obj.type ? ' · ' + escapeHtml(obj.type) : '') + '</p>' : (obj.type ? '<p class="artefact-meta">' + escapeHtml(obj.type) + '</p>' : '')) +
      (obj.history ? '<p class="artefact-history">' + escapeHtml(cleanHistory(obj.history)) + '</p>' : '') +
      (obj.museum_ref ? '<p class="artefact-ref">Ref: ' + escapeHtml(obj.museum_ref) + '</p>' : '') +
      (obj.object_url ? '<a class="artefact-link" href="' + escapeHtml(obj.object_url) + '" target="_blank" rel="noopener">View at British Museum →</a>' : '')
    );
  }


  function buildPopupContent(country) {
    const objs = country.objects || [];
    const list = objs.slice(0, 6).map(function (o) {
      const y = o.year_acquired ? ' (' + o.year_acquired + ')' : '';
      return '<li>' + escapeHtml((o.object_name || 'Object').slice(0, 40)) + (o.object_name && o.object_name.length > 40 ? '…' : '') + y + '</li>';
    }).join('');
    const more = objs.length > 6 ? '<li><em>… and ' + (objs.length - 6) + ' more</em></li>' : '';
    const totalNote = data.bm_africa_search_total ? ' (BM Africa total: ' + data.bm_africa_search_total.toLocaleString() + ')' : '';
    return (
      '<div class="popup-title">' + escapeHtml(country.name) + '</div>' +
      '<div class="popup-meta">' + (country.count || 0) + ' object(s) in this dataset' + totalNote + '</div>' +
      (list ? '<ul class="popup-list">' + list + more + '</ul>' : '<p class="popup-meta">Run scraper or import CSV to add objects.</p>')
    );
  }

  function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    map = L.map('map', {
      center: [2.5, 20],
      zoom: 3,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 80,
      spiderfyOnMaxZoom: true,
    });

    countryList.forEach(function (country) {
      if (!country.coordinates || country.coordinates.length < 2) return;
      const color = getCountryColor(country.name);
      const count = country.count || 0;
      const radius = count > 0 ? Math.min(8 + Math.log2(count + 1) * 3, 22) : 6;
      const marker = L.circleMarker(country.coordinates, {
        radius: radius,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: count > 0 ? 0.9 : 0.5,
      });
      marker.bindPopup(buildPopupContent(country), { maxWidth: 320 });
      marker.bindTooltip(country.name + ': ' + count.toLocaleString() + ' artefacts', {
        permanent: false,
        direction: 'top',
        className: 'marker-tooltip',
      });
      marker.countryName = country.name;
      marker.country = country;
      marker.on('click', function () {
        selectCountry(country.name);
        if (originLayer) map.removeLayer(originLayer);
        originLayer = L.circle(country.coordinates, {
          radius: 400000,
          color: color,
          fillColor: color,
          fillOpacity: 0.06,
          weight: 1,
        }).addTo(map);
      });
      clusterGroup.addLayer(marker);
    });

    var countLabelLayer = L.layerGroup();
    function updateMarkerLabels() {
      countLabelLayer.clearLayers();
      if (map.getZoom() < 4) {
        if (countLabelLayer._map) map.removeLayer(countLabelLayer);
        return;
      }
      countryList.forEach(function (country) {
        if (!country.coordinates || country.coordinates.length < 2) return;
        const count = country.count || 0;
        const countStr = count >= 1000 ? (count / 1000).toFixed(1) + 'k' : String(count);
        const color = getCountryColor(country.name);
        const el = document.createElement('div');
        el.className = 'marker-count-badge';
        el.textContent = countStr;
        el.style.background = color;
        el.style.color = '#fff';
        el.style.borderRadius = '50%';
        el.style.width = '26px';
        el.style.height = '26px';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.fontSize = '11px';
        el.style.fontWeight = '600';
        el.style.border = '2px solid #fff';
        el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.35)';
        el.style.pointerEvents = 'none';
        const icon = L.divIcon({ html: el, className: 'marker-count-icon', iconSize: [26, 26], iconAnchor: [13, 13] });
        const labelMarker = L.marker(country.coordinates, { icon: icon, interactive: false });
        countLabelLayer.addLayer(labelMarker);
      });
      if (!countLabelLayer._map) countLabelLayer.addTo(map);
    }
    map.on('zoomend', updateMarkerLabels);
    setTimeout(updateMarkerLabels, 200);

    map.addLayer(clusterGroup);

    const legendEl = document.getElementById('map-legend');
    if (legendEl) {
      const totalArtefacts = allObjects.length;
      legendEl.innerHTML =
        '<span class="map-legend-item"><span class="legend-dot" style="background:#8b2942"></span> Country with artefacts</span>' +
        '<span class="map-legend-item"><span class="legend-dot" style="background:#c4beb4;opacity:0.6"></span> No data yet</span>' +
        '<span style="margin-left:0.5rem">54 countries · <strong>' + totalArtefacts.toLocaleString() + '</strong> artefacts on continent</span>';
    }
  }

  function run() {
    fetch(DATA_URL)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('Failed to load data')); })
      .then(function (json) {
        data = json;
        buildCountryList();
        renderCountriesList();
        initMap();
      })
      .catch(function (err) {
        console.error(err);
        var listEl = document.getElementById('origins-list');
        if (listEl) listEl.innerHTML =
          '<p style="color: var(--text-muted);">Could not load data. Run from a local server (e.g. <code>npx serve</code>) and ensure <code>data/africa_by_country.json</code> exists. Run <code>node scripts/build_africa_by_country.js</code> to generate it.</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
