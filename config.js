// ============================================================
// config.js — Configuración global del Sistema de Asistencia
// Instituto CEAN
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

    // --- Instituto ---
    SCHOOL: {
        NAME: 'Instituto CEAN',
        SHORT: 'CEAN',
        SUBTITLE: 'Sistema de Asistencia'
    },

    // --- Grados/Paralelos (se cargan desde la hoja) ---
    GRADOS: [],
    SECCIONES: [],

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
