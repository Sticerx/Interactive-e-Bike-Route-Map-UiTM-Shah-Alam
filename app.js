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
  const rr = rd.risk && RISKS.find(x => x.id === rd.risk);
  const color = L.polyline(rd.pts, { color: ROAD_COLOR[rd.level], weight: 5 })
    .bindTooltip(() => roadTip(rd, rr), { sticky: true, direction: 'top', offset: [0, -8], opacity: 1, className: 'vtip' }).addTo(layers.roads);
  if (rr) {
    color.on('mousemove', e => hoverRoad(rr, e));
    color.on('mouseout', () => hoverDot.remove());
    color.on('click', () => openModal(rr));
  }
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
// ----- smooth elevation chart: monotone curve, grid, hover readout -----
const trackOf = r => r.track || (r.profile && r.profile.length > 1 ? { d: r.profile.map(p => p[0]), e: r.profile.map(p => p[1]) } : null);
function curvePath(X, Y) {   // monotone cubic curve: smooth and never overshoots the data
  const n = X.length, dx = [], dl = [], m = [];
  for (let k = 0; k < n - 1; k++) { dx[k] = X[k + 1] - X[k] || 1e-6; dl[k] = (Y[k + 1] - Y[k]) / dx[k]; }
  m[0] = dl[0]; m[n - 1] = dl[n - 2];
  for (let k = 1; k < n - 1; k++) m[k] = dl[k - 1] * dl[k] <= 0 ? 0 : (dl[k - 1] + dl[k]) / 2;
  for (let k = 0; k < n - 1; k++) {
    if (dl[k] === 0) { m[k] = m[k + 1] = 0; continue; }
    const a = m[k] / dl[k], b = m[k + 1] / dl[k], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[k] = t * a * dl[k]; m[k + 1] = t * b * dl[k]; }
  }
  const f = v => v.toFixed(1);
  let p = `M${f(X[0])} ${f(Y[0])}`;
  for (let k = 0; k < n - 1; k++) p += `C${f(X[k] + dx[k] / 3)} ${f(Y[k] + m[k] * dx[k] / 3)} ${f(X[k + 1] - dx[k] / 3)} ${f(Y[k + 1] - m[k + 1] * dx[k] / 3)} ${f(X[k + 1])} ${f(Y[k + 1])}`;
  return p;
}
const RAINBOW = ['#a21cff', '#1f55ff', '#00c8e0', '#27e07a', '#b8e61c', '#ff9d1f', '#ff2a1f'];   // high to low
function chartSVG(tr, o) {
  const W = o.w, H = o.h, L = o.titles ? 60 : 44, R = o.titles ? 26 : 12, T = 14, B = o.titles ? 50 : 24, total = tr.d[tr.d.length - 1] || 1;
  const step = Math.max(1, Math.floor(tr.d.length / 320)), D = [], E = [];
  for (let i = 0; i < tr.d.length; i += step) { D.push(tr.d[i]); E.push(tr.e[i]); }
  if (D[D.length - 1] !== total) { D.push(total); E.push(tr.e[tr.e.length - 1]); }
  const eMin = Math.min(...E), eMax = Math.max(...E), pad = (eMax - eMin) * 0.03 || 1, lo = eMin - pad, hi = eMax + pad;
  const sx = v => L + v / total * (W - L - R), sy = v => H - B - (v - lo) / (hi - lo) * (H - T - B);
  const X = D.map(sx), Y = E.map(sy), line = curvePath(X, Y), base = H - B;
  const fmt = v => (Math.round(v * 10) / 10).toString();
  // elevation labels: regular steps plus the exact lowest and highest point
  const dy = (H - T - B) / (hi - lo), ystep = [1, 2, 5, 10, 20].find(s => s * dy >= (o.gap || 20)) || 20, ticks = [];
  for (let v = Math.ceil(eMin / ystep) * ystep; v <= eMax; v += ystep) ticks.push(v);
  const far = v => ticks.every(t => Math.abs(sy(v) - sy(t)) >= 11);
  const lab = [...ticks.map(v => [v, 0]), ...[eMin, eMax].filter(far).map(v => [v, 1])];
  const grid = lab.map(([v, ext]) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/><text class="${ext ? 'ext' : ''}" x="${L - 6}" y="${(sy(v) + 3.5).toFixed(1)}" text-anchor="end">${fmt(v)} m</text>`).join('');
  // distance labels in km, with a vertical grid line at each
  const pxm = (W - L - R) / total, xstep = [10, 20, 25, 50, 100, 200, 500, 1000].find(s => s * pxm >= (o.xgap || 52)) || 1000, xs = [];
  for (let v = 0; v <= total; v += xstep) xs.push(v);
  const gapEnd = (total - xs[xs.length - 1]) * pxm;   // end label needs room, otherwise it replaces the last tick
  if (gapEnd > 0.5) { if (gapEnd >= 66 || xs.length < 2) xs.push(total); else xs[xs.length - 1] = total; }
  const km = v => +(v / 1000).toFixed(3) + ' km';
  const xt = xs.map(v => `<line class="grid" x1="${sx(v).toFixed(1)}" x2="${sx(v).toFixed(1)}" y1="${T}" y2="${base}"/><text x="${sx(v).toFixed(1)}" y="${base + 14}" text-anchor="${v === 0 ? 'start' : v === total ? 'end' : 'middle'}">${km(v)}</text>`).join('');
  const titles = o.titles ? `<text class="ttl" transform="rotate(-90 13 ${((T + base) / 2).toFixed(1)})" x="13" y="${((T + base) / 2).toFixed(1)}" text-anchor="middle">Elevation</text><text class="ttl" x="${((L + W - R) / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">Distance</text><rect x="${W - R + 8}" y="${sy(eMax).toFixed(1)}" width="8" height="${(sy(eMin) - sy(eMax)).toFixed(1)}" rx="3" fill="url(#c${o.id})"/>` : '';
  const stops = RAINBOW.map((c, i) => `<stop offset="${(i / (RAINBOW.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('');
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Elevation profile"><defs><linearGradient id="c${o.id}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${sy(eMax).toFixed(1)}" y2="${(sy(eMin) + 0.01).toFixed(2)}">${stops}</linearGradient></defs>${grid}${xt}<line class="axl" x1="${L}" x2="${L}" y1="${T}" y2="${base}"/><line class="axl" x1="${L}" x2="${W - R}" y1="${base}" y2="${base}"/><path class="ln" stroke="url(#c${o.id})" d="${line}"/>${titles}<line class="xh" y1="${T}" y2="${base}" style="display:none"/><circle class="dot" r="4.5" style="display:none"/></svg>`;
  return { svg, geo: { sx, sy, W, inv: x => (x - L) / (W - L - R) * total } };
}
const idxAt = (tr, dist) => { let lo = 0, hi = tr.d.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tr.d[mid] < dist) lo = mid; else hi = mid; } return dist - tr.d[lo] < tr.d[hi] - dist ? lo : hi; };
function moveCross(root, geo, tr, i) {   // move the crosshair and update the readout
  const line = root && root.querySelector('.xh'), dot = root && root.querySelector('.dot'), out = root && root.querySelector('.readout');
  if (!line || !geo) return;
  const x = geo.sx(tr.d[i]), y = geo.sy(tr.e[i]);
  line.setAttribute('x1', x); line.setAttribute('x2', x); dot.setAttribute('cx', x); dot.setAttribute('cy', y);
  line.style.display = dot.style.display = '';
  const k = Math.max(1, Math.round(6 / ((tr.d[tr.d.length - 1] / (tr.d.length - 1)) || 1)));   // slope over about 12 m
  const a = Math.max(0, i - k), b = Math.min(tr.d.length - 1, i + k);
  const s = (tr.e[b] - tr.e[a]) / ((tr.d[b] - tr.d[a]) || 1) * 100;
  if (out) out.innerHTML = `<b>${tr.e[i].toFixed(1)} m</b> at ${Math.round(tr.d[i])} m &middot; ${s > 0.5 ? '&#9650; uphill' : s < -0.5 ? '&#9660; downhill' : 'flat'} ${Math.abs(s).toFixed(1)}%`;
}
function profileSVG(r) {
  const tr = trackOf(r);
  if (!tr) return `<p class="muted">${r.loading ? 'Loading elevation data...' : 'Elevation could not be loaded (needs internet). You can add a GPX file or a <code>profile</code> array in data.js.'}</p>`;
  const mw = Math.max(300, Math.min(700, innerWidth - 90));
  const g = chartSVG(tr, { w: mw, h: Math.round(mw * 0.56), titles: mw >= 420, gap: 20, xgap: 52, id: 'm' + r.id }); r._mgeo = g.geo;
  const note = r.est ? (r.est.gpx ? 'From your GPX file, lightly smoothed over about 10 m. Up and down are counted along the direction the track was drawn.' : 'Estimated from about ' + (r.est.res || '90 m') + ' resolution terrain data, so short slopes look rougher than they are.') : '';
  return `${g.svg}<div class="readout">Move over the graph to see elevation and slope at any point</div>${note ? `<p class="muted">${note}</p>` : ''}`;
}
// hovering a road on the map
const TIP_COLOR = { red: '#d92d20', orange: '#b25e00', yellow: '#8a7a00', green: '#237a46' };
const hoverDot = L.circleMarker([0, 0], { radius: 6, color: '#fff', weight: 3, fillColor: '#1d1a26', fillOpacity: 1, interactive: false });
function roadTip(rd, rr) {
  const tr = rr && trackOf(rr), head = `<strong style="color:${TIP_COLOR[rd.level]}">${esc(rd.name)}: ${LEVEL_LABEL[rd.level]}</strong>`;
  if (!tr) return `<div class="tip">${head}</div>`;
  const g = chartSVG(tr, { w: 300, h: 150, gap: 15, xgap: 46, id: 't' + rr.id }); rr._tgeo = g.geo;
  const e = rr.est || {};
  return `<div class="tip tipg">${head}${g.svg}<div class="readout">Move along the road to see elevation</div><small>${esc(e.elevation || '')}${e.gradient ? ' &middot; steepest ' + esc(e.gradient) : ''}<br>Click for the full view</small></div>`;
}
function hoverRoad(r, e) {
  const tr = r.track; if (!tr || !tr.pts) return;
  let best = 0, bd = Infinity;
  tr.pts.forEach((p, i) => { const dd = (p[0] - e.latlng.lat) ** 2 + (p[1] - e.latlng.lng) ** 2; if (dd < bd) { bd = dd; best = i; } });
  hoverDot.setLatLng(tr.pts[best]).addTo(map);
  const t = e.target.getTooltip && e.target.getTooltip();
  moveCross(t && t.getElement(), r._tgeo, tr, best);
}
function wireChart(r) {   // hover or drag over the big graph in the enlarged view
  const root = document.getElementById('elev'), svg = root && root.querySelector('svg.chart'), tr = trackOf(r);
  if (!svg || !tr || !r._mgeo) return;
  const move = ev => {
    const rc = svg.getBoundingClientRect(), vx = (ev.clientX - rc.left) / rc.width * r._mgeo.W;
    moveCross(root, r._mgeo, tr, idxAt(tr, Math.min(tr.d[tr.d.length - 1], Math.max(0, r._mgeo.inv(vx)))));
  };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
}
function dataBlock(r) {
  const s = r.stats || {}, e = r.est || {};
  const stat = (label, v) => `<div><dt>${label}</dt><dd>${v ? esc(v) : '<span class="muted">Not added yet</span>'}</dd></div>`;
  return `<dl class="stats">${stat('Elevation change', s.elevation || e.elevation)}${stat('Max gradient', s.gradient || e.gradient)}${stat('Road length', s.length || e.length)}</dl>
    <h3>Why riders cannot use this road</h3>
    <p>${s.reason ? esc(s.reason) : '<span class="muted">Add the reason in data.js (stats.reason).</span>'}</p>
    <h3>Elevation profile</h3>${profileSVG(r)}`;
}
const refresh = r => { const el = document.getElementById('elev'); if (el && current === r && !modal.hidden) { el.innerHTML = dataBlock(r); wireChart(r); } };
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
  try {   
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
    r.track = { pts: pts.map(p => [p.lat, p.lng]), d: pts.map(p => p.dist), e: el };
    r.est = { elevation: down.toFixed(1) + ' m down / ' + gain.toFixed(1) + ' m up (est.)', gradient: grad.toFixed(1) + '% (est.)', length: Math.round(pts[pts.length - 1].dist) + ' m', res };
  } catch (e) { console.warn('Elevation failed', e); }
  r.loading = false; refresh(r);
}

// ----- elevation from your GPX -----
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
  return buildTrack(raw);
}
function smoothGauss(d, e, sigma) {   
  const out = [], reach = 3 * sigma;
  for (let i = 0; i < e.length; i++) {
    let s = 0, w = 0;
    for (let j = i; j >= 0 && d[i] - d[j] <= reach; j--) { const k = Math.exp(-((d[i] - d[j]) ** 2) / (2 * sigma * sigma)); s += k * e[j]; w += k; }
    for (let j = i + 1; j < e.length && d[j] - d[i] <= reach; j++) { const k = Math.exp(-((d[j] - d[i]) ** 2) / (2 * sigma * sigma)); s += k * e[j]; w += k; }
    out.push(s / w);
  }
  return out;
}
function buildTrack(raw) {
  if (raw.length < 2) throw new Error('GPX has no elevation points');
  let dist = 0;
  const d = raw.map((p, i) => (i ? (dist += map.distance([raw[i - 1].lat, raw[i - 1].lng], [p.lat, p.lng])) : 0));
  const e = smoothGauss(d, raw.map(p => p.ele), 5);   
  return { d, e, total: dist, pts: raw.map(p => [p.lat, p.lng]) };
}
function gpxStats(g, r) {
  const { d, e, total } = g; let gain = 0, down = 0, grad = 0;
  for (let i = 1; i < e.length; i++) { gain += Math.max(0, e[i] - e[i - 1]); down += Math.max(0, e[i - 1] - e[i]); }
  for (let i = 0, j = 0; i < e.length; i++) {             
    while (j < i && d[i] - d[j + 1] >= 25) j++;
    if (d[i] - d[j] >= 25) grad = Math.max(grad, Math.abs(e[i] - e[j]) / (d[i] - d[j]) * 100);
  }
  const step = Math.max(1, Math.floor(e.length / 80)), idx = [];
  for (let i = 0; i < e.length; i += step) idx.push(i);
  if (idx[idx.length - 1] !== e.length - 1) idx.push(e.length - 1);
  r.profile = idx.map(i => [Math.round(d[i]), +e[i].toFixed(1)]);
  r.track = { pts: g.pts, d, e };
  return { gpx: true, elevation: down.toFixed(1) + ' m down / ' + gain.toFixed(1) + ' m up', gradient: grad.toFixed(1) + '%', length: Math.round(total) + ' m' };
}
async function loadElevation(r) {
  if (typeof TRACKS !== 'undefined' && TRACKS[r.id]) {   // GPX data
    try { r.est = gpxStats(buildTrack(TRACKS[r.id].map(p => ({ lat: p[0], lng: p[1], ele: p[2] }))), r); refresh(r); return; }
    catch (e) { console.warn('Built-in track failed', e); }
  }
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
  wireChart(r);
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

// ----- UiTM boundary -----
if (typeof BOUNDARY_GEOJSON !== 'undefined' && BOUNDARY_GEOJSON) {
  try {
    map.createPane('boundary').style.zIndex = 350;
    const ring = style => L.geoJSON(BOUNDARY_GEOJSON, { pane: 'boundary', interactive: false, style: { fill: false, lineJoin: 'round', ...style } }).addTo(map);
    ring({ color: '#6a45b8', weight: 14, opacity: .22 });                    // soft glow
    ring({ color: '#ffffff', weight: 5, opacity: .9 });                      // white edge
    ring({ color: '#6a45b8', weight: 3, dashArray: '12 7', opacity: 1 });    // purple dashed line
  } catch (e) { console.warn('Boundary GeoJSON could not be drawn', e); }
}

// load elevation for the no-entry roads at start 
RISKS.filter(r => r.kind === 'noentry').forEach(r => loadElevation(r));