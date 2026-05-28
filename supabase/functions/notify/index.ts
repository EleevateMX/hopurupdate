// ============================================================
// HOPUR · Edge Function "notify" — Web Push NATIVO de Deno
// (sin la librería npm 'web-push', que falla en Edge Functions).
// Usa @negrel/webpush (Deno) para firmar VAPID y cifrar el mensaje.
//
// Secrets que debe tener el proyecto (Edge Functions → Secrets):
//   VAPID_JWK     -> el JSON con {publicKey, privateKey} (te lo paso en el chat)
//   VAPID_SUBJECT -> mailto:contacto@hopur.mx   (opcional)
//   (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase)
//
// Despliega con la verificación de JWT DESACTIVADA (la auth se valida aquí).
// ============================================================
import * as webpush from "jsr:@negrel/webpush@0.3.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

let serverPromise: Promise<webpush.ApplicationServer> | null = null;
function getServer() {
  if (!serverPromise) {
    serverPromise = (async () => {
      const vapidKeys = await webpush.importVapidKeys(
        JSON.parse(Deno.env.get("VAPID_JWK")!),
        { extractable: false },
      );
      return await webpush.ApplicationServer.new({
        contactInformation: Deno.env.get("VAPID_SUBJECT") ?? "mailto:contacto@hopur.mx",
        vapidKeys,
      });
    })();
  }
  return serverPromise;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Autorización: el que llama debe ser admin.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    const email = userData?.user?.email?.toLowerCase();
    if (!email) return json({ ok: false, error: "no auth" }, 401);
    const { data: isAdmin } = await admin
      .from("hopur_admins").select("email").ilike("email", email).maybeSingle();
    if (!isAdmin) return json({ ok: false, error: "forbidden" }, 403);

    const { title, body, url } = await req.json().catch(() => ({}));
    const payload = JSON.stringify({
      title: title ?? "HOPUR · Yucatalent",
      body: body ?? "",
      url: url ?? "app/dashboard/#noticias",
    });

    const server = await getServer();
    const { data: subs } = await admin
      .from("hopur_push_subscriptions").select("endpoint, p256dh, auth");

    let sent = 0, failed = 0, lastError = "";
    for (const s of subs ?? []) {
      try {
        const subscriber = server.subscribe({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        });
        await subscriber.pushTextMessage(payload, {});
        sent++;
      } catch (err) {
        failed++;
        lastError = String(err);
        const status = (err as { response?: { status?: number } })?.response?.status ?? 0;
        if (status === 404 || status === 410) {
          await admin.from("hopur_push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    }
    return json({ ok: true, sent, failed, lastError: failed ? lastError : undefined });
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
