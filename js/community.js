// ============================================================
// HOPUR · community.js — Muro de comunidad (posts, fotos,
// reacciones y comentarios). Requiere sesión (Google).
// ============================================================
(function () {
  "use strict";
  if (!document.getElementById("cwApp")) return;

  var CFG = window.HOPUR_CONFIG || {};
  var sb = (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_KEY)
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY) : null;
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function initials(n) { n = (n || "?").trim(); var p = n.split(/\s+/); return ((p[0][0] || "?") + (p[1] ? p[1][0] : "")).toUpperCase(); }
  function timeAgo(d) {
    var t = new Date(d).getTime(); if (isNaN(t)) return "";
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return "ahora"; if (s < 3600) return Math.floor(s / 60) + " min";
    if (s < 86400) return Math.floor(s / 3600) + " h";
    return new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
  }
  function avatar(name, url, cls) {
    cls = cls || "cw-av";
    return url ? '<div class="' + cls + '"><img src="' + esc(url) + '" alt=""></div>'
               : '<div class="' + cls + '">' + esc(initials(name)) + '</div>';
  }
  function setMsg(t, k) { var m = $("cwMsg"); if (!m) return; m.textContent = t; m.className = "form-msg is-show " + (k || "ok"); }

  var me = null, pendingImg = null;
  if (!sb) { return; }

  function renderMe() {
    if (!me) { $("cwAuth").style.display = ""; $("cwApp").style.display = "none"; return; }
    $("cwAuth").style.display = "none"; $("cwApp").style.display = "";
    $("cwMeName").textContent = me.name || "Asistente";
    $("cwMeMail").textContent = me.email || "";
    $("cwMeAv").innerHTML = me.avatar ? '<img src="' + esc(me.avatar) + '" alt="">' : esc(initials(me.name || me.email));
  }
  function loadSession() {
    sb.auth.getSession().then(function (res) {
      var s = res && res.data && res.data.session;
      if (s && s.user) {
        var u = s.user, m = u.user_metadata || {};
        me = { id: u.id, name: (m.full_name || m.name || u.email), email: u.email, avatar: (m.avatar_url || m.picture || "") };
      } else me = null;
      renderMe();
      if (me) loadFeed();
    });
  }
  sb.auth.onAuthStateChange(function () { loadSession(); });
  loadSession();

  $("cwGoogle").addEventListener("click", function () {
    sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href.split("#")[0] + "#comunidad" } });
  });
  $("cwLogout").addEventListener("click", function () { sb.auth.signOut().then(function () { me = null; renderMe(); }); });

  // ---- Imagen (se reduce antes de subir) ----
  function downscale(file, maxW, cb) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var scale = Math.min(1, maxW / (img.width || maxW));
      var w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      c.toBlob(function (b) { URL.revokeObjectURL(url); cb(b); }, "image/jpeg", 0.82);
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }
  $("cwFile").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    downscale(f, 1280, function (b) {
      if (!b) { setMsg("No se pudo procesar la imagen.", "err"); return; }
      pendingImg = b; $("cwPreviewImg").src = URL.createObjectURL(b); $("cwPreview").classList.add("is-on");
    });
  });
  $("cwPreviewX").addEventListener("click", function () {
    pendingImg = null; $("cwFile").value = ""; $("cwPreview").classList.remove("is-on");
  });

  // ---- Publicar ----
  $("cwPost").addEventListener("click", function () {
    if (!me) { setMsg("Inicia sesión primero.", "err"); return; }
    var body = ($("cwText").value || "").trim();
    if (!body && !pendingImg) { setMsg("Escribe algo o agrega una foto.", "err"); return; }
    var btn = $("cwPost"); btn.disabled = true; btn.textContent = "Publicando…";
    function insert(imageUrl) {
      sb.from("hopur_wall_posts").insert({
        author_id: me.id, author_name: me.name, author_avatar: me.avatar || null,
        body: body || null, image_url: imageUrl || null
      }).then(function (r) {
        btn.disabled = false; btn.textContent = "Publicar";
        if (r && r.error) { setMsg("No se pudo publicar: " + r.error.message, "err"); return; }
        $("cwText").value = ""; pendingImg = null; $("cwFile").value = ""; $("cwPreview").classList.remove("is-on");
        setMsg("¡Publicado!", "ok"); loadFeed();
      }).catch(function () { btn.disabled = false; btn.textContent = "Publicar"; setMsg("Error de conexión.", "err"); });
    }
    if (pendingImg) {
      var path = me.id + "/" + Date.now() + ".jpg";
      sb.storage.from("wall").upload(path, pendingImg, { contentType: "image/jpeg", upsert: false }).then(function (r) {
        if (r && r.error) { btn.disabled = false; btn.textContent = "Publicar"; setMsg("No se pudo subir la foto: " + r.error.message, "err"); return; }
        insert(sb.storage.from("wall").getPublicUrl(path).data.publicUrl);
      }).catch(function () { btn.disabled = false; btn.textContent = "Publicar"; setMsg("No se pudo subir la foto.", "err"); });
    } else insert(null);
  });

  // ---- Feed ----
  function loadFeed() {
    var box = $("cwFeed");
    sb.from("hopur_wall_posts").select("*").order("created_at", { ascending: false }).limit(40).then(function (r) {
      if (r.error) { box.innerHTML = '<p class="cw-empty">No se pudo cargar el muro.</p>'; return; }
      var posts = r.data || [];
      if (!posts.length) { box.innerHTML = '<p class="cw-empty">Aún no hay publicaciones. ¡Sé el primero en compartir!</p>'; return; }
      var ids = posts.map(function (p) { return p.id; });
      Promise.all([
        sb.from("hopur_wall_reactions").select("post_id,user_id,type").in("post_id", ids),
        sb.from("hopur_wall_comments").select("post_id").in("post_id", ids)
      ]).then(function (res) {
        var rx = (res[0] && res[0].data) || [], cm = (res[1] && res[1].data) || [];
        var rmap = {}, cmap = {};
        rx.forEach(function (x) {
          var o = rmap[x.post_id] || (rmap[x.post_id] = { like: 0, love: 0, mine: null });
          if (x.type === "love") o.love++; else o.like++;
          if (me && x.user_id === me.id) o.mine = x.type;
        });
        cm.forEach(function (x) { cmap[x.post_id] = (cmap[x.post_id] || 0) + 1; });
        box.innerHTML = posts.map(function (p) { return postHtml(p, rmap[p.id] || { like: 0, love: 0, mine: null }, cmap[p.id] || 0); }).join("");
        wire(box);
      });
    });
  }
  function postHtml(p, rx, ccount) {
    return '<article class="app-card cw-post" data-id="' + esc(p.id) + '">'
      + '<div class="post__top">' + avatar(p.author_name, p.author_avatar, "post__av")
      + '<span class="post__who"><strong>' + esc(p.author_name || "Asistente") + '</strong><span>' + esc(timeAgo(p.created_at)) + '</span></span></div>'
      + (p.body ? '<p class="cw-post__body">' + esc(p.body) + '</p>' : '')
      + (p.image_url ? '<img class="cw-post__img" src="' + esc(p.image_url) + '" alt="" loading="lazy">' : '')
      + '<div class="cw-actions">'
      + '<button class="cw-react' + (rx.mine === "like" ? " on" : "") + '" data-act="like"><svg class="ic"><use href="#i-like"/></svg><span>' + rx.like + '</span></button>'
      + '<button class="cw-react love' + (rx.mine === "love" ? " on" : "") + '" data-act="love"><svg class="ic"><use href="#i-heart"/></svg><span>' + rx.love + '</span></button>'
      + '<button class="cw-react" data-act="cmt"><svg class="ic"><use href="#i-comment"/></svg><span>' + ccount + '</span></button>'
      + '</div><div class="cw-comments" data-comments></div></article>';
  }
  function wire(box) {
    box.querySelectorAll(".cw-post").forEach(function (el) {
      var id = el.getAttribute("data-id");
      el.querySelectorAll("[data-act]").forEach(function (b) {
        b.addEventListener("click", function () {
          var act = b.getAttribute("data-act");
          if (act === "cmt") toggleComments(el, id);
          else react(id, act);
        });
      });
    });
  }

  // ---- Reacciones ----
  function react(postId, type) {
    if (!me) return;
    sb.from("hopur_wall_reactions").select("type").eq("post_id", postId).eq("user_id", me.id).maybeSingle().then(function (r) {
      var cur = r.data ? r.data.type : null, op;
      if (cur === type) op = sb.from("hopur_wall_reactions").delete().eq("post_id", postId).eq("user_id", me.id);
      else if (cur) op = sb.from("hopur_wall_reactions").update({ type: type }).eq("post_id", postId).eq("user_id", me.id);
      else op = sb.from("hopur_wall_reactions").insert({ post_id: postId, user_id: me.id, type: type });
      op.then(function () { refreshReactions(postId); });
    });
  }
  function refreshReactions(postId) {
    sb.from("hopur_wall_reactions").select("user_id,type").eq("post_id", postId).then(function (r) {
      var like = 0, love = 0, mine = null;
      (r.data || []).forEach(function (x) { if (x.type === "love") love++; else like++; if (me && x.user_id === me.id) mine = x.type; });
      var el = $("cwFeed").querySelector('.cw-post[data-id="' + postId + '"]'); if (!el) return;
      var lb = el.querySelector('[data-act="like"]'), lv = el.querySelector('[data-act="love"]');
      lb.querySelector("span").textContent = like; lv.querySelector("span").textContent = love;
      lb.className = "cw-react" + (mine === "like" ? " on" : "");
      lv.className = "cw-react love" + (mine === "love" ? " on" : "");
    });
  }

  // ---- Comentarios ----
  function toggleComments(el, postId) {
    var box = el.querySelector("[data-comments]");
    if (box.classList.contains("is-open")) { box.classList.remove("is-open"); box.innerHTML = ""; return; }
    box.classList.add("is-open"); loadComments(box, postId);
  }
  function loadComments(box, postId) {
    box.innerHTML = '<p class="cw-empty" style="padding:8px 0">Cargando…</p>';
    sb.from("hopur_wall_comments").select("*").eq("post_id", postId).order("created_at", { ascending: true }).then(function (r) {
      var list = r.data || [];
      var html = list.map(function (c) {
        return '<div class="cw-comment">' + avatar(c.author_name, c.author_avatar, "cw-av")
          + '<div class="bx"><strong>' + esc(c.author_name || "Asistente") + '</strong><span>' + esc(c.body) + '</span></div></div>';
      }).join("");
      html += '<div class="cw-cbox"><input type="text" placeholder="Escribe un comentario…" data-cinput><button data-csend><svg class="ic"><use href="#i-send"/></svg></button></div>';
      box.innerHTML = html;
      var input = box.querySelector("[data-cinput]"), send = box.querySelector("[data-csend]");
      function submit() {
        var t = (input.value || "").trim(); if (!t || !me) return;
        send.disabled = true;
        sb.from("hopur_wall_comments").insert({
          post_id: postId, author_id: me.id, author_name: me.name, author_avatar: me.avatar || null, body: t
        }).then(function (rr) {
          send.disabled = false;
          if (rr && rr.error) return;
          var post = box.closest(".cw-post");
          if (post) { var cs = post.querySelector('[data-act="cmt"] span'); if (cs) cs.textContent = (parseInt(cs.textContent || "0", 10) + 1); }
          loadComments(box, postId);
        });
      }
      send.addEventListener("click", submit);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    });
  }
})();
