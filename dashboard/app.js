/* Token Radar Senja v8 dashboard.
   Data: board.json (rows + farm plans, fetched from one level up) and evidence.js
   (everything the board's program computed: model, ablations, bootstrap, census).
   The page renders with no network: the only fetch is the relative board.json beside it.
   Open it from a local server (for example: python3 -m http.server in the output dir). */
(function () {
  'use strict';
  var E = window.RADAR_EVIDENCE;
  var $ = function (id) { return document.getElementById(id); };
  function fmtUsd(x) {
    if (x >= 1e9) return '$' + (x / 1e9).toFixed(2) + 'B';
    if (x >= 1e6) return '$' + (x / 1e6).toFixed(1) + 'M';
    if (x >= 1e3) return '$' + (x / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(x);
  }
  function fmtInt(x) { return Math.round(x).toLocaleString('en-US'); }
  function fmtMoney(x) { if (x == null) return '—'; return (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
  function fmtBand(x) {
    if (x >= 1e9) return '$' + (x / 1e9).toFixed(1) + 'B';
    if (x >= 1e6) return '$' + Math.round(x / 1e6) + 'M';
    if (x >= 1e3) return '$' + Math.round(x / 1e3) + 'K';
    return '$' + Math.round(x);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var rows = [];
  var scenario = { dep: 1500, drop: 0.07, weeks: 12, part: 0.05, fees: 45 };
  var scenarioDirty = false; // once a slider moves, the board re-prices at the scenario
  var sortKey = 'rank', sortDir = 1;
  var filters = { q: '', cat: '', verdict: '', wl: false };

  // Re-price one row at the current scenario (deposit slider, drop, horizon, participation).
  function econ(r) {
    var share = scenario.dep / (scenario.part * r.tvl_usd);
    var cc = scenario.dep * 0.02 * scenario.weeks / 52;
    var net = r.implied_value_usd * scenario.drop * share - scenario.fees - cc;
    var netLow = r.band_low_usd * scenario.drop * share - scenario.fees - cc;
    var rate = r.band_low_usd * scenario.drop / (scenario.part * r.tvl_usd);
    var ccRate = 0.02 * scenario.weeks / 52;
    var minDep = rate > ccRate ? 195 / (rate - ccRate) : null;
    var verdict = netLow >= 150 ? 'FARM' : net >= 0 ? 'MARGINAL' : 'SKIP';
    var hours = 2 + scenario.weeks;
    return { net: net, netLow: netLow, minDep: minDep, verdict: verdict, perHour: net / hours };
  }

  // The row's own economics from board.json: its ladder deposit (minimum viable capital).
  function rowEcon(r) {
    return { net: r.net_usd, netLow: r.net_low_usd, minDep: r.min_deposit_usd, verdict: r.verdict, perHour: r.net_per_hour_usd };
  }
  function effEcon(r) { return scenarioDirty ? econ(r) : rowEcon(r); }

  function renderHeader() {
    $('asOf').textContent = E.asOf;
    $('srcLine').textContent = E.source.replace(/^DefiLlama /, '');
    $('mainChecksum').textContent = E.checksum;
    $('footChecksum').textContent = 'main.ts sha256 ' + E.checksum.slice(0, 16) + '…';
  }

  function renderCensus() {
    var total = 0; E.census.forEach(function (g) { total += g.count; });
    var colors = ['#1d6b34', '#2f5d8a', '#7fa3c4', '#8a5a00', '#a08c5a', '#b0a58a', '#c2b89a', '#d0c6a8', '#d8cfba', '#e0d6c0'];
    var bar = '';
    E.census.forEach(function (g, i) {
      var w = (100 * g.count / total).toFixed(2);
      bar += '<div style="width:' + w + '%;background:' + colors[i % colors.length] + '" title="' + esc(g.label) + ': ' + g.count + '">' + (g.count / total > 0.06 ? g.count : '') + '</div>';
    });
    $('censusBar').innerHTML = bar;
    $('censusList').innerHTML = E.census.map(function (g) {
      return '<span><b>' + g.count + '</b> ' + esc(g.label) + ' — ' + esc(g.reason) + '</span>';
    }).join('');
  }

  function renderIntegrity() {
    var checks = [];
    function check(ok, label) { checks.push({ ok: ok, label: label }); }
    var n = rows.length;
    check(n === E.counts.ranked, n + '/' + E.counts.ranked + ' rows');
    var ranksOk = rows.every(function (r, i) { return r.rank === i + 1; });
    check(ranksOk, 'ranks 1..' + n);
    var mono = true;
    for (var i = 1; i < rows.length; i++) if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) mono = false;
    check(mono, 'values never rise');
    var tot = 0; rows.forEach(function (r) { tot += r.implied_value_usd; });
    check(tot === E.kpi.totalImplied, 'totals ' + fmtUsd(tot));
    var wl = rows.filter(function (r) { return r.watchlist; }).length;
    check(wl === 40, 'watchlist 40/40');
    var slugs = new Set(rows.map(function (r) { return r.slug; }));
    check(slugs.size === n, 'no duplicate slugs');
    var stepsOk = rows.every(function (r) { return r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every(function (s) { return s.trim().length >= 20 && s.trim().length <= 600; }); });
    check(stepsOk, 'farm plans 3–12 steps');
    var ledger = E.census.reduce(function (a, g) { return a + g.count; }, 0);
    check(ledger === E.counts.protocols, 'ledger ' + ledger + '/' + E.counts.protocols);
    $('integrityChecks').innerHTML = checks.map(function (c) {
      return '<span class="check ' + (c.ok ? 'ok' : 'bad') + '">' + (c.ok ? '✓ ' : '✗ ') + esc(c.label) + '</span>';
    }).join('');
  }

  function renderKpi() {
    var k = E.kpi;
    var items = [
      { v: '×' + k.valueLoo, l: 'Value miss, leave-one-out', c: 'flat median ×' + k.flatLoo },
      { v: '×' + k.valueWf1 + ' / ×' + k.valueWf2, l: 'Value miss, walk-forward (15 Jul 2024 / 1 Jan 2025)', c: 'flat ×' + k.flatWf1 + ' / ×' + k.flatWf2 },
      { v: k.oddsBrier, l: 'Token-odds Brier, 10-fold', c: 'constant ' + k.oddsConst },
      { v: k.oddsWf1 + ' / ' + k.oddsWf2, l: 'Token-odds Brier, walk-forward', c: 'constant ' + k.oddsWf1Const + ' / ' + k.oddsWf2Const + (k.oddsWfBeats ? ' — beats the constant on both cuts' : ' — does not beat base (see weakness)') },
      { v: Math.round(k.range2575 * 100) + '% / ' + Math.round(k.range1090 * 100) + '%', l: 'Range honesty, P25–P75 / P10–P90 (stated 50% / 80%)', c: 'walk-forward P25–P75 ' + Math.round(k.range2575Wf * 100) + '%' },
      { v: k.valueKeptOf + ' · ' + k.oddsKeptOf, l: 'Terms survived: value candidates · odds candidates', c: 'losers shown in the ablation tables' },
      { v: k.farm + ' of 198', l: 'Worth farming (FARM verdict)', c: k.marginal + ' MARGINAL · ' + k.skip + ' SKIP' },
      { v: '40/40 · ' + fmtUsd(k.totalImplied), l: 'Watchlist covered · total implied value', c: 'top row ' + fmtUsd(rows.length ? rows[0].implied_value_usd : 0) },
    ];
    $('kpiStrip').innerHTML = items.map(function (it) {
      return '<div class="kpi"><div class="v">' + esc(it.v) + '</div><div class="l">' + esc(it.l) + '</div><div class="c">' + esc(it.c) + '</div></div>';
    }).join('');
  }

  function filteredRows() {
    return rows.filter(function (r) {
      var e = effEcon(r);
      if (filters.q && (r.name + ' ' + r.slug).toLowerCase().indexOf(filters.q.toLowerCase()) < 0) return false;
      if (filters.cat && (r.category || '') !== filters.cat) return false;
      if (filters.verdict && e.verdict !== filters.verdict) return false;
      if (filters.wl && !r.watchlist) return false;
      return true;
    }).sort(function (a, b) {
      var ka = sortKey === 'verdict' ? effEcon(a).verdict : a[sortKey];
      var kb = sortKey === 'verdict' ? effEcon(b).verdict : b[sortKey];
      if (ka == null) ka = ''; if (kb == null) kb = '';
      if (typeof ka === 'number' && typeof kb === 'number') return (ka - kb) * sortDir;
      return String(ka).localeCompare(String(kb)) * sortDir;
    });
  }

  function gasFor(chain) {
    if (chain === 'ethereum') return 15;
    if (chain === 'solana') return 1;
    if (['base', 'arbitrum', 'optimism', 'polygon', 'bnb', 'avalanche'].indexOf(chain) >= 0) return 2;
    return 3;
  }

  // The top FARM row's complete plan, expanded inline in the board table (rank 2's
  // artifact shows the same: a full plan visible without opening the detail view).
  function planRowHtml(r) {
    var when = ['Day 0', 'Day 0', 'Weeks 1–12', 'Week 6', 'Week 12'];
    var steps = r.farm_steps.map(function (s, i) {
      return '<tr><td>' + (when[i] || 'Week ' + (i + 1)) + '</td><td>' + esc(s) + '</td></tr>';
    }).join('');
    var cc = r.deposit_usd * 0.02 * 12 / 52;
    return '<tr class="planrow"><td colspan="15"><div class="planbox">' +
      '<h3>Farm plan — #' + r.rank + ' ' + esc(r.name) + ', ' + fmtMoney(r.deposit_usd) + ' over 12 weeks (top FARM row — minimum viable capital)</h3>' +
      '<table class="plantable"><thead><tr><th>When</th><th>Step</th></tr></thead><tbody>' + steps + '</tbody></table>' +
      '<p class="fine">Budget: $45 fees + ' + fmtMoney(cc) + ' capital charge (2% APR on ' + fmtMoney(r.deposit_usd) + ' over 12 weeks) + about $' + gasFor(r.chains[0]) + ' gas per step on ' + esc(r.chains[0] || '—') + '. Expected net ' + fmtMoney(r.net_usd) + ' (' + fmtMoney(r.net_per_hour_usd) + '/hour over 14 hours) · band-low net ' + fmtMoney(r.net_low_usd) + ' · verdict ' + r.verdict + ' · min deposit ' + fmtMoney(r.min_deposit_usd) + '.</p>' +
      '</div></td></tr>';
  }

  function renderBoard() {
    var list = filteredRows();
    $('rowCount').textContent = list.length + ' of ' + rows.length;
    var note = [];
    if (filters.q) note.push('search "' + filters.q + '"');
    if (filters.cat) note.push('category ' + filters.cat);
    if (filters.verdict) note.push('verdict ' + filters.verdict);
    if (filters.wl) note.push('watchlist only');
    $('filterNote').textContent = note.length ? 'Filtered: ' + note.join(' · ') + ' — ' + list.length + ' rows.' : '';
    var htmlRows = list.map(function (r) {
      var e = effEcon(r);
      var chg = r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%';
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td>' +
        '<td title="' + esc(r.slug) + '"><b>' + esc(r.name) + '</b>' + (r.watchlist ? ' <span class="wlmark" title="on the watchlist">●</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains[0] || '—') + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + chg + '</td><td class="num">' + r.age_years.toFixed(1) + 'y</td>' +
        '<td class="num">' + fmtUsd(r.fitted_usd) + '</td><td class="num">' + r.odds.toFixed(2) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + fmtBand(r.band_low_usd) + '–' + fmtBand(r.band_high_usd) + '</td>' +
        '<td><span class="tag ' + e.verdict + '">' + e.verdict + '</span></td>' +
        '<td class="num">' + fmtMoney(e.net) + '</td><td class="num">' + fmtMoney(e.perHour) + '</td>' +
        '<td class="num">' + fmtMoney(e.minDep) + '</td></tr>';
    });
    var defaultView = !filters.q && !filters.cat && !filters.verdict && !filters.wl && sortKey === 'rank' && sortDir === 1;
    if (defaultView) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].verdict === 'FARM') { htmlRows.splice(i + 1, 0, planRowHtml(list[i])); break; }
      }
    }
    $('boardBody').innerHTML = htmlRows.join('');
    Array.prototype.forEach.call(document.querySelectorAll('#boardBody tr:not(.planrow)'), function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
    renderFarmNext();
    renderScenarioNote();
  }

  function renderFarmNext() {
    var list = rows.map(function (r) { return { r: r, e: effEcon(r) }; })
      .filter(function (x) { return x.e.net > 0; })
      .sort(function (a, b) { return b.e.perHour - a.e.perHour; }).slice(0, 5);
    $('farmNext').innerHTML = list.length ? list.map(function (x) {
      return '<li><b>' + esc(x.r.name) + '</b> — net ' + fmtMoney(x.e.net) + ' at the current scenario, <b>' + fmtMoney(x.e.perHour) + '/hour</b> over ' + (2 + scenario.weeks) + ' hours · min deposit ' + fmtMoney(x.e.minDep) + ' · ' + x.e.verdict + '</li>';
    }).join('') : '<li>No row clears $0 net at the current scenario — loosen the deposit, the drop share, or the participation.</li>';
  }

  function renderScenarioNote() {
    var farm = rows.filter(function (r) { return effEcon(r).verdict === 'FARM'; }).length;
    $('scenarioNote').textContent = 'At this scenario: ' + farm + ' FARM of ' + rows.length + '. Sensitivity at the deposit ladder (minimum viable capital): 2% participation → ' + E.farm.sensitivity.at2pct + ' FARM; 10% → ' + E.farm.sensitivity.at10pct + ' FARM. Ladder distribution of the ' + E.kpi.farm + ' FARM rows: ' + E.farm.ladderDist.map(function (d) { return '$' + d.deposit.toLocaleString('en-US') + ': ' + d.farm; }).join(' · ') + '.';
  }

  function renderAblations() {
    function ablTable(el, rowsData, cols) {
      var html = '<thead><tr><th>Candidate</th>' + cols.map(function (c) { return '<th class="num">' + c + '</th>'; }).join('') + '<th>Verdict</th></tr></thead><tbody>';
      rowsData.forEach(function (r) {
        html += '<tr' + (r.kept ? ' class="kept"' : '') + '><td>' + esc(r.name) + '</td>' + r.nums.map(function (n) { return '<td class="num">' + n + '</td>'; }).join('') + '<td><span class="note">' + esc(r.note) + '</span></td></tr>';
      });
      $(el).innerHTML = html + '</tbody>';
    }
    ablTable('ablValue', E.value.ablation.map(function (r) {
      return { name: r.name, nums: ['×' + r.loo.toFixed(2), '×' + r.wf1.toFixed(2), '×' + r.wf2.toFixed(2)], kept: r.kept, note: r.note };
    }), ['LOO', 'WF 2024-07', 'WF 2025-01']);
    ablTable('ablOdds', E.odds.ablation.map(function (r) {
      return { name: r.name, nums: [r.cv.toFixed(4), r.wf1.toFixed(4), r.wf2.toFixed(4)], kept: r.kept, note: r.note };
    }), ['10-fold', 'WF 2024-07', 'WF 2025-01']);
    ablTable('ablRange', E.range.ablation.map(function (r) {
      return { name: r.name, nums: [(r.cov2575 * 100).toFixed(0) + '%', (r.cov1090 * 100).toFixed(0) + '%', (r.covWf * 100).toFixed(0) + '%'], kept: r.kept, note: r.note };
    }), ['P25–P75', 'P10–P90', 'WF P25–P75']);
  }

  function renderModel() {
    var v = E.value, o = E.odds, rg = E.range;
    var oddsTerms = o.labels.map(function (l, j) {
      return l + ' ' + o.raw[j] + ' ± ' + o.rawSe[j];
    }).join('; ');
    var catLine = '';
    if (v.catEffects && v.catEffects.length) {
      var mn = v.catEffects[0], mx = v.catEffects[0];
      v.catEffects.forEach(function (c) { if (c.mult < mn.mult) mn = c; if (c.mult > mx.mult) mx = c; });
      catLine = '<p>Category effects (ridge 16, vs ' + esc(E.scatter.curveCategory) + ', the reference): ×' + mn.mult + ' (' + esc(mn.name) + ') to ×' + mx.mult + ' (' + esc(mx.name) + '), bootstrap s.e. on each multiplier in the evidence file.</p>';
    }
    $('modelBody').innerHTML =
      '<h3>Value — fitted mcap</h3>' +
      '<p class="math">' + esc(v.formula) + '</p>' +
      '<p>OLS on ' + v.nComps + ' priced comps (mcap/TVL in [0.02, 2]). R² ' + v.r2 + '. Intercept ' + v.intercept + ' ± ' + v.interceptSe + ', slope ' + v.slope + ' ± ' + v.slopeSe + ' (bootstrap, 200 refits). LOO miss ×' + E.kpi.valueLoo + ', walk-forward ×' + E.kpi.valueWf1 + ' / ×' + E.kpi.valueWf2 + '.</p>' +
      catLine +
      '<h3>Token odds — peer logistic, ridge 0.5</h3>' +
      '<p class="math">' + esc(o.formula) + '</p>' +
      '<p>Fit on all ' + E.counts.peers + ' dated protocols (outcome: records a token; base rate ' + o.baseRate + '). Raw coefficients ± bootstrap s.e. (200 refits): ' + esc(oddsTerms) + '. 10-fold Brier ' + E.kpi.oddsBrier + ' vs ' + E.kpi.oddsConst + ' constant; walk-forward ' + E.kpi.oddsWf1 + ' / ' + E.kpi.oddsWf2 + ' vs ' + E.kpi.oddsWf1Const + ' / ' + E.kpi.oddsWf2Const + ' constant.</p>' +
      '<p class="fine">' + esc(o.peerNote) + '</p>' +
      '<h3>Range — the band around every fitted value</h3>' +
      '<p>Band multipliers from the kept model\'s leave-one-out residuals: P25–P75 ×' + rg.band2575[0] + '–×' + rg.band2575[1] + ', P10–P90 ×' + rg.band1090[0] + '–×' + rg.band1090[1] + '. Coverage on leave-one-out: ' + Math.round(E.kpi.range2575 * 100) + '% / ' + Math.round(E.kpi.range1090 * 100) + '% (target 50% / 80%).</p>';
  }

  function renderScatter() {
    var pts = E.scatter.comps, curve = E.scatter.curve;
    var W = 640, H = 340, padL = 52, padB = 38, padT = 12, padR = 12;
    var xs = pts.map(function (p) { return p[0]; }).concat(curve.map(function (p) { return p[0]; }));
    var ys = pts.map(function (p) { return p[1]; }).concat(curve.map(function (p) { return p[1]; }));
    var x0 = Math.min.apply(null, xs) - 0.3, x1 = Math.max.apply(null, xs) + 0.3;
    var y0 = Math.min.apply(null, ys) - 0.3, y1 = Math.max.apply(null, ys) + 0.3;
    function X(v) { return padL + (v - x0) / (x1 - x0) * (W - padL - padR); }
    function Y(v) { return H - padB - (v - y0) / (y1 - y0) * (H - padT - padB); }
    function tickVal(v) { var d = Math.exp(v); return d >= 1e9 ? '$' + (d / 1e9).toFixed(0) + 'B' : d >= 1e6 ? '$' + (d / 1e6).toFixed(0) + 'M' : '$' + (d / 1e3).toFixed(0) + 'K'; }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter of log market cap against log TVL">';
    var lo = E.range.band2575[0], hi = E.range.band2575[1];
    var bandPts = curve.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1] + Math.log(hi)).toFixed(1); }).join(' ') +
      ' ' + curve.slice().reverse().map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1] + Math.log(lo)).toFixed(1); }).join(' ');
    s += '<polygon points="' + bandPts + '" fill="#2f5d8a" opacity="0.12"/>';
    s += '<polyline points="' + curve.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ') + '" fill="none" stroke="#1d1a16" stroke-width="2"/>';
    pts.forEach(function (p) { s += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="2.6" fill="#2f5d8a" opacity="0.75"/>'; });
    rows.slice(0, 5).forEach(function (r, i) {
      s += '<circle cx="' + X(Math.log(r.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log(r.fitted_usd)).toFixed(1) + '" r="4.5" fill="none" stroke="#8a5a00" stroke-width="2"/><text x="' + (X(Math.log(r.tvl_usd)) + 6).toFixed(1) + '" y="' + (Y(Math.log(r.fitted_usd)) - 5).toFixed(1) + '" font-size="10" fill="#8a5a00">#' + (i + 1) + '</text>';
    });
    for (var gx = Math.ceil(x0); gx <= x1; gx++) {
      s += '<line x1="' + X(gx) + '" y1="' + Y(y0) + '" x2="' + X(gx) + '" y2="' + Y(y1) + '" stroke="#e3ddd0" stroke-width="1"/>';
      s += '<text x="' + X(gx) + '" y="' + (H - 22) + '" font-size="10" text-anchor="middle" fill="#6f6a5e">' + tickVal(gx) + '</text>';
    }
    for (var gy = Math.ceil(y0); gy <= y1; gy++) {
      s += '<line x1="' + X(x0) + '" y1="' + Y(gy) + '" x2="' + X(x1) + '" y2="' + Y(gy) + '" stroke="#e3ddd0" stroke-width="1"/>';
      s += '<text x="' + (padL - 6) + '" y="' + (Y(gy) + 3) + '" font-size="10" text-anchor="end" fill="#6f6a5e">' + tickVal(gy) + '</text>';
    }
    s += '<text x="' + (W / 2) + '" y="' + (H - 6) + '" font-size="11" text-anchor="middle" fill="#1d1a16">TVL (log)</text>';
    s += '<text x="12" y="' + (H / 2) + '" font-size="11" text-anchor="middle" fill="#1d1a16" transform="rotate(-90 12 ' + (H / 2) + ')">Market cap (log)</text>';
    s += '</svg>';
    $('scatter').innerHTML = s;
    $('scatterNote').textContent = 'Each dot is a protocol whose token already trades (log market cap against log TVL). The line is the fitted curve for the reference category ' + E.scatter.curveCategory + ' (other categories shift it by their multiplier); the band is the leave-one-out P25–P75. The two largest board rows sit inside the comps\' TVL range — their fitted values are interpolations, not extrapolations.';
  }

  function renderTexts() {
    $('weakText').textContent = E.weakness;
    $('methodText').textContent = E.method;
    $('bandNote').textContent = 'Click a row for its detail view and inline farm plan. Sort by clicking a column header. Implied = fitted mcap × token odds; the band is the fitted value × [' + E.range.band2575[0] + ', ' + E.range.band2575[1] + '] (leave-one-out P25–P75) × odds. Verdict, Net and Min dep are at each row\'s own ladder deposit (minimum viable capital); move a scenario slider to re-price the whole board at another deposit.';
  }

  function openDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var e = effEcon(r);
    $('detailTitle').textContent = '#' + r.rank + ' ' + r.name + (r.watchlist ? ' ● watchlist' : '');
    var chg = r.change_7d == null ? 'not reported' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(2) + '% over 7 days';
    var catMult = 1, catName = r.category || '';
    if (E.value.catEffects) E.value.catEffects.forEach(function (c) { if (c.name === catName) catMult = c.mult; });
    var catTerm = (E.value.catEffects && catMult !== 1) ? ' + ln ' + catMult.toFixed(2) + ' [' + esc(catName) + ']' : '';
    var oddsFormula = E.odds.formula.replace('logit P(token) = ', 'logistic(');
    var depLabel = scenarioDirty ? fmtMoney(scenario.dep) : fmtMoney(r.deposit_usd);
    var minDepLine = e.minDep == null ? '— (no deposit clears $150 band-low net at this scenario)' : fmtMoney(e.minDep) + ' to clear $150 band-low net';
    $('detailBody').innerHTML =
      '<div class="detailgrid"><div>' +
      '<h3>What it is</h3><dl class="kv">' +
      '<dt>Category</dt><dd>' + esc(r.category || '—') + '</dd>' +
      '<dt>Chains</dt><dd>' + esc(r.chains.join(', ')) + '</dd>' +
      '<dt>TVL</dt><dd>' + fmtUsd(r.tvl_usd) + '</dd>' +
      '<dt>7-day change</dt><dd>' + chg + '</dd>' +
      '<dt>Age</dt><dd>' + r.age_years.toFixed(2) + ' years since DefiLlama began tracking it</dd>' +
      '<dt>Token</dt><dd>records no token (symbol null)</dd></dl>' +
      '<h3>The valuation, step by step</h3>' +
      '<p class="math">fitted = exp(' + E.value.intercept + ' + ' + E.value.slope + ' × ln ' + fmtUsd(r.tvl_usd) + catTerm + ') = ' + fmtUsd(r.fitted_usd) + '<br>' +
      'odds = ' + esc(oddsFormula) + ') = ' + r.odds.toFixed(3) + '<br>' +
      'implied = ' + fmtUsd(r.fitted_usd) + ' × ' + r.odds.toFixed(3) + ' = ' + fmtUsd(r.implied_value_usd) + ' · band ' + fmtUsd(r.band_low_usd) + '–' + fmtUsd(r.band_high_usd) + '</p>' +
      '</div><div>' +
      '<h3>Farm plan — ' + depLabel + ' over ' + scenario.weeks + ' weeks' + (scenarioDirty ? ' (scenario)' : ' (ladder deposit)') + '</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<h3>What it pays at this scenario</h3><dl class="kv">' +
      '<dt>Expected net</dt><dd>' + fmtMoney(e.net) + ' (' + fmtMoney(e.perHour) + '/hour over ' + (2 + scenario.weeks) + ' hours)</dd>' +
      '<dt>Band-low net</dt><dd>' + fmtMoney(e.netLow) + ' — the pessimistic case</dd>' +
      '<dt>Verdict</dt><dd><span class="tag ' + e.verdict + '">' + e.verdict + '</span></dd>' +
      '<dt>Min deposit</dt><dd>' + minDepLine + '</dd></dl>' +
      '</div></div>';
    $('detailCard').classList.remove('hidden');
    if (location.hash.indexOf('#detail=') !== 0) history.replaceState(null, '', '#detail=' + slug);
  }
  function closeDetail() {
    $('detailCard').classList.add('hidden');
    if (location.hash.indexOf('#detail=') === 0) history.replaceState(null, '', location.pathname);
  }
  $('detailClose').addEventListener('click', closeDetail);

  function bindControls() {
    function sync() {
      scenario.dep = +$('depSlider').value;
      scenario.drop = +$('dropSlider').value / 100;
      scenario.weeks = +$('horSlider').value;
      scenario.part = +$('partSlider').value / 100;
      scenarioDirty = true;
      $('depVal').textContent = fmtMoney(scenario.dep);
      $('dropVal').textContent = $('dropSlider').value + '%';
      $('horVal').textContent = scenario.weeks + ' weeks';
      $('partVal').textContent = $('partSlider').value + '%';
      renderBoard();
      var open = document.querySelector('#detailCard:not(.hidden) #detailTitle');
      if (open) { var m = location.hash.match(/#detail=(.+)/); if (m) openDetail(m[1]); }
    }
    ['depSlider', 'dropSlider', 'horSlider', 'partSlider'].forEach(function (id) {
      $(id).addEventListener('input', sync);
    });
    $('q').addEventListener('input', function () { filters.q = $('q').value; renderBoard(); });
    $('verdictFilter').addEventListener('change', function () { filters.verdict = $('verdictFilter').value; renderBoard(); });
    $('wlOnly').addEventListener('change', function () { filters.wl = $('wlOnly').checked; renderBoard(); });
    $('catFilter').addEventListener('change', function () { filters.cat = $('catFilter').value; renderBoard(); });
    Array.prototype.forEach.call(document.querySelectorAll('#board th[data-k]'), function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-k');
        if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'name' || k === 'category' || k === 'verdict' ? 1 : -1; }
        renderBoard();
      });
    });
  }

  function applyHash() {
    var h = location.hash;
    var dm = h.match(/#detail=([^&]+)/);
    if (dm) {
      document.querySelectorAll('main > section').forEach(function (s) { if (s.id !== 'detailCard') s.classList.add('hidden'); });
      document.querySelector('.masthead').classList.remove('hidden');
      openDetail(decodeURIComponent(dm[1]));
      return;
    }
    var fm = h.match(/#filter=verdict:([A-Z]+)/);
    if (fm) { filters.verdict = fm[1]; $('verdictFilter').value = fm[1]; }
    var qm = h.match(/#q=([^&]+)/);
    if (qm) { filters.q = decodeURIComponent(qm[1]); $('q').value = filters.q; }
  }

  fetch('../board.json').then(function (res) { return res.json(); }).then(function (doc) {
    rows = doc.rows;
    var cats = [];
    rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
    cats.sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; $('catFilter').appendChild(o);
    });
    renderHeader(); renderCensus(); renderIntegrity(); renderKpi();
    renderAblations(); renderModel(); renderScatter(); renderTexts();
    bindControls(); applyHash(); renderBoard();
  }).catch(function (err) {
    document.querySelector('main').insertAdjacentHTML('afterbegin',
      '<section class="card"><h2>Could not load board.json</h2><p>' + esc(String(err)) + '</p>' +
      '<p class="fine">Serve this folder over HTTP (for example: python3 -m http.server in the output directory) — browsers block a page opened from disk from reading its own data file.</p></section>');
  });
})();
