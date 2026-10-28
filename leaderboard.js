/**
 * Neon leaderboard — device localStorage + optional live L3 bus + read-only
 * Pages snapshot.  Static Pages safe: no secret is ever baked in.
 *
 * Global: localStorage key aigame_neon_lb_v1
 * Weekly: aigame_neon_lb_week_v1:<ISO-week-id>  (Asia/Shanghai, same as weekly.js)
 *
 * V20 live submit
 *   Optional L3 bus: ?bus=http://127.0.0.1:8787 (or window.AIGAME_BUS_URL).
 *   Token (mutating): window.AIGAME_BUS_TOKEN or ?bus_token= (local-dev only).
 *   `recordAsync(entry)` ALWAYS commits localStorage first, then:
 *     - bus enabled + auth accepted → POST {bus}/bus/v0/call
 *       service=leaderboard method=submit (existing V0 contract), then a
 *       leaderboard.top refresh so the panel can paint the player's row without
 *       a reload;
 *     - bus absent / failed / timed out / 401 / CORS → soft-fail, resolve with
 *       source=device (or snapshot when the static board backs the panel).
 *   Honest source badge: Live | Device | Snapshot(+Device).  Live is only ever
 *   set from a successful bus top/submit for this week in this page session.
 *   `record()` stays synchronous (local write + fire-and-forget submit) for the
 *   legacy callers; new code should use `recordAsync()`.
 *   Default (no bus): localStorage only — public Pages must not depend on bus.
 *   Note: GH Pages is HTTPS static hosting and cannot be an always-on bus;
 *   http://127.0.0.1 is also mixed-content blocked from HTTPS.  Live submit
 *   needs an ops-run HTTPS bus (CORS + token) or a local static host for QA.
 *
 * Read-only Pages snapshot: ./bus_leaderboard_snapshot.json (static export of L3
 *   bus file). Weekly UI prefers/merges it when present; empty rows are honest.
 *   Refresh: python3 tools/export_bus_lb_snapshot.py && deploy_neon_pages.sh
 */
(function (w) {
  var KEY = "aigame_neon_lb_v1";
  var WEEK_PREFIX = "aigame_neon_lb_week_v1:";
  var MAX = 50;
  var MAX_WEEK = 30;

  /**
   * V20 per-week remote state (page-session only; never persisted as "Live",
   * so a reload re-probes the bus instead of trusting a stale badge).
   * {week: {ok, at, op, reason, rows}}
   */
  var _remote = {};
  var BUS_TIMEOUT_MS = 6000;

  function remoteState(weekId) {
    var wid = String(weekId || "").trim();
    return wid ? _remote[wid] || null : null;
  }

  function _markRemote(weekId, ok, op, reason, rows) {
    var wid = String(weekId || "").trim();
    if (!wid) return;
    _remote[wid] = {
      ok: !!ok,
      at: Date.now(),
      op: String(op || ""),
      reason: ok ? "" : String(reason || "unknown"),
      rows: ok && typeof rows === "number" ? rows : null,
    };
  }

  function sourceBadge(source, merged) {
    if (source === "live") return "Live";
    if (source === "snapshot") return merged === false ? "Snapshot" : "Snapshot+Device";
    return "Device";
  }

  /** Machine + display source for a week (no fetch; callers pass probe results). */
  function resolveSource(weekId, opts) {
    opts = opts || {};
    var wid = resolveWeekId(weekId);
    var st = remoteState(wid);
    if (opts.source === "live" || (opts.source == null && st && st.ok)) {
      return { source: "live", badge: "Live", week: wid, reason: "", at: st ? st.at : 0 };
    }
    if (opts.source === "snapshot") {
      return {
        source: "snapshot",
        badge: sourceBadge("snapshot", opts.merged !== false),
        week: wid,
        reason: "",
        at: st ? st.at : 0,
      };
    }
    return {
      source: "device",
      badge: "Device",
      week: wid,
      reason: (opts.reason || (st && st.reason) || (busEnabled() ? "not_probed" : "no_bus")),
      at: st ? st.at : 0,
    };
  }

  function _withTimeout(promise, ms) {
    if (typeof setTimeout !== "function") return promise;
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve({ ok: false, soft_fail: true, reason: "timeout" });
      }, ms || BUS_TIMEOUT_MS);
      promise.then(
        function (v) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(v);
        },
        function (e) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({
            ok: false,
            soft_fail: true,
            reason: "network",
            message: String(e && e.message ? e.message : e),
          });
        }
      );
    });
  }

  function _dispatchBusLb(detail) {
    try {
      w.dispatchEvent(new CustomEvent("aigame-bus-lb", { detail: detail }));
    } catch (err) {}
  }

  function _empty() {
    return { v: 1, entries: [] };
  }

  function _loadKey(key) {
    try {
      var raw = w.localStorage.getItem(key);
      if (!raw) return _empty();
      var o = JSON.parse(raw);
      if (!o || !Array.isArray(o.entries)) return _empty();
      return o;
    } catch (e) {
      return _empty();
    }
  }

  function _saveKey(key, store) {
    try {
      w.localStorage.setItem(key, JSON.stringify(store));
    } catch (e) {}
  }

  function _load() {
    return _loadKey(KEY);
  }

  function _save(store) {
    _saveKey(KEY, store);
  }

  function weekStorageKey(weekId) {
    return WEEK_PREFIX + String(weekId || "").trim();
  }

  function _loadWeek(weekId) {
    if (!weekId) return _empty();
    var store = _loadKey(weekStorageKey(weekId));
    store.week = weekId;
    return store;
  }

  function _saveWeek(weekId, store) {
    if (!weekId) return;
    store.week = weekId;
    _saveKey(weekStorageKey(weekId), store);
  }

  /** Prefer AIGAME_WEEKLY_API (same Asia/Shanghai ISO week as weekly.js). */
  function resolveWeekId(explicit) {
    if (explicit && String(explicit).trim()) return String(explicit).trim();
    try {
      if (w.AIGAME_WEEKLY_CURRENT && w.AIGAME_WEEKLY_CURRENT.week_id) {
        return String(w.AIGAME_WEEKLY_CURRENT.week_id);
      }
      if (w.AIGAME_WEEKLY_API && typeof w.AIGAME_WEEKLY_API.isoWeekIdFromDate === "function") {
        return w.AIGAME_WEEKLY_API.isoWeekIdFromDate(new Date()).week_id;
      }
    } catch (e) {}
    // Offline / headless fallback: ISO week in Asia/Shanghai (+08, no DST).
    try {
      var t = new Date(Date.now() + 8 * 3600 * 1000);
      var wd = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() + 4 - wd);
      var yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
      var week = Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
      return t.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
    } catch (e2) {}
    return "";
  }

  function _rankKey(e) {
    var win = e.result === "win" ? 0 : 1;
    var ms = typeof e.elapsed_ms === "number" ? e.elapsed_ms : 1e12;
    return [win, ms, -(Date.parse(e.ts || 0) || 0)];
  }

  function _cmp(a, b) {
    var ka = _rankKey(a),
      kb = _rankKey(b);
    for (var i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  }

  function _pushSorted(store, e, maxN) {
    store.entries.push(e);
    store.entries.sort(_cmp);
    if (store.entries.length > maxN) store.entries = store.entries.slice(0, maxN);
  }


  function resolveBusBase(explicit) {
    var raw = explicit;
    if (raw == null || raw === "") {
      try {
        if (w.AIGAME_BUS_URL) raw = w.AIGAME_BUS_URL;
      } catch (e0) {}
    }
    if (raw == null || raw === "") {
      try {
        var q = new URLSearchParams(w.location.search || "");
        raw = q.get("bus") || "";
      } catch (e1) {
        raw = "";
      }
    }
    raw = String(raw || "").trim();
    if (!raw) return "";
    if (/^\d{2,5}$/.test(raw)) raw = "http://127.0.0.1:" + raw;
    raw = raw.replace(/\/+$/, "");
    // Reject obvious javascript: etc.
    if (!/^https?:\/\//i.test(raw)) return "";
    return raw;
  }

  /** Optional shared secret for mutating bus ops (submit/register). */
  function resolveBusToken(explicit) {
    var raw = explicit;
    if (raw == null || raw === "") {
      try {
        if (w.AIGAME_BUS_TOKEN) raw = w.AIGAME_BUS_TOKEN;
      } catch (e0) {}
    }
    if (raw == null || raw === "") {
      try {
        var q = new URLSearchParams(w.location.search || "");
        raw = q.get("bus_token") || "";
      } catch (e1) {
        raw = "";
      }
    }
    return String(raw || "").trim();
  }

  function busEnabled() {
    return !!resolveBusBase();
  }

  var DEFAULT_FEATURED_BUNDLE = "neon_hardcore_combat_84123";

  /**
   * V13: shared-bus campaign bucket.  Campaign clears finish on the signed
   * finale (84125), but the featured weekly snapshot filters
   * 2026-W44|neon_rooftop_dash|neon_hardcore_combat_84123.  Campaign rows are
   * therefore submitted into the featured weekly bundle bucket while the
   * finale id + full chain stay in metadata (bundle_finale / bundle_chain).
   * Solo non-campaign rows keep their own bundle.
   */
  function featuredBusBundle() {
    try {
      if (w.AIGAME_FEATURED_WEEK_BUNDLE) {
        return String(w.AIGAME_FEATURED_WEEK_BUNDLE).trim();
      }
      if (w.AIGAME_WEEKLY_CURRENT && w.AIGAME_WEEKLY_CURRENT.bundle_id) {
        return String(w.AIGAME_WEEKLY_CURRENT.bundle_id).trim();
      }
    } catch (e0) {}
    return DEFAULT_FEATURED_BUNDLE;
  }

  /** POST /bus/v0/call — never throws; soft-fail object on error/timeout. */
  function busCall(service, method, params, opts) {
    opts = opts || {};
    var base = resolveBusBase();
    if (!base) {
      return Promise.resolve({ ok: false, skipped: true, reason: "no_bus" });
    }
    var body = JSON.stringify({
      service: service,
      method: method,
      params: params || {},
    });
    var headers = { "Content-Type": "application/json" };
    var tok = resolveBusToken();
    if (tok) headers["Authorization"] = "Bearer " + tok;
    var req = fetch(base + "/bus/v0/call", {
      method: "POST",
      headers: headers,
      body: body,
      mode: "cors",
      credentials: "omit",
    })
      .then(function (resp) {
        return resp.text().then(function (txt) {
          var data;
          try {
            data = JSON.parse(txt || "{}");
          } catch (e) {
            return {
              ok: false,
              soft_fail: true,
              reason: "bad_json",
              http: resp.status,
              raw: String(txt).slice(0, 200),
            };
          }
          if (!resp.ok && data && data.ok === false) return data;
          if (!resp.ok) {
            return {
              ok: false,
              soft_fail: true,
              reason: "http_" + resp.status,
              http: resp.status,
              error: data,
            };
          }
          return data;
        });
      })
      .catch(function (err) {
        return {
          ok: false,
          soft_fail: true,
          reason: "network",
          message: String(err && err.message ? err.message : err),
        };
      });
    return _withTimeout(req, opts.timeout_ms || BUS_TIMEOUT_MS);
  }

  function _busSubmitFromEntry(e, opts) {
  opts = opts || {};
    var elapsedMs =
      typeof e.elapsed_ms === "number" && isFinite(e.elapsed_ms) ? e.elapsed_ms : null;
    var timeS = elapsedMs != null ? Math.max(0, elapsedMs / 1000) : 0;
    var result = e.result === "win" ? "clear" : String(e.result || "lose");
    var campaign = !!(e.campaign || e.campaign_win);
    var params = {
      game_id: "neon_rooftop_dash",
      bundle_id: e.bundle || e.bundle_id || "",
      player: e.name || "anon",
      result: result,
      time_s: timeS,
      elapsed_ms: elapsedMs != null ? Math.round(elapsedMs) : Math.round(timeS * 1000),
      source: e.source || "",
      tier: e.tier || "",
      week: e.week || "",
      week_id: e.week || "",
      weekly: !!(e.weekly || e.week),
    };
    if (campaign) {
      // V13 bucket fix: campaign clears go into the featured weekly bucket so
      // the W44 snapshot sees them.  Finale id + chain are metadata only.
      params.bundle_id = featuredBusBundle();
      params.bundle_finale = e.bundle || e.bundle_id || "";
      params.bundle_chain = e.bundle_chain || "";
      params.campaign = true;
      params.campaign_win = !!e.campaign_win;
      if (e.campaign_stage != null) params.campaign_stage = e.campaign_stage;
      if (e.campaign_stages != null) params.campaign_stages = e.campaign_stages;
      if (e.campaign_total_ms != null) params.campaign_total_ms = e.campaign_total_ms;
      if (e.campaign_total_sec != null) params.campaign_total_sec = e.campaign_total_sec;
      if (e.campaign_total_ticks != null) params.campaign_total_ticks = e.campaign_total_ticks;
      if (Array.isArray(e.campaign_stage_ticks)) {
        params.campaign_stage_ticks = e.campaign_stage_ticks.slice();
      }
      if (Array.isArray(e.campaign_stage_secs)) {
        params.campaign_stage_secs = e.campaign_stage_secs.slice();
      }
    }
    return busCall("leaderboard", "submit", params).then(function (res) {
      var ok = !!(res && res.ok);
      _markRemote(e.week || "", ok, "submit", ok ? "" : _softReason(res));
      if (!opts || opts.dispatch !== false) {
        var src = resolveSource(e.week || "", ok ? { source: "live" } : {});
        _dispatchBusLb({
          op: "submit",
          ok: ok,
          source: src.source,
          badge: src.badge,
          week: e.week || "",
          reason: ok ? "" : _softReason(res),
          entry: e,
          campaign: campaign,
          response: res,
        });
      }
      return res;
    });
  }

  function _softReason(res) {
    if (!res) return "bus_fail";
    if (res.reason) return String(res.reason);
    if (res.error && res.error.code) return String(res.error.code);
    if (res.error && res.error.error) return String(res.error.error);
    if (res.http) return "http_" + res.http;
    return "bus_fail";
  }

  function _isNum(v) {
    return typeof v === "number" && isFinite(v);
  }

  /** Normalize a bus leaderboard.top row into the landing/device row shape. */
  function _normBusRow(r, fallbackBundle) {
    if (!r || typeof r !== "object") return null;
    var row = {
      result: r.result === "clear" ? "win" : r.result || "?",
      elapsed_ms: _isNum(r.time_s)
        ? Math.round(r.time_s * 1000)
        : _isNum(r.elapsed_ms)
        ? Math.round(r.elapsed_ms)
        : null,
      bundle: r.bundle_id || r.bundle || fallbackBundle || "",
      name: r.player || r.name || "anon",
      ts: r.at || r.ts || "",
      week: r.week_id || r.week || "",
      weekly: true,
      tier: r.tier || "",
      source: "bus_live_v0",
    };
    ["campaign", "campaign_win"].forEach(function (k) {
      if (r[k] != null) row[k] = !!r[k];
    });
    [
      "campaign_stage",
      "campaign_stages",
      "campaign_total_ticks",
      "campaign_total_ms",
      "campaign_total_sec",
      "bundle_chain",
      "bundle_finale",
    ].forEach(function (k) {
      if (r[k] != null) row[k] = r[k];
    });
    if (Array.isArray(r.campaign_stage_ticks)) {
      row.campaign_stage_ticks = r.campaign_stage_ticks.slice();
    }
    return row;
  }

  /**
   * leaderboard.top → {ok, rows, reason, week_id, bundle_id}.
   * Never throws; failures are soft objects so callers can badge Device/Snapshot.
   */
  function busTop(n, opts) {
    opts = opts || {};
    var bundle = opts.bundle || opts.bundle_id || "";
    return busCall("leaderboard", "top", {
      game_id: opts.game_id || "neon_rooftop_dash",
      bundle_id: bundle || "_any",
      n: n || 10,
      week: opts.week || "",
    }).then(function (res) {
      if (!res || !res.ok || !res.result) {
        return { ok: false, rows: [], reason: _softReason(res), week_id: opts.week || "" };
      }
      var rows = (res.result.top || [])
        .map(function (r) {
          return _normBusRow(r, bundle);
        })
        .filter(function (r) {
          return !!r;
        });
      return {
        ok: true,
        rows: rows,
        reason: "",
        week_id: res.result.week_id || opts.week || "",
        bundle_id: res.result.bundle_id || bundle || "",
      };
    });
  }

  /** Legacy array-only accessor (landing bus probe / existing callers). */
  function topFromBus(n, opts) {
    return busTop(n, opts).then(function (res) {
      return res.ok ? res.rows : [];
    });
  }

  function _liveKey(e) {
    return [
      String(e.name || e.player || "anon"),
      String(e.bundle || e.bundle_id || ""),
      String(e.result || ""),
      String(e.elapsed_ms != null ? e.elapsed_ms : ""),
    ].join("|");
  }

  /** Bus rows win on the same clear identity; local-only rows are kept. */
  function _mergeLiveRows(busRows, localRows, maxN) {
    var seen = {};
    var out = [];
    (busRows || []).forEach(function (e) {
      if (!e) return;
      var k = _liveKey(e);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(e);
    });
    (localRows || []).forEach(function (e) {
      if (!e) return;
      var k = _liveKey(e);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(e);
    });
    out.sort(_cmp);
    if (maxN && out.length > maxN) out = out.slice(0, maxN);
    return out;
  }

  /**
   * V20 board read: bus top when the L3 base answers, otherwise the existing
   * device + snapshot merge.  Returns the honest source/badge for the panel.
   *   {rows, source:"live"|"snapshot"|"device", badge:"Live"|"Snapshot…"|"Device"}
   */
  function topLive(n, weekId, opts) {
    opts = opts || {};
    var wid = resolveWeekId(weekId);
    var campaignOnly = !!opts.campaignOnly;
    var local = campaignOnly
      ? topCampaign(n || 10, wid, opts)
      : topWeekly(n || 10, wid, opts);

    function snapshotFallback(reason) {
      var p = campaignOnly
        ? topCampaignMerged(n || 10, wid, opts)
        : topWeeklyMerged(n || 10, wid, opts);
      return p.then(function (m) {
        var rows = (m && m.rows) || local;
        var has = !!(rows && rows.length);
        var src = m && m.merged && has ? "snapshot" : "device";
        return {
          rows: rows,
          source: src,
          badge: sourceBadge(src, !!(m && m.merged)),
          live: false,
          reason: reason || "",
          week: wid,
          snapshot: (m && m.snapshot) || null,
          merged: !!(m && m.merged),
        };
      });
    }

    if (!busEnabled()) {
      _markRemote(wid, false, "top", "no_bus");
      return snapshotFallback("no_bus");
    }
    var bundle = opts.bundle || featuredBusBundle();
    return busTop(n || 10, { bundle: bundle, week: wid }).then(function (res) {
      if (!res.ok) {
        _markRemote(wid, false, "top", res.reason || "top_fail");
        return snapshotFallback(res.reason || "top_fail");
      }
      var busRows = res.rows || [];
      if (campaignOnly) {
        busRows = busRows.filter(function (e) {
          if (!(e && e.campaign && e.campaign_win)) return false;
          if (opts.tier && e.tier !== opts.tier) return false;
          return true;
        });
      } else if (opts.winsOnly !== false) {
        busRows = busRows.filter(function (e) {
          return e.result === "win";
        });
      }
      var rows = campaignOnly
        ? mergeCampaignRows(busRows, local, n || 10)
        : _mergeLiveRows(busRows, local, n || 10);
      _markRemote(wid, true, "top", "", busRows.length);
      return {
        rows: rows,
        source: "live",
        badge: "Live",
        live: true,
        reason: "",
        week: wid,
        bus_rows: busRows.length,
        snapshot: null,
        merged: false,
      };
    });
  }

  function topWeeklyLive(n, weekId, opts) {
    opts = opts || {};
    return topLive(n, weekId, opts);
  }

  function topCampaignLive(n, weekId, opts) {
    opts = opts || {};
    opts.campaignOnly = true;
    return topLive(n, weekId, opts);
  }

  /** Local commit shared by record() (sync) and recordAsync() (V20 live). */
  function _commitLocal(entry) {
    var e = Object.assign(
      {
        ts: new Date().toISOString(),
        result: "win",
        bundle: "",
        elapsed_ms: null,
        name: (entry && entry.name) || "anon",
        source: "local_device_v1",
      },
      entry || {}
    );

    var weeklyFlag =
      e.weekly === true ||
      e.weekly === 1 ||
      e.weekly === "1" ||
      e.weekly === "true" ||
      (e.week && String(e.week).trim());
    var weekId = resolveWeekId(e.week);
    if (weeklyFlag && weekId) {
      e.week = weekId;
      e.weekly = true;
    }

    var store = _load();
    _pushSorted(store, e, MAX);
    _save(store);

    if (weekId && (weeklyFlag || e.week)) {
      var wstore = _loadWeek(weekId);
      _pushSorted(wstore, e, MAX_WEEK);
      _saveWeek(weekId, wstore);
    }

    try {
      w.dispatchEvent(
        new CustomEvent("aigame-lb-updated", {
          detail: { global: store, week: weekId || null, weekStore: weekId ? _loadWeek(weekId) : null },
        })
      );
    } catch (err) {}
    return e;
  }

  function _lastPayload(fields) {
    var payload = Object.assign(
      { at: Date.now(), op: "submit", live: false, rows: 0, reason: "" },
      fields || {}
    );
    try {
      w.AIGAME_LB_LAST = payload;
    } catch (e) {}
    return payload;
  }

  function record(entry) {
    var e = _commitLocal(entry);
    // Optional L3 bus mirror (never blocks local LB; never required on Pages).
    if (busEnabled()) {
      try {
        _busSubmitFromEntry(e);
      } catch (busErr) {}
    }
    return e;
  }

  /**
   * V20: await the live submit.  localStorage always commits first.
   * Resolves (never rejects) with {ok, source, badge, week, reason, rows, entry}.
   * On success the board is re-read from bus top so landing/end-screen can
   * repaint without a reload.  On any failure it resolves source=device (or
   * snapshot when the static board backs the panel) and never claims Live.
   */
  function recordAsync(entry, opts) {
    opts = opts || {};
    var e = _commitLocal(entry);
    var wid = e.week || "";
    var campaign = !!(e.campaign || e.campaign_win);

    function fail(reason) {
      _markRemote(wid, false, "submit", reason);
      var src = resolveSource(wid, { source: "device", reason: reason });
      var out = _lastPayload({
        ok: false,
        skipped: reason === "no_bus",
        source: src.source,
        badge: src.badge,
        week: wid,
        reason: reason,
        entry: e,
      });
      _dispatchBusLb(
        Object.assign({ op: "submit", campaign: campaign }, out, { entry: e })
      );
      return out;
    }

    // The live submit is a CLEAR path (campaign win / solo clear).  A loss only
    // commits device localStorage; it never posts a losing row and never flips
    // a healthy Live board to Device.
    if (e.result !== "win") {
      var rs = remoteState(wid);
      var liveBoard = !!(rs && rs.ok);
      var srcNC = liveBoard
        ? { source: "live", badge: "Live" }
        : resolveSource(wid, { source: "device", reason: busEnabled() ? "not_a_clear" : "no_bus" });
      var outNC = _lastPayload({
        ok: false,
        skipped: true,
        no_submit: true,
        source: srcNC.source,
        badge: srcNC.badge,
        week: wid,
        reason: busEnabled() ? "not_a_clear" : "no_bus",
        entry: e,
      });
      return Promise.resolve(outNC);
    }

    if (!busEnabled()) return Promise.resolve(fail("no_bus"));

    return _busSubmitFromEntry(e, { dispatch: false })
      .then(function (res) {
        if (!res || !res.ok) return fail(_softReason(res));
        var bundle = campaign ? featuredBusBundle() : e.bundle || featuredBusBundle();
        return busTop(opts.n || 10, { bundle: bundle, week: wid }).then(function (top) {
          var rows = (top && top.ok && top.rows) || [];
          if (campaign) {
            rows = rows.filter(function (r) {
              return r && r.campaign && r.campaign_win;
            });
          }
          // Submit already succeeded: Live is truthful even if the top refresh
          // failed; rows=0 tells the UI the panel could not repaint.
          _markRemote(wid, true, "submit", "", top && top.ok ? rows.length : null);
          var out = _lastPayload({
            ok: true,
            source: "live",
            badge: "Live",
            week: wid,
            reason: "",
            rows: rows.length,
            board_ok: !!(top && top.ok),
            entry: e,
          });
          _dispatchBusLb(
            Object.assign(
              { op: "submit", campaign: campaign, board: rows },
              out,
              { entry: e }
            )
          );
          return out;
        });
      })
      .catch(function (err) {
        return fail("exception_" + String((err && err.message) || err));
      });
  }

  function top(n, opts) {
    opts = opts || {};
    var list;
    if (opts.week) {
      list = _loadWeek(opts.week).entries.slice();
    } else {
      list = _load().entries.slice();
    }
    if (opts.winsOnly) list = list.filter(function (e) { return e.result === "win"; });
    if (opts.bundle) list = list.filter(function (e) { return e.bundle === opts.bundle; });
    if (opts.weeklyOnly && !opts.week) {
      list = list.filter(function (e) { return e.weekly || e.week; });
    }
    list.sort(_cmp);
    return list.slice(0, n || 10);
  }

  function topWeekly(n, weekId, opts) {
    opts = opts || {};
    var wid = resolveWeekId(weekId);
    return top(n || 10, Object.assign({}, opts, { week: wid, winsOnly: opts.winsOnly !== false }));
  }

  /**
   * V12 campaign clear rows (no solo bleed). Ranked by total campaign
   * elapsed_ms, which the runtime writes as the campaign TOTAL clear time.
   */
  function topCampaign(n, weekId, opts) {
    opts = opts || {};
    var wid = resolveWeekId(weekId);
    var rows = top(50, { week: wid, winsOnly: true }).filter(function (e) {
      if (!(e && e.campaign && e.campaign_win)) return false;
      if (opts.tier && e.tier !== opts.tier) return false;
      return true;
    });
    return rows.slice(0, n || 10);
  }

  /** Best campaign clear for the weekly card / readback (null = honest empty). */
  function bestCampaign(weekId, opts) {
    var rows = topCampaign(1, weekId, opts || {});
    return rows.length ? rows[0] : null;
  }

  /**
   * V13 campaign rows do not carry the same bundle on every surface: the device
   * row keeps the finale bundle (84125) while the shared snapshot row carries
   * the featured bucket (84123).  Dedup on the clear identity instead of bundle.
   */
  function _campaignDedupKey(e) {
    return [
      String(e.name || e.player || "anon"),
      String(e.tier || ""),
      String(e.week || e.week_id || ""),
      String(e.campaign_total_ticks != null ? e.campaign_total_ticks : ""),
      String(e.campaign_stage != null ? e.campaign_stage : ""),
      String(e.elapsed_ms != null ? e.elapsed_ms : ""),
    ].join("|");
  }

  /** Local wins on the same clear identity; snapshot-only rows are kept. */
  function mergeCampaignRows(snapshotRows, localRows, maxN) {
    var map = {};
    var order = [];
    function add(e, prefer) {
      if (!e || typeof e !== "object") return;
      var k = _campaignDedupKey(e);
      if (map[k] && prefer !== "replace") return;
      if (!map[k]) order.push(k);
      map[k] = e;
    }
    (snapshotRows || []).forEach(function (e) { add(e, "keep"); });
    (localRows || []).forEach(function (e) { add(e, "replace"); });
    var out = order.map(function (k) { return map[k]; });
    out.sort(_cmp);
    if (maxN && out.length > maxN) out = out.slice(0, maxN);
    return out;
  }

  function _snapshotBadge(localCount, snapCount) {
    if (snapCount > 0 && localCount > 0) {
      return { source: "snapshot", badge: "Snapshot+Device" };
    }
    if (snapCount > 0) return { source: "snapshot", badge: "Snapshot" };
    return { source: "device", badge: "Device" };
  }

  /**
   * V13 shared campaign board: device rows + read-only bus snapshot campaign
   * rows for the featured week.  Empty stays honest (no fabricated clears).
   */
  function topCampaignMerged(n, weekId, opts) {
    opts = opts || {};
    var wid = resolveWeekId(weekId);
    var local = topCampaign(n || 10, wid, opts);
    return fetchBusSnapshot(opts.snapshot || {}).then(function (snap) {
      if (!snap || !snap.ok) {
        return { rows: local, snapshot: snap, merged: false, source: "device", badge: "Device" };
      }
      var meta = snap.meta || {};
      if (meta.week_id && wid && meta.week_id !== wid) {
        return {
          rows: local,
          snapshot: snap,
          merged: false,
          source: "device",
          badge: "Device",
          reason: "week_mismatch",
        };
      }
      var snapRows = (snap.entries || []).filter(function (e) {
        if (!(e && e.campaign && e.campaign_win)) return false;
        if (opts.tier && e.tier !== opts.tier) return false;
        return true;
      });
      var mergedRows = mergeCampaignRows(snapRows, local, n || 10);
      var badge = _snapshotBadge(local.length, snapRows.length);
      return {
        rows: mergedRows,
        snapshot: snap,
        merged: true,
        source: badge.source,
        badge: badge.badge,
        snap_rows: snapRows.length,
        local_rows: local.length,
      };
    });
  }

  function exportJSON(opts) {
    opts = opts || {};
    if (opts.week) {
      return JSON.stringify(_loadWeek(opts.week), null, 2);
    }
    return JSON.stringify(_load(), null, 2);
  }

  function importJSON(text, mode) {
    mode = mode || "merge";
    var incoming;
    try {
      incoming = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: "invalid_json" };
    }
    var entries = Array.isArray(incoming) ? incoming : incoming && incoming.entries;
    if (!Array.isArray(entries)) return { ok: false, error: "no_entries" };
    var weekHint = (incoming && incoming.week) || "";
    var store = mode === "replace" ? _empty() : _load();
    entries.forEach(function (e) {
      if (e && typeof e === "object") {
        store.entries.push(e);
        var wid = e.week || weekHint;
        if (wid) {
          var ws = _loadWeek(wid);
          ws.entries.push(e);
          ws.entries.sort(_cmp);
          if (ws.entries.length > MAX_WEEK) ws.entries = ws.entries.slice(0, MAX_WEEK);
          _saveWeek(wid, ws);
        }
      }
    });
    store.entries.sort(_cmp);
    if (store.entries.length > MAX) store.entries = store.entries.slice(0, MAX);
    _save(store);
    try {
      w.dispatchEvent(new CustomEvent("aigame-lb-updated", { detail: { global: store } }));
    } catch (err) {}
    return { ok: true, count: store.entries.length };
  }

  function clear(opts) {
    opts = opts || {};
    if (opts.week) {
      _saveWeek(opts.week, _empty());
    } else {
      _save(_empty());
    }
    try {
      w.dispatchEvent(new CustomEvent("aigame-lb-updated", { detail: { global: _load() } }));
    } catch (err) {}
  }

  function download(opts) {
    opts = opts || {};
    var blob = new Blob([exportJSON(opts)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    var tag = opts.week ? "week-" + opts.week : new Date().toISOString().slice(0, 10);
    a.download = "neon-leaderboard-" + tag + ".json";
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 1000);
  }


  var SNAPSHOT_URL_DEFAULT = "bus_leaderboard_snapshot.json";
  var _snapshotCache = null; // {ok, entries, meta} | null pending
  var _snapshotPromise = null;

  function resolveSnapshotUrl(explicit) {
    if (explicit != null && String(explicit).trim()) return String(explicit).trim();
    try {
      if (w.AIGAME_BUS_SNAPSHOT_URL) return String(w.AIGAME_BUS_SNAPSHOT_URL).trim();
    } catch (e0) {}
    try {
      var q = new URLSearchParams(w.location.search || "");
      var s = q.get("bus_snapshot");
      if (s) return String(s).trim();
    } catch (e1) {}
    return SNAPSHOT_URL_DEFAULT;
  }

  function _entryDedupKey(e) {
    return [
      String(e.name || e.player || "anon"),
      String(e.bundle || e.bundle_id || ""),
      String(e.result || ""),
      String(e.elapsed_ms != null ? e.elapsed_ms : e.time_s != null ? Math.round(Number(e.time_s) * 1000) : ""),
      String(e.ts || e.at || ""),
    ].join("|");
  }

  /** Merge snapshot + local rows; local wins on same dedup key. Re-sort. */
  function mergeLeaderboardRows(snapshotRows, localRows, maxN) {
    var map = {};
    var order = [];
    function add(e, prefer) {
      if (!e || typeof e !== "object") return;
      var k = _entryDedupKey(e);
      if (map[k] && prefer !== "replace") return;
      if (!map[k]) order.push(k);
      map[k] = e;
    }
    (snapshotRows || []).forEach(function (e) { add(e, "keep"); });
    (localRows || []).forEach(function (e) { add(e, "replace"); });
    var out = order.map(function (k) { return map[k]; });
    out.sort(_cmp);
    if (maxN && out.length > maxN) out = out.slice(0, maxN);
    return out;
  }

  /**
   * Soft-fetch static bus snapshot. Never throws. Empty entries = honest.
   * Does not write localStorage.
   */
  function fetchBusSnapshot(opts) {
    opts = opts || {};
    if (_snapshotCache && !opts.force) {
      return Promise.resolve(_snapshotCache);
    }
    if (_snapshotPromise && !opts.force) return _snapshotPromise;
    var url = resolveSnapshotUrl(opts.url);
    _snapshotPromise = fetch(url, { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) return { ok: false, reason: "http_" + r.status, entries: [], meta: null };
        return r.json().then(function (j) {
          if (!j || typeof j !== "object") {
            return { ok: false, reason: "bad_json", entries: [], meta: null };
          }
          var entries = Array.isArray(j.entries) ? j.entries.slice() : [];
          // Normalize bus-ish rows if a future export uses top[] shape
          if (!entries.length && Array.isArray(j.top)) {
            entries = j.top.map(function (r) {
              return {
                result: r.result === "clear" ? "win" : r.result || "?",
                elapsed_ms:
                  typeof r.time_s === "number" ? Math.round(r.time_s * 1000) : r.elapsed_ms,
                bundle: r.bundle_id || r.bundle || "",
                name: r.player || r.name || "anon",
                ts: r.at || r.ts || "",
                week: r.week_id || r.week || j.week_id || "",
                weekly: true,
                source: "bus_snapshot_v0",
              };
            });
          }
          var meta = {
            schema: j.schema || "",
            updated_at: j.updated_at || "",
            timezone: j.timezone || "",
            week_id: j.week_id || "",
            bundle_id: j.bundle_id || "",
            row_count: typeof j.row_count === "number" ? j.row_count : entries.length,
            note: j.note || "",
            url: url,
          };
          var out = { ok: true, entries: entries, meta: meta };
          _snapshotCache = out;
          return out;
        });
      })
      .catch(function (err) {
        return { ok: false, reason: "fetch_fail", entries: [], meta: null, error: String(err && err.message || err) };
      })
      .then(function (out) {
        _snapshotPromise = null;
        return out;
      });
    return _snapshotPromise;
  }

  /** Weekly top: localStorage first, then merge read-only snapshot for same week (soft). */
  function topWeeklyMerged(n, weekId, opts) {
    opts = opts || {};
    var wid = resolveWeekId(weekId);
    var local = topWeekly(n || 10, wid, opts);
    return fetchBusSnapshot(opts.snapshot || {}).then(function (snap) {
      if (!snap || !snap.ok) {
        return { rows: local, snapshot: snap, merged: false, source: "device", badge: "Device" };
      }
      var meta = snap.meta || {};
      // Only merge when snapshot week matches (or snapshot has no week filter)
      if (meta.week_id && wid && meta.week_id !== wid) {
        return {
          rows: local,
          snapshot: snap,
          merged: false,
          source: "device",
          badge: "Device",
          reason: "week_mismatch",
        };
      }
      var snapRows = (snap.entries || []).slice();
      if (opts.bundle || meta.bundle_id) {
        var bid = opts.bundle || meta.bundle_id;
        snapRows = snapRows.filter(function (e) {
          return !bid || e.bundle === bid || !e.bundle;
        });
      }
      if (opts.winsOnly !== false) {
        snapRows = snapRows.filter(function (e) { return e.result === "win"; });
      }
      var rows = mergeLeaderboardRows(snapRows, local, n || 10);
      var badge = _snapshotBadge(local.length, snapRows.length);
      return {
        rows: rows,
        snapshot: snap,
        merged: true,
        source: badge.source,
        badge: badge.badge,
        snap_rows: snapRows.length,
        local_rows: local.length,
      };
    });
  }

  w.AIGAME_LEADERBOARD = {
    KEY: KEY,
    WEEK_PREFIX: WEEK_PREFIX,
    weekStorageKey: weekStorageKey,
    resolveWeekId: resolveWeekId,
    record: record,
    recordAsync: recordAsync,
    resolveSource: resolveSource,
    remoteState: remoteState,
    sourceBadge: sourceBadge,
    top: top,
    topWeekly: topWeekly,
    topWeeklyMerged: topWeeklyMerged,
    topCampaign: topCampaign,
    bestCampaign: bestCampaign,
    topCampaignMerged: topCampaignMerged,
    mergeCampaignRows: mergeCampaignRows,
    fetchBusSnapshot: fetchBusSnapshot,
    mergeLeaderboardRows: mergeLeaderboardRows,
    resolveSnapshotUrl: resolveSnapshotUrl,
    exportJSON: exportJSON,
    importJSON: importJSON,
    clear: clear,
    download: download,
    resolveBusBase: resolveBusBase,
    busEnabled: busEnabled,
    busCall: busCall,
    resolveBusToken: resolveBusToken,
    featuredBusBundle: featuredBusBundle,
    busSubmitFromEntry: _busSubmitFromEntry,
    topFromBus: topFromBus,
    busTop: busTop,
    topLive: topLive,
    topWeeklyLive: topWeeklyLive,
    topCampaignLive: topCampaignLive,
    mergeLiveRows: _mergeLiveRows,
    _load: _load,
    _loadWeek: _loadWeek,
  };
})(window);
