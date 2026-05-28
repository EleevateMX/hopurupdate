// ============================================================
// HOPUR - Configuración pública del sitio.
// La SUPABASE_KEY es la llave "publishable" (pública): es SEGURO
// exponerla en el navegador. NUNCA pongas aquí la service_role key.
// ============================================================
window.HOPUR_CONFIG = {
  SUPABASE_URL: "https://urtduigdlkwbopczlbhr.supabase.co",
  SUPABASE_KEY: "sb_publishable_B8-1JSl7ix4X0j1xz1EduA_DqWMXhvV",

  // Tablas (prefijo hopur_ para no chocar con otros proyectos).
  CONTACT_TABLE: "hopur_contacts",
  POSTS_TABLE: "hopur_posts",
  PUSH_SUB_TABLE: "hopur_push_subscriptions",

  // Clave pública VAPID para notificaciones push (es pública, va en el cliente).
  PUSH_PUBLIC_KEY: "BLIcK2qqPcuVL1inJ5zaCpMnaRMqrWVeO0BNgbn1XAM16_tH-Z7xc9bPyo0T5RR31YE0BmAvSdewhxQI6Ki38p4",

  // Fechas del foro Yucatalent (zona horaria de Yucatán, UTC-6).
  EVENT_START: "2026-05-27T09:00:00-06:00",
  EVENT_END: "2026-05-28T19:00:00-06:00",

  WHATSAPP: "529992507203",
  EMAIL: "contacto@hopur.mx"
};
