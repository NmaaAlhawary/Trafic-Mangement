/**
 * incident_log.js
 * Phase 3 — Real-Time Incident & Anomaly Event Log
 *
 * Polls the detection REST server (http://localhost:5002) every 3 seconds for:
 *   GET /events  → structured incident events from the tracker
 *   GET /health  → ingestion metrics (frames, dropped, uptime, reconnects)
 *
 * Renders events into #incident-event-list and health stats into
 * #incident-health-strip. Gracefully degrades when the server is offline.
 */

"use strict";

const incidentLog = (function () {

    const POLL_MS      = 3000;
    const EVENTS_URL   = "http://localhost:5002/events";
    const HEALTH_URL   = "http://localhost:5002/health";
    const MAX_ROWS     = 100;   // keep at most this many rows in the DOM

    let _seen      = new Set();   // de-duplicate by timestamp+event_type+track_id
    let _allEvents = [];          // full local log
    let _online    = false;
    let _timer     = null;
    let _failures  = 0;

    // ── Event type metadata ──────────────────────────────────────────────────
    const META = {
        stalled_vehicle:    { icon: "🚗", label: "Stalled Vehicle",       color: "#f87171" },
        queue_spillback:    { icon: "🚦", label: "Queue Spillback",        color: "#fb923c" },
        sudden_congestion:  { icon: "⚡", label: "Sudden Congestion",      color: "#fbbf24" },
        abnormal_stopping:  { icon: "⚠️", label: "Abnormal Stopping",      color: "#a78bfa" },
        unexpected_trajectory: { icon: "↗", label: "Unexpected Trajectory", color: "#60a5fa" }
    };

    // ── Render one event row ─────────────────────────────────────────────────
    function _row(ev) {
        const m   = META[ev.event_type] || { icon: "●", label: ev.event_type, color: "#6b7a99" };
        const pct = Math.round((ev.confidence || 0) * 100);
        const barColor = pct >= 80 ? "#f87171" : pct >= 55 ? "#fbbf24" : "#22d97a";
        const queueTxt = ev.queue_length != null ? ` · Queue: ${ev.queue_length} veh` : "";
        const trackTxt = ev.track_id    != null ? ` · T${ev.track_id}` : "";
        const ts       = (ev.timestamp || "").replace("T", " ");
        const cameraTxt = ev.camera_id ? ` · ${ev.camera_id}` : "";
        const categoryTxt = ev.category ? ev.category : "traffic event";
        const actions = [
            ev.snapshot_url ? `<a href="${ev.snapshot_url}" target="_blank" rel="noopener" style="color:#3ecfff;text-decoration:none">Snapshot</a>` : "",
            ev.clip_url ? `<a href="${ev.clip_url}" target="_blank" rel="noopener" style="color:#3ecfff;text-decoration:none">Clip</a>` : ""
        ].filter(Boolean).join('<span style="color:rgba(255,255,255,.18)">·</span>');

        const el = document.createElement("div");
        el.style.cssText = [
            "display:flex;align-items:flex-start;gap:12px;padding:10px 18px",
            "border-bottom:1px solid rgba(255,255,255,.04);font-size:12px",
            "animation:fadeIn .3s ease"
        ].join(";");

        el.innerHTML = `
          <span style="font-size:18px;line-height:1;margin-top:2px">${m.icon}</span>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <strong style="color:${m.color}">${m.label}</strong>
              <span style="color:var(--muted);font-size:10px;white-space:nowrap">${ts}</span>
            </div>
            <div style="color:var(--muted);margin-top:3px">
              ${ev.location}${cameraTxt}${trackTxt}${queueTxt}
            </div>
            <div style="color:${m.color};margin-top:4px;font-size:10px;text-transform:uppercase;letter-spacing:.12em">
              ${categoryTxt}
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
              <div style="flex:1;height:4px;background:rgba(255,255,255,.08);border-radius:2px">
                <div style="width:${pct}%;height:100%;background:${barColor};border-radius:2px;transition:width .4s"></div>
              </div>
              <span style="font-size:10px;color:${barColor};min-width:32px;text-align:right">${pct}%</span>
            </div>
            ${actions ? `<div style="display:flex;gap:8px;margin-top:8px;font-size:10px">${actions}</div>` : ""}
          </div>`;
        return el;
    }

    // ── Render all events ────────────────────────────────────────────────────
    function _render() {
        const list = document.getElementById("incident-event-list");
        if (!list) return;

        if (!_allEvents.length) {
            list.innerHTML = `<div style="padding:20px 18px;color:var(--muted);font-size:12px">
                No incidents detected yet.</div>`;
            return;
        }

        // Prepend new events (most recent first)
        const sorted = [..._allEvents].sort((a, b) =>
            (b.timestamp || "").localeCompare(a.timestamp || ""));

        list.innerHTML = "";
        sorted.slice(0, MAX_ROWS).forEach(ev => list.appendChild(_row(ev)));
    }

    // ── Poll /events ─────────────────────────────────────────────────────────
    async function _fetchEvents() {
        try {
            const res = await fetch(EVENTS_URL, { signal: AbortSignal.timeout(2500) });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const events = await res.json();
            _online = true;
            _failures = 0;
            _setStatus(true);

            let newCount = 0;
            events.forEach(ev => {
                const key = `${ev.timestamp}|${ev.event_type}|${ev.track_id}`;
                if (!_seen.has(key)) {
                    _seen.add(key);
                    _allEvents.push(ev);
                    newCount++;
                }
            });
            // Keep rolling log bounded
            if (_allEvents.length > MAX_ROWS * 2)
                _allEvents = _allEvents.slice(-MAX_ROWS);

            window.dispatchEvent(new CustomEvent("incident-summary", {
                detail: {
                    online: true,
                    total: events.length,
                    highestConfidence: events.reduce((max, ev) => Math.max(max, Number(ev.confidence) || 0), 0),
                    activeEvents: events.slice(0, 12)
                }
            }));

            if (newCount > 0) _render();
        } catch {
            _online = false;
            _setStatus(false);
            _failures += 1;
            window.dispatchEvent(new CustomEvent("incident-summary", {
                detail: { online: false, total: 0, highestConfidence: 0, activeEvents: [] }
            }));
            if (_failures >= 2 && _timer !== null) {
                clearInterval(_timer);
                _timer = null;
            }
        }
    }

    // ── Poll /health ─────────────────────────────────────────────────────────
    async function _fetchHealth() {
        try {
            const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2500) });
            if (!res.ok) return;
            const h = await res.json();
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? "—"; };
            set("ih-frames",    h.frames_processed);
            set("ih-dropped",   h.frames_dropped);
            set("ih-uptime",    h.stream_uptime_s != null ? h.stream_uptime_s + "s" : "—");
            set("ih-reconnects",h.reconnect_count);
            if (h.active_tracks) {
                set("ih-track-n", h.active_tracks.North ?? "—");
                set("ih-track-s", h.active_tracks.South ?? "—");
                set("ih-track-e", h.active_tracks.East  ?? "—");
                set("ih-track-w", h.active_tracks.West  ?? "—");
            }
            window.dispatchEvent(new CustomEvent("incident-health", { detail: h }));
        } catch { /* server offline – handled by events poll */ }
    }

    // ── Status indicator ─────────────────────────────────────────────────────
    function _setStatus(online) {
        const dot   = document.getElementById("incident-status-dot");
        const label = document.getElementById("incident-status-label");
        if (dot)   dot.style.background   = online ? "#22d97a" : "#f87171";
        if (label) label.textContent       = online
            ? "Detection server connected · :5002"
            : "Detection server offline (start run_wadi_saqra_streams.py)";
    }

    // ── Public API ────────────────────────────────────────────────────────────
    function start() {
        _poll();
        _timer = setInterval(_poll, POLL_MS);
    }

    function _poll() {
        _fetchEvents();
        _fetchHealth();
    }

    function clear() {
        _allEvents = [];
        _seen.clear();
        _render();
    }

    // Auto-start when DOM is ready
    if (document.readyState !== "loading") {
        start();
    } else {
        document.addEventListener("DOMContentLoaded", start);
    }

    return { start, clear };
})();
