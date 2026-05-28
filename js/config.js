// ============================================================
// HOPUR - Configuración pública del sitio.
// La SUPABASE_KEY es la llave "publishable" (pública): es SEGURO
// exponerla en el navegador. NUNCA pongas aquí la service_role key.
// ============================================================
window.HOPUR_CONFIG = {
  SUPABASE_URL: "https://urtduigdlkwbopczlbhr.supabase.co",
  SUPABASE_KEY: "sb_publishable_B8-1JSl7ix4X0j1xz1EduA_DqWMXhvV",

  // Tabla de registro (prefijo hopur_ para no chocar con otros proyectos).
  CONTACT_TABLE: "hopur_contacts",

  // Fechas del foro Yucatalent (zona horaria de Yucatán, UTC-6).
  EVENT_START: "2026-05-27T09:00:00-06:00",
  EVENT_END: "2026-05-28T19:00:00-06:00",

  WHATSAPP: "529992507203",
  EMAIL: "contacto@hopur.mx"
};
