// ============================================================
// HOPUR · Edge Function "notify"
// Envía una notificación Web Push a todas las suscripciones guardadas.
// Solo la pueden invocar administradores (correo en hopur_admins).
//
// Configuración (una sola vez):
//   supabase secrets set \
//     VAPID_PUBLIC_KEY=BLIcK2qqPcuVL1inJ5zaCpMnaRMqrWVeO0BNgbn1XAM16_tH-Z7xc9bPyo0T5RR31YE0BmAvSdewhxQI6Ki38p4 \
//     VAPID_PRIVATE_KEY=*** (la privada que te compartí en el chat) *** \
//     VAPID_SUBJECT=mailto:contacto@hopur.mx
//   supabase functions deploy notify
// ============================================================
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Autorización: el que llama debe ser admin ---
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    const email = userData?.user?.email?.toLowerCase();
    if (!email) return json({ ok: false, error: "no auth" }, 401);

    const { data: isAdmin } = await admin
      .from("hopur_admins").select("email").ilike("email", email).maybeSingle();
    if (!isAdmin) return json({ ok: false, error: "forbidden" }, 403);

    // --- Envío ---
    const { title, body, url } = await req.json().catch(() => ({}));
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") ?? "mailto:contacto@hopur.mx",
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );

    const { data: subs } = await admin
      .from("hopur_push_subscriptions").select("endpoint, p256dh, auth");

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
      } catch (err) {
        // 404/410 = suscripción vencida: la limpiamos.
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await admin.from("hopur_push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    }
    return json({ ok: true, sent });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
