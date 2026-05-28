// ============================================================
// HOPUR · admin.js — panel para publicar en el blog y enviar push.
// Requiere estar autenticado y que tu correo esté en hopur_admins.
// ============================================================

// --- Puerta de contraseña (capa ligera; la seguridad REAL es el allowlist
//     hopur_admins + RLS en Supabase). ---
(function gate() {
  var GATE_HASH = "4e47315208d2ebc3a7b554c8e13d757561193951925467f0596048092db66e76";
  var body = document.body, el = document.getElementById("gate");
  function unlock() { body.classList.remove("locked"); if (el) el.style.display = "none"; }
  if (sessionStorage.getItem("hopur_panel_ok") === "1") { unlock(); return; }
  function sha256(s) {
    if (window.crypto && crypto.subtle) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      });
    }
    return Promise.resolve("");
  }
  var form = document.getElementById("gateForm");
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    sha256(document.getElementById("gatePw").value || "").then(function (h) {
      if (h === GATE_HASH) { sessionStorage.setItem("hopur_panel_ok", "1"); unlock(); }
      else { var m = document.getElementById("gateMsg"); if (m) { m.textContent = "Contraseña incorrecta."; m.className = "msg is-show err"; } }
    });
  });
})();

(function () {
  "use strict";
  var CFG = window.HOPUR_CONFIG || {};
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); }, { passive: false });
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
  function sendPush(title, body, url) {
    return sb.auth.getSession().then(function (res) {
      var token = res && res.data && res.data.session && res.data.session.access_token;
      return fetch(CFG.SUPABASE_URL + "/functions/v1/" + (CFG.NOTIFY_FN || "notify"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": CFG.SUPABASE_KEY, "Authorization": "Bearer " + token },
        body: JSON.stringify({ title: title, body: body, url: url || "app/dashboard/#noticias" })
      }).then(function (r) {
        return r.json().then(function (j) { j = j || {}; j.__status = r.status; return j; })
          .catch(function () { return { ok: false, error: "HTTP " + r.status, __status: r.status }; });
      });
    });
  }
  function pushResult(el, res, prefix) {
    prefix = prefix || "";
    var sent = (res && res.sent) || 0, failed = (res && res.failed) || 0;
    if (res && res.error) { msg(el, prefix + "Error de la función: " + res.error, "err"); return; }
    if (sent > 0) { msg(el, prefix + "Notificación enviada a " + sent + " dispositivo(s).", "ok"); return; }
    if (failed > 0) { msg(el, prefix + "Falló el envío (" + failed + "). Detalle: " + (res.lastError || "—"), "err"); return; }
    msg(el, prefix + "Sin suscriptores activos. Activa las notificaciones en la app primero.", failed || sent ? "ok" : "err");
  }

  // ---- Sesión / autorización ----
  function checkAdmin() {
    sb.from("hopur_admins").select("email").then(function (r) {
      if (!r.error && r.data && r.data.length) { show("adApp"); loadStats(); loadPosts(); loadRegs(); }
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

  // ---- Registrados (histórico) ----
  var regCache = [];
  function regRowHtml(c) {
    var name = ((c.first_name || "") + " " + (c.last_name || "")).trim() || "(sin nombre)";
    var role = [c.cargo, c.empresa].filter(Boolean).join(" · ");
    var tel = (c.phone || "").replace(/[^\d]/g, "");
    var meta = [];
    if (c.email) meta.push('<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>');
    if (c.phone) meta.push('<a href="https://wa.me/' + esc(tel) + '" target="_blank" rel="noopener">' + esc(c.phone) + '</a>');
    if (c.created_at) meta.push(esc(new Date(c.created_at).toLocaleString("es-MX")));
    return '<div class="reg-row"><div class="top"><span class="nm">' + esc(name) + '</span><span class="src">' + esc(c.source || "web") + '</span></div>'
      + (role ? '<div class="role">' + esc(role) + '</div>' : '')
      + (meta.length ? '<div class="meta">' + meta.join("") + '</div>' : '') + '</div>';
  }
  function renderRegs(rows) {
    var box = $("regList");
    if (!rows || !rows.length) { box.innerHTML = '<p class="reg-empty">Sin registros que coincidan.</p>'; return; }
    box.innerHTML = rows.map(regRowHtml).join("");
  }
  function filterRegs() {
    var q = ($("regSearch").value || "").trim().toLowerCase();
    if (!q) { renderRegs(regCache); return; }
    renderRegs(regCache.filter(function (c) {
      return [c.first_name, c.last_name, c.cargo, c.empresa, c.email, c.phone].join(" ").toLowerCase().indexOf(q) !== -1;
    }));
  }
  function loadRegs() {
    var box = $("regList"); box.innerHTML = '<p class="reg-empty">Cargando…</p>';
    sb.from(CFG.CONTACT_TABLE || "hopur_contacts").select("*").order("created_at", { ascending: false }).limit(5000)
      .then(function (r) {
        if (r.error) { box.innerHTML = '<p class="reg-empty">No se pudo cargar (¿tu correo está en hopur_admins?): ' + esc(r.error.message) + '</p>'; return; }
        regCache = r.data || [];
        $("statRegs").textContent = regCache.length;
        filterRegs();
      })
      .catch(function () { box.innerHTML = '<p class="reg-empty">Error de conexión.</p>'; });
  }
  function csvCell(v) {
    v = (v == null ? "" : String(v));
    if (/[",\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }
  function downloadRegsCsv() {
    if (!regCache.length) { alert("Aún no hay registros para exportar."); return; }
    var head = ["Nombre", "Apellido", "Cargo", "Empresa", "Correo", "Telefono", "Origen", "Fecha"];
    var lines = [head.join(",")];
    regCache.forEach(function (c) {
      lines.push([c.first_name, c.last_name, c.cargo, c.empresa, c.email, c.phone, c.source,
        c.created_at ? new Date(c.created_at).toISOString() : ""].map(csvCell).join(","));
    });
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "registrados-hopur-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  $("regReload").addEventListener("click", loadRegs);
  $("regCsv").addEventListener("click", downloadRegsCsv);
  $("regSearch").addEventListener("input", filterRegs);

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

  // ---- Imagen de la noticia (con vista de recorte) ----
  var pPendingImg = null;
  function adDownscale(file, maxW, cb) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var sc = Math.min(1, maxW / (img.width || maxW));
      var w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      c.toBlob(function (b) { URL.revokeObjectURL(url); cb(b); }, "image/jpeg", 0.82);
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }
  if ($("pImg")) $("pImg").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    adDownscale(f, 1280, function (b) {
      if (!b) { msg($("pMsg"), "No se pudo procesar la imagen.", "err"); return; }
      pPendingImg = b; $("pImgPrevImg").src = URL.createObjectURL(b); $("pImgPrev").style.display = "block";
    });
  });

  // ---- Publicar ----
  $("pSave").addEventListener("click", function () {
    var title = ($("pTitle").value || "").trim();
    if (!title) { msg($("pMsg"), "El título es obligatorio.", "err"); return; }
    var points = ($("pPoints").value || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    var summary = ($("pSummary").value || "").trim();
    var body = $("pBody") ? ($("pBody").value || "").trim() : "";
    var btn = $("pSave"); btn.disabled = true; btn.textContent = "Publicando…";
    function publish(imageUrl) {
      sb.from(CFG.POSTS_TABLE || "hopur_posts").insert({
        title: title,
        panelist: ($("pPanelist").value || "").trim() || null,
        role: ($("pRole").value || "").trim() || null,
        summary: summary || null,
        body: body || null,
        points: points,
        image_url: imageUrl || null,
        published: true
      }).then(function (r) {
        btn.disabled = false; btn.textContent = "Publicar";
        if (r && r.error) { msg($("pMsg"), "No se pudo publicar (¿tu correo está en hopur_admins?): " + r.error.message, "err"); return; }
        var doPush = $("pPush").checked;
        ["pTitle", "pPanelist", "pRole", "pSummary", "pPoints", "pBody"].forEach(function (i) { if ($(i)) $(i).value = ""; });
        pPendingImg = null; if ($("pImg")) $("pImg").value = ""; if ($("pImgPrev")) $("pImgPrev").style.display = "none";
        loadPosts();
        if (doPush) {
          msg($("pMsg"), "Publicado. Enviando notificación…", "ok");
          sendPush(title, summary || "Nueva publicación en Yucatalent")
            .then(function (res) { pushResult($("pMsg"), res, "Publicado. "); })
            .catch(function () { msg($("pMsg"), "Publicado. La notificación no se envió (sin conexión).", "err"); });
        } else { msg($("pMsg"), "¡Publicado!", "ok"); }
      }).catch(function () { btn.disabled = false; btn.textContent = "Publicar"; msg($("pMsg"), "Error de conexión.", "err"); });
    }
    if (pPendingImg) {
      var path = "news/" + Date.now() + ".jpg";
      sb.storage.from("wall").upload(path, pPendingImg, { contentType: "image/jpeg", upsert: false }).then(function (r) {
        if (r && r.error) { btn.disabled = false; btn.textContent = "Publicar"; msg($("pMsg"), "No se pudo subir la imagen: " + r.error.message, "err"); return; }
        publish(sb.storage.from("wall").getPublicUrl(path).data.publicUrl);
      }).catch(function () { btn.disabled = false; btn.textContent = "Publicar"; msg($("pMsg"), "No se pudo subir la imagen.", "err"); });
    } else { publish(null); }
  });

  // ---- Push suelto ----
  $("nSend").addEventListener("click", function () {
    var t = ($("nTitle").value || "").trim();
    var b = ($("nBody").value || "").trim();
    if (!t) { msg($("nMsg"), "Escribe un título.", "err"); return; }
    var dest = ($("nDest") && $("nDest").value) || "app/dashboard/#noticias";
    var btn = $("nSend"); btn.disabled = true; btn.textContent = "Enviando…";
    sendPush(t, b, dest)
      .then(function (res) {
        btn.disabled = false; btn.textContent = "Enviar push";
        pushResult($("nMsg"), res);
        if (res && res.sent > 0) { $("nTitle").value = ""; $("nBody").value = ""; }
      })
      .catch(function () { btn.disabled = false; btn.textContent = "Enviar push"; msg($("nMsg"), "No se pudo enviar. Asegúrate de haber desplegado la función 'notify' y configurado las llaves VAPID.", "err"); });
  });
})();
