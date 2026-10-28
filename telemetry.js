/**
 * Neon telemetry — inspectable without a backend.
 *
 * Default mode (no secrets): console.info + localStorage ring buffer
 *   key: aigame_neon_telem_v1
 *
 * Optional beacon: set window.AIGAME_TELEMETRY_URL before load
 *   e.g. https://httpbin.org/post  (smoke only; do not rely on retention)
 *
 * Canonical events: boot | win | lose | reject
 * Also accepts: landing_view, game_shell_load, session_start, session_end
 */
(function (w) {
  var ENDPOINT = (w.AIGAME_TELEMETRY_URL || "").replace(/\/$/, "");
  var TELEM_KEY = "aigame_neon_telem_v1";
  var TELEM_MAX = 100;
  var MODE = ENDPOINT ? "beacon+local" : "local_only";

  function _ringPush(payload) {
    try {
      var raw = w.localStorage.getItem(TELEM_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      arr.push(payload);
      if (arr.length > TELEM_MAX) arr = arr.slice(arr.length - TELEM_MAX);
      w.localStorage.setItem(TELEM_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function _normalize(event, data) {
    var ev = event || "ping";
    var d = data || {};
    // Godot may pass {event, ...} as second arg; flatten
    if (d.event && !event) ev = d.event;
    if (ev === "session_start") ev = "boot";
    if (ev === "session_end") {
      if (d.result === "win") ev = "win";
      else if (d.result === "lose") ev = "lose";
    }
    return { event: ev, data: d };
  }

  function _maybeScore(ev, d) {
    if (!w.AIGAME_LEADERBOARD) return;
    if (ev === "win" || ev === "lose") {
      try {
        w.AIGAME_LEADERBOARD.record({
          result: ev,
          bundle: d.bundle || "",
          elapsed_ms: typeof d.elapsed_ms === "number" ? d.elapsed_ms : null,
          fail_reason: d.fail_reason || "",
          checkpoints: d.checkpoints,
          checkpoints_total: d.checkpoints_total,
          name: d.name || "anon"
        });
      } catch (e) {}
    }
  }

  function ping(event, data) {
    var norm = _normalize(event, data);
    var payload = Object.assign({
      event: norm.event,
      ts: new Date().toISOString(),
      href: (w.location && w.location.href) || "",
      ua: (w.navigator && w.navigator.userAgent) || "",
      mode: MODE
    }, norm.data || {});
    // Prefer normalized event name over nested data.event
    payload.event = norm.event;

    try { console.info("[aigame-telemetry]", payload.event, payload); } catch (e) {}
    _ringPush(payload);
    _maybeScore(norm.event, norm.data);

    if (!ENDPOINT) return;
    try {
      var body = JSON.stringify(payload);
      if (w.navigator && w.navigator.sendBeacon) {
        w.navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      } else {
        fetch(ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/json" },
          body: body
        });
      }
    } catch (e) {}
  }

  function dump() {
    try {
      return JSON.parse(w.localStorage.getItem(TELEM_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function clear() {
    try { w.localStorage.removeItem(TELEM_KEY); } catch (e) {}
  }

  w.AIGAME_TELEMETRY = {
    ping: ping,
    dump: dump,
    clear: clear,
    mode: MODE,
    endpoint: ENDPOINT || null
  };
})(window);
