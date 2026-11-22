/* Campus Markets: every figure on the page is computed here, in the browser, from data/site_data.json. */
(function () {
  'use strict';

  // ---------- Constants and formatting ----------
  var PRICE_MIN = 10000, PRICE_MAX = 5000000;
  var DIST_MIN = 0, DIST_MAX = 15.5;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function money(v) { return v == null || isNaN(v) ? '–' : usd0.format(Math.round(v)); }
  function moneyShort(v) {
    if (v == null || isNaN(v)) return '–';
    var a = Math.abs(v);
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + Math.round(v);
  }
  function num(v) { return v == null || isNaN(v) ? '–' : nf0.format(v); }
  function dec1(v) { return v == null || isNaN(v) ? '–' : (Math.round(v * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 }); }
  function pct(v, d) { d = d == null ? 1 : d; return v == null || isNaN(v) ? '–' : (v >= 0 ? '' : '−') + Math.abs(v).toFixed(d) + '%'; }
  function spct(v, d) { return (v > 0 ? '+' : '') + pct(v, d); }
  function days(v) { return v == null || isNaN(v) ? '–' : dec1(v) + (v === 1 ? ' day' : ' days'); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function listJoin(a) {
    if (a.length <= 1) return a.join('');
    if (a.length === 2) return a[0] + ' and ' + a[1];
    return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  }
  function $(id) { return document.getElementById(id); }

  // ---------- Statistics ----------
  function median(arr) {
    var n = arr.length;
    if (!n) return null;
    var s = Float64Array.from(arr).sort();
    var m = n >> 1;
    return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function mean(arr) {
    if (!arr.length) return null;
    var t = 0;
    for (var i = 0; i < arr.length; i++) t += arr[i];
    return t / arr.length;
  }
  // Values tie if equal after rounding to the precision we display and the key uses.
  function tiedExtreme(items, key, wantMax, roundTo) {
    var best = null;
    items.forEach(function (it) {
      var v = it[key];
      if (v == null) return;
      if (best == null || (wantMax ? v > best : v < best)) best = v;
    });
    if (best == null) return [];
    var r = function (x) { return Math.round(x * roundTo) / roundTo; };
    return items.filter(function (it) { return it[key] != null && r(it[key]) === r(best); });
  }

  // ---------- Data ----------
  var D = null;      // raw columns
  var N = 0;
  var CITIES = [], UNIS = [], CITY_UNI = [];
  var YEAR, MONTH, VALID;
  var CITY_POS = [];  // median lat/lon per city
  var YEARS = [];

  function prepare(json) {
    D = json;
    CITIES = json.meta.cities;
    UNIS = json.meta.universities;
    CITY_UNI = json.meta.city_university;
    N = json.price.length;
    YEAR = new Int16Array(N);
    MONTH = new Int8Array(N);
    VALID = new Uint8Array(N);
    var ys = {};
    for (var i = 0; i < N; i++) {
      var sd = json.sale_date[i];
      if (sd) { YEAR[i] = +sd.slice(0, 4); MONTH[i] = +sd.slice(5, 7); ys[YEAR[i]] = 1; }
      var p = json.price[i];
      VALID[i] = p != null && p >= PRICE_MIN && p <= PRICE_MAX ? 1 : 0;
    }
    YEARS = Object.keys(ys).map(Number).sort();
    var lat = CITIES.map(function () { return []; }), lon = CITIES.map(function () { return []; });
    for (i = 0; i < N; i++) { lat[json.city[i]].push(json.lat[i]); lon[json.city[i]].push(json.lon[i]); }
    CITY_POS = CITIES.map(function (c, k) { return [median(lat[k]), median(lon[k])]; });
  }

  function shortUni(u) {
    return u.replace('The University of North Carolina at Chapel Hill', 'UNC Chapel Hill')
      .replace('University of Illinois Urbana-Champaign', 'Illinois Urbana-Champaign')
      .replace('The Pennsylvania State University', 'Penn State')
      .replace('University of California, Davis', 'UC Davis')
      .replace('University of Wisconsin-Madison', 'Wisconsin–Madison')
      .replace('The University of Iowa', 'University of Iowa');
  }

  // ---------- State (synced to the page address) ----------
  var DEFAULTS = {
    loc: '', yr: '', beds: '', pmin: PRICE_MIN, pmax: PRICE_MAX, dmin: DIST_MIN, dmax: DIST_MAX,
    gar: 'any', bas: 'any', fire: 'any',
    ca: 'c:Champaign, IL', cb: 'c:Urbana, IL',
    sort: 'n', dir: 'desc',
    q7b: 3, q8min: 200000, q8max: 400000, q9c: 'Champaign, IL', q9y: 2025,
    q10u: 'University of Illinois Urbana-Champaign', q10b: 400000, q10m: 3
  };
  var S = {};

  function readURL() {
    var p = new URLSearchParams(location.search);
    Object.keys(DEFAULTS).forEach(function (k) {
      var d = DEFAULTS[k], v = p.get(k);
      if (v == null || v === '') { S[k] = d; return; }
      if (typeof d === 'number') { var x = parseFloat(v); S[k] = isFinite(x) ? x : d; }
      else S[k] = v;
    });
    // Validate
    if (S.loc && !locValid(S.loc)) S.loc = '';
    if (!locValid(S.ca)) S.ca = DEFAULTS.ca;
    if (!locValid(S.cb)) S.cb = DEFAULTS.cb;
    ['gar', 'bas', 'fire'].forEach(function (k) { if (['any', 'yes', 'no', 'unknown'].indexOf(S[k]) < 0) S[k] = 'any'; });
    if (S.yr && YEARS.indexOf(+S.yr) < 0) S.yr = '';
    if (CITIES.indexOf(S.q9c) < 0) S.q9c = DEFAULTS.q9c;
    if (UNIS.indexOf(S.q10u) < 0) S.q10u = DEFAULTS.q10u;
    if (YEARS.indexOf(S.q9y) < 0) S.q9y = DEFAULTS.q9y;
    S.dmin = clamp(S.dmin, DIST_MIN, DIST_MAX); S.dmax = clamp(S.dmax, DIST_MIN, DIST_MAX);
    if (S.dmin > S.dmax) { var t = S.dmin; S.dmin = S.dmax; S.dmax = t; }
  }
  var urlTimer = null;
  function writeURL() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(function () {
      var p = new URLSearchParams();
      Object.keys(DEFAULTS).forEach(function (k) { if (String(S[k]) !== String(DEFAULTS[k])) p.set(k, S[k]); });
      var q = p.toString();
      history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    }, 150);
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function locValid(l) {
    if (!l) return false;
    var t = l.slice(0, 2), name = l.slice(2);
    return (t === 'c:' && CITIES.indexOf(name) >= 0) || (t === 'u:' && UNIS.indexOf(name) >= 0);
  }
  function locLabel(l) {
    if (!l) return 'All campus areas and cities';
    return l.slice(0, 2) === 'u:' ? shortUni(l.slice(2)) + ' (campus area)' : l.slice(2);
  }
  function locMatcher(l) {
    if (!l) return null;
    var name = l.slice(2);
    if (l.slice(0, 2) === 'u:') { var u = UNIS.indexOf(name); return function (i) { return D.uni[i] === u; }; }
    var c = CITIES.indexOf(name); return function (i) { return D.city[i] === c; };
  }

  // Rows that pass every explore filter (optionally ignoring the location filter).
  function filteredRows(ignoreLoc) {
    var out = [];
    var lm = ignoreLoc ? null : locMatcher(S.loc);
    var yr = S.yr ? +S.yr : 0;
    var beds = S.beds;
    var bmin = beds === '6+' ? 6 : beds ? +beds : 0;
    var pmin = Math.max(PRICE_MIN, S.pmin), pmax = Math.min(PRICE_MAX, S.pmax);
    var dmin = S.dmin, dmax = S.dmax;
    var feats = [['gar', D.garage], ['bas', D.basement], ['fire', D.fireplace]].filter(function (f) { return S[f[0]] !== 'any'; });
    var distOn = dmin > DIST_MIN || dmax < DIST_MAX;
    for (var i = 0; i < N; i++) {
      if (!VALID[i]) continue;
      var p = D.price[i];
      if (p < pmin || p > pmax) continue;
      if (lm && !lm(i)) continue;
      if (yr && YEAR[i] !== yr) continue;
      if (beds) { var b = D.beds[i]; if (beds === '6+' ? b < 6 : b !== bmin) continue; }
      if (distOn) { var m = D.miles[i]; if (m < dmin - 1e-9 || m > dmax + 1e-9) continue; }
      var ok = true;
      for (var f = 0; f < feats.length; f++) {
        var v = feats[f][1][i], want = S[feats[f][0]];
        if (want === 'yes' ? v !== 1 : want === 'no' ? v !== 0 : v != null) { ok = false; break; }
      }
      if (ok) out.push(i);
    }
    return out;
  }

  function summarize(rows) {
    var prices = [], doms = [], ppsf = [], miles = [], sqft = [];
    for (var k = 0; k < rows.length; k++) {
      var i = rows[k];
      prices.push(D.price[i]);
      if (D.dom[i] != null) doms.push(D.dom[i]);
      if (D.sqft[i] > 0) { ppsf.push(D.price[i] / D.sqft[i]); sqft.push(D.sqft[i]); }
      miles.push(D.miles[i]);
    }
    return {
      n: rows.length, median: median(prices), mean: mean(prices), dom: median(doms), domN: doms.length,
      ppsf: median(ppsf), sqft: median(sqft), miles: median(miles)
    };
  }

  // ---------- Theme and charts ----------
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  var C = {};
  function readColors() {
    ['--ink', '--ink-2', '--muted', '--line', '--line-strong', '--quiet', '--quiet-2', '--accent', '--accent-ink', '--accent-soft', '--second', '--second-soft', '--surface', '--surface-2', '--bg'].forEach(function (k) {
      C[k.slice(2)] = cssVar(k);
    });
  }
  var FONT = 'Inter, system-ui, sans-serif';
  var charts = {};
  function chart(id) {
    var el = $(id);
    if (!charts[id]) {
      charts[id] = echarts.init(el, null, { renderer: 'svg' });
    }
    return charts[id];
  }
  function narrow() { return window.innerWidth < 600; }
  var CUR_W = 900; // width of the chart being drawn, so titles wrap instead of being cut off

  function baseOption(title, sub) {
    return {
      animationDuration: 500,
      textStyle: { fontFamily: FONT, color: C['ink-2'] },
      title: {
        text: title, subtext: sub || '', left: 0, top: 0,
        textStyle: { fontFamily: FONT, fontSize: 15, fontWeight: 650, color: C.ink, width: CUR_W, overflow: 'break' },
        subtextStyle: { fontFamily: FONT, fontSize: 12, color: C.muted, width: CUR_W, overflow: 'break', lineHeight: 16 }
      },
      tooltip: tooltipStyle(),
      grid: { left: 8, right: 24, top: titleHeight(title, sub), bottom: 40, containLabel: true }
    };
  }
  // Rough estimate of how tall the wrapped title and subtitle are.
  function titleHeight(title, sub) {
    var perLine15 = Math.max(10, Math.floor(CUR_W / 8.2)), perLine12 = Math.max(10, Math.floor(CUR_W / 6.4));
    var tl = Math.ceil(title.length / perLine15), sl = sub ? Math.ceil(sub.length / perLine12) : 0;
    return 14 + tl * 20 + sl * 16 + 18;
  }
  function tooltipStyle(extra) {
    var t = {
      trigger: 'item', confine: true,
      backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, padding: [8, 12],
      textStyle: { fontFamily: FONT, fontSize: 12.5, color: C.ink },
      extraCssText: 'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.14);'
    };
    if (extra) Object.keys(extra).forEach(function (k) { t[k] = extra[k]; });
    return t;
  }
  function axisName(name, gap) {
    return { name: name, nameLocation: 'middle', nameGap: gap || 30, nameTextStyle: { color: C.muted, fontSize: 12, fontWeight: 600 } };
  }
  function valueAxis(name, fmt, extra) {
    var a = {
      type: 'value', axisLabel: { color: C.muted, formatter: fmt, hideOverlap: true },
      splitLine: { lineStyle: { color: C.line } }, axisLine: { show: false }, axisTick: { show: false }
    };
    var an = axisName(name);
    Object.keys(an).forEach(function (k) { a[k] = an[k]; });
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    if (a.nameRotate) {
      // Vertical axis: put its title above the axis, written horizontally, so it never overlaps tick labels.
      delete a.nameRotate;
      a.nameLocation = 'end'; a.nameGap = 12;
      a.nameTextStyle = { color: C.muted, fontSize: 12, fontWeight: 600, align: a.position === 'right' ? 'right' : 'left', padding: a.position === 'right' ? [0, -6, 0, 0] : [0, 0, 0, -6] };
    }
    return a;
  }
  function catAxis(data, name, extra) {
    var a = {
      type: 'category', data: data, axisLabel: { color: C['ink-2'], fontSize: 12 },
      axisLine: { lineStyle: { color: C['line-strong'] } }, axisTick: { show: false }
    };
    if (name) { var an = axisName(name); Object.keys(an).forEach(function (k) { a[k] = an[k]; }); }
    if (extra) Object.keys(extra).forEach(function (k) { a[k] = extra[k]; });
    return a;
  }
  function tipRow(label, value, color) {
    return '<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:' + C.muted + '">' +
      (color ? '<i style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:' + color + '"></i>' : '') +
      label + '</span><b>' + value + '</b></div>';
  }
  function tipHead(t) { return '<div style="font-weight:700;margin-bottom:4px">' + esc(t) + '</div>'; }

  function showEmpty(id, title, msg) {
    var el = $(id);
    if (charts[id]) { charts[id].dispose(); delete charts[id]; }
    el.innerHTML = '<div class="empty" style="height:100%;display:grid;place-content:center"><strong>' + esc(title) + '</strong>' + esc(msg) + '</div>';
    el.dataset.empty = '1';
  }
  function clearEmpty(id) {
    var el = $(id);
    CUR_W = Math.max(200, (el.clientWidth || 900) - 8);
    if (el.dataset.empty) { el.innerHTML = ''; delete el.dataset.empty; }
  }

  // Horizontal bar chart used by several questions.
  function hbar(id, o) {
    clearEmpty(id);
    var ch = chart(id);
    var items = o.items.slice().reverse(); // largest at top
    var opt = baseOption(o.title, o.sub);
    opt.grid.right = narrow() ? 64 : 96;
    opt.grid.bottom = 44;
    opt.xAxis = valueAxis(o.xName, o.axisFmt, o.xExtra);
    if (narrow()) { opt.xAxis.splitNumber = 2; opt.xAxis.axisLabel.fontSize = 10.5; }
    opt.yAxis = catAxis(items.map(function (d) { return d.label; }), null, { axisLabel: { color: C['ink-2'], fontSize: narrow() ? 11 : 12 } });
    opt.tooltip = tooltipStyle({ formatter: function (p) { return o.tip(items[p.dataIndex]); } });
    opt.series = [{
      type: 'bar', barMaxWidth: 22, barCategoryGap: '30%',
      data: items.map(function (d) {
        return { value: d.value, itemStyle: { color: d.color || C.quiet, borderRadius: d.value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } };
      }),
      label: {
        show: true, position: 'right', color: C['ink-2'], fontSize: narrow() ? 10.5 : 11.5, fontWeight: 600,
        formatter: function (p) { return o.label(items[p.dataIndex]); }
      },
      emphasis: { focus: 'none', itemStyle: { opacity: .85 } }
    }];
    if (o.extend) o.extend(opt, items);
    ch.setOption(opt, true);
  }

  // ---------- Hero ----------
  function renderHero() {
    var valid = 0;
    for (var i = 0; i < N; i++) valid += VALID[i];
    var prices = [];
    for (i = 0; i < N; i++) if (VALID[i]) prices.push(D.price[i]);
    var dom = [];
    for (i = 0; i < N; i++) if (VALID[i] && D.dom[i] != null) dom.push(D.dom[i]);
    var first = null, last = null;
    for (i = 0; i < N; i++) { var s = D.sale_date[i]; if (!s) continue; if (!first || s < first) first = s; if (!last || s > last) last = s; }
    var fmtD = function (s) { var d = new Date(s + 'T00:00:00'); return MON[d.getMonth()] + ' ' + d.getFullYear(); };
    $('hero-stats').innerHTML = [
      ['Home sales', num(N)],
      ['Median sale price', money(median(prices))],
      ['Median days on market', days(median(dom))],
      ['Sale dates', fmtD(first) + ' – ' + fmtD(last)]
    ].map(function (s) { return '<div class="hero-stat"><span class="v">' + s[1] + '</span><span class="l">' + s[0] + '</span></div>'; }).join('');
  }

  // ---------- Explore: controls ----------
  function locOptions(includeAll) {
    var h = includeAll ? '<option value="">All campus areas and cities</option>' : '';
    h += '<optgroup label="Campus areas">' + UNIS.map(function (u) { return '<option value="u:' + esc(u) + '">' + esc(shortUni(u)) + '</option>'; }).join('') + '</optgroup>';
    h += '<optgroup label="Cities">' + CITIES.map(function (c) { return '<option value="c:' + esc(c) + '">' + esc(c) + '</option>'; }).join('') + '</optgroup>';
    return h;
  }

  function buildControls() {
    $('f-loc').innerHTML = locOptions(true);
    $('cmp-a').innerHTML = locOptions(false);
    $('cmp-b').innerHTML = locOptions(false);
    $('f-year').innerHTML = '<option value="">All years</option>' + YEARS.map(function (y) { return '<option>' + y + '</option>'; }).join('');
    $('f-beds').innerHTML = '<option value="">Any</option>' + [1, 2, 3, 4, 5].map(function (b) { return '<option value="' + b + '">' + b + '</option>'; }).join('') + '<option value="6+">6 or more</option>';

    document.querySelectorAll('.feature').forEach(function (f) {
      var key = f.dataset.feature;
      var seg = f.querySelector('.segmented');
      seg.innerHTML = [['any', 'Any'], ['yes', 'Yes'], ['no', 'No'], ['unknown', 'Unknown']].map(function (o) {
        return '<button type="button" role="radio" data-v="' + o[0] + '">' + o[1] + '</button>';
      }).join('');
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        S[key] = b.dataset.v; syncControls(); update();
      });
      seg.addEventListener('keydown', function (e) {
        if (['ArrowLeft', 'ArrowRight'].indexOf(e.key) < 0) return;
        var opts = ['any', 'yes', 'no', 'unknown'], k = opts.indexOf(S[key]);
        k = (k + (e.key === 'ArrowRight' ? 1 : 3)) % 4; S[key] = opts[k]; syncControls(); update();
        seg.querySelector('[data-v="' + opts[k] + '"]').focus(); e.preventDefault();
      });
    });

    $('f-loc').addEventListener('change', function () { S.loc = this.value; update(true); });
    $('f-year').addEventListener('change', function () { S.yr = this.value; update(); });
    $('f-beds').addEventListener('change', function () { S.beds = this.value; update(); });
    bindNumber('f-pmin', 'pmin', PRICE_MIN, PRICE_MAX, PRICE_MIN);
    bindNumber('f-pmax', 'pmax', PRICE_MIN, PRICE_MAX, PRICE_MAX);

    // Distance: slider and number inputs stay in sync.
    var rmin = $('f-dmin-r'), rmax = $('f-dmax-r');
    function fromSlider(which) {
      var a = parseFloat(rmin.value), b = parseFloat(rmax.value);
      if (a > b) { if (which === 'min') a = b; else b = a; }
      S.dmin = Math.round(a * 10) / 10; S.dmax = Math.round(b * 10) / 10;
      syncControls(); update();
    }
    rmin.addEventListener('input', function () { fromSlider('min'); });
    rmax.addEventListener('input', function () { fromSlider('max'); });
    function fromInput(which) {
      var el = $(which === 'min' ? 'f-dmin' : 'f-dmax');
      var v = parseFloat(el.value);
      if (!isFinite(v)) { el.classList.add('invalid'); return; }
      el.classList.remove('invalid');
      v = clamp(Math.round(v * 10) / 10, DIST_MIN, DIST_MAX);
      if (which === 'min') { S.dmin = Math.min(v, S.dmax); } else { S.dmax = Math.max(v, S.dmin); }
      syncSlider(); update();
    }
    $('f-dmin').addEventListener('input', function () { fromInput('min'); });
    $('f-dmax').addEventListener('input', function () { fromInput('max'); });
    $('f-dmin').addEventListener('change', function () { syncControls(); });
    $('f-dmax').addEventListener('change', function () { syncControls(); });

    $('reset-filters').addEventListener('click', function () {
      ['loc', 'yr', 'beds', 'pmin', 'pmax', 'dmin', 'dmax', 'gar', 'bas', 'fire'].forEach(function (k) { S[k] = DEFAULTS[k]; });
      syncControls(); update(true);
    });
    $('cmp-a').addEventListener('change', function () { S.ca = this.value; renderCompare(); writeURL(); });
    $('cmp-b').addEventListener('change', function () { S.cb = this.value; renderCompare(); writeURL(); });
    $('cmp-swap').addEventListener('click', function () { var t = S.ca; S.ca = S.cb; S.cb = t; syncControls(); renderCompare(); writeURL(); });
    $('map-reset').addEventListener('click', function () { S.loc = ''; syncControls(); update(true); });

    // Question controls
    var bedVals = [];
    for (var i = 0; i < N; i++) if (bedVals.indexOf(D.beds[i]) < 0 && D.beds[i] != null) bedVals.push(D.beds[i]);
    bedVals.sort(function (a, b) { return a - b; });
    $('q7-beds').innerHTML = bedVals.map(function (b) { return '<option value="' + b + '">' + b + (b === 1 ? ' bedroom' : ' bedrooms') + '</option>'; }).join('');
    $('q7-beds').addEventListener('change', function () { S.q7b = +this.value; renderQ7(); writeURL(); });
    bindQNumber('q8-min', 'q8min', renderQ8);
    bindQNumber('q8-max', 'q8max', renderQ8);
    $('q9-city').innerHTML = CITIES.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    $('q9-year').innerHTML = YEARS.map(function (y) { return '<option>' + y + '</option>'; }).join('');
    $('q9-city').addEventListener('change', function () { S.q9c = this.value; renderQ9(); writeURL(); });
    $('q9-year').addEventListener('change', function () { S.q9y = +this.value; renderQ9(); writeURL(); });
    $('q10-uni').innerHTML = UNIS.map(function (u) { return '<option value="' + esc(u) + '">' + esc(u) + '</option>'; }).join('');
    $('q10-uni').addEventListener('change', function () { S.q10u = this.value; renderQ10(); writeURL(); });
    bindQNumber('q10-budget', 'q10b', renderQ10);
    bindQNumber('q10-beds', 'q10m', renderQ10);

    // Share
    function share() {
      writeURL();
      setTimeout(function () {
        var url = location.href;
        var done = function () { toast('Link copied. It opens this exact view.'); };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link:', url); });
        else prompt('Copy this link:', url);
      }, 200);
    }
    $('share-btn').addEventListener('click', share);
    document.querySelectorAll('[data-action="share"]').forEach(function (b) { b.addEventListener('click', share); });
  }

  function bindNumber(id, key, lo, hi, dflt) {
    var el = $(id);
    el.addEventListener('input', function () {
      var v = parseFloat(el.value);
      if (el.value === '') v = dflt;
      if (!isFinite(v)) { el.classList.add('invalid'); return; }
      el.classList.remove('invalid');
      S[key] = v; update();
    });
    el.addEventListener('change', function () { if (el.value === '') { S[key] = dflt; syncControls(); } });
  }
  function bindQNumber(id, key, fn) {
    var el = $(id);
    el.addEventListener('input', function () {
      var v = parseFloat(el.value);
      if (!isFinite(v) || v < 0) { el.classList.add('invalid'); return; }
      el.classList.remove('invalid');
      S[key] = v; fn(); writeURL();
    });
  }

  function syncSlider() {
    $('f-dmin-r').value = S.dmin; $('f-dmax-r').value = S.dmax;
    var a = (S.dmin - DIST_MIN) / (DIST_MAX - DIST_MIN) * 100, b = (S.dmax - DIST_MIN) / (DIST_MAX - DIST_MIN) * 100;
    $('dist-fill').style.left = a + '%'; $('dist-fill').style.width = (b - a) + '%';
    // Keep the lower handle reachable when both meet at the right end.
    $('f-dmin-r').style.zIndex = S.dmin > DIST_MAX - 1 ? 3 : 1;
  }
  function setIfNotFocused(id, v) { var el = $(id); if (document.activeElement !== el) { el.value = v; el.classList.remove('invalid'); } }
  function syncControls() {
    $('f-loc').value = S.loc; $('f-year').value = S.yr; $('f-beds').value = S.beds;
    setIfNotFocused('f-pmin', S.pmin); setIfNotFocused('f-pmax', S.pmax);
    setIfNotFocused('f-dmin', S.dmin.toFixed(1)); setIfNotFocused('f-dmax', S.dmax.toFixed(1));
    syncSlider();
    document.querySelectorAll('.feature').forEach(function (f) {
      var key = f.dataset.feature;
      f.querySelectorAll('button').forEach(function (b) {
        var on = b.dataset.v === S[key];
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    });
    $('cmp-a').value = S.ca; $('cmp-b').value = S.cb;
    $('q7-beds').value = S.q7b;
    setIfNotFocused('q8-min', S.q8min); setIfNotFocused('q8-max', S.q8max);
    $('q9-city').value = S.q9c; $('q9-year').value = S.q9y;
    $('q10-uni').value = S.q10u;
    setIfNotFocused('q10-budget', S.q10b); setIfNotFocused('q10-beds', S.q10m);
  }

  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------- Explore: render ----------
  var rowsCache = [];
  function update(zoomMap) {
    rowsCache = filteredRows(false);
    renderChips();
    renderKPIs();
    renderMap(zoomMap);
    renderTrend();
    renderHist();
    renderCompare();
    renderTable();
    writeURL();
  }

  function renderChips() {
    var c = [];
    function chip(label, reset) { c.push('<span class="chip">' + esc(label) + '<button type="button" aria-label="Remove filter: ' + esc(label) + '" data-reset="' + reset + '"><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></button></span>'); }
    if (S.loc) chip(locLabel(S.loc), 'loc');
    if (S.yr) chip('Sold in ' + S.yr, 'yr');
    if (S.beds) chip(S.beds === '6+' ? '6+ bedrooms' : S.beds + (S.beds === '1' ? ' bedroom' : ' bedrooms'), 'beds');
    if (S.pmin > PRICE_MIN || S.pmax < PRICE_MAX) chip(moneyShort(Math.max(S.pmin, PRICE_MIN)) + ' – ' + moneyShort(Math.min(S.pmax, PRICE_MAX)), 'price');
    if (S.dmin > DIST_MIN || S.dmax < DIST_MAX) chip(dec1(S.dmin) + ' – ' + dec1(S.dmax) + ' mi from campus', 'dist');
    var names = { gar: 'Garage', bas: 'Basement', fire: 'Fireplace' }, vals = { yes: 'yes', no: 'no', unknown: 'unknown' };
    ['gar', 'bas', 'fire'].forEach(function (k) { if (S[k] !== 'any') chip(names[k] + ': ' + vals[S[k]], k); });
    var el = $('active-filters');
    el.innerHTML = c.length ? c.join('') : '<span class="chip-note">No filters applied: showing every sale from $10,000 to $5,000,000.</span>';
    el.querySelectorAll('[data-reset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = b.dataset.reset;
        if (r === 'price') { S.pmin = PRICE_MIN; S.pmax = PRICE_MAX; }
        else if (r === 'dist') { S.dmin = DIST_MIN; S.dmax = DIST_MAX; }
        else S[r] = DEFAULTS[r];
        syncControls(); update(r === 'loc');
      });
    });
  }

  function renderKPIs() {
    var el = $('kpis');
    if (!rowsCache.length) {
      el.innerHTML = '<div class="empty" style="grid-column:1/-1"><strong>No sales match these filters.</strong>Try widening the price or distance range, or set a home feature back to “Any”.</div>';
      return;
    }
    var s = summarize(rowsCache);
    el.innerHTML = [
      ['Median price', money(s.median), 'Mean ' + money(s.mean), true],
      ['Sales', num(s.n), 'of ' + num(N) + ' in the dataset'],
      ['Days on market', days(s.dom), 'Median, ' + num(s.domN) + ' sales with dates'],
      ['Price per sq ft', s.ppsf == null ? '–' : money(s.ppsf), 'Median, living area above 0'],
      ['To campus', s.miles == null ? '–' : s.miles.toFixed(1) + ' mi', 'Median straight-line distance']
    ].map(function (k) {
      return '<div class="kpi' + (k[3] ? ' lead' : '') + '"><span class="l">' + k[0] + '</span><span class="v">' + k[1] + '</span><span class="s">' + k[2] + '</span></div>';
    }).join('');
  }

  // Map
  var map = null, tiles = null, markers = [];
  var ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
  var labels = null;
  function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
  function tileURL() { return ESRI + (isDark() ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base') + '/MapServer/tile/{z}/{y}/{x}'; }
  function labelURL() { return ESRI + (isDark() ? 'World_Dark_Gray_Reference' : 'World_Light_Gray_Reference') + '/MapServer/tile/{z}/{y}/{x}'; }
  function initMap() {
    map = L.map('map', { scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true });
    tiles = L.tileLayer(tileURL(), {
      maxZoom: 16, attribution: 'Base map &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
    }).addTo(map);
    map.createPane('labels');
    map.getPane('labels').style.zIndex = 350;
    map.getPane('labels').style.pointerEvents = 'none';
    labels = L.tileLayer(labelURL(), { maxZoom: 16, pane: 'labels' }).addTo(map);
    map.fitBounds(L.latLngBounds(CITY_POS), { padding: [30, 30] });
    map.on('focus', function () { map.scrollWheelZoom.enable(); });
    map.on('blur', function () { map.scrollWheelZoom.disable(); });
  }
  function renderMap(zoom) {
    if (!map) return;
    readColors();
    var rowsNoLoc = filteredRows(true);
    var byCity = CITIES.map(function () { return []; });
    rowsNoLoc.forEach(function (i) { byCity[D.city[i]].push(D.price[i]); });
    var maxN = Math.max.apply(null, byCity.map(function (a) { return a.length; }).concat([1]));
    markers.forEach(function (m) { m.remove(); });
    markers = [];
    var lm = locMatcher(S.loc);
    var selCities = CITIES.map(function (c, k) {
      if (!S.loc) return false;
      return S.loc.slice(0, 2) === 'u:' ? UNIS[CITY_UNI[k]] === S.loc.slice(2) : c === S.loc.slice(2);
    });
    var order = CITIES.map(function (c, k) { return k; }).sort(function (a, b) { return byCity[b].length - byCity[a].length; });
    order.forEach(function (k) {
      var n = byCity[k].length;
      var sel = selCities[k];
      var r = n ? 6 + 20 * Math.sqrt(n / maxN) : 5;
      var m = L.circleMarker(CITY_POS[k], {
        radius: r, weight: sel ? 2.5 : 1.5,
        color: sel ? C['accent-ink'] : C.surface,
        fillColor: sel ? C.accent : (S.loc ? C.quiet : C.second),
        fillOpacity: n ? (sel || !S.loc ? .82 : .55) : .2,
        keyboard: true
      }).addTo(map);
      m.bindTooltip('<b>' + esc(CITIES[k]) + '</b>' + shortUni(UNIS[CITY_UNI[k]]) + '<br><span>' + num(n) + ' sales · median ' + money(median(byCity[k])) + '</span>', { className: 'cm-tip', direction: 'top', offset: [0, -r] });
      m.on('click', function () {
        var v = 'c:' + CITIES[k];
        S.loc = S.loc === v ? '' : v;
        syncControls(); update(true);
      });
      if (sel) m.bringToFront();
      markers.push(m);
    });
    if (zoom) {
      var pts = CITY_POS.filter(function (p, k) { return selCities[k]; });
      if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(pts.length === 1 ? 0 : .6), { maxZoom: 10, duration: .6, padding: [40, 40] });
      else map.flyToBounds(L.latLngBounds(CITY_POS), { padding: [30, 30], duration: .6 });
    }
  }

  function renderTrend() {
    var id = 'ch-explore-trend';
    if (!rowsCache.length) return showEmpty(id, 'No sales match', 'Change the filters to see the monthly trend.');
    clearEmpty(id);
    var buckets = {};
    rowsCache.forEach(function (i) { if (!YEAR[i]) return; var k = YEAR[i] + '-' + (MONTH[i] < 10 ? '0' : '') + MONTH[i]; (buckets[k] = buckets[k] || []).push(D.price[i]); });
    var keys = Object.keys(buckets).sort();
    // fill gaps
    if (keys.length) {
      var all = [], y = +keys[0].slice(0, 4), mo = +keys[0].slice(5), ly = +keys[keys.length - 1].slice(0, 4), lmo = +keys[keys.length - 1].slice(5);
      while (y < ly || (y === ly && mo <= lmo)) { all.push(y + '-' + (mo < 10 ? '0' : '') + mo); mo++; if (mo > 12) { mo = 1; y++; } }
      keys = all;
    }
    var labels = keys.map(function (k) { return MON[+k.slice(5) - 1] + ' ' + k.slice(0, 4); });
    var counts = keys.map(function (k) { return buckets[k] ? buckets[k].length : 0; });
    var meds = keys.map(function (k) { return buckets[k] ? Math.round(median(buckets[k])) : null; });
    var opt = baseOption('Sales and median price by month', 'Bars: number of sales (left axis). Line: median sale price (right axis).');
    opt.grid.right = 16; opt.grid.bottom = 36;
    opt.tooltip = tooltipStyle({ trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: C['line-strong'] } },
      formatter: function (ps) { var k = ps[0].dataIndex; return tipHead(labels[k]) + tipRow('Sales', num(counts[k]), C.quiet) + tipRow('Median price', money(meds[k]), C.accent); } });
    opt.xAxis = catAxis(labels, 'Month of sale', { axisLabel: { color: C.muted, hideOverlap: true, fontSize: 11 }, nameGap: 28 });
    opt.yAxis = [
      valueAxis('Sales', function (v) { return num(v); }, { nameRotate: 90, nameGap: 40, splitNumber: 4 }),
      valueAxis('Median price', function (v) { return moneyShort(v); }, { nameRotate: 90, position: 'right', splitLine: { show: false }, scale: true, splitNumber: 4 })
    ];
    opt.grid.top += 24;
    opt.series = [
      { type: 'bar', data: counts, itemStyle: { color: C['quiet-2'], borderRadius: [3, 3, 0, 0] }, barCategoryGap: '25%' },
      { type: 'line', yAxisIndex: 1, data: meds, smooth: .25, symbol: 'circle', symbolSize: 5, connectNulls: true, lineStyle: { color: C.accent, width: 2.5 }, itemStyle: { color: C.accent } }
    ];
    chart(id).setOption(opt, true);
  }

  function renderHist() {
    var id = 'ch-explore-hist';
    if (!rowsCache.length) return showEmpty(id, 'No sales match', 'Change the filters to see the price distribution.');
    clearEmpty(id);
    var prices = rowsCache.map(function (i) { return D.price[i]; });
    var med = median(prices);
    var top = median(prices.slice().sort(function (a, b) { return a - b; }).slice(Math.floor(prices.length * .98))) ; // for range
    var p98 = prices.slice().sort(function (a, b) { return a - b; })[Math.min(prices.length - 1, Math.floor(prices.length * .98))];
    var lo = Math.min.apply(null, prices);
    var step = niceStep((p98 - lo) / 24 || 10000);
    var start = Math.floor(lo / step) * step;
    var nb = Math.max(1, Math.ceil((p98 - start) / step));
    var bins = new Array(nb + 1).fill(0);
    prices.forEach(function (p) { var b = Math.floor((p - start) / step); bins[Math.min(nb, Math.max(0, b))]++; });
    var labels = bins.map(function (c, k) { return k === nb ? moneyShort(start + k * step) + '+' : moneyShort(start + k * step) + '–' + moneyShort(start + (k + 1) * step); });
    var medBin = Math.min(nb, Math.floor((med - start) / step));
    var opt = baseOption('Distribution of sale prices', 'Median ' + money(med) + ' (highlighted bin). The last bar collects the top 2% of sales.');
    opt.grid.right = 16; opt.grid.bottom = 36;
    opt.tooltip = tooltipStyle({ formatter: function (p) { return tipHead(labels[p.dataIndex]) + tipRow('Sales', num(bins[p.dataIndex])); } });
    opt.xAxis = catAxis(labels, 'Sale price', { axisLabel: { color: C.muted, fontSize: 11, hideOverlap: true, formatter: function (v) { return v.split('–')[0]; } }, nameGap: 28 });
    opt.yAxis = valueAxis('Number of sales', function (v) { return num(v); }, { nameRotate: 90, nameGap: 44, splitNumber: 4 }); opt.grid.top += 24;
    opt.series = [{ type: 'bar', barCategoryGap: '6%', data: bins.map(function (c, k) { return { value: c, itemStyle: { color: k === medBin ? C.accent : C.quiet, borderRadius: [2, 2, 0, 0] } }; }) }];
    chart(id).setOption(opt, true);
  }
  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  function renderCompare() {
    var rows = filteredRows(true);
    var A = locMatcher(S.ca), B = locMatcher(S.cb);
    var ra = rows.filter(A), rb = rows.filter(B);
    var sa = summarize(ra), sb = summarize(rb);
    var metrics = [
      ['Median sale price', 'median', money],
      ['Number of sales', 'n', num],
      ['Mean sale price', 'mean', money],
      ['Median days on market', 'dom', days],
      ['Median price per sq ft', 'ppsf', money],
      ['Median living area', 'sqft', function (v) { return v == null ? '–' : num(v) + ' sq ft'; }],
      ['Median distance to campus', 'miles', function (v) { return v == null ? '–' : v.toFixed(1) + ' mi'; }]
    ];
    var h = '<div class="cmp-row head"><span class="cmp-metric">Metric</span><span><span class="swatch swatch-a"></span>' + esc(locLabel(S.ca)) + '</span><span><span class="swatch swatch-b"></span>' + esc(locLabel(S.cb)) + '</span></div>';
    metrics.forEach(function (m) {
      var a = sa[m[1]], b = sb[m[1]], mx = Math.max(a || 0, b || 0) || 1;
      var cell = function (cls, v, other) {
        var win = v != null && other != null && v !== other && v > other;
        return '<div class="cmp-cell ' + cls + '"><span class="cmp-val' + (win ? ' win' : '') + '">' + m[2](v) + '</span><span class="cmp-bar"><i style="width:' + ((v || 0) / mx * 100).toFixed(1) + '%"></i></span></div>';
      };
      h += '<div class="cmp-row"><span class="cmp-metric">' + m[0] + '</span>' + cell('cmp-a', a, b) + cell('cmp-b', b, a) + '</div>';
    });
    if (!ra.length || !rb.length) {
      h += '<p class="hint" style="margin-top:10px">' + esc(!ra.length && !rb.length ? 'Neither selection has' : (!ra.length ? locLabel(S.ca) : locLabel(S.cb)) + ' has') + ' any sales under the current filters.</p>';
    }
    $('compare-out').innerHTML = h;
  }

  // Sortable city table
  var COLS = [
    { k: 'city', t: 'City', text: true },
    { k: 'uni', t: 'Campus area', text: true },
    { k: 'n', t: 'Sales', f: num },
    { k: 'median', t: 'Median price', f: money },
    { k: 'mean', t: 'Mean price', f: money },
    { k: 'dom', t: 'Median days on market', f: function (v) { return v == null ? '–' : dec1(v); } },
    { k: 'ppsf', t: 'Median $ / sq ft', f: money },
    { k: 'miles', t: 'Median miles to campus', f: function (v) { return v == null ? '–' : v.toFixed(1); } }
  ];
  var SORT_ICON = {
    none: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M5 6l3-3 3 3M5 10l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    asc: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    desc: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 3v10M4 9l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function renderTable() {
    var table = $('city-table');
    var thead = '<tr>' + COLS.map(function (c) {
      var state = S.sort === c.k ? (S.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      var icon = state === 'none' ? SORT_ICON.none : state === 'ascending' ? SORT_ICON.asc : SORT_ICON.desc;
      return '<th scope="col" class="' + (c.text ? 'text' : '') + '" aria-sort="' + state + '"><button type="button" class="sort-btn" data-k="' + c.k + '">' + (c.text ? '' : icon) + '<span>' + c.t + '</span>' + (c.text ? icon : '') + '</button></th>';
    }).join('') + '</tr>';
    table.tHead.innerHTML = thead;
    var by = CITIES.map(function () { return []; });
    rowsCache.forEach(function (i) { by[D.city[i]].push(i); });
    var rows = CITIES.map(function (c, k) {
      var s = summarize(by[k]);
      s.city = c; s.uni = shortUni(UNIS[CITY_UNI[k]]); s.k = k; return s;
    }).filter(function (r) { return r.n > 0; });
    var col = S.sort, dir = S.dir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var x = a[col], y = b[col];
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      if (typeof x === 'string') return x.localeCompare(y) * dir;
      return (x - y) * dir || a.city.localeCompare(b.city);
    });
    var tb = table.tBodies[0];
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="' + COLS.length + '" style="text-align:center;padding:24px;color:var(--muted)">No sales match these filters.</td></tr>'; }
    else tb.innerHTML = rows.map(function (r) {
      var sel = S.loc === 'c:' + r.city || (S.loc && S.loc.slice(0, 2) === 'u:' && UNIS[CITY_UNI[r.k]] === S.loc.slice(2));
      return '<tr' + (sel ? ' class="sel"' : '') + '>' + COLS.map(function (c) {
        return '<td class="' + (c.text ? 'text' : '') + '">' + (c.text ? esc(r[c.k]) : c.f(r[c.k])) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    table.tHead.querySelectorAll('.sort-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.k;
        if (S.sort === k) S.dir = S.dir === 'asc' ? 'desc' : 'asc';
        else { S.sort = k; S.dir = (k === 'city' || k === 'uni') ? 'asc' : 'desc'; }
        renderTable(); writeURL();
        var nb = table.tHead.querySelector('[data-k="' + k + '"]'); if (nb) nb.focus();
      });
    });
  }

  // ---------- Q1 to Q6: full dataset ----------
  function groupBy(rows, keyArr, valFn) {
    var g = {};
    rows.forEach(function (i) { var k = keyArr[i]; (g[k] = g[k] || []).push(valFn ? valFn(i) : D.price[i]); });
    return g;
  }
  function allValid() { var r = []; for (var i = 0; i < N; i++) if (VALID[i]) r.push(i); return r; }
  function allRows() { var r = []; for (var i = 0; i < N; i++) r.push(i); return r; }
  function setAnswer(q, html) { var el = document.querySelector('[data-answer="' + q + '"]'); if (el) el.innerHTML = html; }

  var Q = {}; // computed results, also used by the insights section

  function renderQ1() {
    var g = groupBy(allValid(), D.city);
    var items = CITIES.map(function (c, k) { return { label: c, value: Math.round(median(g[k]) * 100) / 100, n: g[k].length }; })
      .sort(function (a, b) { return b.value - a.value; });
    var top = tiedExtreme(items, 'value', true, 1);
    items.forEach(function (d) { d.color = top.indexOf(d) >= 0 ? C.accent : C.quiet; });
    Q.q1 = items;
    setAnswer('q1', '<strong class="hl">' + listJoin(top.map(function (d) { return d.label; })) + '</strong> ' + (top.length > 1 ? 'have' : 'has') +
      ' the highest median sale price, <strong>' + money(top[0].value) + '</strong>' + ' (' + num(top[0].n) + ' sales). ' +
      'Next are ' + items[1].label + ' at ' + money(items[1].value) + ' and ' + items[2].label + ' at ' + money(items[2].value) +
      '. Urbana, IL is the least expensive at ' + money(items[items.length - 1].value) + '. Valid prices only ($10,000 to $5,000,000).');
    if (items[items.length - 1].label !== 'Urbana, IL') {
      setAnswer('q1', document.querySelector('[data-answer="q1"]').innerHTML.replace('Urbana, IL is the least expensive', items[items.length - 1].label + ' is the least expensive'));
    }
    hbar('ch-q1', {
      title: 'Median sale price by city', sub: 'Sales from $10,000 to $5,000,000 · highest in orange',
      items: items, xName: 'Median sale price', axisFmt: moneyShort,
      label: function (d) { return money(d.value); },
      tip: function (d) { return tipHead(d.label) + tipRow('Median sale price', money(d.value)) + tipRow('Sales', num(d.n)); }
    });
  }

  function renderQ2() {
    var g = groupBy(allRows(), D.city);
    var items = CITIES.map(function (c, k) {
      var me = mean(g[k]), md = median(g[k]);
      return { label: c, mean: me, median: md, gap: (me - md) / md * 100, n: g[k].length, max: Math.max.apply(null, g[k]), k: k };
    }).sort(function (a, b) { return b.gap - a.gap; });
    var top = tiedExtreme(items, 'gap', true, 10);
    Q.q2 = items;
    var t = top[0];
    // What drives the gap: the single largest sale in that city.
    var prices = g[t.k].slice().sort(function (a, b) { return b - a; });
    var meanWithoutTop = mean(prices.slice(1));
    var gapWithoutTop = (meanWithoutTop - median(prices.slice(1))) / median(prices.slice(1)) * 100;
    setAnswer('q2', '<strong class="hl">' + listJoin(top.map(function (d) { return d.label; })) + '</strong>: its mean of <strong>' + money(t.mean) + '</strong> is <strong>' + pct(t.gap) +
      '</strong> above its median of <strong>' + money(t.median) + '</strong> (all ' + num(t.n) + ' rows, no price rule). ' +
      'The cause is one extreme sale: ' + t.label.split(',')[0] + ' has a single recorded sale of <strong>' + money(prices[0]) + '</strong>, more than 8 times the next-highest (' + money(prices[1]) + '). ' +
      'That one row adds about ' + money(t.mean - meanWithoutTop) + ' to the mean; without it the gap falls to ' + pct(gapWithoutTop) + '. ' +
      'Second is ' + items[1].label + ' at ' + pct(items[1].gap) + '.');
    if (prices[0] < 8 * prices[1]) setAnswer('q2', document.querySelector('[data-answer="q2"]').innerHTML.replace('more than 8 times the next-highest', 'far above the next-highest'));
    var id = 'ch-q2';
    clearEmpty(id);
    var rev = items.slice().reverse();
    var opt = baseOption('Mean vs median sale price by city, all rows', 'Each row runs from the median dot to the mean dot · label = (mean − median) ÷ median · largest gap in orange');
    opt.grid.right = narrow() ? 58 : 80; opt.grid.bottom = 44;
    var t0 = opt.grid.top - 18;
    opt.legend = { top: t0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: C.muted, fontSize: 12 }, data: ['Median', 'Mean'] };
    opt.grid.top = t0 + 30;
    opt.xAxis = valueAxis('Sale price (all rows)', moneyShort, { min: function (v) { return Math.floor(v.min / 100000) * 100000; } });
    opt.yAxis = catAxis(rev.map(function (d) { return d.label; }), null, { axisLabel: { color: C['ink-2'], fontSize: narrow() ? 11 : 12 } });
    opt.tooltip = tooltipStyle({ formatter: function (p) { var d = rev[p.dataIndex]; return tipHead(d.label) + tipRow('Mean', money(d.mean), isTop(d) ? C.accent : C.second) + tipRow('Median', money(d.median), C.ink) + tipRow('Gap', pct(d.gap)) + tipRow('Sales (all rows)', num(d.n)); } });
    var isTop = function (d) { return top.indexOf(d) >= 0; };
    opt.series = [
      { type: 'custom', name: 'gap', silent: true, renderItem: function (params, api) {
          var a = api.coord([api.value(0), params.dataIndex]), b = api.coord([api.value(1), params.dataIndex]);
          return { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: isTop(rev[params.dataIndex]) ? C.accent : C['quiet'], lineWidth: 3, opacity: .55 } };
        }, data: rev.map(function (d) { return [d.median, d.mean]; }), encode: { x: [0, 1] }, z: 1 },
      { type: 'scatter', name: 'Median', symbolSize: 11, data: rev.map(function (d) { return d.median; }), itemStyle: { color: C.ink, borderColor: C.surface, borderWidth: 1.5 }, z: 3 },
      { type: 'scatter', name: 'Mean', symbolSize: 11, z: 4,
        data: rev.map(function (d) { return { value: d.mean, itemStyle: { color: isTop(d) ? C.accent : C.second, borderColor: C.surface, borderWidth: 1.5 } }; }),
        itemStyle: { color: C.second },
        label: { show: true, position: 'right', distance: 8, fontSize: narrow() ? 10.5 : 11.5, fontWeight: 600, color: C['ink-2'],
          formatter: function (p) { return '+' + rev[p.dataIndex].gap.toFixed(1) + '%'; } } }
    ];
    chart(id).setOption(opt, true);
  }

  function rankDesc(items, key) {
    // Rank 1 = highest; ties share the lowest rank number ("min" method).
    items.forEach(function (d) { d[key + 'Rank'] = 1 + items.filter(function (o) { return o[key] > d[key]; }).length; });
  }
  function renderQ3() {
    var ga = groupBy(allRows(), D.city), gv = groupBy(allValid(), D.city);
    var items = CITIES.map(function (c, k) { return { label: c, all: mean(ga[k]), valid: mean(gv[k]), nAll: ga[k].length, nValid: gv[k].length }; });
    rankDesc(items, 'all'); rankDesc(items, 'valid');
    items.forEach(function (d) { d.change = d.allRank - d.validRank; });
    items.sort(function (a, b) { return a.validRank - b.validRank; });
    Q.q3 = items;
    var moved = items.filter(function (d) { return d.change !== 0; }).sort(function (a, b) { return Math.abs(b.change) - Math.abs(a.change); });
    var desc = moved.map(function (d) {
      return '<strong class="' + (d.change > 0 ? 'hl2' : 'hl') + '">' + d.label + '</strong> ' + (d.change > 0 ? 'rises' : 'falls') + ' ' + Math.abs(d.change) + ' position' + (Math.abs(d.change) > 1 ? 's' : '') + ' (#' + d.allRank + ' → #' + d.validRank + ')';
    });
    setAnswer('q3', moved.length ? (num(moved.length) + ' cities change rank: ' + listJoin(desc) + '. ' +
      'Athens drops because the price rule removes its $81.5 million sale, cutting its mean from ' + money(items.filter(function (d) { return d.label === 'Athens, GA'; })[0].all) + ' to ' + money(items.filter(function (d) { return d.label === 'Athens, GA'; })[0].valid) + '. All other cities keep their rank.')
      : 'No city changes rank.');
    var id = 'ch-q3';
    clearEmpty(id);
    var n = items.length, nar = narrow();
    var opt = baseOption('City rank by mean sale price: all rows vs valid prices', 'Rank by mean sale price, 1 = highest · orange falls, teal rises, gray unchanged');
    opt.grid = { left: nar ? 124 : 196, right: nar ? 118 : 190, top: opt.grid.top + 18, bottom: 30 };
    opt.xAxis = { type: 'category', data: nar ? ['All rows', 'Valid prices'] : ['Rank, all rows', 'Rank, valid prices'], position: 'top', boundaryGap: false, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { interval: 0, color: C.ink, fontWeight: 700, fontSize: nar ? 11.5 : 12.5, margin: 14 } };
    opt.yAxis = { type: 'value', inverse: true, min: 1, max: n, show: false };
    opt.tooltip = tooltipStyle({ formatter: function (p) { var d = items[p.seriesIndex]; return tipHead(d.label) + tipRow('All rows', '#' + d.allRank + ' · ' + money(d.all)) + tipRow('Valid prices', '#' + d.validRank + ' · ' + money(d.valid)) + tipRow('Change', d.change === 0 ? 'none' : (d.change > 0 ? '+' : '−') + Math.abs(d.change)); } });
    opt.series = items.map(function (d) {
      var col = d.change < 0 ? C.accent : d.change > 0 ? C.second : C.quiet;
      var hi = d.change !== 0;
      var lab = function (side) {
        return { show: true, position: side, distance: 8, fontSize: nar ? 10.5 : 11.5, fontWeight: hi ? 700 : 500, color: hi ? col : C['ink-2'],
          formatter: function () { var short = nar ? d.label.replace(/, ..$/, '') : d.label; return side === 'left' ? short + '  #' + d.allRank : '#' + d.validRank + '  ' + short; } };
      };
      return {
        type: 'line', name: d.label, data: [{ value: d.allRank, label: lab('left') }, { value: d.validRank, label: lab('right') }],
        symbol: 'circle', symbolSize: hi ? 9 : 6, lineStyle: { color: col, width: hi ? 3 : 1.5, opacity: hi ? 1 : .7 }, itemStyle: { color: col },
        z: hi ? 5 : 2, emphasis: { focus: 'series' }
      };
    });
    chart(id).setOption(opt, true);
  }

  function renderQ4() {
    var g24 = {}, g25 = {};
    allValid().forEach(function (i) {
      if (YEAR[i] === 2024) (g24[D.uni[i]] = g24[D.uni[i]] || []).push(D.price[i]);
      else if (YEAR[i] === 2025) (g25[D.uni[i]] = g25[D.uni[i]] || []).push(D.price[i]);
    });
    var items = UNIS.map(function (u, k) {
      var a = median(g24[k] || []), b = median(g25[k] || []);
      return { label: shortUni(u), full: u, m24: a, m25: b, n24: (g24[k] || []).length, n25: (g25[k] || []).length, value: (b - a) / a * 100 };
    }).sort(function (a, b) { return b.value - a.value; });
    var top = tiedExtreme(items, 'value', true, 10);
    var dec = items.filter(function (d) { return d.value < 0; });
    items.forEach(function (d) { d.color = top.indexOf(d) >= 0 ? C.accent : d.value < 0 ? C.second : C.quiet; });
    Q.q4 = items;
    setAnswer('q4', '<strong class="hl">' + listJoin(top.map(function (d) { return d.full; })) + '</strong> had the largest increase, <strong>' + spct(top[0].value) + '</strong> (median ' + money(top[0].m24) + ' in 2024 to ' + money(top[0].m25) + ' in 2025). ' +
      (dec.length ? 'Median prices fell in <strong class="hl2">' + listJoin(dec.map(function (d) { return d.full + ' (' + pct(d.value) + ', ' + money(d.m24) + ' to ' + money(d.m25) + ')'; })) + '</strong>. ' : 'No campus area had a decrease. ') +
      'Every other campus area rose by between ' + pct(items.filter(function (d) { return d.value >= 0; }).slice(-1)[0].value) + ' and ' + pct(items[top.length].value) + '. Valid prices only; year from sale date.');
    var id = 'ch-q4';
    clearEmpty(id);
    var rev = items.slice().reverse();
    var opt = baseOption('Change in median sale price, 2024 to 2025', 'By campus area · largest increase in orange, decreases in teal');
    opt.grid.right = narrow() ? 52 : 64; opt.grid.bottom = 44;
    var lo = Math.min(0, Math.min.apply(null, items.map(function (d) { return d.value; })));
    var hi = Math.max(0, Math.max.apply(null, items.map(function (d) { return d.value; })));
    opt.xAxis = valueAxis('Percent change in median sale price', function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%'; },
      { min: Math.floor(lo / 2) * 2 - (lo < 0 ? 2 : 0), max: Math.ceil(hi / 2) * 2, interval: 2 });
    opt.yAxis = catAxis(rev.map(function (d) { return d.label; }), null, { axisLabel: { color: C['ink-2'], fontSize: narrow() ? 11 : 12 }, axisLine: { show: false } });
    opt.tooltip = tooltipStyle({ formatter: function (p) { var d = rev[p.dataIndex]; return tipHead(d.full) + tipRow('2024 median', money(d.m24)) + tipRow('2025 median', money(d.m25)) + tipRow('Change', spct(d.value)) + tipRow('Sales 2024 / 2025', num(d.n24) + ' / ' + num(d.n25)); } });
    opt.series = [{
      type: 'bar', barMaxWidth: 22, barCategoryGap: '30%',
      data: rev.map(function (d) {
        return { value: Math.round(d.value * 100) / 100, itemStyle: { color: d.color, borderRadius: d.value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] },
          label: { position: d.value < 0 ? 'left' : 'right' } };
      }),
      label: { show: true, color: C['ink-2'], fontSize: narrow() ? 10.5 : 11.5, fontWeight: 600, formatter: function (p) { return spct(rev[p.dataIndex].value); } },
      markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: C.muted, type: 'solid', width: 1 }, data: [{ xAxis: 0 }] }
    }];
    chart(id).setOption(opt, true);
  }

  function renderQ5() {
    var g = {};
    allValid().forEach(function (i) { if (D.dom[i] != null) (g[D.uni[i]] = g[D.uni[i]] || []).push(D.dom[i]); });
    var items = UNIS.map(function (u, k) { return { label: shortUni(u), full: u, value: median(g[k] || []), n: (g[k] || []).length }; })
      .sort(function (a, b) { return b.value - a.value || a.label.localeCompare(b.label); });
    var slow = tiedExtreme(items, 'value', true, 10), fast = tiedExtreme(items, 'value', false, 10);
    items.forEach(function (d) { d.color = slow.indexOf(d) >= 0 ? C.accent : fast.indexOf(d) >= 0 ? C.second : C.quiet; });
    Q.q5 = items;
    setAnswer('q5', 'Slowest: <strong class="hl">' + listJoin(slow.map(function (d) { return d.full; })) + '</strong>, with a median of <strong>' + days(slow[0].value) + '</strong> from listing to contract. ' +
      'Fastest: ' + (fast.length > 1 ? 'a ' + (fast.length === 2 ? 'two' : fast.length === 3 ? 'three' : fast.length === 4 ? 'four' : num(fast.length)) + '-way tie between ' : '') +
      '<strong class="hl2">' + listJoin(fast.map(function (d) { return d.full; })) + '</strong>, at <strong>' + days(fast[0].value) + '</strong>. ' +
      'Days on market is contract date minus list date, using only the ' + num(items.reduce(function (t, d) { return t + d.n; }, 0)) + ' valid-price sales that have both dates.');
    hbar('ch-q5', {
      title: 'Median days on market by campus area', sub: 'List date to contract date · slowest in orange, fastest in teal',
      items: items, xName: 'Median days on market', axisFmt: function (v) { return v; },
      label: function (d) { return dec1(d.value) + ' days'; },
      tip: function (d) { return tipHead(d.full) + tipRow('Median days on market', dec1(d.value)) + tipRow('Sales with both dates', num(d.n)); },
      extend: function (opt) {
        // Lollipop: thin stem + dot.
        opt.series[0].barMaxWidth = 3;
        opt.series[0].label.distance = 14;
        opt.series.push({ type: 'scatter', symbolSize: 14, silent: true, z: 3,
          data: opt.series[0].data.map(function (d) { return { value: d.value, itemStyle: { color: d.itemStyle.color, borderColor: C.surface, borderWidth: 2 } }; }) });
      }
    });
  }

  function renderQ6() {
    var tax = {}, price = {}, n = {};
    allValid().forEach(function (i) {
      var t = D.tax[i], p = D.price[i];
      if (t == null || !(t > 0) || !(t < 0.1 * p)) return;
      var u = D.uni[i];
      tax[u] = (tax[u] || 0) + t; price[u] = (price[u] || 0) + p; n[u] = (n[u] || 0) + 1;
    });
    var items = UNIS.map(function (u, k) { return { label: shortUni(u), full: u, value: tax[k] / price[k] * 100, tax: tax[k], price: price[k], n: n[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
    var hi = tiedExtreme(items, 'value', true, 100), lo = tiedExtreme(items, 'value', false, 100);
    items.forEach(function (d) { d.color = hi.indexOf(d) >= 0 ? C.accent : lo.indexOf(d) >= 0 ? C.second : C.quiet; });
    Q.q6 = items;
    setAnswer('q6', 'Highest tax burden: <strong class="hl">' + listJoin(hi.map(function (d) { return d.full; })) + '</strong>, where annual property tax adds up to <strong>' + pct(hi[0].value, 2) + '</strong> of total sale price (' + money(hi[0].tax) + ' of tax on ' + money(hi[0].price) + ' of sales). ' +
      'Lowest: <strong class="hl2">' + listJoin(lo.map(function (d) { return d.full; })) + '</strong> at <strong>' + pct(lo[0].value, 2) + '</strong>, about a third of the Illinois rate. ' +
      'Uses valid-price sales whose tax amount is above $0 and below 10% of the sale price (' + num(items.reduce(function (t, d) { return t + d.n; }, 0)) + ' rows).');
    if (hi[0].full.indexOf('Illinois') < 0) setAnswer('q6', document.querySelector('[data-answer="q6"]').innerHTML.replace(', about a third of the Illinois rate', ''));
    hbar('ch-q6', {
      title: 'Total annual property tax as a percent of total sale price', sub: 'By campus area · highest in orange, lowest in teal',
      items: items, xName: 'Tax as % of sale price', axisFmt: function (v) { return v.toFixed(1) + '%'; },
      label: function (d) { return pct(d.value, 2); },
      tip: function (d) { return tipHead(d.full) + tipRow('Tax ÷ sale price', pct(d.value, 2)) + tipRow('Total annual tax', money(d.tax)) + tipRow('Total sale price', money(d.price)) + tipRow('Sales used', num(d.n)); }
    });
  }

  // ---------- Q7 to Q10: interactive ----------
  function renderQ7() {
    var b = +S.q7b;
    var g = {};
    allValid().forEach(function (i) { if (D.beds[i] === b) (g[D.city[i]] = g[D.city[i]] || []).push(D.price[i]); });
    var items = CITIES.map(function (c, k) { return { label: c, value: g[k] ? median(g[k]) : null, n: g[k] ? g[k].length : 0 }; });
    var withSales = items.filter(function (d) { return d.n > 0; }).sort(function (a, b) { return a.value - b.value; });
    var none = items.filter(function (d) { return d.n === 0; });
    if (!withSales.length) {
      setAnswer('q7', 'No valid-price sales have exactly ' + b + ' bedroom' + (b === 1 ? '' : 's') + '. Pick another number.');
      return showEmpty('ch-q7', 'No sales match', 'No city has a valid-price sale with exactly ' + b + ' bedrooms.');
    }
    var low = tiedExtreme(withSales, 'value', false, 1);
    withSales.forEach(function (d) { d.color = low.indexOf(d) >= 0 ? C.accent : C.quiet; });
    var total = withSales.reduce(function (t, d) { return t + d.n; }, 0);
    setAnswer('q7', 'For homes with exactly <strong>' + b + ' bedroom' + (b === 1 ? '' : 's') + '</strong>, the lowest median sale price is in <strong class="hl">' + listJoin(low.map(function (d) { return d.label; })) + '</strong>: <strong>' + money(low[0].value) + '</strong>' +
      (low.length === 1 ? ' (' + num(low[0].n) + ' sale' + (low[0].n === 1 ? '' : 's') + ')' : '') + '. ' +
      (withSales.length > 1 ? 'The highest is ' + withSales[withSales.length - 1].label + ' at ' + money(withSales[withSales.length - 1].value) + '. ' : '') +
      num(total) + ' valid-price sales across ' + withSales.length + ' cit' + (withSales.length === 1 ? 'y' : 'ies') + '.' +
      (none.length ? ' No sales at this size in ' + listJoin(none.map(function (d) { return d.label; })) + '.' : '') +
      (withSales.some(function (d) { return d.n < 10; }) ? ' Medians based on fewer than 10 sales are less reliable.' : ''));
    hbar('ch-q7', {
      title: 'Median sale price by city, ' + b + '-bedroom homes', sub: narrow() ? 'Lowest in orange · label: median price · number of sales' : 'Lowest in orange · label shows median and number of sales',
      items: withSales.slice().sort(function (a, b) { return b.value - a.value || a.label.localeCompare(b.label); }), xName: 'Median sale price', axisFmt: moneyShort,
      label: function (d) { return narrow() ? moneyShort(d.value) + ' · ' + num(d.n) : money(d.value) + '  ·  ' + num(d.n) + (d.n === 1 ? ' sale' : ' sales'); },
      tip: function (d) { return tipHead(d.label) + tipRow('Median sale price', money(d.value)) + tipRow('Sales', num(d.n)); },
      extend: function (opt) { opt.grid.right = narrow() ? 86 : 170; }
    });
  }

  function renderQ8() {
    var lo = Math.max(PRICE_MIN, +S.q8min), hi = Math.min(PRICE_MAX, +S.q8max);
    var g = {};
    if (lo <= hi) allValid().forEach(function (i) { var p = D.price[i]; if (p >= lo && p <= hi && D.dom[i] != null) (g[D.city[i]] = g[D.city[i]] || []).push(D.dom[i]); });
    var items = CITIES.map(function (c, k) { return { label: c, value: g[k] ? median(g[k]) : null, n: g[k] ? g[k].length : 0 }; });
    var withSales = items.filter(function (d) { return d.n > 0; }).sort(function (a, b) { return b.value - a.value || a.label.localeCompare(b.label); });
    var none = items.filter(function (d) { return d.n === 0; });
    var rangeTxt = money(lo) + ' to ' + money(hi);
    var scopeNote = (+S.q8min < PRICE_MIN || +S.q8max > PRICE_MAX) ? ' (your range is limited to the $10,000 to $5,000,000 scope)' : '';
    if (lo > hi) { setAnswer('q8', 'The minimum price is above the maximum. Adjust the range.'); return showEmpty('ch-q8', 'Check the range', 'The minimum price is above the maximum.'); }
    if (!withSales.length) { setAnswer('q8', 'No sales between ' + rangeTxt + scopeNote + ' have both a list date and a contract date.'); return showEmpty('ch-q8', 'No sales match', 'Widen the price range.'); }
    var fast = tiedExtreme(withSales, 'value', false, 10);
    withSales.forEach(function (d) { d.color = fast.indexOf(d) >= 0 ? C.accent : C.quiet; });
    var total = withSales.reduce(function (t, d) { return t + d.n; }, 0);
    setAnswer('q8', 'For sales from <strong>' + rangeTxt + '</strong>' + scopeNote + ', the shortest median days on market ' + (fast.length > 1 ? 'is a ' + fast.length + '-way tie between' : 'is in') + ' <strong class="hl">' + listJoin(fast.map(function (d) { return d.label + (fast.length > 1 ? ' (' + num(d.n) + ' sales)' : ''); })) + '</strong>: <strong>' + days(fast[0].value) + '</strong>' +
      (fast.length === 1 ? ', based on ' + num(fast[0].n) + ' sale' + (fast[0].n === 1 ? '' : 's') : '') + '. ' +
      'Slowest: ' + withSales[0].label + ' at ' + days(withSales[0].value) + '. ' + num(total) + ' sales with both a list and contract date are used.' +
      (none.length ? ' No usable sales in ' + listJoin(none.map(function (d) { return d.label; })) + '.' : ''));
    hbar('ch-q8', {
      title: 'Median days on market by city, ' + moneyShort(lo) + ' to ' + moneyShort(hi), sub: narrow() ? 'Shortest in orange · label: median days (d) · sales used' : 'Shortest in orange · label shows median days and number of sales used',
      items: withSales, xName: 'Median days on market', axisFmt: function (v) { return v; },
      label: function (d) { return narrow() ? dec1(d.value) + ' d · ' + num(d.n) : dec1(d.value) + ' days  ·  ' + num(d.n) + (d.n === 1 ? ' sale' : ' sales'); },
      tip: function (d) { return tipHead(d.label) + tipRow('Median days on market', dec1(d.value)) + tipRow('Sales used', num(d.n)); },
      extend: function (opt) { opt.grid.right = narrow() ? 78 : 160; }
    });
  }

  function renderQ9() {
    var c = CITIES.indexOf(S.q9c), y = +S.q9y;
    var counts = new Array(12).fill(0);
    for (var i = 0; i < N; i++) if (D.city[i] === c && YEAR[i] === y) counts[MONTH[i] - 1]++;
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    var id = 'ch-q9';
    if (!total) { setAnswer('q9', 'No sales recorded in ' + esc(S.q9c) + ' in ' + y + '.'); return showEmpty(id, 'No sales match', 'No sales were recorded for this city and year.'); }
    var mx = Math.max.apply(null, counts);
    var best = counts.map(function (v, k) { return v === mx ? MONTHS[k] : null; }).filter(Boolean);
    var lastMonth = 0; counts.forEach(function (v, k) { if (v) lastMonth = k; });
    setAnswer('q9', 'In <strong>' + esc(S.q9c) + '</strong> in <strong>' + y + '</strong>, ' + num(total) + ' sales were recorded. The busiest month ' + (best.length > 1 ? 'is a tie between' : 'was') + ' <strong class="hl">' + listJoin(best) + '</strong>, with <strong>' + num(mx) + '</strong> sales. ' +
      'Monthly counts: ' + counts.map(function (v, k) { return MON[k] + ' ' + v; }).join(', ') + '.' +
      (y === YEARS[YEARS.length - 1] ? ' The data was collected in March ' + y + ', so later months are incomplete or empty.' : '') + ' All rows with a sale date are counted (no price rule).');
    clearEmpty(id);
    var opt = baseOption('Sales per month, ' + S.q9c + ', ' + y, 'Busiest month in orange');
    opt.grid.bottom = 40; opt.grid.right = 12;
    opt.xAxis = catAxis(MON, 'Month of sale', { nameGap: 30 });
    opt.yAxis = valueAxis('Number of sales', function (v) { return num(v); }, { nameRotate: 90, nameGap: 40, minInterval: 1 }); opt.grid.top += 24;
    opt.tooltip = tooltipStyle({ formatter: function (p) { return tipHead(MONTHS[p.dataIndex] + ' ' + y) + tipRow('Sales', num(counts[p.dataIndex])); } });
    opt.series = [{ type: 'bar', barCategoryGap: '28%', data: counts.map(function (v) { return { value: v, itemStyle: { color: v === mx ? C.accent : C.quiet, borderRadius: [4, 4, 0, 0] } }; }),
      label: { show: true, position: 'top', color: C['ink-2'], fontWeight: 600, fontSize: 11.5 } }];
    chart(id).setOption(opt, true);
  }

  function renderQ10() {
    var u = UNIS.indexOf(S.q10u), budget = Math.min(PRICE_MAX, +S.q10b), mb = +S.q10m;
    var miles = [];
    allValid().forEach(function (i) { if (D.uni[i] === u && D.price[i] <= budget && D.beds[i] >= mb) miles.push(D.miles[i]); });
    var id = 'ch-q10';
    var scopeNote = +S.q10b > PRICE_MAX ? ' (budgets above $5,000,000 are capped at the scope limit)' : '';
    if (!miles.length) {
      setAnswer('q10', 'No valid-price sales in <strong>' + esc(S.q10u) + '</strong> cost ' + money(budget) + ' or less with at least ' + mb + ' bedroom' + (mb === 1 ? '' : 's') + scopeNote + '. Try a higher budget or fewer bedrooms.');
      return showEmpty(id, 'No sales match', 'Try a higher budget or fewer bedrooms.');
    }
    var med = median(miles);
    setAnswer('q10', 'In the <strong>' + esc(S.q10u) + '</strong> campus area, <strong>' + num(miles.length) + '</strong> sale' + (miles.length === 1 ? '' : 's') + ' cost ' + money(budget) + ' or less' + scopeNote + ' and had at least ' + mb + ' bedroom' + (mb === 1 ? '' : 's') + '. ' +
      'Their median distance to campus is <strong class="hl">' + med.toFixed(1) + ' miles</strong> (straight line to the campus landmark).');
    clearEmpty(id);
    var step = 0.5, nb = Math.ceil((Math.max.apply(null, miles) + 1e-9) / step) || 1;
    var bins = new Array(nb).fill(0);
    miles.forEach(function (m) { bins[Math.min(nb - 1, Math.floor(m / step))]++; });
    var labels = bins.map(function (c, k) { return (k * step).toFixed(1) + '–' + ((k + 1) * step).toFixed(1); });
    var medBin = Math.min(nb - 1, Math.floor(med / step));
    var opt = baseOption('Distance to campus of matching sales', 'Half-mile bins · the bin holding the median (' + med.toFixed(1) + ' mi) in orange');
    opt.grid.bottom = 40; opt.grid.right = 12;
    opt.xAxis = catAxis(labels, 'Miles to campus', { axisLabel: { color: C.muted, fontSize: 11, hideOverlap: true, formatter: function (v) { return v.split('–')[0]; } }, nameGap: 28 });
    opt.yAxis = valueAxis('Number of sales', function (v) { return num(v); }, { nameRotate: 90, nameGap: 40, minInterval: 1 }); opt.grid.top += 24;
    opt.tooltip = tooltipStyle({ formatter: function (p) { return tipHead(labels[p.dataIndex] + ' miles') + tipRow('Sales', num(bins[p.dataIndex])); } });
    opt.series = [{ type: 'bar', barCategoryGap: '4%', data: bins.map(function (v, k) { return { value: v, itemStyle: { color: k === medBin ? C.accent : C.quiet, borderRadius: [2, 2, 0, 0] } }; }) }];
    chart(id).setOption(opt, true);
  }

  // ---------- Insights P1 ----------
  function renderP1() {
    var items = Q.q3;
    var lowN = 0, highN = 0, zeroN = 0, maxP = 0;
    for (var i = 0; i < N; i++) { var p = D.price[i]; if (p < PRICE_MIN) lowN++; if (p > PRICE_MAX) highN++; if (p === 0) zeroN++; if (p > maxP) maxP = p; }
    var allP = [], vP = [];
    for (i = 0; i < N; i++) { allP.push(D.price[i]); if (VALID[i]) vP.push(D.price[i]); }
    var mAll = mean(allP), mV = mean(vP), mdAll = median(allP), mdV = median(vP);
    var byChange = items.slice().sort(function (a, b) { return Math.abs(b.all - b.valid) - Math.abs(a.all - a.valid); });
    var ath = items.filter(function (d) { return d.label === 'Athens, GA'; })[0];
    var cha = items.filter(function (d) { return d.label === 'Charlottesville, VA'; })[0];
    var moved = items.filter(function (d) { return d.change !== 0; });
    document.querySelector('[data-answer="p1"]').innerHTML =
      '<p><strong>The problem.</strong> The data description sheet warns that some prices are impossible. In this dataset ' + num(lowN) + ' sales are under $10,000 (' + num(zeroN) + ' at exactly $0) and ' + num(highN) + ' are over $5,000,000, up to ' + money(maxP) + '. A $0 sale is a recording artifact, and an $81.5 million “home” in Athens, Georgia is not a typical college-town sale.</p>' +
      '<p><strong>How I handled it.</strong> I applied one scope rule everywhere: only sales from $10,000 to $5,000,000, inclusive. That removes ' + num(lowN + highN) + ' rows (' + pct((lowN + highN) / N * 100) + ' of the data). The rule is stated in Data &amp; methods and applied in code, never by editing the dataset. Q2 and Q3 deliberately use all rows to show what the rule changes.</p>' +
      '<p><strong>What it changed.</strong> Medians barely move: the overall median is ' + money(mdAll) + ' with every row and ' + money(mdV) + ' under the rule. Means move a lot. The overall mean drops from ' + money(mAll) + ' to ' + money(mV) + ' (' + pct((mV - mAll) / mAll * 100) + '). ' +
      'Athens falls from ' + money(ath.all) + ' to ' + money(ath.valid) + ' (' + pct((ath.valid - ath.all) / ath.all * 100) + '), and Charlottesville, with ' + 15 + ' sales over $5 million, from ' + money(cha.all) + ' to ' + money(cha.valid) + '. ' +
      'That is enough to reorder the ranking: ' + listJoin(moved.map(function (d) { return d.label + ' (#' + d.allRank + ' → #' + d.validRank + ')'; })) + '. ' +
      'Without a rule, any “average price” comparison of these towns would be driven by a handful of rows. This is also why the site uses medians unless a question asks for a mean.</p>';
    // Check the hard-coded "15" against the data.
    var chaIdx = CITIES.indexOf('Charlottesville, VA'), chaHigh = 0;
    for (i = 0; i < N; i++) if (D.city[i] === chaIdx && D.price[i] > PRICE_MAX) chaHigh++;
    var pEl = document.querySelector('[data-answer="p1"]');
    pEl.innerHTML = pEl.innerHTML.replace('with 15 sales over', 'with ' + chaHigh + ' sales over');

    // Chart: mean before/after for the six most affected cities.
    var top = byChange.slice(0, 6);
    var id = 'ch-p1';
    clearEmpty(id);
    var opt = baseOption('Mean sale price before and after the price rule', 'Six cities whose mean changes most');
    var t1 = opt.grid.top - 18;
    opt.legend = { top: t1, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: C.muted, fontSize: 12 } };
    opt.grid.top = t1 + 30; opt.grid.right = 16; opt.grid.bottom = 44;
    var cats = top.map(function (d) { return d.label.replace(/, ..$/, ''); });
    opt.xAxis = catAxis(cats, 'City', { axisLabel: { color: C['ink-2'], fontSize: 11, interval: 0, hideOverlap: false, rotate: narrow() ? 30 : 0 }, nameGap: narrow() ? 52 : 30 });
    if (narrow()) opt.grid.bottom = 64;
    opt.yAxis = valueAxis('Mean sale price', moneyShort, { nameRotate: 90, nameGap: 48, splitNumber: 4 }); opt.grid.top += 24;
    opt.tooltip = tooltipStyle({ trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: C['quiet-2'], opacity: .4 } }, formatter: function (ps) { var d = top[ps[0].dataIndex]; return tipHead(d.label) + tipRow('All rows', money(d.all), C.quiet) + tipRow('Valid prices', money(d.valid), C.accent) + tipRow('Change', pct((d.valid - d.all) / d.all * 100)); } });
    opt.series = [
      { name: 'All rows', type: 'bar', data: top.map(function (d) { return Math.round(d.all); }), itemStyle: { color: C.quiet, borderRadius: [3, 3, 0, 0] }, barGap: '10%' },
      { name: 'Valid prices ($10K–$5M)', type: 'bar', data: top.map(function (d) { return Math.round(d.valid); }), itemStyle: { color: C.accent, borderRadius: [3, 3, 0, 0] } }
    ];
    clearEmpty(id);
    chart(id).setOption(opt, true);

    var t = $('p1-table');
    t.tHead.innerHTML = '<tr><th class="static">City</th><th class="static">Mean, all rows</th><th class="static">Mean, valid prices</th><th class="static">Rank change</th></tr>';
    var tableRows = byChange.slice(0, 6); moved.forEach(function (d) { if (tableRows.indexOf(d) < 0) tableRows.push(d); });
    tableRows.sort(function (a, b) { return a.allRank - b.allRank; });
    t.tBodies[0].innerHTML = tableRows.map(function (d) {
      var rk = d.change === 0 ? '#' + d.validRank : '<span class="' + (d.change > 0 ? 'up' : 'down') + '">#' + d.allRank + ' → #' + d.validRank + '</span>';
      return '<tr><td>' + esc(d.label) + '</td><td>' + money(d.all) + '</td><td>' + money(d.valid) + '</td><td>' + rk + '</td></tr>';
    }).join('');
  }

  // ---------- Render all ----------
  function renderQuestions() {
    readColors();
    renderQ1(); renderQ2(); renderQ3(); renderQ4(); renderQ5(); renderQ6();
    renderQ7(); renderQ8(); renderQ9(); renderQ10();
    renderP1();
  }
  function renderAll() {
    readColors();
    renderQuestions();
    update(false);
  }

  // Theme
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('cm-theme', t); } catch (e) {}
    var b = $('theme-btn');
    b.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
    b.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    if (tiles) { tiles.setUrl(tileURL()); labels.setUrl(labelURL()); }
    if (D) renderAll();
  }

  // Resize
  var lastNarrow = null, rT = null;
  window.addEventListener('resize', function () {
    Object.keys(charts).forEach(function (k) { charts[k].resize(); });
    clearTimeout(rT);
    rT = setTimeout(function () {
      var n = narrow();
      if (n !== lastNarrow) { lastNarrow = n; if (D) renderAll(); }
    }, 200);
  });

  // Highlight the current section in the top nav
  function navSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.topnav a'));
    var secs = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (e.isIntersecting) {
          var k = secs.indexOf(e.target);
          links.forEach(function (l, j) { l.classList.toggle('active', j === k); });
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    secs.forEach(function (s) { if (s) io.observe(s); });
  }

  // ---------- Boot ----------
  function boot() {
    var t = document.documentElement.getAttribute('data-theme');
    $('theme-btn').setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
    $('theme-btn').setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    $('theme-btn').addEventListener('click', function () {
      setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
    navSpy();
    fetch('data/site_data.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (json) {
        prepare(json);
        readURL();
        buildControls();
        syncControls();
        renderHero();
        initMap();
        lastNarrow = narrow();
        renderAll();
        $('loading').classList.add('done');
        window.__CM = { D: D, S: S, Q: Q, filteredRows: filteredRows, median: median, CITIES: CITIES, UNIS: UNIS };
      })
      .catch(function (err) {
        var l = $('loading');
        l.classList.add('error');
        l.querySelector('.loading-title').textContent = 'The data could not be loaded.';
        l.querySelector('.loading-sub').textContent = 'Please refresh the page. (' + err.message + ')';
        console.error(err);
      });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
