const map = L.map('map', { zoomControl: false }).setView(CENTER, 16);
L.control.zoom({ position: 'bottomright' }).addTo(map);

const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 19, attribution: 'Imagery &copy; Esri' }).addTo(map);
const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution: '&copy; OpenStreetMap' });
L.control.layers({ Satellite: sat, Street: street }, null, { position: 'bottomright' }).addTo(map);

const GLYPH = { roads: '', parking: 'P', charging: '&#9889;', noentry: '<i></i>', caution: '!', safe: '&#10003;' };
const icon = kind => L.divIcon({
  className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14],
  html: `<div class="pin ${kind}"><span>${GLYPH[kind]}</span></div>`
});

const layers = {
  roads: L.layerGroup().addTo(map), parking: L.layerGroup().addTo(map), charging: L.layerGroup().addTo(map),
  noentry: L.layerGroup().addTo(map), caution: L.layerGroup().addTo(map), safe: L.layerGroup().addTo(map)
};

PARKING.forEach(p => L.marker(p.pos, { icon: icon('parking') }).bindTooltip(p.name).addTo(layers.parking));
CHARGING.forEach(p => L.marker(p.pos, { icon: icon('charging') }).bindTooltip(p.name).addTo(layers.charging));

const levelClass = l => l.split(/[ /]+/)[0].toLowerCase();
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const badge = r => `<span class="badge ${levelClass(r.level)}">${esc(r.level)}</span>`;
const videoTag = (src, controls) =>
  `<video src="${esc(src)}" ${controls ? 'controls' : 'muted'} autoplay loop playsinline></video>`;

const markers = {};
RISKS.forEach(r => {
  const m = L.marker(r.pos, { icon: icon(r.kind) }).addTo(layers[r.kind]);
  markers[r.id] = m;
  if (r.kind === 'noentry') {
    m.bindTooltip(
      `<div class="tip"><strong>No entry: ${esc(r.road)}</strong>${videoTag(r.video)}<small>Click to enlarge</small></div>`,
      { direction: 'top', offset: [0, -16], opacity: 1, className: 'vtip' });
    m.on('click', () => openModal(r));
  } else {
    m.bindPopup(
      `<div class="pop"><img src="media/site-${r.id}.jpg" alt="">` +
      `<strong>${esc(r.place)}</strong><br>${esc(r.road)}<br>${badge(r)}</div>`, { minWidth: 220 });
  }
});

// ----- colored road segments -----
const ROAD_COLOR = { red: '#d92d20', orange: '#f79009', yellow: '#f2d600', green: '#2e9e5b' };
const LEVEL_LABEL = { red: 'Danger: no entry', orange: 'Slightly dangerous', yellow: 'Moderate', green: 'Safe' };
async function snapToRoad(rd) {
  if (rd.snap === false) return rd.pts;
  const key = 'road:' + JSON.stringify(rd.pts);
  try { const c = localStorage.getItem(key); if (c) return JSON.parse(c); } catch (e) {}
  try {
    const q = rd.pts.map(p => p[1] + ',' + p[0]).join(';');
    const j = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${q}?overview=full&geometries=geojson`)).json();
    const line = j.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    try { localStorage.setItem(key, JSON.stringify(line)); } catch (e) {}
    return line;
  } catch (e) { return rd.pts; }
}
ROADS.forEach(rd => {
  rd.line = rd.pts;
  const casing = L.polyline(rd.pts, { color: '#1d1a26', weight: 9, opacity: .55 }).addTo(layers.roads);
  const color = L.polyline(rd.pts, { color: ROAD_COLOR[rd.level], weight: 5 })
    .bindTooltip(`<b>${esc(rd.name)}</b><br>${LEVEL_LABEL[rd.level]}`, { sticky: true }).addTo(layers.roads);
  rd.ready = snapToRoad(rd).then(line => { rd.line = line; casing.setLatLngs(line); color.setLatLngs(line); });
});

// ----- side panel -----
const KINDS = [
  ['roads', 'Road safety colors'], ['parking', 'Parking'], ['charging', 'Charging station'],
  ['noentry', 'No entry'], ['caution', 'Caution road'], ['safe', 'Safe spot']
];
const DESC = { roads: 'Colored by safety level', parking: 'eBike parking spots', charging: 'Charging point', noentry: 'Hover for a video preview', caution: 'Ride with extra care', safe: 'Low-risk spot' };
document.getElementById('toggles').innerHTML = KINDS.map(([k, label]) =>
  `<label class="row"><span class="pin sm ${k}"><span>${GLYPH[k]}</span></span><span>${label}<small>${DESC[k]}</small></span><input type="checkbox" class="switch" data-k="${k}" checked></label>`).join('');
document.getElementById('toggles').addEventListener('change', e => {
  const k = e.target.dataset.k;
  e.target.checked ? layers[k].addTo(map) : map.removeLayer(layers[k]);
});

document.getElementById('list').innerHTML = RISKS.map(r =>
  `<li><button data-id="${r.id}"><b>${r.id}</b><span>${esc(r.place)}<small>${esc(r.road)}</small></span>${badge(r)}</button></li>`).join('');
document.getElementById('list').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const r = RISKS.find(x => x.id == b.dataset.id);
  if (innerWidth < 800) setSidebar(false);
  map.flyTo(r.pos, 18, { duration: 0.8 });
  r.kind === 'noentry' ? openModal(r) : markers[r.id].openPopup();
});

// ----- enlarged view for no-entry roads -----
const modal = document.getElementById('modal');
let current = null;
function profileSVG(r) {
  const p = r.profile;
  if (!p || p.length < 2) return `<p class="muted">${r.loading ? 'Loading elevation data...' : 'Elevation could not be loaded (needs internet). You can add a <code>profile</code> array in data.js.'}</p>`;
  const W = 480, H = 120, xs = p.map(d => d[0]), ys = p.map(d => d[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pts = p.map(d => `${((d[0] - x0) / (x1 - x0 || 1) * W).toFixed(1)},${(H - 8 - (d[1] - y0) / (y1 - y0 || 1) * (H - 20)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Elevation profile"><polygon points="${pts} ${W},${H} 0,${H}" class="fill"/><polyline points="${pts}" class="line"/></svg>
    <div class="axis"><span>${y0} m low</span><span>${y1} m high</span></div>
    ${r.est ? (r.est.gpx ? '<p class="muted">From your GPX file (lightly smoothed). Up and down are counted along the direction the track was drawn.</p>' : '<p class="muted">Estimated from about ' + (r.est.res || '90 m') + ' resolution terrain data, so short slopes look rougher than they are. Confirm with Google Earth Pro or a GPS reading.</p>') : ''}`;
}
function dataBlock(r) {
  const s = r.stats || {}, e = r.est || {};
  const stat = (label, v) => `<div><dt>${label}</dt><dd>${v ? esc(v) : '<span class="muted">Not added yet</span>'}</dd></div>`;
  return `<dl class="stats">${stat('Elevation change', s.elevation || e.elevation)}${stat('Max gradient', s.gradient || e.gradient)}${stat('Road length', s.length || e.length)}</dl>
    <h3>Why riders cannot use this road</h3>
    <p>${s.reason ? esc(s.reason) : '<span class="muted">Add the reason in data.js (stats.reason).</span>'}</p>
    <h3>Elevation profile</h3>${profileSVG(r)}`;
}
const refresh = r => { const el = document.getElementById('elev'); if (el && current === r && !modal.hidden) el.innerHTML = dataBlock(r); };
function samplePoints(line, n) {
  const d = [0]; for (let i = 1; i < line.length; i++) d.push(d[i - 1] + map.distance(line[i - 1], line[i]));
  const total = d[d.length - 1], out = []; let j = 1;
  for (let k = 0; k < n; k++) {
    const t = total * k / (n - 1);
    while (j < line.length - 1 && d[j] < t) j++;
    const f = Math.min(1, Math.max(0, (t - d[j - 1]) / ((d[j] - d[j - 1]) || 1)));
    out.push({ dist: t, lat: line[j - 1][0] + (line[j][0] - line[j - 1][0]) * f, lng: line[j - 1][1] + (line[j][1] - line[j - 1][1]) * f });
  }
  return out;
}
async function getElevations(pts) {
  try {   // finer 30 m terrain data first (OpenTopoData SRTM)
    const loc = pts.map(p => p.lat.toFixed(6) + ',' + p.lng.toFixed(6)).join('|');
    const j = await (await fetch('https://api.opentopodata.org/v1/srtm30m?locations=' + loc)).json();
    const el = j.results.map(x => x.elevation);
    if (el.length === pts.length && el.every(v => typeof v === 'number')) return { el, res: '30 m' };
  } catch (e) { console.warn('30 m elevation unavailable, using 90 m', e); }
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p.lat.toFixed(6))}&longitude=${pts.map(p => p.lng.toFixed(6))}`;
  return { el: (await (await fetch(url)).json()).elevation, res: '90 m' };
}
async function loadTerrain(r) {
  const rd = ROADS.find(x => x.risk === r.id); if (!rd) return;
  r.loading = true; refresh(r);
  try {
    await rd.ready;
    const pts = samplePoints(rd.line, 40);
    const { el, res } = await getElevations(pts);
    if (!el || el.length !== pts.length) throw new Error('bad data');
    let gain = 0, down = 0, grad = 0;
    for (let i = 1; i < el.length; i++) { gain += Math.max(0, el[i] - el[i - 1]); down += Math.max(0, el[i - 1] - el[i]); }
    for (let i = 4; i < el.length; i++) grad = Math.max(grad, Math.abs(el[i] - el[i - 4]) / (pts[i].dist - pts[i - 4].dist) * 100);
    r.profile = pts.map((p, i) => [Math.round(p.dist), el[i]]);
    r.est = { elevation: down.toFixed(1) + ' m down / ' + gain.toFixed(1) + ' m up (est.)', gradient: grad.toFixed(1) + '% (est.)', length: Math.round(pts[pts.length - 1].dist) + ' m', res };
  } catch (e) { console.warn('Elevation failed', e); }
  r.loading = false; refresh(r);
}

// ----- elevation from your own GPX track (preferred over terrain estimates) -----
function readText(url) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.onload = () => ((x.status === 200 || x.status === 0) && x.responseText ? res(x.responseText) : rej(new Error('GPX not found: ' + url)));
    x.onerror = () => rej(new Error('GPX not found: ' + url));
    x.send();
  });
}
async function loadGPX(url) {
  const doc = new DOMParser().parseFromString(await readText(url), 'application/xml');
  const raw = [...doc.querySelectorAll('trkpt, rtept')]
    .map(p => ({ lat: +p.getAttribute('lat'), lng: +p.getAttribute('lon'), ele: parseFloat(p.querySelector('ele')?.textContent) }))
    .filter(p => !isNaN(p.ele));
  if (raw.length < 2) throw new Error('GPX has no elevation points');
  // 5-point moving average to reduce GPS noise
  const e = raw.map((p, i) => { const s = raw.slice(Math.max(0, i - 2), i + 3); return s.reduce((t, q) => t + q.ele, 0) / s.length; });
  let dist = 0;
  const d = raw.map((p, i) => (i ? (dist += map.distance([raw[i - 1].lat, raw[i - 1].lng], [p.lat, p.lng])) : 0));
  return { d, e, total: dist };
}
function gpxStats(g, r) {
  const { d, e, total } = g; let gain = 0, down = 0, grad = 0;
  for (let i = 1; i < e.length; i++) { gain += Math.max(0, e[i] - e[i - 1]); down += Math.max(0, e[i - 1] - e[i]); }
  for (let i = 0, j = 0; i < e.length; i++) {              // steepest stretch over at least 25 m
    while (j < i && d[i] - d[j + 1] >= 25) j++;
    if (d[i] - d[j] >= 25) grad = Math.max(grad, Math.abs(e[i] - e[j]) / (d[i] - d[j]) * 100);
  }
  const step = Math.max(1, Math.floor(e.length / 80)), idx = [];
  for (let i = 0; i < e.length; i += step) idx.push(i);
  if (idx[idx.length - 1] !== e.length - 1) idx.push(e.length - 1);
  r.profile = idx.map(i => [Math.round(d[i]), +e[i].toFixed(1)]);
  return { gpx: true, elevation: down.toFixed(1) + ' m down / ' + gain.toFixed(1) + ' m up', gradient: grad.toFixed(1) + '%', length: Math.round(total) + ' m' };
}
async function loadElevation(r) {
  if (r.gpx) {
    r.loading = true; refresh(r);
    try { r.est = gpxStats(await loadGPX(r.gpx), r); } catch (e) { console.warn('GPX could not be read', e); }
    r.loading = false; refresh(r);
  }
  if (!r.profile) await loadTerrain(r);   // falls back to terrain estimate
}
function openModal(r) {
  current = r;
  document.getElementById('modal-body').innerHTML = `
    <h2>No entry for eBikes: ${esc(r.road)}</h2>
    <p class="sub">${esc(r.place)} ${badge(r)}</p>
    ${videoTag(r.video, true)}
    <div id="elev">${dataBlock(r)}</div>`;
  modal.hidden = false;
  modal.querySelector('.close').focus();
  if (!r.profile && !r.loading) loadElevation(r);
}
const closeModal = () => { modal.hidden = true; document.getElementById('modal-body').innerHTML = ''; };
modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('.close')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

// Missing video files: show a message instead of a broken player
document.addEventListener('error', e => {
  if (e.target.tagName === 'IMG') { e.target.remove(); return; }
  if (e.target.tagName !== 'VIDEO') return;
  const d = document.createElement('div');
  d.className = 'novid'; d.textContent = 'Video not added yet';
  e.target.replaceWith(d);
}, true);

// ----- floating legend button + places drawer -----
const legend = document.getElementById('legend'), legendBtn = document.getElementById('legend-btn'), sideBtn = document.getElementById('side-btn');
function setLegend(open) {
  legend.hidden = !open; legendBtn.setAttribute('aria-expanded', open);
  if (open && innerWidth < 800) setSidebar(false);
}
function setSidebar(open) {
  document.body.classList.toggle('side-open', open); sideBtn.setAttribute('aria-expanded', open);
  if (open && innerWidth < 800) setLegend(false);
}
legendBtn.addEventListener('click', () => setLegend(legend.hidden));
document.getElementById('legend-close').addEventListener('click', () => setLegend(false));
sideBtn.addEventListener('click', () => setSidebar(true));
document.getElementById('side-close').addEventListener('click', () => setSidebar(false));
map.on('click', () => { setLegend(false); if (innerWidth < 800) setSidebar(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.hidden) setLegend(false); });
setSidebar(innerWidth >= 800);

// ----- UiTM boundary: always on, not clickable, sits under the roads and markers -----
if (typeof BOUNDARY_GEOJSON !== 'undefined' && BOUNDARY_GEOJSON) {
  try {
    map.createPane('boundary').style.zIndex = 350;
    const ring = style => L.geoJSON(BOUNDARY_GEOJSON, { pane: 'boundary', interactive: false, style: { fill: false, lineJoin: 'round', ...style } }).addTo(map);
    ring({ color: '#6a45b8', weight: 14, opacity: .22 });                    // soft glow
    ring({ color: '#ffffff', weight: 5, opacity: .9 });                      // white edge
    ring({ color: '#6a45b8', weight: 3, dashArray: '12 7', opacity: 1 });    // purple dashed line
  } catch (e) { console.warn('Boundary GeoJSON could not be drawn', e); }
}