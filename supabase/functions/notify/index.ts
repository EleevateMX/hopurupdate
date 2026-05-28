// ============================================================
// HOPUR · Edge Function "notify" (PLANTILLA DE REFERENCIA)
// Envía una notificación Web Push a todas las suscripciones guardadas.
//
// Requisitos (los configuras tú, ver SETUP en el chat):
//   1) Generar claves VAPID y guardarlas como secrets:
//        supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:contacto@hopur.mx
//   2) Desplegar:  supabase functions deploy notify
//   3) Llamarla con el título/cuerpo, por ejemplo desde un trigger o manualmente:
//        POST /functions/v1/notify  { "title": "...", "body": "...", "url": "app/dashboard/#noticias" }
//
// Usa la SERVICE_ROLE (inyectada por Supabase) para leer las suscripciones.
// NO subas la service_role al repo ni al cliente.
// ============================================================
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const { title, body, url } = await req.json().catch(() => ({}));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") ?? "mailto:contacto@hopur.mx",
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );

    const { data: subs } = await supabase
      .from("hopur_push_subscriptions")
      .select("endpoint, p256dh, auth");

    const payload = JSON.stringify({
      title: title ?? "HOPUR · Yucatalent",
      body: body ?? "",
      url: url ?? "app/dashboard/#noticias",
    });

    let sent = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        sent++;
      } catch (_) {
        // Suscripción vencida: opcionalmente bórrala aquí.
      }
    }
    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
