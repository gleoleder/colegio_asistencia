# 🗺️ Calles de la Ciudad
**Generador de mapas artísticos vectoriales** — por Leonardo Cabrera

Renderiza cada calle de cualquier ciudad del mundo como un mapa minimalista exportable en PNG y SVG. Datos de OpenStreetMap, renderizado con WebGL.

---

## 📁 Estructura de archivos

```
city-roads/
├── index.html      ← Aplicación principal
├── vendor.js       ← Librerías (w-gl + d3-geo empaquetadas)
├── config.js       ← Credenciales y configuración
├── analytics.js    ← Módulo de registro de visitas
└── README.md       ← Este archivo
```

---

## 🚀 Despliegue

Sube los **4 archivos** a cualquier hosting estático:

| Plataforma | Pasos |
|---|---|
| **GitHub Pages** | Sube a un repo → Settings → Pages → Deploy from branch |
| **Netlify** | Arrastra la carpeta a [app.netlify.com/drop](https://app.netlify.com/drop) |
| **Vercel** | `npx vercel` en la carpeta |
| **Local** | Abre `index.html` en el navegador (Chrome/Edge recomendado) |

> ⚠️ Para analytics local necesitas un servidor HTTP: `npx serve .`

---

## 📊 Sistema de Analytics — Google Sheets

### Cómo funciona

Cada interacción se registra automáticamente en Google Sheets usando la API REST con API Key. No requiere login ni OAuth del usuario.

### Credenciales actuales (`config.js`)

```javascript
const CONFIG = {
  CLIENT_ID: '814005655098-8csk41qts3okv4b2fjnq7ls4qc2kq0vc.apps.googleusercontent.com',
  API_KEY:   'AIzaSyAOhGTjJXHhuUhqf1g2DPCla59xNzftb-Q',
  SHEET_ID:  '18CgbMS4y3QkP4af8bk7t4Xk8dn40-NB8Xj1bLnRTVik',
  SHEET_TAB: 'Visitas',
};
```

### Preparar el Google Sheet

1. Abre el Sheet con el ID configurado
2. Renombra la primera hoja como **`Visitas`**
3. Agrega la fila de encabezados en la fila 1:

```
A: Fecha/Hora  |  B: Sesión  |  C: Evento  |  D: Detalle
E: Dispositivo |  F: Resolución  |  G: Idioma  |  H: Referrer
```

4. En **Google Cloud Console**:
   - Activa la **Google Sheets API**
   - Restringe la API Key al dominio de tu sitio
   - Comparte el Sheet con permisos de **editor** para la cuenta asociada, o ponlo como "cualquiera con el enlace puede editar"

### Eventos que se registran

| Evento | Cuándo |
|---|---|
| `visita` | Carga inicial de la página |
| `busqueda` | Usuario busca una ciudad |
| `mapa_cargado` | Mapa renderizado exitosamente |
| `export_png` | Descarga de imagen PNG |
| `export_svg` | Descarga de vector SVG |
| `cambio_tema` | Cambia entre Oscuro / Nocturno |
| `cambio_color` | Edita un color manualmente |

### Columnas por cada registro

| Columna | Ejemplo |
|---|---|
| Fecha/Hora | `13/03/2026, 14:32:05` |
| Sesión | `M5X2K9APQR` (único por visita) |
| Evento | `mapa_cargado` |
| Detalle | `La Paz` |
| Dispositivo | `móvil` / `escritorio` / `tablet` |
| Resolución | `390×844` |
| Idioma | `es-BO` |
| Referrer | `https://google.com` / `directo` |

---

## 📱 Compatibilidad de dispositivos

| Dispositivo | Soporte |
|---|---|
| Desktop Chrome / Edge / Firefox | ✅ Completo |
| Desktop Safari (macOS) | ✅ Completo |
| iPhone / iPad (Safari) | ✅ Completo — selector de color nativo iOS |
| Android Chrome | ✅ Completo |
| Android Firefox | ✅ Completo |
| Pantallas HiDPI / Retina | ✅ Canvas se escala con `devicePixelRatio` |
| Multipantalla / Ultra-wide | ✅ Layout fluido con `clamp()` y media queries |
| Orientación landscape (móvil) | ✅ Hero comprimido, panel scrolleable |
| Notch / Dynamic Island | ✅ `safe-area-inset` aplicado a todos los elementos |

---

## 🎨 Temas disponibles

| Tema | Fondo | Color de calles |
|---|---|---|
| **Oscuro** | `#08080d` negro | `#e8ff47` lima eléctrico |
| **Nocturno** | `#0a1628` azul marino | `#64c8ff` celeste |

Los colores son personalizables individualmente desde el panel de ajustes.

---

## 🛠️ Tecnologías

| Módulo | Uso |
|---|---|
| [w-gl](https://github.com/anvaka/w-gl) | Renderizado WebGL de líneas vectoriales |
| [d3-geo](https://github.com/d3/d3-geo) | Proyección cartográfica Mercator |
| [Nominatim](https://nominatim.org/) | Geocodificación (nombre → coordenadas) |
| [Overpass API](https://overpass-api.de/) | Datos de calles de OpenStreetMap |
| [Google Sheets API v4](https://developers.google.com/sheets/api) | Almacenamiento de analytics |

---

## 📤 Exportación

### PNG
- Resolución nativa del canvas (incluye `devicePixelRatio`)
- Incluye nombre de ciudad y crédito de datos

### SVG
- Vector puro escalable infinitamente
- Listo para Illustrator, Inkscape, impresión en gran formato
- Coordenadas reconstruidas desde el estado de la cámara WebGL
- `stroke` como hex + `stroke-opacity` separado (compatibilidad SVG completa)

---

## 🔧 Personalización rápida

Para cambiar los colores por defecto, edita `TEMAS` en `index.html`:

```javascript
const TEMAS = {
  dark: { bg:'#08080d', line:'#e8ff47', lbl:'#eeede6', lineAlpha:0.85, lineWidth:1 },
  blue: { bg:'#0a1628', line:'#64c8ff', lbl:'#c8e8ff', lineAlpha:0.80, lineWidth:1 },
};
```

Para agregar un tercer tema, duplica una entrada y agrega el botón correspondiente en el HTML.

---

## ⚠️ Notas importantes

- La API Key de Google Sheets está expuesta en el cliente — **restringe el dominio** en Google Cloud Console para evitar uso no autorizado.
- El Sheet debe tener permisos de escritura habilitados para el origen de la API Key.
- Los datos de Overpass pueden tardar 30–120 segundos en ciudades grandes (Madrid, Ciudad de México, etc.).
- El SVG exportado puede ser muy pesado (varios MB) en ciudades densas — normal y esperado.

---

*Calles de la Ciudad — Leonardo Cabrera · Datos © OpenStreetMap contributors, ODbL 1.0*
