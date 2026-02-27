// ============================================================
// config.js — Configuración global del Sistema de Asistencia
// Colegio San Agustín
// ============================================================

const CONFIG = {
    // --- Google API ---
    CLIENT_ID: '814005655098-8csk41qts3okv4b2fjnq7ls4qc2kq0vc.apps.googleusercontent.com',
    API_KEY: 'AIzaSyAOhGTjJXHhuUhqf1g2DPCla59xNzftb-Q',
    SHEET_ID: '1m0rv2gcMW3E8Yrh02PnwtHgZ3utj8XRPa9kYpwwm5oo',
    FOLDER_ID: '1ig8n3pthz8esYzmAsoibPUPz1MNVg88m',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',

    // --- Hojas de cálculo (nombres de pestañas) ---
    SHEETS: {
        ESTUDIANTES: 'Estudiantes',
        ASISTENCIA: 'Asistencia',
        CURSOS: 'Cursos',
        HORARIOS: 'Horarios'
    },

    // --- Rangos de lectura ---
    RANGES: {
        ESTUDIANTES: 'Estudiantes!A2:H',
        ASISTENCIA: 'Asistencia!A2:H',
        CURSOS: 'Cursos!A2:E',
        HORARIOS: 'Horarios!A2:F'
    },

    // --- Almacenamiento local ---
    STORAGE_KEY: 'san_agustin_v3',

    // --- Escáner QR ---
    SCANNER: {
        FPS: 10,
        QR_BOX: 220,
        PAUSE_MS: 3000
    },

    // --- Foto de perfil ---
    PHOTO: {
        WIDTH: 200,
        HEIGHT: 200,
        QUALITY: 0.8
    },

    // --- Colegio ---
    SCHOOL: {
        NAME: 'Colegio San Agustín',
        SHORT: 'San Agustín',
        SUBTITLE: 'Sistema de Asistencia Escolar'
    },

    // --- Grados disponibles (por defecto, se complementan con Cursos de la hoja) ---
    GRADOS: [
        '1° Primaria', '2° Primaria', '3° Primaria',
        '4° Primaria', '5° Primaria', '6° Primaria'
    ],

    SECCIONES: ['A', 'B', 'C'],

    // --- Tipos de asistencia ---
    TIPOS: {
        ENTRADA: 'ENTRADA',
        SALIDA: 'SALIDA'
    }
};

// Estado global de la aplicación
const APP = {
    tokenClient: null,
    gapiOk: false,
    gisOk: false,
    authed: false,
    qrScanner: null,
    currentPhoto: null,
    lastStudent: null,
    db: {
        students: [],
        attendance: [],
        courses: [],
        schedules: []
    }
};
