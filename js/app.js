/* ============================================================
   HOPUR · app.js — página de instalación (/app) y dashboard
   ============================================================ */
(function () {
  "use strict";
  var CFG = window.HOPUR_CONFIG || {};

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }

  var isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  function detectOS() {
    var ua = navigator.userAgent || "";
    if (/android/i.test(ua)) return "android";
    if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && "ontouchend" in document)) return "ios";
    return "desktop";
  }

  /* ---------- Página de instalación ---------- */
  (function installPage() {
    var installBtn = document.getElementById("installBtn");
    var note = document.getElementById("installNote");
    var tabs = document.querySelectorAll(".appinstall__tab");
    var panels = document.querySelectorAll(".appinstall__panel");
    if (!installBtn && !tabs.length) return;

    var os = detectOS();
    var deferred = null;

    function selectTab(name) {
      tabs.forEach(function (t) { t.classList.toggle("is-active", t.getAttribute("data-tab") === name); });
      panels.forEach(function (p) { p.classList.toggle("is-active", p.getAttribute("data-panel") === name); });
    }
    tabs.forEach(function (t) {
      t.addEventListener("click", function () { selectTab(t.getAttribute("data-tab")); });
    });
    if (tabs.length) selectTab(os === "ios" ? "ios" : os === "android" ? "android" : "desktop");

    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferred = e;
      if (installBtn) installBtn.style.display = "";
      if (note) note.textContent = "Tu dispositivo es compatible: toca “Instalar app”.";
    });

    window.addEventListener("appinstalled", function () {
      if (note) note.textContent = "¡App instalada! Ya puedes abrirla desde tu pantalla de inicio.";
      deferred = null;
    });

    if (isStandalone && installBtn) {
      installBtn.textContent = "Abrir el panel";
      installBtn.addEventListener("click", function () { window.location.href = "/app/dashboard/"; });
    } else if (installBtn) {
      installBtn.addEventListener("click", function () {
        if (deferred) {
          deferred.prompt();
          deferred.userChoice.finally(function () { deferred = null; });
          return;
        }
        // Sin prompt nativo (iOS o ya disponible): llevamos a las instrucciones.
        if (tabs.length) selectTab(os === "ios" ? "ios" : os === "android" ? "android" : "desktop");
        var target = document.querySelector(".appinstall");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (note) {
          note.textContent = os === "ios"
            ? "En iPhone se instala desde Safari con el botón Compartir → “Añadir a pantalla de inicio”."
            : "Sigue los pasos de abajo para instalarla en tu dispositivo.";
        }
      });
    }
  })();

  /* ---------- Dashboard ---------- */
  (function dashboard() {
    var app = document.getElementById("app");
    if (!app) return;

    var tabs = document.querySelectorAll(".app-tab");
    var views = document.querySelectorAll(".app-view");
    var main = document.querySelector(".app-main");

    function switchTab(name) {
      tabs.forEach(function (t) { t.classList.toggle("is-active", t.getAttribute("data-tab") === name); });
      views.forEach(function (v) { v.classList.toggle("is-active", v.getAttribute("data-view") === name); });
      if (main) main.scrollTo ? window.scrollTo({ top: 0, behavior: "smooth" }) : window.scrollTo(0, 0);
      if (history.replaceState) history.replaceState(null, "", "#" + name);
    }

    tabs.forEach(function (t) {
      t.addEventListener("click", function () { switchTab(t.getAttribute("data-tab")); });
    });
    document.querySelectorAll("[data-goto]").forEach(function (b) {
      b.addEventListener("click", function () { switchTab(b.getAttribute("data-goto")); });
    });

    var initial = (location.hash || "").replace("#", "");
    if (initial && document.querySelector('.app-view[data-view="' + initial + '"]')) switchTab(initial);

    // Countdown + estado en vivo
    var start = CFG.EVENT_START ? new Date(CFG.EVENT_START) : null;
    var end = CFG.EVENT_END ? new Date(CFG.EVENT_END) : null;
    var count = document.getElementById("appCount");
    var live = document.getElementById("appLive");
    var liveText = document.getElementById("appLiveText");
    var pad = function (n) { return String(n).padStart(2, "0"); };
    var setv = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = pad(v); };

    function tick() {
      if (!start) return;
      var now = new Date();
      var diff = start - now;

      if (diff <= 0 && end && now < end) {
        if (count) count.classList.add("is-hidden");
        if (live) { live.setAttribute("data-state", "live"); }
        if (liveText) liveText.textContent = "En vivo hoy";
        return;
      }
      if (end && now >= end) {
        if (count) count.classList.add("is-hidden");
        if (live) live.setAttribute("data-state", "soon");
        if (liveText) liveText.textContent = "Finalizó";
        return;
      }
      if (count) count.classList.remove("is-hidden");
      if (live) live.setAttribute("data-state", "soon");
      if (liveText) liveText.textContent = "Próximamente";
      setv("ac-days", Math.floor(diff / 86400000));
      setv("ac-hours", Math.floor(diff / 3600000) % 24);
      setv("ac-mins", Math.floor(diff / 60000) % 60);
      setv("ac-secs", Math.floor(diff / 1000) % 60);
    }
    tick();
    setInterval(tick, 1000);
  })();
})();
