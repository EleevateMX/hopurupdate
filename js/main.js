/* ============================================================
   HOPUR · main.js — interacciones del sitio
   ============================================================ */
(function () {
  "use strict";
  var CFG = window.HOPUR_CONFIG || {};

  /* ---------- Año del footer ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Navbar: sombra al hacer scroll + menú móvil ---------- */
  var nav = document.getElementById("nav");
  var toggle = document.getElementById("navToggle");
  if (nav) {
    var onScroll = function () { nav.classList.toggle("is-stuck", window.scrollY > 8); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    var navLinks = document.getElementById("navLinks");
    if (navLinks) {
      navLinks.addEventListener("click", function (e) {
        if (e.target.tagName === "A") { nav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); }
      });
    }
  }

  /* ---------- Reveal al hacer scroll ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- Countdown con estado "en vivo" ---------- */
  (function countdown() {
    var start = CFG.EVENT_START ? new Date(CFG.EVENT_START) : null;
    var end = CFG.EVENT_END ? new Date(CFG.EVENT_END) : null;
    if (!start) return;

    var content = document.getElementById("eventContent");
    var live = document.getElementById("eventLive");
    var label = document.getElementById("countLabel");
    var pad = function (n) { return String(n).padStart(2, "0"); };
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = pad(v); };

    function tick() {
      var now = new Date();
      var diff = start - now;

      // Durante el evento (entre inicio y fin)
      if (diff <= 0 && end && now < end) {
        if (content) content.classList.add("is-live");
        if (live) live.classList.add("is-on");
        if (label) label.textContent = "está en vivo";
        return;
      }
      // Después del evento
      if (end && now >= end) {
        if (content) content.classList.add("is-live");
        if (live) {
          live.classList.add("is-on");
          live.querySelector("strong").textContent = "¡Gracias por asistir!";
          live.querySelector("small").textContent = "Revive el foro y conoce a los panelistas en la app.";
          var dot = live.querySelector(".dot"); if (dot) dot.style.background = "#43c7c9";
        }
        if (label) label.textContent = "ya ocurrió";
        return;
      }
      // Antes del evento: cuenta regresiva
      set("cd-days", Math.floor(diff / 86400000));
      set("cd-hours", Math.floor(diff / 3600000) % 24);
      set("cd-mins", Math.floor(diff / 60000) % 60);
      set("cd-secs", Math.floor(diff / 1000) % 60);
    }
    tick();
    setInterval(tick, 1000);
  })();

  /* ---------- Registro a Supabase ---------- */
  (function registro() {
    var form = document.getElementById("registroForm");
    if (!form) return;

    var msg = document.getElementById("formMsg");
    var submitBtn = document.getElementById("submitBtn");
    var googleBtn = document.getElementById("googleBtn");
    var fName = document.getElementById("firstName");
    var lName = document.getElementById("lastName");
    var fCargo = document.getElementById("cargo");
    var fEmpresa = document.getElementById("empresa");
    var fPhone = document.getElementById("phone");
    var fEmail = document.getElementById("email");
    var fConsent = document.getElementById("consent");
    var fHoney = document.getElementById("website");

    var sb = null, googleUserId = null, source = "web";
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_KEY) {
      try { sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY); } catch (e) { sb = null; }
    }

    function show(text, kind) {
      if (!msg) return;
      msg.textContent = text;
      msg.className = "form-msg is-show " + (kind || "ok");
    }
    function markInvalid(input, bad) { if (input) input.classList.toggle("invalid", !!bad); }

    // Si el usuario regresó de Google, precargamos nombre y correo.
    if (sb) {
      sb.auth.getSession().then(function (res) {
        var session = res && res.data && res.data.session;
        if (!session || !session.user) return;
        var u = session.user, m = u.user_metadata || {};
        source = "google";
        googleUserId = u.id;
        var full = (m.full_name || m.name || "").trim().split(" ");
        if (fName && !fName.value && full[0]) fName.value = full[0];
        if (lName && !lName.value && full.length > 1) lName.value = full.slice(1).join(" ");
        if (fEmail) {
          if (u.email) fEmail.value = u.email;          // con Google el correo viene de tu cuenta
          var emFld = fEmail.closest(".field");
          if (emFld) emFld.style.display = "none";
        }
        show("¡Listo! Completa cargo, empresa y teléfono, y envía tu registro.", "ok");
        if (fCargo) fCargo.focus();
      }).catch(function () {});
    }

    if (googleBtn) {
      googleBtn.addEventListener("click", function () {
        if (!sb) { show("El acceso con Google aún no está disponible. Regístrate con el formulario.", "err"); return; }
        sb.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.href.split("#")[0] }
        }).then(function (r) {
          if (r && r.error) show("No se pudo iniciar con Google. Usa el formulario, por favor.", "err");
        });
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (fHoney && fHoney.value) { show("¡Gracias! Tu registro fue recibido.", "ok"); return; } // bot

      var first = (fName.value || "").trim();
      var last = (lName.value || "").trim();
      var cargo = (fCargo.value || "").trim();
      var empresa = (fEmpresa.value || "").trim();
      var phone = (fPhone.value || "").trim();
      var email = (fEmail.value || "").trim();

      var phoneOk = phone.replace(/\D/g, "").length >= 7;
      var emailOk = EMAIL_RE.test(email);
      markInvalid(fName, !first);
      markInvalid(lName, !last);
      markInvalid(fCargo, !cargo);
      markInvalid(fEmpresa, !empresa);
      markInvalid(fPhone, !phoneOk);
      markInvalid(fEmail, !emailOk);
      var bad = !first || !last || !cargo || !empresa || !phoneOk || !emailOk;

      if (bad) { show("Revisa los campos marcados: nombre, apellido, cargo, empresa, teléfono y correo válidos.", "err"); return; }
      if (fConsent && !fConsent.checked) { show("Necesitamos tu autorización para contactarte.", "err"); return; }

      if (!sb) { show("No pudimos conectar con el servidor. Escríbenos por WhatsApp y te registramos.", "err"); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando…";

      sb.from(CFG.CONTACT_TABLE || "hopur_contacts").insert({
        first_name: first,
        last_name: last,
        cargo: cargo,
        empresa: empresa,
        phone: phone,
        email: email,
        source: source,
        auth_user_id: googleUserId,
        user_agent: navigator.userAgent
      }).then(function (r) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Confirmar mi registro";
        if (r && r.error && r.error.code !== "23505") {
          show("Ocurrió un error al guardar. Inténtalo de nuevo o escríbenos por WhatsApp.", "err");
          return;
        }
        // Éxito (o el correo ya estaba registrado): llevamos a la página de gracias.
        var mf = document.querySelector('link[rel="manifest"]');
        var base = mf ? mf.href.replace(/manifest\.json.*$/, "") : "./";
        window.location.href = base + "gracias/";
      }).catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Confirmar mi registro";
        show("No hay conexión. Revisa tu internet e inténtalo otra vez.", "err");
      });
    });
  })();

  /* ---------- PWA: registrar service worker ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      var m = document.querySelector('link[rel="manifest"]');
      var base = m ? m.href.replace(/manifest\.json.*$/, "") : "./";
      navigator.serviceWorker.register(base + "sw.js", { scope: base }).catch(function () {});
    });
  }
})();
