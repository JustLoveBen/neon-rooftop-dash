/* AIGAME PWA V23 — service-worker registration + Fullscreen + Install hint.
 * Shared by landing.html and index.html.  No tokens, no signing secrets.
 *
 * SW policy (see sw.js): network-first for signed game assets, cache-first
 * only for the manifest + icons.  This file never caches anything itself.
 */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var log = function (msg) {
    try { console.log(msg); } catch (e) { /* noop */ }
  };
  var state = {
    sw: { supported: "serviceWorker" in navigator, registered: false, ready: false, controller: false, scope: "" },
    fullscreen: {
      supported: !!(root.requestFullscreen || root.webkitRequestFullscreen),
      active: false
    },
    install: { bip: false, deferred: null, installed: false }
  };
  window.AIGAME_PWA_STATE = state;

  function fsElement() {
    return doc.fullscreenElement || doc.webkitFullscreenElement || null;
  }

  function setStateText(text) {
    try {
      var el = doc.getElementById("pwa-state");
      if (el) el.textContent = text;
    } catch (e) { /* noop */ }
  }

  function focusCanvas() {
    try {
      var c = doc.getElementById("canvas");
      if (c && c.focus) c.focus({ preventScroll: true });
    } catch (e) { /* noop */ }
  }

  function toast(msg) {
    try {
      var el = doc.getElementById("aigame-pwa-toast");
      if (!el) {
        el = doc.createElement("div");
        el.id = "aigame-pwa-toast";
        el.setAttribute("role", "status");
        el.style.cssText = [
          "position:fixed", "left:50%", "bottom:calc(18px + env(safe-area-inset-bottom,0px))",
          "transform:translateX(-50%)", "z-index:2147483647", "max-width:min(92vw,30rem)",
          "padding:.6rem .9rem", "border:1px solid #4b3f86", "border-radius:10px",
          "background:rgba(8,10,20,.94)", "color:#e8f0ff", "font:13px/1.35 system-ui,sans-serif",
          "text-align:center", "pointer-events:none", "box-shadow:0 8px 28px rgba(0,0,0,.5)"
        ].join(";");
        doc.body.appendChild(el);
      }
      el.textContent = msg;
      el.hidden = false;
      clearTimeout(el.__aigameTimer);
      el.__aigameTimer = setTimeout(function () { el.hidden = true; }, 4200);
    } catch (e) { /* noop */ }
  }

  // ---------------------------------------------------------------- service worker
  function registerSW() {
    if (!state.sw.supported) {
      log("PWA_SW supported=0 reason=no_service_worker");
      return;
    }
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      state.sw.controller = !!navigator.serviceWorker.controller;
      log("PWA_SW controller=1");
    });
    navigator.serviceWorker.addEventListener("message", function (ev) {
      if (ev && ev.data && ev.data.type) log("PWA_SW message=" + ev.data.type);
    });
    navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" })
      .then(function (reg) {
        state.sw.registered = true;
        state.sw.scope = (reg && reg.scope) || "";
        log("PWA_SW registered=1 scope=" + state.sw.scope + " script=./sw.js");
        return navigator.serviceWorker.ready;
      })
      .then(function (reg) {
        state.sw.ready = !!(reg && reg.active);
        state.sw.controller = !!navigator.serviceWorker.controller;
        log("PWA_SW ready=1 active=" + (state.sw.ready ? 1 : 0) +
            " controller=" + (state.sw.controller ? 1 : 0));
        if (!state.install.bip) setStateText("PWA · SW ready · installable");
      })
      .catch(function (err) {
        log("PWA_SW registered=0 reason=" + ((err && err.message) || "error"));
      });
  }

  // ---------------------------------------------------------------- fullscreen
  function updateFullscreenButtons() {
    var active = !!fsElement();
    state.fullscreen.active = active;
    var nodes = doc.querySelectorAll("[data-pwa-fullscreen]");
    for (var i = 0; i < nodes.length; i++) {
      var compact = nodes[i].getAttribute("data-compact") === "1";
      nodes[i].setAttribute("aria-pressed", active ? "true" : "false");
      nodes[i].setAttribute("title", active ? "Exit fullscreen / 退出全屏" : "Fullscreen / 全屏");
      if (nodes[i].getAttribute("data-icon-only") === "1") {
        nodes[i].textContent = active ? "⛶" : "⛶";
      } else if (compact) {
        nodes[i].textContent = active ? "⛶ Exit / 退出" : "⛶ Full / 全屏";
      } else {
        nodes[i].textContent = active ? "⛶ Exit fullscreen / 退出全屏" : "⛶ Fullscreen / 全屏";
      }
    }
  }

  function requestFullscreen() {
    if (!state.fullscreen.supported) {
      log("PWA_FULLSCREEN supported=0 action=request reason=api_missing");
      toast("Fullscreen is not available in this browser — use Add to Home Screen / 添加到主屏幕 for app mode.");
      return Promise.resolve(false);
    }
    try {
      var p = root.requestFullscreen
        ? root.requestFullscreen({ navigationUI: "hide" })
        : Promise.resolve(root.webkitRequestFullscreen());
      return Promise.resolve(p).then(function () {
        updateFullscreenButtons();
        setStateText("Fullscreen / 全屏 · active");
        focusCanvas();
        log("PWA_FULLSCREEN supported=1 state=entered active=" + (fsElement() ? 1 : 0));
        return true;
      }).catch(function (err) {
        log("PWA_FULLSCREEN supported=1 state=error reason=" + ((err && err.message) || "request_failed"));
        toast("Fullscreen was blocked — tap again / 请再点一次全屏。");
        return false;
      });
    } catch (err) {
      log("PWA_FULLSCREEN supported=1 state=error reason=" + ((err && err.message) || "request_threw"));
      return Promise.resolve(false);
    }
  }

  function exitFullscreen() {
    var p = doc.exitFullscreen
      ? doc.exitFullscreen()
      : (doc.webkitExitFullscreen ? doc.webkitExitFullscreen() : null);
    return Promise.resolve(p).then(function () {
      updateFullscreenButtons();
      setStateText("PWA · SW ready · installable");
      focusCanvas();
      log("PWA_FULLSCREEN supported=1 state=exited active=" + (fsElement() ? 1 : 0));
      return true;
    }).catch(function (err) {
      log("PWA_FULLSCREEN supported=1 state=exit_error reason=" + ((err && err.message) || "exit_failed"));
      return false;
    });
  }

  function toggleFullscreen(source) {
    var src = source || "api";
    if (fsElement()) {
      log("PWA_FULLSCREEN action=exit via=" + src);
      return exitFullscreen();
    }
    log("PWA_FULLSCREEN action=enter via=" + src);
    return requestFullscreen();
  }

  // ---------------------------------------------------------------- install hint
  function installButtons(show) {
    var nodes = doc.querySelectorAll("[data-pwa-install]");
    for (var i = 0; i < nodes.length; i++) nodes[i].hidden = !show;
  }

  function installApp() {
    var d = state.install.deferred;
    if (!d || typeof d.prompt !== "function") {
      log("PWA_INSTALL unavailable=1 reason=no_bip");
      return Promise.resolve(false);
    }
    var choice = null;
    return Promise.resolve(d.prompt())
      .then(function () { return d.userChoice; })
      .then(function (c) {
        choice = c || null;
        log("PWA_INSTALL prompted=1 outcome=" + ((choice && choice.outcome) || "unknown"));
        if (choice && choice.outcome === "accepted") {
          state.install.installed = true;
          installButtons(false);
        }
        return true;
      })
      .catch(function (err) {
        log("PWA_INSTALL prompted=0 reason=" + ((err && err.message) || "prompt_failed"));
        return false;
      });
  }

  function initInstall() {
    var standalone = false;
    try {
      standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        window.navigator.standalone === true;
    } catch (e) { standalone = false; }
    if (standalone) log("PWA_STANDALONE mode=standalone (install hint hidden)");
    if (standalone) installButtons(false);

    window.addEventListener("beforeinstallprompt", function (ev) {
      try { ev.preventDefault(); } catch (e) { /* noop */ }
      state.install.bip = true;
      state.install.deferred = ev;
      installButtons(true);
      setStateText("PWA · install available / 可安装");
      log("PWA_INSTALL bip=1 (deferred prompt stored)");
    });
    window.addEventListener("appinstalled", function () {
      state.install.installed = true;
      state.install.deferred = null;
      installButtons(false);
      log("PWA_INSTALL appinstalled=1");
    });
    log("PWA_INSTALL hook=1 bip=" + (state.install.bip ? 1 : 0) +
        " standalone=" + (standalone ? 1 : 0));

    doc.addEventListener("click", function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;
      var fsBtn = target.closest("[data-pwa-fullscreen]");
      if (fsBtn) {
        ev.preventDefault();
        toggleFullscreen(fsBtn.id || "button");
        return;
      }
      var inBtn = target.closest("[data-pwa-install]");
      if (inBtn) {
        ev.preventDefault();
        installApp();
      }
    });
  }

  window.AIGAME_PWA = {
    state: state,
    register: registerSW,
    toggleFullscreen: toggleFullscreen,
    requestFullscreen: requestFullscreen,
    exitFullscreen: exitFullscreen,
    install: installApp,
    isFullscreen: function () { return !!fsElement(); }
  };
  // Optional, tiny bridge for a future Godot pause-panel button:
  // JavaScriptBridge.eval("window.AIGAME_PWA && window.AIGAME_PWA.toggleFullscreen('godot')")
  window.AIGAME_PWA_REQUEST_FULLSCREEN = function () { return toggleFullscreen("bridge"); };

  function boot() {
    initInstall();
    registerSW();
    updateFullscreenButtons();
    doc.addEventListener("fullscreenchange", function () {
      updateFullscreenButtons();
      setStateText(fsElement() ? "Fullscreen / 全屏 · active" : "PWA · SW ready · installable");
      log("PWA_FULLSCREEN event=fullscreenchange active=" + (fsElement() ? 1 : 0));
    });
    doc.addEventListener("webkitfullscreenchange", function () {
      updateFullscreenButtons();
    });
    if (!state.fullscreen.supported) {
      log("PWA_FULLSCREEN supported=0 reason=api_missing (iOS uses Add to Home Screen)");
    } else {
      log("PWA_FULLSCREEN supported=1 hook=1");
    }
    log("PWA_READY v=23 sw=" + (state.sw.supported ? 1 : 0) +
        " fs=" + (state.fullscreen.supported ? 1 : 0) +
        " display=" + (function () {
          try {
            if (window.matchMedia("(display-mode: fullscreen)").matches) return "fullscreen";
            if (window.matchMedia("(display-mode: standalone)").matches) return "standalone";
          } catch (e) { /* noop */ }
          return "browser";
        })());
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
