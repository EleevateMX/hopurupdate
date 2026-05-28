// ============================================================
// HOPUR · admin.js — panel para publicar en el blog y enviar push.
// Requiere estar autenticado y que tu correo esté en hopur_admins.
// ============================================================
(function () {
  "use strict";
  var CFG = window.HOPUR_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  var sb = null;
  if (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_KEY) {
    try { sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY); } catch (e) { sb = null; }
  }

  function show(id) { ["adLogin", "adDenied", "adApp"].forEach(function (s) { $(s).classList.toggle("hide", s !== id); }); }
  function msg(el, text, kind) { el.textContent = text; el.className = "msg is-show " + (kind || "ok"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  if (!sb) { msg($("adLoginMsg"), "No se pudo conectar con Supabase. Revisa tu conexión.", "err"); return; }

  // ---- Notificar (llama a la Edge Function "notify") ----
  function sendPush(title, body) {
    return sb.auth.getSession().then(function (res) {
      var token = res && res.data && res.data.session && res.data.session.access_token;
      return fetch(CFG.SUPABASE_URL + "/functions/v1/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": CFG.SUPABASE_KEY, "Authorization": "Bearer " + token },
        body: JSON.stringify({ title: title, body: body, url: "app/dashboard/#noticias" })
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json().catch(function () { return {}; });
      });
    });
  }

  // ---- Sesión / autorización ----
  function checkAdmin() {
    sb.from("hopur_admins").select("email").then(function (r) {
      if (!r.error && r.data && r.data.length) { show("adApp"); loadStats(); loadPosts(); }
      else { show("adDenied"); }
    }).catch(function () { show("adDenied"); });
  }
  function refresh() {
    sb.auth.getSession().then(function (res) {
      var s = res && res.data && res.data.session;
      if (s && s.user) {
        var who = $("adWho"); if (who) who.textContent = s.user.email || "";
        checkAdmin();
      } else { show("adLogin"); }
    });
  }
  sb.auth.onAuthStateChange(function () { refresh(); });
  refresh();

  // ---- Login ----
  $("adGoogle").addEventListener("click", function () {
    sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href.split("#")[0] } })
      .then(function (r) { if (r && r.error) msg($("adLoginMsg"), "No se pudo iniciar con Google.", "err"); });
  });
  $("adMagic").addEventListener("click", function () {
    var email = ($("adEmail").value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg($("adLoginMsg"), "Escribe un correo válido.", "err"); return; }
    sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: window.location.href.split("#")[0] } })
      .then(function (r) {
        if (r && r.error) msg($("adLoginMsg"), "No se pudo enviar el enlace: " + r.error.message, "err");
        else msg($("adLoginMsg"), "Te enviamos un enlace de acceso a tu correo. Ábrelo en este dispositivo.", "ok");
      });
  });
  function logout() { sb.auth.signOut().then(function () { show("adLogin"); }); }
  $("adLogout").addEventListener("click", logout);
  $("adLogout2").addEventListener("click", logout);

  // ---- Stats ----
  function loadStats() {
    sb.from(CFG.CONTACT_TABLE || "hopur_contacts").select("*", { count: "exact", head: true })
      .then(function (r) { $("statRegs").textContent = (r.count != null ? r.count : "—"); });
    sb.from(CFG.PUSH_SUB_TABLE || "hopur_push_subscriptions").select("*", { count: "exact", head: true })
      .then(function (r) { $("statSubs").textContent = (r.count != null ? r.count : "—"); });
  }

  // ---- Posts ----
  function loadPosts() {
    var box = $("adPosts");
    sb.from(CFG.POSTS_TABLE || "hopur_posts").select("*").order("published_at", { ascending: false }).limit(40)
      .then(function (r) {
        if (r.error || !r.data || !r.data.length) { box.innerHTML = '<p class="sub">Aún no hay publicaciones.</p>'; return; }
        box.innerHTML = r.data.map(function (p) {
          return '<div class="post-row"><div><b>' + esc(p.title) + '</b><small>' + esc(p.panelist || "HOPUR")
            + ' · ' + esc(new Date(p.published_at).toLocaleString("es-MX")) + '</small></div>'
            + '<button data-del="' + esc(p.id) + '">Borrar</button></div>';
        }).join("");
        box.querySelectorAll("[data-del]").forEach(function (b) {
          b.addEventListener("click", function () {
            if (!confirm("¿Borrar esta publicación?")) return;
            sb.from(CFG.POSTS_TABLE || "hopur_posts").delete().eq("id", b.getAttribute("data-del"))
              .then(function () { loadPosts(); });
          });
        });
      });
  }

  // ---- Publicar ----
  $("pSave").addEventListener("click", function () {
    var title = ($("pTitle").value || "").trim();
    if (!title) { msg($("pMsg"), "El título es obligatorio.", "err"); return; }
    var points = ($("pPoints").value || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var summary = ($("pSummary").value || "").trim();
    var btn = $("pSave"); btn.disabled = true; btn.textContent = "Publicando…";
    sb.from(CFG.POSTS_TABLE || "hopur_posts").insert({
      title: title,
      panelist: ($("pPanelist").value || "").trim() || null,
      role: ($("pRole").value || "").trim() || null,
      summary: summary || null,
      points: points,
      published: true
    }).then(function (r) {
      btn.disabled = false; btn.textContent = "Publicar";
      if (r && r.error) { msg($("pMsg"), "No se pudo publicar (¿tu correo está en hopur_admins?): " + r.error.message, "err"); return; }
      var doPush = $("pPush").checked;
      ["pTitle", "pPanelist", "pRole", "pSummary", "pPoints"].forEach(function (i) { $(i).value = ""; });
      loadPosts();
      if (doPush) {
        msg($("pMsg"), "Publicado. Enviando notificación…", "ok");
        sendPush(title, summary || "Nueva publicación en Yucatalent")
          .then(function (res) { msg($("pMsg"), "Publicado y notificado (" + ((res && res.sent) || 0) + " envíos).", "ok"); })
          .catch(function () { msg($("pMsg"), "Publicado. La notificación no se envió (¿falta desplegar la función 'notify'?).", "err"); });
      } else {
        msg($("pMsg"), "¡Publicado!", "ok");
      }
    }).catch(function () { btn.disabled = false; btn.textContent = "Publicar"; msg($("pMsg"), "Error de conexión.", "err"); });
  });

  // ---- Push suelto ----
  $("nSend").addEventListener("click", function () {
    var t = ($("nTitle").value || "").trim();
    var b = ($("nBody").value || "").trim();
    if (!t) { msg($("nMsg"), "Escribe un título.", "err"); return; }
    var btn = $("nSend"); btn.disabled = true; btn.textContent = "Enviando…";
    sendPush(t, b)
      .then(function (res) { btn.disabled = false; btn.textContent = "Enviar push"; msg($("nMsg"), "Enviado (" + ((res && res.sent) || 0) + " envíos).", "ok"); $("nTitle").value = ""; $("nBody").value = ""; })
      .catch(function () { btn.disabled = false; btn.textContent = "Enviar push"; msg($("nMsg"), "No se pudo enviar. Asegúrate de haber desplegado la función 'notify' y configurado las llaves VAPID.", "err"); });
  });
})();
