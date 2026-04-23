/**
 * wadi_saqra_data.js
 * Loads real Google Maps corridor data + LightGBM forecast output for Wadi Saqra.
 *
 * Data sources:
 *   sandbox_data/typical_wadi_saqra.ndjson  — raw corridor observations
 *   sandbox_data/forecast_lgbm.json         — LightGBM model predictions
 *                                             (trained by tools/lgbm_forecast.py)
 *
 * Drives: Congestion Index, Speed Profile Chart, Short-Term Forecast Panel,
 *         Signal Optimization Recommendations, Peak Analysis, Dashboard KPIs.
 */

"use strict";

const WS = (function () {

    // ── Internal state ────────────────────────────────────────────
    let _rows = [];           // all ok==true rows sorted by local_hour
    let _byHour = {};         // { "8.0": { N:{…}, S:{…}, E:{…}, W:{…} } }
    let _lgbm = null;         // parsed forecast_lgbm.json
    let _corridorChart = null;
    let _loaded = false;

    // Free-flow speed per corridor (static_speed_kmh baseline from data)
    const FREE_FLOW = { N: 19.13, S: 23.15, E: 20.54, W: 22.56 };

    // ── Helpers ───────────────────────────────────────────────────
    function _pad(n) { return String(n).padStart(2, "0"); }

    function _hourLabel(h) {
        const hh = Math.floor(h);
        const mm = (h % 1) === 0.5 ? "30" : "00";
        return _pad(hh) + ":" + mm;
    }

    function _congestionColor(ratio) {
        if (ratio < 0.75) return "#22d97a";      // green – free
        if (ratio < 0.90) return "#fbbf24";      // yellow – moderate
        if (ratio < 1.10) return "#fb923c";      // orange – heavy
        return "#f87171";                         // red – congested
    }

    function _congestionLabel(ratio) {
        if (ratio < 0.75) return "Free";
        if (ratio < 0.90) return "Moderate";
        if (ratio < 1.10) return "Heavy";
        return "Congested";
    }

    // Simple linear forecast: weighted average of last N known values + trend
    function _forecast(values, stepsAhead) {
        if (!values.length) return null;
        if (values.length === 1) return values[0];
        const n = Math.min(6, values.length);
        const recent = values.slice(-n);
        const trend = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
        return recent[recent.length - 1] + trend * stepsAhead;
    }

    // ── Load data ─────────────────────────────────────────────────
    async function load() {
        try {
            // Load raw corridor observations
            const resp = await fetch("sandbox_data/typical_wadi_saqra.ndjson?_=" + Date.now());
            if (!resp.ok) throw new Error("HTTP " + resp.status);
            const text = await resp.text();
            _rows = text.trim().split("\n")
                .map(line => { try { return JSON.parse(line); } catch { return null; } })
                .filter(r => r && r.ok === true)
                .sort((a, b) => a.local_hour - b.local_hour);

            // Index by hour then corridor
            _byHour = {};
            _rows.forEach(r => {
                const k = String(r.local_hour);
                if (!_byHour[k]) _byHour[k] = {};
                _byHour[k][r.corridor] = r;
            });

            // Load LightGBM forecast output (non-blocking – dashboard degrades gracefully)
            try {
                const lgbmResp = await fetch("sandbox_data/forecast_lgbm.json?_=" + Date.now());
                if (lgbmResp.ok) {
                    _lgbm = await lgbmResp.json();
                    console.log("[WadiSaqra] LightGBM model loaded · CV MAE:", _lgbm.cv_mae);
                }
            } catch (e) {
                console.warn("[WadiSaqra] LightGBM forecast unavailable, using linear fallback:", e.message);
            }

            _loaded = true;
            _render();
        } catch (e) {
            console.warn("[WadiSaqra] data load failed:", e.message);
        }
    }

    // ── Derive current-hour metrics ───────────────────────────────
    function _currentHourData() {
        // Use the nearest half-hour slot from actual time
        const now = new Date();
        const h = now.getHours() + (now.getMinutes() >= 30 ? 0.5 : 0);
        const key = String(h);
        if (_byHour[key]) return { hour: h, data: _byHour[key] };
        // Fall back to closest available
        const hours = Object.keys(_byHour).map(Number).sort((a, b) => a - b);
        const closest = hours.reduce((prev, cur) =>
            Math.abs(cur - h) < Math.abs(prev - h) ? cur : prev, hours[0]);
        return { hour: closest, data: _byHour[String(closest)] };
    }

    // ── Compute aggregate congestion index ────────────────────────
    function _avgCongestion(data) {
        const vals = Object.values(data)
            .filter(r => r && typeof r.congestion_ratio === "number")
            .map(r => r.congestion_ratio);
        if (!vals.length) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    // ── Signal optimization recommendation ───────────────────────
    function _signalRec(data) {
        // Higher congestion_ratio → slower → needs more green time
        const scores = {
            N: data.N ? data.N.congestion_ratio : null,
            S: data.S ? data.S.congestion_ratio : null,
            E: data.E ? data.E.congestion_ratio : null,
            W: data.W ? data.W.congestion_ratio : null
        };
        const recs = [];
        Object.entries(scores).forEach(([dir, ratio]) => {
            if (ratio === null) return;
            const label = { N: "North", S: "South", E: "East", W: "West" }[dir];
            if (ratio > 1.05) {
                recs.push({ dir, label, type: "extend", msg: "Extend green +" + Math.round((ratio - 1) * 30) + "s — heavy demand" });
            } else if (ratio < 0.80) {
                recs.push({ dir, label, type: "reduce", msg: "Reduce green −5s — low demand" });
            } else {
                recs.push({ dir, label, type: "ok", msg: "Green time optimal" });
            }
        });
        return recs;
    }

    // ── Build 24-h speed series per corridor ─────────────────────
    function _hourlySpeedSeries() {
        const hours = Object.keys(_byHour).map(Number).sort((a, b) => a - b);
        const series = { N: [], S: [], E: [], W: [], labels: [] };
        hours.forEach(h => {
            series.labels.push(_hourLabel(h));
            ["N", "S", "E", "W"].forEach(c => {
                const r = _byHour[String(h)][c];
                series[c].push(r ? r.speed_kmh : null);
            });
        });
        return series;
    }

    // ── Build forecast series – uses LightGBM JSON when available ─
    function _buildForecast() {
        const { hour } = _currentHourData();

        // Try to find the nearest LightGBM slot (exact or ±0.5h)
        if (_lgbm && _lgbm.data) {
            const lgbmKeys = Object.keys(_lgbm.data).map(Number).sort((a, b) => a - b);
            let bestKey = lgbmKeys.reduce((prev, cur) =>
                Math.abs(cur - hour) < Math.abs(prev - hour) ? cur : prev, lgbmKeys[0]);
            const slot = _lgbm.data[String(bestKey)];
            if (slot) {
                const result = {};
                ["N", "S", "E", "W"].forEach(c => {
                    const lg = slot[c];
                    result[c] = lg ? {
                        now:   lg.congestion_ratio,
                        "15m": lg.pred_15m,
                        "30m": lg.pred_30m,
                        "1h":  lg.pred_1h
                    } : null;
                });
                return result;
            }
        }

        // Linear-trend fallback when LGBM data is not loaded
        const hours = Object.keys(_byHour).map(Number).sort((a, b) => a - b);
        const pastHours = hours.filter(h => h <= hour);
        const result = {};
        ["N", "S", "E", "W"].forEach(c => {
            const pastVals = pastHours
                .map(h => _byHour[String(h)][c])
                .filter(Boolean)
                .map(r => r.congestion_ratio);
            result[c] = {
                now: pastVals.slice(-1)[0] || null,
                "15m": _forecast(pastVals, 1),
                "30m": _forecast(pastVals, 2),
                "1h":  _forecast(pastVals, 4)
            };
        });
        return result;
    }

    // ── Peak analysis: find top congestion windows ────────────────
    function _peakWindows() {
        const hours = Object.keys(_byHour).map(Number).sort((a, b) => a - b);
        const avgByHour = hours.map(h => ({
            h,
            avg: _avgCongestion(_byHour[String(h)])
        }));
        // Label named periods
        const periods = [
            { name: "Midnight–Dawn", start: 0,    end: 5,    slots: [] },
            { name: "Early Morning", start: 5,    end: 7,    slots: [] },
            { name: "Morning Rush",  start: 7,    end: 10,   slots: [] },
            { name: "Midday",        start: 10,   end: 14,   slots: [] },
            { name: "Afternoon",     start: 14,   end: 17,   slots: [] },
            { name: "Evening Rush",  start: 17,   end: 20,   slots: [] },
            { name: "Late Evening",  start: 20,   end: 24,   slots: [] }
        ];
        avgByHour.forEach(({ h, avg }) => {
            const p = periods.find(p => h >= p.start && h < p.end);
            if (p) p.slots.push(avg);
        });
        return periods.map(p => {
            const avg = p.slots.length
                ? p.slots.reduce((a, b) => a + b, 0) / p.slots.length
                : 0;
            return {
                name: p.name,
                timeLabel: _pad(p.start) + ":00 – " + _pad(p.end) + ":00",
                pct: Math.round(avg * 100),
                color: _congestionColor(avg)
            };
        }).sort((a, b) => b.pct - a.pct);
    }

    // ── Render everything ─────────────────────────────────────────
    function _render() {
        if (!_loaded) return;

        const { hour, data } = _currentHourData();
        const avgRatio = _avgCongestion(data) || 0;
        const forecast = _buildForecast();
        const recs = _signalRec(data);
        const speedSeries = _hourlySpeedSeries();
        const peaks = _peakWindows();

        _renderKpis(data, avgRatio, hour);
        _renderSignalRecs(recs);
        _renderForecastPanel(forecast, data);
        _renderPeakAnalysis(peaks);
        _renderCorridorChart(speedSeries);
        _renderDashboardOverview(data, avgRatio, forecast);
    }

    // ── KPI cards ─────────────────────────────────────────────────
    function _renderKpis(data, avgRatio, hour) {
        const avgSpeed = Object.values(data)
            .filter(r => r && r.speed_kmh)
            .reduce((s, r) => s + r.speed_kmh, 0) /
            (Object.values(data).filter(r => r && r.speed_kmh).length || 1);

        const avgDelay = Object.values(data)
            .filter(r => r && r.duration_s && r.static_duration_s)
            .reduce((s, r) => s + (r.duration_s - r.static_duration_s), 0) /
            (Object.values(data).filter(r => r && r.duration_s).length || 1);

        // Efficiency = avg speed / free-flow weighted avg
        const freeFlowAvg = Object.entries(FREE_FLOW)
            .filter(([c]) => data[c])
            .reduce((s, [, v]) => s + v, 0) /
            (Object.entries(FREE_FLOW).filter(([c]) => data[c]).length || 1);
        const efficiency = Math.min(100, Math.round((avgSpeed / freeFlowAvg) * 100));

        // Smart dashboard overview
        const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setEl("smart-congestion-index", avgRatio.toFixed(3));
        setEl("smart-efficiency", efficiency + "%");
        setEl("smart-current-flow", Math.round(avgSpeed * 60) + "/hr");
        setEl("smart-wait-time", (Math.max(0, avgDelay) / 60).toFixed(1) + " min");
        setEl("smart-monitor-wait", (Math.max(0, avgDelay) / 60).toFixed(1) + "m");
        setEl("smart-monitor-efficiency", efficiency + "%");
        setEl("smart-analytics-congestion", Math.round(avgRatio * 100) + "%");
        setEl("smart-analytics-volume", Math.round(avgSpeed * 60));

        // Congestion index gauge colour on the ring
        const ring = document.querySelector(".smart-gauge-ring");
        if (ring) {
            const deg = Math.round(efficiency * 3.6);
            ring.style.background = "conic-gradient(" +
                _congestionColor(avgRatio) + " 0deg " + deg + "deg, " +
                "rgba(62,207,255,.1) " + deg + "deg 360deg)";
        }

        // Peak banner
        const peakEl = document.getElementById("smart-peak-banner");
        if (peakEl) {
            const congLabel = _congestionLabel(avgRatio);
            peakEl.textContent = "Current: " + congLabel +
                " · Avg speed " + avgSpeed.toFixed(1) + " km/h · " +
                _hourLabel(hour) + " local";
        }

        // Weather / health (remain static but mark with real speed)
        setEl("smart-health", efficiency + "%");
    }

    // ── Signal recommendations ────────────────────────────────────
    function _renderSignalRecs(recs) {
        // Update the action buttons in the monitoring view
        const stack = document.querySelector(".smart-action-stack");
        if (!stack) return;

        const iconMap = { extend: "▲", reduce: "▼", ok: "✓" };
        const classMap = {
            extend: "smart-action smart-action-danger",
            reduce: "smart-action smart-action-warn",
            ok: "smart-action smart-action-success"
        };

        // Insert real rec buttons after the static ones
        let recBlock = document.getElementById("ws-signal-recs");
        if (!recBlock) {
            recBlock = document.createElement("div");
            recBlock.id = "ws-signal-recs";
            recBlock.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07)";
            stack.parentNode.appendChild(recBlock);
        }

        const title = document.createElement("div");
        title.style.cssText = "font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:4px";
        title.textContent = "AI Signal Recommendations · Real Data";
        recBlock.innerHTML = "";
        recBlock.appendChild(title);

        recs.forEach(rec => {
            const btn = document.createElement("button");
            btn.className = classMap[rec.type] || classMap.ok;
            btn.innerHTML = iconMap[rec.type] + " " + rec.label + " Approach" +
                "<span>" + rec.msg + "</span>";
            recBlock.appendChild(btn);
        });

        // Also update the signal timing bars based on congestion
        const dirs = recs.reduce((o, r) => { o[r.dir] = r; return o; }, {});
        _updateSignalBar("smart-bar-ns", "smart-timing-ns",
            (dirs.N && dirs.N.ratio) || 0, (dirs.S && dirs.S.ratio) || 0);
        _updateSignalBar("smart-bar-ew", "smart-timing-ew",
            (dirs.E && dirs.E.ratio) || 0, (dirs.W && dirs.W.ratio) || 0);
    }

    function _updateSignalBar(barId, labelId, r1, r2) {
        const pct = Math.min(100, Math.round(((r1 + r2) / 2) * 100));
        const bar = document.getElementById(barId);
        if (bar) {
            bar.style.width = pct + "%";
            bar.style.background = "linear-gradient(90deg," +
                _congestionColor((r1 + r2) / 2) + ", " +
                _congestionColor((r1 + r2) / 2) + "aa)";
        }
        const lbl = document.getElementById(labelId);
        if (lbl) lbl.textContent = pct + "%";
    }

    // ── Forecast panel (analytics view) ──────────────────────────
    function _renderForecastPanel(forecast, current) {
        const container = document.getElementById("ws-forecast-panel");
        if (!container) return;

        // Model badge – LightGBM or linear fallback
        const modelBadge = document.getElementById("ws-forecast-model-badge");
        if (modelBadge) {
            if (_lgbm && _lgbm.cv_mae) {
                const m = _lgbm.cv_mae;
                modelBadge.textContent =
                    `LightGBM gradient-boosting · CV MAE  15 min: ${m["15m"].toFixed(3)}  |  30 min: ${m["30m"].toFixed(3)}  |  1 hr: ${m["1h"].toFixed(3)}`;
                modelBadge.style.color = "#22d97a";
            } else {
                modelBadge.textContent = "Linear-trend fallback (LightGBM data unavailable)";
                modelBadge.style.color = "#6b7a99";
            }
        }

        const dirs = ["N", "S", "E", "W"];
        const names = { N: "North", S: "South", E: "East", W: "West" };

        container.innerHTML = dirs.map(c => {
            const f = forecast[c];
            const cur = current[c];
            if (!f) return "";
            const pct15 = Math.min(100, Math.round((f["15m"] || 0) * 100));
            const pct30 = Math.min(100, Math.round((f["30m"] || 0) * 100));
            const pct60 = Math.min(100, Math.round((f["1h"]  || 0) * 100));
            const speed = cur ? cur.speed_kmh.toFixed(1) : "—";
            const ratio = cur ? cur.congestion_ratio.toFixed(3) : "—";
            const col = cur ? _congestionColor(cur.congestion_ratio) : "#6b7a99";
            return `
            <div class="ws-forecast-col">
              <div class="ws-fc-head" style="color:${col}">
                <span class="cam-live-dot" style="background:${col};box-shadow:0 0 6px ${col}"></span>
                ${names[c]} Corridor
              </div>
              <div class="ws-fc-meta">${speed} km/h · ratio ${ratio}</div>
              <div class="ws-fc-row">
                <span>+15 min</span>
                <div class="ws-fc-bar"><div style="width:${pct15}%;background:${_congestionColor(f['15m']||0)}"></div></div>
                <strong>${pct15}%</strong>
              </div>
              <div class="ws-fc-row">
                <span>+30 min</span>
                <div class="ws-fc-bar"><div style="width:${pct30}%;background:${_congestionColor(f['30m']||0)}"></div></div>
                <strong>${pct30}%</strong>
              </div>
              <div class="ws-fc-row">
                <span>+1 hr</span>
                <div class="ws-fc-bar"><div style="width:${pct60}%;background:${_congestionColor(f['1h']||0)}"></div></div>
                <strong>${pct60}%</strong>
              </div>
            </div>`;
        }).join("");
    }

    // ── Peak analysis (analytics view) ───────────────────────────
    function _renderPeakAnalysis(peaks) {
        const list = document.querySelector(".smart-peak-list");
        if (!list) return;
        list.innerHTML = peaks.map(p => `
          <div class="smart-peak-item">
            <div class="smart-peak-copy">
              <strong>${p.name}</strong><span>${p.timeLabel}</span>
            </div>
            <div class="smart-progress">
              <span style="width:${p.pct}%;background:${p.color}"></span>
            </div>
            <strong class="smart-peak-score" style="color:${p.color}">${p.pct}%</strong>
          </div>`).join("");
    }

    // ── Corridor speed chart (Chart.js) ───────────────────────────
    function _renderCorridorChart(series) {
        const canvas = document.getElementById("ws-corridor-chart");
        if (!canvas || typeof Chart === "undefined") return;

        if (_corridorChart) { _corridorChart.destroy(); _corridorChart = null; }

        const COLORS = { N: "#3ecfff", S: "#22d97a", E: "#fbbf24", W: "#fb923c" };
        _corridorChart = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels: series.labels,
                datasets: ["N", "S", "E", "W"].map(c => ({
                    label: { N: "North", S: "South", E: "East", W: "West" }[c],
                    data: series[c],
                    borderColor: COLORS[c],
                    backgroundColor: COLORS[c] + "18",
                    fill: false,
                    tension: 0.32,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHitRadius: 8,
                    spanGaps: true
                }))
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { labels: { color: "#94a3b8", font: { size: 11 } } },
                    tooltip: { callbacks: { label: ctx => " " + ctx.parsed.y.toFixed(1) + " km/h" } }
                },
                scales: {
                    x: { ticks: { color: "#94a3b8", maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { color: "rgba(255,255,255,.05)" } },
                    y: { title: { display: true, text: "Speed (km/h)", color: "#6b7a99", font: { size: 11 } }, ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,.07)" } }
                }
            }
        });
    }

    // ── Dashboard overview update ─────────────────────────────────
    function _renderDashboardOverview(data, avgRatio, forecast) {
        // Predictive analytics items
        const items = document.querySelectorAll(".smart-prediction-item");
        const fcN = forecast.N;
        const fcS = forecast.S;
        if (items[0] && fcN) {
            const pct15 = Math.min(100, Math.round((fcN["15m"] || 0) * 100));
            items[0].querySelector(".smart-prediction-head strong").textContent = pct15 + "%";
            items[0].querySelector(".smart-prediction-head span").textContent = "North approach · +15 min";
            items[0].querySelector("p").textContent =
                "Forecast congestion " + _congestionLabel(fcN["15m"] || 0) +
                " · speed " + (data.N ? data.N.speed_kmh.toFixed(1) : "—") + " km/h now";
            const bar = items[0].querySelector(".smart-progress span");
            if (bar) { bar.style.width = pct15 + "%"; bar.style.background = _congestionColor(fcN["15m"] || 0); }
        }
        if (items[1] && fcS) {
            const pct30 = Math.min(100, Math.round((fcS["30m"] || 0) * 100));
            items[1].querySelector(".smart-prediction-head strong").textContent = pct30 + "%";
            items[1].querySelector(".smart-prediction-head span").textContent = "South approach · +30 min";
            items[1].querySelector("p").textContent =
                "Forecast congestion " + _congestionLabel(fcS["30m"] || 0) +
                " · speed " + (data.S ? data.S.speed_kmh.toFixed(1) : "—") + " km/h now";
            const bar = items[1].querySelector(".smart-progress span");
            if (bar) { bar.style.width = pct30 + "%"; bar.style.background = _congestionColor(fcS["30m"] || 0); }
        }
        if (items[2]) {
            // Overall 1-hour forecast
            const allFc1h = ["N", "S", "E", "W"]
                .map(c => forecast[c] && forecast[c]["1h"])
                .filter(v => v !== null && v !== undefined);
            const avg1h = allFc1h.length
                ? allFc1h.reduce((a, b) => a + b, 0) / allFc1h.length : avgRatio;
            const pct1h = Math.min(100, Math.round(avg1h * 100));
            items[2].querySelector(".smart-prediction-head strong").textContent = pct1h + "%";
            items[2].querySelector(".smart-prediction-head span").textContent = "All corridors · +1 hour";
            items[2].querySelector("p").textContent =
                "Forecast: " + _congestionLabel(avg1h) + " across intersection";
            const bar = items[2].querySelector(".smart-progress span");
            if (bar) { bar.style.width = pct1h + "%"; bar.style.background = _congestionColor(avg1h); }
        }
    }

    // ── Public API ────────────────────────────────────────────────
    return { load, isLoaded: () => _loaded };
})();

// Auto-load on DOM ready
document.addEventListener("DOMContentLoaded", function () {
    WS.load();
});
// Also trigger load immediately if DOM already ready
if (document.readyState !== "loading") {
    WS.load();
}
