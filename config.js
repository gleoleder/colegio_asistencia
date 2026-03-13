// ─────────────────────────────────────────────────────────────────────────────
//  config.js — Calles de la Ciudad
//  Credenciales de Google Sheets para registro de visitas e interacciones
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  // Google OAuth 2.0 Client ID
  CLIENT_ID: '814005655098-8csk41qts3okv4b2fjnq7ls4qc2kq0vc.apps.googleusercontent.com',

  // Google Sheets API Key (acceso de solo lectura/escritura sin OAuth completo)
  API_KEY: 'AIzaSyAOhGTjJXHhuUhqf1g2DPCla59xNzftb-Q',

  // ID del Google Sheet donde se guardan los registros
  SHEET_ID: '18CgbMS4y3QkP4af8bk7t4Xk8dn40-NB8Xj1bLnRTVik',

  // Nombre de la pestaña dentro del Sheet
  SHEET_TAB: 'Visitas',

  // URL base de la API de Google Sheets
  SHEETS_API: 'https://sheets.googleapis.com/v4/spreadsheets',

  // Eventos que se registran
  EVENTOS: {
    VISITA:      'visita',        // carga inicial de la página
    BUSQUEDA:    'busqueda',      // usuario busca una ciudad
    MAPA_CARGADO:'mapa_cargado',  // mapa renderizado exitosamente
    EXPORT_PNG:  'export_png',    // descarga PNG
    EXPORT_SVG:  'export_svg',    // descarga SVG
    CAMBIO_TEMA: 'cambio_tema',   // cambia tema oscuro/nocturno
    CAMBIO_COLOR:'cambio_color',  // edita un color manualmente
  },
};
