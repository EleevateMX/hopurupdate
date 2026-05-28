/* ============================================================
   HOPUR · app.js — página de instalación (/app) y dashboard
   ============================================================ */
(function () {
  "use strict";
  var CFG = window.HOPUR_CONFIG || {};

  // Evitar zoom accidental (pellizco) en la app.
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); }, { passive: false });

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
    var sb = window.HOPUR_SB || null;
    if (!sb && window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_KEY) {
      try { sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY); window.HOPUR_SB = sb; } catch (e) { sb = null; }
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
        var isHopur = !p.panelist || /hopur/i.test(p.panelist);
        var av = isHopur
          ? '<span class="post__av post__av--logo"><img src="../../icons/hopur-mark.svg" alt="HOPUR"></span>'
          : '<span class="post__av">' + esc(initials(p.panelist)) + '</span>';
        return '<article class="post">'
          + (p.image_url ? '<img class="post__img" src="' + esc(p.image_url) + '" alt="" loading="lazy">' : '')
          + '<div class="post__top">' + av
          + '<span class="post__who"><strong>' + esc(p.panelist || "HOPUR") + '</strong><span>' + esc(p.role || "") + '</span></span>'
          + '<span class="post__time">' + esc(timeAgo(p.published_at)) + '</span></div>'
          + '<h4>' + esc(p.title) + '</h4>'
          + (p.summary ? '<p>' + esc(p.summary) + '</p>' : '')
          + (pts.length ? '<ul>' + pts.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '')
          + (p.body ? '<button class="post__more" data-more>Ver más</button><div class="post__full">' + esc(p.body) + '</div>' : '')
          + '</article>';
      }).join("");
      feed.querySelectorAll("[data-more]").forEach(function (b) {
        b.addEventListener("click", function () {
          var full = b.nextElementSibling;
          var open = full.classList.toggle("is-open");
          b.textContent = open ? "Ver menos" : "Ver más";
        });
      });
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
    var notifPrompt = document.getElementById("notifPrompt");
    var notifPromptBtn = document.getElementById("notifPromptBtn");
    var pushSupported = ("Notification" in window) && ("serviceWorker" in navigator) && ("PushManager" in window);
    function urlB64ToUint8(s) {
      var pad = "=".repeat((4 - s.length % 4) % 4);
      var b = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
      var raw = atob(b), arr = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return arr;
    }
    var notifMsg = document.getElementById("notifMsg");
    function notifSay(t, isErr) {
      if (notifMsg) { notifMsg.style.display = ""; notifMsg.textContent = t; notifMsg.style.color = isErr ? "#c0392b" : "#1e8e6a"; }
      if (isErr) { try { alert("HOPUR · Notificaciones\n" + t); } catch (e) {} }
    }
    function sameKey(sub) {
      try {
        var cur = urlB64ToUint8(CFG.PUSH_PUBLIC_KEY);
        var k = sub && sub.options && sub.options.applicationServerKey;
        if (!k) return false;
        var a = new Uint8Array(k);
        if (a.length !== cur.length) return false;
        for (var i = 0; i < a.length; i++) if (a[i] !== cur[i]) return false;
        return true;
      } catch (e) { return false; }
    }
    function updateNotifUI() {
      var granted = pushSupported && Notification.permission === "granted";
      var show = pushSupported && !granted;   // recomendar SOLO si aún no las activó
      if (notifPrompt) notifPrompt.style.display = show ? "" : "none";
      var bar = notifBtn ? notifBtn.closest(".notif") : null;
      if (bar) bar.style.display = show ? "" : "none";
      if (notifBtn && !pushSupported) { notifBtn.textContent = "No disponible"; notifBtn.disabled = true; }
    }
    function swReady() {
      // Registramos y esperamos el SW activo, con timeout para no colgar el botón.
      var m = document.querySelector('link[rel="manifest"]');
      var base = m ? m.href.replace(/manifest\.json.*$/, "") : "./";
      var reg = navigator.serviceWorker.register(base + "sw.js", { scope: base })
        .then(function () { return navigator.serviceWorker.ready; });
      var to = new Promise(function (_, rej) { setTimeout(function () { rej(new Error("sw-timeout")); }, 12000); });
      return Promise.race([reg, to]);
    }
    function subscribePush(btn) {
      if (!pushSupported) { notifSay("Este dispositivo/navegador no soporta notificaciones push. En iPhone instala la app en la pantalla de inicio.", true); return; }
      if (!CFG.PUSH_PUBLIC_KEY) { if (btn) btn.textContent = "Pronto"; return; }
      if (btn) { btn.disabled = true; btn.textContent = "Activando…"; }
      Notification.requestPermission().then(function (perm) {
        if (perm !== "granted") {
          if (btn) { btn.disabled = false; btn.textContent = "Activar"; }
          notifSay("No diste permiso de notificaciones. Actívalo en los ajustes del navegador/app y vuelve a intentar.", true);
          updateNotifUI(); return;
        }
        return swReady().then(function (reg) {
          return reg.pushManager.getSubscription().then(function (existing) {
            if (existing && sameKey(existing)) return existing;
            var unsub = existing ? existing.unsubscribe().catch(function () {}) : Promise.resolve();
            return unsub.then(function () {
              return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(CFG.PUSH_PUBLIC_KEY) });
            });
          });
        }).then(function (sub) {
          var j = sub.toJSON();
          if (!sb) { notifSay("No hay conexión con Supabase para guardar la suscripción.", true); if (btn) { btn.disabled = false; btn.textContent = "Reintentar"; } return; }
          return sb.from(CFG.PUSH_SUB_TABLE || "hopur_push_subscriptions").upsert({
            endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent
          }, { onConflict: "endpoint", ignoreDuplicates: true }).then(function (r) {
            if (r && r.error) {
              notifSay("No se pudo guardar la suscripción: " + (r.error.message || r.error), true);
              if (btn) { btn.disabled = false; btn.textContent = "Reintentar"; }
              return;
            }
            notifSay("Listo: notificaciones activas en este dispositivo.", false);
            if (btn) { btn.disabled = true; btn.textContent = "Activadas"; }
            updateNotifUI();
          });
        });
      }).catch(function (err) {
        if (btn) { btn.disabled = false; btn.textContent = "Reintentar"; }
        var m = (err && (err.message || err.name)) || String(err);
        notifSay("No se pudo activar: " + m, true);
        try { console.error("[HOPUR] push error:", err); } catch (e) {}
      });
    }
    if (notifBtn) notifBtn.addEventListener("click", function () { subscribePush(notifBtn); });
    if (notifPromptBtn) notifPromptBtn.addEventListener("click", function () { subscribePush(notifPromptBtn); });
    updateNotifUI();

    // ----- Acceso: Google + teléfono (para quien ya tiene QR) -----
    var gBtn = document.getElementById("accessGoogle");
    var aForm = document.getElementById("accessForm");
    var aFull = document.getElementById("accessFullName");
    var aCargo = document.getElementById("accessCargo");
    var aEmpresa = document.getElementById("accessEmpresa");
    var aEmail = document.getElementById("accessEmail");
    var aPhone = document.getElementById("accessPhone");
    var aWho = document.getElementById("accessWho");
    var aName = document.getElementById("accessName");
    var aMsg = document.getElementById("accessMsg");
    var aSave = document.getElementById("accessSave");
    var gUser = null;
    function aShow(t, k) { if (!aMsg) return; aMsg.textContent = t; aMsg.className = "access__msg is-show " + (k || "ok"); }
    function hideAccess() { var a = document.getElementById("access"), t = document.getElementById("accessTitle"); if (a) a.style.display = "none"; if (t) t.style.display = "none"; }
    try { if (localStorage.getItem("hopur_confirmed") === "1") hideAccess(); } catch (e) {}
    function applyAccessSession(s) {
      if (s && s.user) {
        gUser = s.user; var m = s.user.user_metadata || {};
        if (aName) aName.textContent = (m.full_name || m.name || s.user.email || "asistente");
        if (aFull && !aFull.value) aFull.value = (m.full_name || m.name || "");
        if (aWho) aWho.classList.add("is-on");
        if (aEmail) aEmail.style.display = "none";   // con Google el correo viene de tu cuenta
        if (gBtn) gBtn.style.display = "none";
        if (aSave) aSave.textContent = "Confirmar mi asistencia";
      } else {
        gUser = null;
        if (aWho) aWho.classList.remove("is-on");
        if (aEmail) aEmail.style.display = "";
        if (gBtn) gBtn.style.display = "";
        if (aSave) aSave.textContent = "Enviar mi registro";
      }
    }
    if (sb && gBtn) {
      sb.auth.getSession().then(function (res) { applyAccessSession(res && res.data && res.data.session); }).catch(function () {});
      sb.auth.onAuthStateChange(function (_e, session) { applyAccessSession(session); });
      gBtn.addEventListener("click", function () {
        sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href.split("#")[0] } })
          .then(function (r) { if (r && r.error) aShow("No se pudo iniciar con Google. Intenta de nuevo.", "err"); });
      });
    } else if (gBtn) {
      gBtn.addEventListener("click", function () { aShow("Inicio con Google no disponible aún.", "err"); });
    }
    if (aForm) {
      var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      aForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!sb) { aShow("No hay conexión con el servidor. Intenta de nuevo.", "err"); return; }
        var fullName = (aFull && aFull.value || "").trim();
        var cargo = (aCargo && aCargo.value || "").trim();
        var empresa = (aEmpresa && aEmpresa.value || "").trim();
        var phone = (aPhone && aPhone.value || "").trim();
        var email = gUser ? (gUser.email || "") : (aEmail && aEmail.value || "").trim();

        if (fullName.split(/\s+/).filter(Boolean).length < 2) { aShow("Escribe tu nombre completo (nombre y apellido).", "err"); return; }
        if (!cargo) { aShow("Escribe tu cargo o puesto.", "err"); return; }
        if (!empresa) { aShow("Escribe tu empresa u organización.", "err"); return; }
        if (phone.replace(/\D/g, "").length < 7) { aShow("Escribe un teléfono válido.", "err"); return; }
        if (!EMAIL_RE.test(email)) { aShow(gUser ? "No pudimos leer tu correo de Google." : "Escribe un correo válido.", "err"); return; }

        var parts = fullName.split(/\s+/).filter(Boolean);
        var btn = aSave, prev = btn ? btn.textContent : ""; if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
        sb.from(CFG.CONTACT_TABLE || "hopur_contacts").insert({
          first_name: parts[0],
          last_name: parts.slice(1).join(" "),
          cargo: cargo,
          empresa: empresa,
          phone: phone,
          email: email,
          source: "app",
          auth_user_id: gUser ? gUser.id : null,
          user_agent: navigator.userAgent
        }).then(function (r) {
          if (btn) { btn.disabled = false; btn.textContent = prev; }
          if (r && r.error && r.error.code !== "23505") { aShow("No se pudo guardar. Intenta de nuevo.", "err"); return; }
          aShow((r && r.error) ? "Ya estabas registrado. ¡Te esperamos!" : "¡Listo! Tu registro quedó confirmado.", "ok");
          try { localStorage.setItem("hopur_confirmed", "1"); } catch (e) {}
          setTimeout(hideAccess, 1000);
        }).catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = prev; }
          aShow("Sin conexión. Intenta de nuevo.", "err");
        });
      });
    }
  })();
})();
