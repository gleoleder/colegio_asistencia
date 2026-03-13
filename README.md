# 📋 Sistema de Asistencia QR — Instituto CEAN
**Versión 4.0** · Documentación completa

---

## 🗂️ Estructura de archivos

```
├── index.html     → Interfaz principal (todos los paneles)
├── app.js         → Lógica de la aplicación
├── styles.css     → Estilos y animaciones
├── config.js      → Configuración (API keys, nombres de hojas)
└── README.md      → Esta documentación
```

---

## 🗄️ Estructura de la base de datos (Google Sheets)

El sistema usa una hoja de cálculo de Google Sheets con **5 pestañas** obligatorias. Los nombres deben ser exactos.

---

### Pestaña `Estudiantes`
Columnas A–K

| Col | Campo | Descripción | Ejemplo |
|-----|-------|-------------|---------|
| A | id | ID único generado por el sistema | `SID1700000000000` |
| B | name | Nombre completo del estudiante | `Juan Carlos Mamani` |
| C | dni | Carnet de Identidad | `8523147` |
| D | email | Correo del estudiante | `juan@gmail.com` |
| E | phone | Teléfono de contacto | `76543210` |
| F | course | Nombre del curso (debe coincidir con col B de Cursos) | `Prefacultativo Derecho` |
| G | schedule | Horario seleccionado al registrar | `Lunes, Miércoles: 07:30–12:00 · Aula 101` |
| H | photoUrl | URL de foto en Google Drive (lo llena el sistema) | `https://drive.google.com/...` |
| I | qrUrl | URL del QR en Google Drive (lo llena el sistema) | `https://drive.google.com/...` |
| J | createdAt | Fecha/hora de registro ISO | `2025-03-01T10:30:00.000Z` |
| K | registeredBy | Correo de quien registró | `admin@cean.edu.bo` |

**Fila 1 = encabezados** (el sistema empieza a leer desde A2)

---

### Pestaña `Asistencia`
Columnas A–I · **Esta pestaña la llena automáticamente el sistema al escanear QR**

| Col | Campo | Descripción | Ejemplo |
|-----|-------|-------------|---------|
| A | sid | ID del estudiante | `SID1700000000000` |
| B | name | Nombre completo | `Juan Carlos Mamani` |
| C | dni | Carnet de Identidad | `8523147` |
| D | course | Curso del estudiante | `Prefacultativo Derecho` |
| E | schedule | Horario | `Lunes, Miércoles: 07:30–12:00` |
| F | date | Fecha del registro | `2025-03-03` |
| G | time | Hora del registro | `07:45:12` |
| H | type | Tipo: ENTRADA o SALIDA | `ENTRADA` |
| I | registeredBy | Correo de quien escaneó | `scanner@cean.edu.bo` |

---

### Pestaña `Cursos`
Columnas A–E · Define los cursos disponibles en el sistema

| Col | Campo | Descripción | Ejemplo |
|-----|-------|-------------|---------|
| A | id | ID del curso | `CUR001` |
| B | name | Nombre del curso ⚠️ debe coincidir exactamente con `Estudiantes!F` | `Prefacultativo Derecho` |
| C | grade | Tipo/categoría del curso | `Prefacultativo` |
| D | active | SI = visible en el sistema, NO = oculto | `SI` |
| E | description | Descripción opcional | `Preparación para ingreso a Derecho` |

**Ejemplo de datos:**
```
CUR001  Prefacultativo Derecho       Prefacultativo  SI  Preparación para ingreso a Derecho
CUR002  Prefacultativo Medicina      Prefacultativo  SI  Preparación para ingreso a Medicina
CUR003  Prefacultativo Ingeniería    Prefacultativo  SI  Preparación para ingreso a Ingeniería
CUR004  Prefacultativo Psicología    Prefacultativo  SI  Preparación para ingreso a Psicología
CUR005  Prefacultativo Economía      Prefacultativo  SI  Preparación para ingreso a Economía
CUR006  Prefacultativo Arquitectura  Prefacultativo  SI  Preparación para ingreso a Arquitectura
CUR007  Nivelación Matemática        Nivelación      SI  Curso de temporada
CUR008  Nivelación Química           Nivelación      SI  Curso de temporada
CUR009  Taller de Redacción          Taller          SI  Curso libre
CUR010  Curso Antiguo                Otro            NO  (desactivado, no aparece en el sistema)
```

---

### Pestaña `Horarios`
Columnas A–F · Define los horarios de cada curso

| Col | Campo | Descripción | Ejemplo |
|-----|-------|-------------|---------|
| A | courseId | ID del curso (col A de Cursos) | `CUR001` |
| B | courseName | Nombre del curso (col B de Cursos) | `Prefacultativo Derecho` |
| C | day | Día de la semana en español minúsculas | `lunes` |
| D | startTime | Hora de inicio (HH:MM) | `07:30` |
| E | endTime | Hora de fin (HH:MM) | `12:00` |
| F | room | Aula o sala (opcional) | `Aula 101` |

**Valores válidos para `day`:** `lunes` `martes` `miércoles` `jueves` `viernes` `sábado` `domingo`

**Ejemplo — un curso que va de lunes a viernes:**
```
CUR001  Prefacultativo Derecho   lunes      07:30  12:00  Aula 101
CUR001  Prefacultativo Derecho   martes     07:30  12:00  Aula 101
CUR001  Prefacultativo Derecho   miércoles  07:30  12:00  Aula 101
CUR001  Prefacultativo Derecho   jueves     07:30  12:00  Aula 101
CUR001  Prefacultativo Derecho   viernes    07:30  12:00  Aula 101
CUR002  Prefacultativo Medicina  lunes      08:00  13:00  Aula 205
CUR002  Prefacultativo Medicina  martes     08:00  13:00  Aula 205
CUR007  Nivelación Matemática    lunes      09:00  11:00  Aula 302
CUR007  Nivelación Matemática    miércoles  09:00  11:00  Aula 302
CUR007  Nivelación Matemática    viernes    09:00  11:00  Aula 302
```

---

### Pestaña `Permisos`
Columnas A–C · Controla quién puede acceder al sistema y con qué rol

| Col | Campo | Descripción | Ejemplo |
|-----|-------|-------------|---------|
| A | email | Correo Google del usuario (minúsculas) | `admin@gmail.com` |
| B | nombre | Nombre o cargo del usuario | `Lic. María García` |
| C | rol | Rol asignado (ver tabla de roles) | `ADMIN` |

**Roles disponibles:**

| Rol | Acceso |
|-----|--------|
| `ADMIN` | Acceso total: registrar, escanear, reportes, gestionar permisos |
| `REGISTRO` | Solo puede registrar nuevos estudiantes y generar carnets |
| `SCANNER` | Solo puede escanear QR para marcar asistencia |
| `VIEWER` | Solo puede consultar y descargar reportes |

**⚠️ IMPORTANTE:** El primer ADMIN debe agregarse directamente en la hoja antes de iniciar sesión, porque el sistema bloquea a cualquier correo que no esté en esta lista.

**Ejemplo:**
```
admin@gmail.com          Director CEAN           ADMIN
secretaria@gmail.com     Lic. María García        REGISTRO
portero@gmail.com        Sr. Pedro López          SCANNER
docente@gmail.com        Prof. Ana Condori        VIEWER
```

---

## ⚙️ Configuración inicial (config.js)

Antes de usar el sistema edita estos valores en `config.js`:

```javascript
CLIENT_ID: 'TU_CLIENT_ID.apps.googleusercontent.com',  // Google OAuth
API_KEY:   'TU_API_KEY',                                // Google Sheets API
SHEET_ID:  'ID_DE_TU_HOJA_DE_CALCULO',                // El ID largo de tu Google Sheets
FOLDER_ID: 'ID_DE_TU_CARPETA_DRIVE',                  // Carpeta de Google Drive para fotos/QRs
```

Para obtener estas credenciales:
1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Crea un proyecto → habilita Google Sheets API + Google Drive API
3. Crea credenciales OAuth 2.0 → copia el Client ID
4. Crea una API Key → copia el API Key
5. El SHEET_ID está en la URL de tu hoja: `docs.google.com/spreadsheets/d/**SHEET_ID**/edit`

---

## 🚀 Cómo usar el sistema

### Primer uso
1. Subir los 4 archivos a un servidor web (o abrir `index.html` localmente)
2. Agregar el correo del admin en la pestaña `Permisos` directamente en Sheets
3. Llenar la pestaña `Cursos` con los cursos del instituto
4. Llenar la pestaña `Horarios` con los horarios de cada curso
5. Hacer clic en **"🔑 Conectar Google"** e iniciar sesión con el correo de admin
6. El sistema cargará todos los datos automáticamente

### Registrar estudiante
1. Ir al panel **📝 Registrar**
2. Completar: nombre, carnet, correo, teléfono (opcional foto)
3. Seleccionar **Curso** → el select de **Horario** se llena automáticamente con los horarios disponibles de ese curso
4. Clic en **"Registrar y Generar Carnet QR"**
5. Descargar el **Carnet PDF** o el **QR PNG**

### Marcar asistencia
1. Ir al panel **📷 Escanear**
2. Seleccionar **Entrada** o **Salida**
3. Apuntar la cámara al código QR del carnet
4. Aparece la **notificación emergente grande** con el nombre del estudiante

### Reportes
- Filtrar por **rango de fechas**, **curso** y/o **horario**
- Ver estadísticas de presentes/ausentes
- Descargar **PDF del reporte**

---

## 📐 Estructura del carnet generado

El carnet PDF tiene formato CR80 (tarjeta de crédito) en orientación horizontal con:
- Logo del Instituto CEAN
- Foto del estudiante (o iniciales si no tiene foto)
- Nombre completo, Carnet de Identidad, Curso, Horario, Año
- Código QR con fondo blanco propio (no intersecta con el diseño)
- ID único y fecha de emisión

---

## 🔧 Notas técnicas

- Los datos se guardan en **localStorage** como respaldo offline
- Las fotos y QRs se suben a **Google Drive** (carpeta configurada en FOLDER_ID)
- La asistencia se registra en tiempo real en **Google Sheets**
- El sistema funciona en navegadores modernos (Chrome, Firefox, Safari, Edge)
- Compatible con dispositivos móviles y tablets
- Para escaneo en producción se recomienda usar Chrome en Android o Safari en iOS
