// ============================================================
// config.js — Configuración global del Sistema de Asistencia
// Instituto CEAN
// ============================================================

const CONFIG = {
    CLIENT_ID: '814005655098-8csk41qts3okv4b2fjnq7ls4qc2kq0vc.apps.googleusercontent.com',
    API_KEY: 'AIzaSyAOhGTjJXHhuUhqf1g2DPCla59xNzftb-Q',
    SHEET_ID: '1m0rv2gcMW3E8Yrh02PnwtHgZ3utj8XRPa9kYpwwm5oo',
    FOLDER_ID: '1ig8n3pthz8esYzmAsoibPUPz1MNVg88m',
    SCOPES: 'openid email profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',

    SHEETS: {
        ESTUDIANTES: 'Estudiantes',
        ASISTENCIA:  'Asistencia',
        CURSOS:      'Cursos',
        HORARIOS:    'Horarios',
        PERMISOS:    'Permisos'
    },

    RANGES: {
        ESTUDIANTES: 'Estudiantes!A2:J',
        ASISTENCIA:  'Asistencia!A2:I',
        CURSOS:      'Cursos!A2:E',
        HORARIOS:    'Horarios!A2:F',
        PERMISOS:    'Permisos!A2:C'
    },

    STORAGE_KEY: 'cean_v4',

    SCANNER: { FPS: 10, QR_BOX: 220, PAUSE_MS: 3500 },
    PHOTO:   { WIDTH: 200, HEIGHT: 200, QUALITY: 0.85 },

    SCHOOL: {
        NAME:     'Instituto CEAN',
        SHORT:    'CEAN',
        SUBTITLE: 'Sistema de Asistencia'
    },

    TIPOS: { ENTRADA: 'ENTRADA', SALIDA: 'SALIDA' },

    ROLES: {
        ADMIN:    'ADMIN',
        REGISTRO: 'REGISTRO',
        SCANNER:  'SCANNER',
        VIEWER:   'VIEWER'
    }
};

const APP = {
    tokenClient:  null,
    gapiOk:       false,
    gisOk:        false,
    authed:       false,
    currentUser:  null,
    qrScanner:    null,
    currentPhoto: null,
    lastStudent:  null,
    db: {
        students:   [],
        attendance: [],
        courses:    [],
        schedules:  [],
        permisos:   []
    }
};
