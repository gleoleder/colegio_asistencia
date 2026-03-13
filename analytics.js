// ─────────────────────────────────────────────────────────────────────────────
//  analytics.js — Registro de visitas e interacciones en Google Sheets
//  Requiere config.js cargado antes que este archivo
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── Cola de eventos pendientes (por si la API tarda) ──────────────────────
  const cola = [];
  let enviando = false;

  // ── Generar ID de sesión único ─────────────────────────────────────────────
  const SESSION_ID = (Date.now().toString(36) + Math.random().toString(36).slice(2)).toUpperCase();

  // ── Utilidades ──────────────────────────────────────────────────────────────
  function fechaHora() {
    return new Date().toLocaleString('es-ES', {
      timeZone: 'America/La_Paz',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  function dispositivoTipo() {
    const ua = navigator.userAgent;
    if (/Mobi|Android|iPhone|iPad/i.test(ua)) return 'móvil';
    if (/Tablet|iPad/i.test(ua)) return 'tablet';
    return 'escritorio';
  }

  function idioma() {
    return navigator.language || navigator.languages?.[0] || 'desconocido';
  }

  function resolucion() {
    return `${window.screen.width}×${window.screen.height}`;
  }

  function referrer() {
    return document.referrer || 'directo';
  }

  // ── Construir fila para el Sheet ───────────────────────────────────────────
  // Columnas: Fecha/Hora | Sesión | Evento | Detalle | Dispositivo | Resolución | Idioma | Referrer
  function construirFila(evento, detalle) {
    return [
      fechaHora(),
      SESSION_ID,
      evento,
      detalle || '',
      dispositivoTipo(),
      resolucion(),
      idioma(),
      referrer(),
    ];
  }

  // ── Enviar filas a Google Sheets via API REST (API Key, sin OAuth) ─────────
  async function enviarAlSheet(filas) {
    if (!filas.length) return;
    const url = `${CONFIG.SHEETS_API}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(CONFIG.SHEET_TAB)}:append?valueInputOption=USER_ENTERED&key=${CONFIG.API_KEY}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: filas }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.warn('[Analytics] Error Sheets:', resp.status, err?.error?.message || '');
      }
    } catch (e) {
      console.warn('[Analytics] Red no disponible, evento descartado:', e.message);
    }
  }

  // ── Procesar cola ──────────────────────────────────────────────────────────
  async function procesarCola() {
    if (enviando || !cola.length) return;
    enviando = true;
    // Tomar hasta 10 filas de una vez
    const lote = cola.splice(0, 10);
    await enviarAlSheet(lote);
    enviando = false;
    if (cola.length) setTimeout(procesarCola, 500);
  }

  // ── API pública ────────────────────────────────────────────────────────────
  window.Analytics = {
    /**
     * Registrar un evento.
     * @param {string} evento  — clave del evento (usar CONFIG.EVENTOS.*)
     * @param {string} detalle — información extra (nombre ciudad, tema, etc.)
     */
    registrar(evento, detalle) {
      cola.push(construirFila(evento, detalle));
      // Pequeño delay para no bloquear la interacción del usuario
      setTimeout(procesarCola, 200);
    },
  };

  // ── Registrar visita automáticamente al cargar ─────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () =>
      window.Analytics.registrar(CONFIG.EVENTOS.VISITA, window.location.pathname)
    );
  } else {
    setTimeout(() =>
      window.Analytics.registrar(CONFIG.EVENTOS.VISITA, window.location.pathname), 100
    );
  }

})();
