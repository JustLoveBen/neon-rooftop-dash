/* Neon weekly challenge — ISO week Asia/Shanghai, GH Pages static */
(function (global) {
  "use strict";
  var TZ = "Asia/Shanghai";

  function shanghaiParts(d) {
    // en-CA yields YYYY-MM-DD; compute weekday in Shanghai
    var fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
    var parts = fmt.formatToParts(d);
    var map = {};
    parts.forEach(function (p) {
      if (p.type !== "literal") map[p.type] = p.value;
    });
    return map;
  }

  function isoWeekIdFromDate(d) {
    // ISO week: Thursday-based year; week starts Monday
    var map = shanghaiParts(d);
    var y = parseInt(map.year, 10);
    var m = parseInt(map.month, 10);
    var day = parseInt(map.day, 10);
    // Use UTC noon trick on the Shanghai calendar date
    var utc = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
    // weekday: Mon=1..Sun=7
    var wd = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - wd);
    var yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    var week = Math.ceil(((utc - yearStart) / 86400000 + 1) / 7);
    var isoYear = utc.getUTCFullYear();
    return {
      week_id: isoYear + "-W" + String(week).padStart(2, "0"),
      year: isoYear,
      week_number: week,
      date: map.year + "-" + map.month + "-" + map.day,
    };
  }

  var PRIMARY_PACK = "3d_short_challenge.v1";

  function defaultPackId(doc) {
    if (doc && doc.default_pack_id) return String(doc.default_pack_id);
    return PRIMARY_PACK;
  }

  function synthesize(meta, presets, doc) {
    var list = presets && presets.length ? presets : [];
    var preset =
      list.length > 0
        ? list[meta.week_number % list.length]
        : {
            bundle_id: "neon_rooftop_84023",
            pack_id: defaultPackId(doc),
            title: "Hardcore Night — Weekly",
            goal: "Clear Hardcore Night this week.",
            goal_zh: "完成本周 Hardcore Night。",
          };
    var ops = 84000 + ((meta.year * 100 + meta.week_number) % 9000);
    var pack = preset.pack_id || defaultPackId(doc);
    return Object.assign({}, preset, {
      week_id: meta.week_id,
      week_number: meta.week_number,
      year: meta.year,
      pack_id: pack,
      ops_seed_label: meta.week_id + "-" + ops,
      layout_note: "V0 ops id; signed layout.seed unchanged",
    });
  }

  function resolve(doc, when) {
    var meta = isoWeekIdFromDate(when || new Date());
    var weeks = (doc && doc.weeks) || {};
    var hit = weeks[meta.week_id];
    var dpack = defaultPackId(doc);
    if (hit) {
      return Object.assign({ source: "weeks", pack_id: hit.pack_id || dpack }, hit, {
        pack_id: hit.pack_id || dpack,
      });
    }
    return Object.assign(
      { source: "presets" },
      synthesize(meta, (doc && doc.presets) || [], doc)
    );
  }

  function playUrl(ch) {
    var b = encodeURIComponent(ch.bundle_id || "neon_rooftop_84023");
    var w = encodeURIComponent(ch.week_id || "");
    var pack = encodeURIComponent(ch.pack_id || PRIMARY_PACK);
    // pack= is informational for ops/tools; Runtime still loads by bundle_id.
    return "./index.html?bundle=" + b + "&weekly=1&week=" + w + "&pack=" + pack;
  }

  function mountLanding(doc) {
    var ch = resolve(doc);
    global.AIGAME_WEEKLY_CURRENT = ch;
    var weekEl = document.getElementById("weekly-id");
    var titleEl = document.getElementById("weekly-title");
    var goalEl = document.getElementById("weekly-goal");
    var goalZh = document.getElementById("weekly-goal-zh");
    var seedEl = document.getElementById("weekly-seed");
    var rangeEl = document.getElementById("weekly-range");
    var play = document.getElementById("play-weekly");
    if (weekEl) weekEl.textContent = ch.week_id || "—";
    if (titleEl) titleEl.textContent = ch.title || "Weekly Challenge";
    if (goalEl) goalEl.textContent = ch.goal || "";
    if (goalZh) goalZh.textContent = ch.goal_zh || "";
    if (seedEl) seedEl.textContent = ch.ops_seed_label || "—";
    if (rangeEl) {
      rangeEl.textContent =
        ch.starts && ch.ends
          ? ch.starts + " → " + ch.ends + " (Asia/Shanghai)"
          : "ISO week " + (ch.week_id || "") + " · Asia/Shanghai";
    }
    if (play) {
      play.href = playUrl(ch);
      play.setAttribute("data-week", ch.week_id || "");
      play.setAttribute("data-bundle", ch.bundle_id || "");
      play.setAttribute("data-pack", ch.pack_id || PRIMARY_PACK);
    }
    if (global.AIGAME_TELEMETRY) {
      global.AIGAME_TELEMETRY.ping("weekly_view", {
        week: ch.week_id,
        bundle: ch.bundle_id,
        pack_id: ch.pack_id || PRIMARY_PACK,
        seed_label: ch.ops_seed_label,
      });
    }
    return ch;
  }

  function loadAndMount(url) {
    url = url || "./weekly.json";
    return fetch(url, { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("weekly.json " + r.status);
        return r.json();
      })
      .then(function (doc) {
        global.AIGAME_WEEKLY = doc;
        return mountLanding(doc);
      })
      .catch(function (err) {
        console.warn("weekly load failed", err);
        var fallback = {
          timezone: TZ,
          default_pack_id: PRIMARY_PACK,
          presets: [
            {
              bundle_id: "neon_rooftop_84023",
              pack_id: PRIMARY_PACK,
              title: "Hardcore Night — Weekly",
              goal: "Clear Hardcore Night. Shared ISO week challenge.",
              goal_zh: "完成本周 Hardcore Night。",
            },
          ],
          weeks: {},
        };
        global.AIGAME_WEEKLY = fallback;
        return mountLanding(fallback);
      });
  }

  global.AIGAME_WEEKLY_API = {
    isoWeekIdFromDate: isoWeekIdFromDate,
    resolve: resolve,
    playUrl: playUrl,
    mountLanding: mountLanding,
    loadAndMount: loadAndMount,
    defaultPackId: defaultPackId,
    PRIMARY_PACK: PRIMARY_PACK,
  };
})(window);
