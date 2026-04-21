/**
 * Traffic Intelligence Platform — Dashboard Logic
 * Phase 1 · Live data hydration from sandbox_data/
 * All data sourced from SimToll, WTS annotations, CityFlow replay
 */

/* ── Clock ──────────────────────────────────────────────────────── */
function tickClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
}
tickClock();
setInterval(tickClock, 1000);

/* ── Fetch helpers ──────────────────────────────────────────────── */
async function loadText(url) {
  const r = await fetch(url + '?_=' + Date.now());
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}
async function loadJSON(url) {
  return JSON.parse(await loadText(url));
}

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
    return row;
  });
}

/* ── Console logger ─────────────────────────────────────────────── */
function log(msg) {
  const el = document.getElementById('info');
  if (!el) return;
  el.textContent = '› ' + msg + '\n' + el.textContent.slice(0, 800);
}

/* ── Table renderer ─────────────────────────────────────────────── */
function renderTable(tableEl, rows, cols, colorsCol) {
  if (!tableEl || !rows.length) return;
  const head = '<thead><tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead>';
  const body = '<tbody>' + rows.slice(0, 40).map(row => {
    return '<tr>' + cols.map(c => {
      let cls = '';
      if (c === colorsCol) {
        const v = (row[c] || '').toLowerCase();
        cls = v.includes('green') ? 's-green' : v.includes('yellow') ? 's-yellow' : v.includes('red') ? 's-red' : '';
      }
      return `<td class="${cls}">${row[c] ?? ''}</td>`;
    }).join('') + '</tr>';
  }).join('') + '</tbody>';
  tableEl.innerHTML = head + body;
}

/* ── Detector bar chart ─────────────────────────────────────────── */
let detChartInst = null;
function buildDetectorChart(rows) {
  const ctx = document.getElementById('det-chart');
  if (!ctx) return;
  if (detChartInst) { detChartInst.destroy(); detChartInst = null; }

  // Average vehicle count per approach
  const byApproach = {};
  rows.forEach(r => {
    const a = r.approach || 'Unknown';
    if (!byApproach[a]) byApproach[a] = [];
    byApproach[a].push(Number(r.vehicle_count) || 0);
  });
  const labels = Object.keys(byApproach).slice(0, 7);
  const data   = labels.map(a => {
    const arr = byApproach[a];
    return +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1);
  });

  const palette = ['#3ecfff','#7b6ff0','#22d97a','#fbbf24','#f87171','#fb923c','#a78bfa'];
  detChartInst = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg vehicles / 15 min',
        data,
        backgroundColor: palette.map(c => c + '55'),
        borderColor: palette,
        borderWidth: 1.5,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y} vehicles/slot`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#6b7a99', font: { size: 12 } }, grid: { color: 'rgba(255,255,255,.04)' } },
        y: { ticks: { color: '#6b7a99', font: { size: 12 } }, grid: { color: 'rgba(255,255,255,.06)' } }
      }
    }
  });
}

/* ── Signal doughnut chart ──────────────────────────────────────── */
let sigChartInst = null;
function buildSignalChart(rows) {
  const ctx = document.getElementById('sig-chart');
  if (!ctx) return;
  if (sigChartInst) { sigChartInst.destroy(); sigChartInst = null; }

  const counts = { 'GREEN ON': 0, 'YELLOW ON': 0, 'RED ON': 0 };
  rows.forEach(r => {
    const s = (r.signal_state || '').trim();
    if (s in counts) counts[s]++;
  });

  sigChartInst = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Green', 'Yellow', 'Red'],
      datasets: [{
        data: [counts['GREEN ON'], counts['YELLOW ON'], counts['RED ON']],
        backgroundColor: ['rgba(34,217,122,.65)', 'rgba(251,191,36,.65)', 'rgba(248,113,113,.65)'],
        borderColor:     ['#22d97a', '#fbbf24', '#f87171'],
        borderWidth: 1.5,
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '66%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#6b7a99', font: { size: 13 }, boxWidth: 13, padding: 14 }
        },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} events` }
        }
      }
    }
  });
}

/* ── Signal KPI + phase pills ───────────────────────────────────── */
function updateSignalKPI(rows) {
  if (!rows.length) return;
  const now   = new Date();
  const hhmm  = now.getHours() * 60 + now.getMinutes();
  let best = rows[0], bestDiff = Infinity;
  rows.forEach(r => {
    if (!r.timestamp) return;
    const t = new Date(r.timestamp);
    const diff = Math.abs(t.getHours() * 60 + t.getMinutes() - hhmm);
    if (diff < bestDiff) { bestDiff = diff; best = r; }
  });

  const st = (best.signal_state || '').trim();
  const kSig = document.getElementById('kpi-signal');
  const kPh  = document.getElementById('kpi-phase');
  if (kSig) {
    kSig.textContent = st;
    kSig.style.color = st.includes('GREEN') ? 'var(--green)' : st.includes('YELLOW') ? 'var(--yellow)' : 'var(--red)';
  }
  if (kPh) kPh.textContent = `Phase ${best.phase_number || '—'} · ${best.control_mode || ''}`;

  // Phase pills — find current state for each phase
  [1, 2, 3, 4].forEach(ph => {
    const el = document.getElementById('ph' + ph);
    if (!el) return;
    const candidates = rows.filter(r => Number(r.phase_number) === ph && r.timestamp);
    let phBest = candidates[0], phBestDiff = Infinity;
    candidates.forEach(r => {
      const t = new Date(r.timestamp);
      const diff = Math.abs(t.getHours() * 60 + t.getMinutes() - hhmm);
      if (diff < phBestDiff) { phBestDiff = diff; phBest = r; }
    });
    if (phBest) {
      const s = (phBest.signal_state || '').toLowerCase();
      el.className = 'phase-pill ' + (s.includes('green') ? 'phase-green' : s.includes('yellow') ? 'phase-yellow' : 'phase-red');
    }
  });
}

/* ── Detector KPI ───────────────────────────────────────────────── */
function updateDetectorKPI(rows) {
  if (!rows.length) return;
  const now  = new Date();
  const hhmm = now.getHours() * 60 + now.getMinutes();
  const nearby = rows.filter(r => {
    if (!r.timestamp) return false;
    const t = new Date(r.timestamp);
    return Math.abs(t.getHours() * 60 + t.getMinutes() - hhmm) <= 30;
  });
  const pool = nearby.length ? nearby : rows;
  const peak = pool.reduce((best, r) =>
    Number(r.vehicle_count) > Number(best.vehicle_count) ? r : best, pool[0]);
  const el1 = document.getElementById('kpi-peak-det');
  const el2 = document.getElementById('kpi-peak-lane');
  if (el1) el1.textContent = peak.vehicle_count || '—';
  if (el2) el2.textContent = `${peak.detector_id || ''} · ${peak.lane_label || ''}`;
}

/* ── Ground truth renderer ──────────────────────────────────────── */
const LABEL_COLORS = {
  'congestion-event':       '#f87171',
  'queue-spillback-marker': '#fbbf24',
  'abnormal-stopping':      '#fb923c',
  'incident-label':         '#f87171',
  'unexpected-trajectory':  '#7b6ff0',
  'normal-flow':            '#22d97a',
  'vehicle':                '#3ecfff',
  'low-density':            '#6b7a99',
};
function renderGroundTruth(payload) {
  const list = document.getElementById('groundtruth-list');
  const cnt  = document.getElementById('gt-count');
  if (!list) return;
  const wins = (payload && payload.validation_windows) || [];
  if (cnt) cnt.textContent = wins.length + ' windows';

  list.innerHTML = wins.map(w => {
    const tags = (w.labels || []).map(l => {
      const c = LABEL_COLORS[l] || '#7b6ff0';
      return `<span class="gt-tag" style="background:${c}22;color:${c};border:1px solid ${c}55">${l}</span>`;
    }).join('');
    return `
      <div class="gt-item">
        <div class="gt-title">
          ${w.window_id || '—'} &nbsp;·&nbsp; <span style="color:var(--accent)">${w.video || ''}</span>
          &nbsp;<span style="color:var(--muted);font-weight:400;font-size:10px">${w.start_time_s}s–${w.end_time_s}s</span>
        </div>
        <div class="gt-note">${w.notes || ''}</div>
        <div class="gt-tags">${tags}</div>
      </div>`;
  }).join('');
}

/* ── Main hydrate ───────────────────────────────────────────────── */
async function hydrate() {
  try {
    log('Refreshing live data…');
    const [detText, sigText, meta, gt] = await Promise.all([
      loadText('sandbox_data/detector_counts_15min.csv'),
      loadText('sandbox_data/signal_timing_log.csv'),
      loadJSON('sandbox_data/intersection_metadata.json'),
      loadJSON('sandbox_data/ground_truth_validation.json'),
    ]);

    const detRows = parseCsv(detText);
    const sigRows = parseCsv(sigText);

    // Tables
    renderTable(
      document.getElementById('detector-table'), detRows,
      ['timestamp','detector_id','approach','lane_label','vehicle_count','avg_speed_kmh']
    );
    renderTable(
      document.getElementById('signal-table'), sigRows,
      ['timestamp','phase_number','signal_state','duration_sec','control_mode'],
      'signal_state'
    );

    // Charts
    buildDetectorChart(detRows);
    buildSignalChart(sigRows);

    // KPIs
    updateDetectorKPI(detRows);
    updateSignalKPI(sigRows);

    // Metadata
    const metaEl = document.getElementById('metadata-preview');
    if (metaEl) metaEl.textContent = JSON.stringify(meta, null, 2).slice(0, 3000) + '\n…';

    // Ground truth
    renderGroundTruth(gt);

    log(`OK · ${detRows.length} detector rows · ${sigRows.length} signal events`);
  } catch (e) {
    log('⚠ ' + e.message);
    console.error('hydrate error', e);
  }
}

hydrate();
setInterval(hydrate, 30000); // live refresh every 30 s

/* ── Sync sim progress pill ─────────────────────────────────────── */
const _pctEl  = document.getElementById('progress-percentage');
const _simPill = document.getElementById('sim-progress');
if (_pctEl && _simPill) {
  new MutationObserver(() => {
    _simPill.textContent = _pctEl.textContent || '0%';
  }).observe(_pctEl, { childList: true, characterData: true, subtree: true });
}
