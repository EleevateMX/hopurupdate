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
      var m = document.querySelector('link[rel="manifest"]');
      var base = m ? m.href.replace(/manifest\.json.*$/, "") : "./";
      navigator.serviceWorker.register(base + "sw.js", { scope: base }).catch(function () {});
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
      installBtn.addEventListener("click", function () { window.location.href = "dashboard/"; });
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

      if ((diff <= 0 && end && now < end) || (end && now >= end)) {
        if (count) count.classList.add("is-hidden");
        return;
      }
      if (count) count.classList.remove("is-hidden");
      setv("ac-days", Math.floor(diff / 86400000));
      setv("ac-hours", Math.floor(diff / 3600000) % 24);
      setv("ac-mins", Math.floor(diff / 60000) % 60);
      setv("ac-secs", Math.floor(diff / 1000) % 60);
    }
    tick();
    setInterval(tick, 1000);
  })();

  /* ---------- Supabase: blog, notificaciones y acceso (Google) ---------- */
  (function appModules() {
    if (!document.getElementById("app")) return;
    var sb = null;
    if (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_KEY) {
      try { sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY); } catch (e) { sb = null; }
    }

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    }

    // ----- Blog / Última hora -----
    var feed = document.getElementById("newsFeed");
    function timeAgo(d) {
      var t = new Date(d).getTime(); if (isNaN(t)) return "";
      var s = Math.floor((Date.now() - t) / 1000);
      if (s < 60) return "ahora";
      if (s < 3600) return Math.floor(s / 60) + " min";
      if (s < 86400) return Math.floor(s / 3600) + " h";
      return new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
    }
    function initials(n) {
      n = (n || "H").trim(); var p = n.split(/\s+/);
      return ((p[0][0] || "H") + (p[1] ? p[1][0] : "")).toUpperCase();
    }
    function renderPosts(rows) {
      if (!feed) return;
      if (!rows || !rows.length) {
        feed.innerHTML = '<div class="feed__empty"><svg class="ic"><use href="#i-news"/></svg>Aún no hay publicaciones. Vuelve pronto para la última hora del foro.</div>';
        return;
      }
      feed.innerHTML = rows.map(function (p) {
        var pts = Array.isArray(p.points) ? p.points : [];
        return '<article class="post">'
          + '<div class="post__top"><span class="post__av">' + esc(initials(p.panelist || p.title)) + '</span>'
          + '<span class="post__who"><strong>' + esc(p.panelist || "HOPUR") + '</strong><span>' + esc(p.role || "") + '</span></span>'
          + '<span class="post__time">' + esc(timeAgo(p.published_at)) + '</span></div>'
          + '<h4>' + esc(p.title) + '</h4>'
          + (p.summary ? '<p>' + esc(p.summary) + '</p>' : '')
          + (pts.length ? '<ul>' + pts.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '')
          + '</article>';
      }).join("");
    }
    if (feed) {
      if (!sb) {
        feed.innerHTML = '<div class="feed__empty"><svg class="ic"><use href="#i-news"/></svg>No se pudo conectar. Revisa tu internet.</div>';
      } else {
        sb.from(CFG.POSTS_TABLE || "hopur_posts").select("*").order("published_at", { ascending: false }).limit(30)
          .then(function (r) { renderPosts(r.error ? [] : r.data); })
          .catch(function () { renderPosts([]); });
      }
    }

    // ----- Notificaciones push -----
    var notifBtn = document.getElementById("notifBtn");
    function urlB64ToUint8(s) {
      var pad = "=".repeat((4 - s.length % 4) % 4);
      var b = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
      var raw = atob(b), arr = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return arr;
    }
    if (notifBtn) {
      var pushOk = ("Notification" in window) && ("serviceWorker" in navigator) && ("PushManager" in window);
      if (!pushOk) { notifBtn.textContent = "No disponible"; notifBtn.disabled = true; }
      else if (Notification.permission === "granted") { var bar = notifBtn.closest(".notif"); if (bar) bar.style.display = "none"; }
      notifBtn.addEventListener("click", function () {
        if (!CFG.PUSH_PUBLIC_KEY) { notifBtn.textContent = "Pronto"; return; }
        Notification.requestPermission().then(function (perm) {
          if (perm !== "granted") return;
          navigator.serviceWorker.ready.then(function (reg) {
            return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(CFG.PUSH_PUBLIC_KEY) });
          }).then(function (sub) {
            var j = sub.toJSON();
            if (sb) sb.from(CFG.PUSH_SUB_TABLE || "hopur_push_subscriptions").insert({
              endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent
            });
            notifBtn.textContent = "Activadas"; notifBtn.disabled = true;
          }).catch(function () { notifBtn.textContent = "Reintentar"; });
        });
      });
    }

    // ----- Acceso: Google + teléfono (para quien ya tiene QR) -----
    var gBtn = document.getElementById("accessGoogle");
    var aForm = document.getElementById("accessForm");
    var aPhone = document.getElementById("accessPhone");
    var aWho = document.getElementById("accessWho");
    var aName = document.getElementById("accessName");
    var aMsg = document.getElementById("accessMsg");
    var gUser = null;
    function aShow(t, k) { if (!aMsg) return; aMsg.textContent = t; aMsg.className = "access__msg is-show " + (k || "ok"); }
    if (sb && gBtn) {
      sb.auth.getSession().then(function (res) {
        var s = res && res.data && res.data.session;
        if (s && s.user) {
          gUser = s.user; var m = s.user.user_metadata || {};
          if (aName) aName.textContent = (m.full_name || m.name || s.user.email || "asistente");
          if (aWho) aWho.classList.add("is-on");
          if (aForm) aForm.style.display = "block";
          gBtn.style.display = "none";
        }
      }).catch(function () {});
      gBtn.addEventListener("click", function () {
        sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href.split("#")[0] } })
          .then(function (r) { if (r && r.error) aShow("No se pudo iniciar con Google. Usa el registro del sitio.", "err"); });
      });
    } else if (gBtn) {
      gBtn.addEventListener("click", function () { aShow("Inicio con Google no disponible aún. Usa el registro del sitio.", "err"); });
    }
    if (aForm) {
      aForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var phone = (aPhone.value || "").trim();
        if (phone.replace(/\D/g, "").length < 7) { aShow("Escribe un teléfono válido.", "err"); return; }
        if (!sb || !gUser) { aShow("Primero inicia con Google.", "err"); return; }
        var m = gUser.user_metadata || {}, full = (m.full_name || m.name || "").trim().split(/\s+/);
        var btn = document.getElementById("accessSave"); if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
        sb.from(CFG.CONTACT_TABLE || "hopur_contacts").insert({
          first_name: full[0] || (m.name || "Asistente"),
          last_name: full.slice(1).join(" ") || ".",
          phone: phone,
          email: gUser.email || "",
          source: "app",
          auth_user_id: gUser.id,
          user_agent: navigator.userAgent
        }).then(function (r) {
          if (btn) { btn.disabled = false; btn.textContent = "Confirmar mi teléfono"; }
          if (r && r.error) {
            if (r.error.code === "23505") { aShow("Ya estabas registrado. ¡Te esperamos!", "ok"); }
            else { aShow("No se pudo guardar. Intenta de nuevo.", "err"); }
            return;
          }
          aShow("¡Listo! Tu asistencia quedó confirmada.", "ok");
          aForm.style.display = "none";
        }).catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = "Confirmar mi teléfono"; }
          aShow("Sin conexión. Intenta de nuevo.", "err");
        });
      });
    }
  })();
})();
