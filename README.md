# 📋 Sistema de Asistencia QR — Colegio San Agustín

Sistema completo de control de asistencia escolar mediante códigos QR, con sincronización a Google Sheets y Google Drive.

---

## 📁 Estructura del Proyecto

```
asistencia/
├── index.html          ← Página principal
├── css/
│   └── styles.css      ← Estilos responsive
├── js/
│   ├── config.js       ← Configuración y constantes
│   └── script.js       ← Lógica de la aplicación
└── README.md           ← Este archivo
```

---

## 🗄️ Estructura de la Base de Datos (Google Sheets)

La hoja de cálculo de Google **debe tener 4 pestañas (hojas)**. Cada pestaña debe tener los encabezados exactos en la **fila 1**.

### 📌 Pestaña 1: `Estudiantes`

Contiene los datos de cada alumno registrado.

| Columna | Campo       | Tipo    | Descripción                          | Ejemplo                     |
|---------|-------------|---------|--------------------------------------|-----------------------------|
| A       | `id`        | Texto   | Identificador único (generado)       | `SID1709234567890`          |
| B       | `nombre`    | Texto   | Nombre completo del alumno           | `Juan Carlos Pérez López`   |
| C       | `dni`       | Texto   | Número de documento de identidad     | `12345678`                  |
| D       | `grado`     | Texto   | Grado escolar                        | `3° Primaria`               |
| E       | `seccion`   | Texto   | Sección del aula                     | `A`                         |
| F       | `fotoUrl`   | Texto   | URL de la foto en Google Drive       | `https://drive.google...`   |
| G       | `qrUrl`     | Texto   | URL de la imagen QR en Google Drive  | `https://drive.google...`   |
| H       | `fechaReg`  | Texto   | Fecha y hora de registro (ISO 8601)  | `2025-02-26T08:30:00.000Z`  |

**Ejemplo de fila 1 (encabezados):**
```
id | nombre | dni | grado | seccion | fotoUrl | qrUrl | fechaReg
```

---

### 📌 Pestaña 2: `Asistencia`

Registra cada marcación de entrada o salida.

| Columna | Campo       | Tipo    | Descripción                          | Ejemplo                |
|---------|-------------|---------|--------------------------------------|------------------------|
| A       | `sid`       | Texto   | ID del alumno (referencia)           | `SID1709234567890`     |
| B       | `nombre`    | Texto   | Nombre del alumno (redundante)       | `Juan Carlos Pérez`    |
| C       | `dni`       | Texto   | DNI del alumno                       | `12345678`             |
| D       | `grado`     | Texto   | Grado del alumno                     | `3° Primaria`          |
| E       | `seccion`   | Texto   | Sección del alumno                   | `A`                    |
| F       | `fecha`     | Texto   | Fecha de la asistencia (YYYY-MM-DD)  | `2025-02-26`           |
| G       | `hora`      | Texto   | Hora de la marcación (HH:MM:SS)      | `07:45:23`             |
| H       | `tipo`      | Texto   | Tipo de registro                     | `ENTRADA` o `SALIDA`   |

**Ejemplo de fila 1 (encabezados):**
```
sid | nombre | dni | grado | seccion | fecha | hora | tipo
```

---

### 📌 Pestaña 3: `Cursos`

Lista de cursos/materias disponibles. **Los cursos temporales se agregan aquí y se desactivan cambiando el campo `activo` a `NO`.**

| Columna | Campo         | Tipo    | Descripción                              | Ejemplo                  |
|---------|---------------|---------|------------------------------------------|--------------------------|
| A       | `id`          | Texto   | Identificador único del curso            | `CUR001`                 |
| B       | `nombre`      | Texto   | Nombre del curso o materia               | `Matemáticas`            |
| C       | `grado`       | Texto   | Grado al que pertenece                   | `3° Primaria`            |
| D       | `activo`      | Texto   | Si el curso está activo (`SI` / `NO`)    | `SI`                     |
| E       | `descripcion` | Texto   | Descripción opcional                     | `Curso temporal verano`  |

**Ejemplo de fila 1 (encabezados):**
```
id | nombre | grado | activo | descripcion
```

> 💡 **Cursos temporales**: Para agregar un curso temporal, simplemente añade una fila nueva con `activo = SI`. Cuando termine el periodo, cambia a `NO` y el sistema lo ignorará.

---

### 📌 Pestaña 4: `Horarios`

Define los horarios de cada curso por día de la semana.

| Columna | Campo         | Tipo    | Descripción                              | Ejemplo          |
|---------|---------------|---------|------------------------------------------|------------------|
| A       | `cursoId`     | Texto   | ID del curso (referencia a Cursos)       | `CUR001`         |
| B       | `cursoNombre` | Texto   | Nombre del curso (para fácil lectura)    | `Matemáticas`    |
| C       | `dia`         | Texto   | Día de la semana                         | `lunes`          |
| D       | `horaInicio`  | Texto   | Hora de inicio (HH:MM)                  | `08:00`          |
| E       | `horaFin`     | Texto   | Hora de fin (HH:MM)                     | `09:30`          |
| F       | `aula`        | Texto   | Aula o salón (opcional)                  | `Aula 3-A`       |

**Ejemplo de fila 1 (encabezados):**
```
cursoId | cursoNombre | dia | horaInicio | horaFin | aula
```

**Valores válidos para `dia`:** `lunes`, `martes`, `miércoles`, `jueves`, `viernes`, `sábado`, `domingo`

---

## 🚀 Instalación y Configuración

### Paso 1: Crear la Hoja de Cálculo

1. Ve a [Google Sheets](https://sheets.google.com) y crea una nueva hoja de cálculo.
2. Crea las **4 pestañas** con los nombres exactos:
   - `Estudiantes`
   - `Asistencia`
   - `Cursos`
   - `Horarios`
3. En cada pestaña, agrega los **encabezados en la fila 1** como se indica arriba.
4. Copia el **ID de la hoja de cálculo** de la URL:
   ```
   https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
   ```

### Paso 2: Crear Carpeta en Google Drive

1. Crea una carpeta en Google Drive para almacenar fotos y QRs.
2. Copia el **ID de la carpeta** de la URL:
   ```
   https://drive.google.com/drive/folders/ESTE_ES_EL_ID
   ```

### Paso 3: Configurar Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com).
2. Crea un proyecto nuevo o usa uno existente.
3. Habilita las APIs:
   - **Google Sheets API**
   - **Google Drive API**
4. Crea credenciales:
   - **Clave de API** (API Key)
   - **ID de cliente OAuth 2.0** (Client ID) — tipo "Aplicación web"
5. En la configuración de OAuth, agrega los orígenes autorizados (ej: `http://localhost`, tu dominio).

### Paso 4: Configurar el Sistema

Edita el archivo `js/config.js` y reemplaza los valores:

```javascript
const CONFIG = {
    CLIENT_ID: 'TU_CLIENT_ID_AQUÍ',
    API_KEY: 'TU_API_KEY_AQUÍ',
    SHEET_ID: 'TU_SHEET_ID_AQUÍ',
    FOLDER_ID: 'TU_FOLDER_ID_AQUÍ',
    // ...
};
```

### Paso 5: Abrir el Sistema

Abre `index.html` en un navegador web. Para uso en red local, puedes usar un servidor simple:

```bash
# Con Python
python3 -m http.server 8080

# Con Node.js (npx)
npx serve .
```

Luego accede desde cualquier dispositivo en la misma red: `http://IP_DEL_SERVIDOR:8080`

---

## 📱 Funcionalidades

| Función | Descripción |
|---------|-------------|
| **Registrar alumnos** | Formulario con foto, datos personales y generación automática de QR |
| **Escanear QR** | Cámara del dispositivo para registrar entrada/salida |
| **Ver alumnos** | Lista con búsqueda, estado del día (presente/ausente) |
| **Asistencia** | Dashboard con estadísticas del día en tiempo real |
| **Reportes** | Filtros por fecha, grado y sección + descarga en PDF |
| **Horarios** | Muestra los horarios del día actual desde la hoja de cálculo |
| **Cursos temporales** | Se gestionan directamente en la hoja `Cursos` (activo: SI/NO) |
| **Carnet PDF** | Genera un carnet con datos del alumno y su código QR |
| **Sincronización** | Funciona sin conexión (localStorage) y sincroniza con Google Sheets |

---

## 📊 Ejemplo de Datos en la Hoja de Cálculo

### Pestaña `Cursos` (ejemplo)

| id     | nombre               | grado        | activo | descripcion              |
|--------|----------------------|--------------|--------|--------------------------|
| CUR001 | Matemáticas          | 3° Primaria  | SI     |                          |
| CUR002 | Lenguaje             | 3° Primaria  | SI     |                          |
| CUR003 | Ciencias Naturales   | 3° Primaria  | SI     |                          |
| CUR004 | Taller de Robótica   | 3° Primaria  | SI     | Curso temporal - verano  |
| CUR005 | Taller de Arte       | 4° Primaria  | NO     | Finalizó en diciembre    |

### Pestaña `Horarios` (ejemplo)

| cursoId | cursoNombre        | dia       | horaInicio | horaFin | aula      |
|---------|--------------------|-----------|------------|---------|-----------|
| CUR001  | Matemáticas        | lunes     | 08:00      | 09:30   | Aula 3-A  |
| CUR001  | Matemáticas        | miércoles | 08:00      | 09:30   | Aula 3-A  |
| CUR002  | Lenguaje           | lunes     | 09:45      | 11:15   | Aula 3-A  |
| CUR004  | Taller de Robótica | viernes   | 14:00      | 15:30   | Lab. 1    |

---

## 🔧 Notas Técnicas

- **Almacenamiento local**: Los datos se guardan en `localStorage` para funcionar sin internet.
- **Sincronización**: Al conectar con Google, los datos se sincronizan automáticamente.
- **QR**: Cada código QR contiene solo el ID del alumno (`{id: "SIDxxxx"}`), lo que lo hace rápido de escanear.
- **Responsive**: La interfaz se adapta a celulares, tablets y computadoras de escritorio.
- **Notificaciones**: Las notificaciones de registro aparecen centradas en la pantalla para máxima visibilidad.

---

## 🌐 Compatibilidad

| Navegador      | Soporte |
|----------------|---------|
| Chrome (móvil/escritorio) | ✅ |
| Firefox        | ✅ |
| Safari (iOS)   | ✅ |
| Edge           | ✅ |
| Opera          | ✅ |

---

## 📄 Licencia

Uso exclusivo para el Colegio San Agustín. Todos los derechos reservados.
