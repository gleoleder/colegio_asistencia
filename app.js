// ============================================================
// app.js — Sistema de Asistencia QR · Instituto CEAN
// ============================================================

// ─── UTILIDADES ──────────────────────────────────────────────
function getToday() { return new Date().toISOString().split('T')[0]; }
function getTime()  { return new Date().toLocaleTimeString('es-BO', { hour12: false }); }
function getAvatarColor(name) {
    const colors = ['#3b6cb4','#2a8f6a','#c68a1d','#c9463d','#7c3aed','#0891b2','#db2777'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}
function getInitials(name) { return (name||'?').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase(); }
function capitalize(str)   { return str ? str.charAt(0).toUpperCase() + str.slice(1) : str; }

// ─── TOAST ───────────────────────────────────────────────────
function showToast(type, title, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const icons = { ok:'✅', bad:'❌', warn:'⚠️', info:'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-icon">${icons[type]||''}</div><div><h4>${title}</h4><p>${message}</p></div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ─── SESIÓN PERSISTENTE ──────────────────────────────────────
const SESSION_KEY = 'cean_session_v1';

function saveSession(user, accessToken) {
    const session = {
        email:       user.email,
        name:        user.name,
        role:        user.role,
        accessToken: accessToken,
        savedAt:     Date.now()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function loadSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw);
        // Token de Google dura ~1 hora; si pasó más de 50 min pedimos nuevo silencioso
        const age = (Date.now() - (s.savedAt || 0)) / 1000 / 60; // minutos
        if (age > 50) return null; // expirado, renovar
        return s;
    } catch(e) { return null; }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

// ─── PANTALLA DE LOGIN ───────────────────────────────────────
function showLoginBtn() {
    document.getElementById('loginLoading').style.display = 'none';
    document.getElementById('loginBtn').style.display     = 'flex';
    document.getElementById('loginError').style.display   = 'none';
}
function showLoginLoading(text) {
    document.getElementById('loginLoading').style.display   = 'flex';
    document.getElementById('loginLoadingText').textContent = text || 'Cargando...';
    document.getElementById('loginBtn').style.display       = 'none';
    document.getElementById('loginError').style.display     = 'none';
}
function showLoginError(msg) {
    document.getElementById('loginLoading').style.display = 'none';
    document.getElementById('loginBtn').style.display     = 'flex';
    document.getElementById('loginError').style.display   = 'block';
    document.getElementById('loginError').textContent     = msg;
}
function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display    = 'block';
}
function showLogin() {
    document.getElementById('appShell').style.display    = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    showLoginBtn();
}

// ─── SYNC STATUS ─────────────────────────────────────────────
function syncStatus(type, text) {
    const el = document.getElementById('syncChip');
    if (!el) return;
    el.className   = 'chip ' + (type==='ok' ? 'chip-ok' : type==='err' ? 'chip-err' : 'chip-g');
    el.textContent = text;
}

// ─── ALMACENAMIENTO LOCAL ────────────────────────────────────
function saveLocal() {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(APP.db));
}
function loadLocal() {
    try {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (!raw) return;
        const parsed      = JSON.parse(raw);
        APP.db.students   = parsed.students   || [];
        APP.db.attendance = parsed.attendance || [];
        APP.db.courses    = parsed.courses    || [];
        APP.db.schedules  = parsed.schedules  || [];
        APP.db.permisos   = [];  // siempre frescos desde Sheets
    } catch(e) { console.warn('loadLocal error:', e); }
}

// ─── GOOGLE API INIT ─────────────────────────────────────────
function onGapiLoad() {
    gapi.load('client', async () => {
        try { await gapi.client.init({ apiKey: CONFIG.API_KEY }); } catch(e) {}
        APP.gapiOk = true;
        checkReady();
    });
}
function onGisLoad() {
    try {
        APP.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CONFIG.CLIENT_ID,
            scope:     CONFIG.SCOPES,
            callback:  ''
        });
        APP.gisOk = true;
        checkReady();
    } catch(e) {
        showLoginError('Error al cargar Google. Recarga la página.');
    }
}

async function checkReady() {
    if (!APP.gapiOk || !APP.gisOk) return;

    // Intentar restaurar sesión guardada
    const session = loadSession();
    if (session) {
        showLoginLoading('Restaurando sesión...');
        const ok = await restaurarSesion(session);
        if (ok) return; // sesión restaurada, no mostrar login
    }
    showLoginBtn();
}

// ─── RESTAURAR SESIÓN (al recargar la página) ─────────────────
async function restaurarSesion(session) {
    try {
        // Verificar que el token sigue siendo válido con userinfo
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': 'Bearer ' + session.accessToken }
        });
        if (!r.ok) return false; // token expirado

        const data      = await r.json();
        const userEmail = (data.email || '').toLowerCase().trim();
        if (!userEmail || userEmail !== session.email) return false;

        // Registrar el token en gapi para que sheetsGet lo use
        gapi.client.setToken({ access_token: session.accessToken });

        showLoginLoading('Verificando permisos...');
        const permisosOk = await cargarPermisos(session.accessToken);
        if (!permisosOk) return false;

        const perm = APP.db.permisos.find(p => p.email === userEmail);
        if (!perm) return false; // ya no tiene permiso

        // Sesión válida
        APP.authed      = true;
        APP.currentUser = { email: userEmail, name: session.name || data.name || userEmail, role: perm.rol };

        showLoginLoading('Cargando datos...');
        await loadFromSheets();

        showApp();
        configurarUI(perm);
        populateCourseFilters();
        refreshAll();
        startRealtimeSync();

        showToast('ok', `Bienvenido de nuevo, ${APP.currentUser.name}`, `Rol: ${perm.rol}`);
        return true;
    } catch(e) {
        console.warn('No se pudo restaurar sesión:', e);
        return false;
    }
}

// ─── LOGIN MANUAL ─────────────────────────────────────────────
function handleAuth() {
    showLoginLoading('Conectando con Google...');

    APP.tokenClient.callback = async (resp) => {
        if (resp.error) {
            showLoginError('Error al conectar con Google. Intenta de nuevo.');
            return;
        }

        const accessToken = resp.access_token;
        showLoginLoading('Obteniendo datos de usuario...');

        let userEmail, userName;
        try {
            const r    = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': 'Bearer ' + accessToken }
            });
            const data = await r.json();
            userEmail  = (data.email || '').toLowerCase().trim();
            userName   = (data.name  || userEmail).trim();
        } catch(e) {
            showLoginError('No se pudo obtener tu correo de Google. Verifica tu conexión.');
            return;
        }

        if (!userEmail) { showLoginError('Google no devolvió un correo válido.'); return; }

        showLoginLoading('Verificando permisos...');
        const permisosOk = await cargarPermisos(accessToken);
        if (!permisosOk) {
            showLoginError('No se pudo leer la hoja de Permisos. Verifica configuración.');
            return;
        }

        const perm = APP.db.permisos.find(p => p.email === userEmail);
        if (!perm) {
            showLoginError(`"${userEmail}" no tiene permisos. Contacta al administrador.`);
            google.accounts.oauth2.revoke(accessToken);
            gapi.client.setToken('');
            return;
        }

        // ✅ Login exitoso — guardar sesión para recargas
        APP.authed      = true;
        APP.currentUser = { email: userEmail, name: userName, role: perm.rol };
        saveSession(APP.currentUser, accessToken);

        showLoginLoading('Cargando datos...');
        await loadFromSheets();

        showApp();
        configurarUI(perm);
        populateCourseFilters();
        refreshAll();
        startRealtimeSync();

        showToast('ok', `Bienvenido, ${userName}`, `Rol: ${perm.rol}`);
    };

    APP.tokenClient.requestAccessToken({ prompt: '' });
}

// ─── CARGAR SOLO PERMISOS ─────────────────────────────────────
async function cargarPermisos(accessToken) {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(CONFIG.RANGES.PERMISOS)}`;
        const r   = await fetch(url, { headers: { 'Authorization': 'Bearer ' + accessToken } });
        if (!r.ok) return false;
        const data = await r.json();
        APP.db.permisos = (data.values || [])
            .filter(row => row[0] && row[0].toString().trim())
            .map(row => ({
                email:  row[0].toString().trim().toLowerCase(),
                nombre: (row[1] || '').toString().trim(),
                rol:    (row[2] || 'VIEWER').toString().trim().toUpperCase()
            }));
        return true;
    } catch(e) { return false; }
}

// ─── CONFIGURAR UI POST LOGIN ─────────────────────────────────
function configurarUI(perm) {
    document.getElementById('userBadge').style.display  = 'flex';
    document.getElementById('logoutBtn').style.display  = 'inline-flex';
    document.getElementById('userAvatar').textContent   = (APP.currentUser.name || APP.currentUser.email)[0].toUpperCase();
    document.getElementById('userEmail').textContent    = APP.currentUser.name || APP.currentUser.email;
    document.getElementById('userRole').textContent     = perm.rol;
    document.getElementById('userRole').className       = `role-tag role-${perm.rol}`;
    syncStatus('ok', '✅ Conectado');

    // Mostrar botones según rol
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const allowed = (btn.dataset.role || '').split(',');
        btn.style.display = allowed.includes(perm.rol) ? 'flex' : 'none';
    });

    // Activar primer panel visible
    const primer = document.querySelector('.nav-btn[style*="flex"]');
    if (primer) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        primer.classList.add('active');
        const panel = document.getElementById('panel-' + primer.dataset.panel);
        if (panel) panel.classList.add('active');
    }
}

// ─── CERRAR SESIÓN ───────────────────────────────────────────
function handleSignout() {
    stopScanner();
    stopRealtimeSync();
    clearSession();
    try {
        const token = gapi.client.getToken();
        if (token) { google.accounts.oauth2.revoke(token.access_token); gapi.client.setToken(''); }
    } catch(e) {}
    APP.authed      = false;
    APP.currentUser = null;
    APP.db.permisos = [];
    showLogin();
}

// ─── SHEETS API — fetch directo ───────────────────────────────
function getToken() {
    try { return gapi.client.getToken()?.access_token || null; } catch(e) { return null; }
}

async function sheetsGet(range) {
    const token = getToken();
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}`;
    const r     = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
    if (!r.ok) throw new Error(`sheetsGet ${range} → ${r.status}`);
    return (await r.json()).values || [];
}
async function sheetsAppend(range, values) {
    const token = getToken();
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
    const r     = await fetch(url, {
        method:'POST', headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
        body: JSON.stringify({ values })
    });
    if (!r.ok) throw new Error(`sheetsAppend ${range} → ${r.status}`);
    return r.json();
}
async function sheetsClear(range) {
    const token = getToken();
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}:clear`;
    const r     = await fetch(url, { method:'POST', headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'} });
    if (!r.ok) throw new Error(`sheetsClear → ${r.status}`);
    return r.json();
}
async function sheetsUpdate(range, values) {
    const token = getToken();
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const r     = await fetch(url, {
        method:'PUT', headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
        body: JSON.stringify({ values })
    });
    if (!r.ok) throw new Error(`sheetsUpdate → ${r.status}`);
    return r.json();
}

// ─── CARGA DESDE GOOGLE SHEETS ───────────────────────────────
async function loadFromSheets() {
    syncStatus('g','🔄 Cargando...');
    try {
        try {
            const rows = await sheetsGet(CONFIG.RANGES.ESTUDIANTES);
            APP.db.students = rows.map(r => ({
                id:r[0]||'', name:r[1]||'', dni:r[2]||'', email:r[3]||'',
                phone:r[4]||'', course:r[5]||'', schedule:r[6]||'',
                photoUrl:r[7]||'', qrUrl:r[8]||'', createdAt:r[9]||'', registeredBy:r[10]||''
            }));
        } catch(e) { console.warn('Estudiantes:', e); }

        try {
            const rows = await sheetsGet(CONFIG.RANGES.ASISTENCIA);
            APP.db.attendance = rows.map(r => ({
                sid:r[0]||'', name:r[1]||'', dni:r[2]||'', course:r[3]||'',
                schedule:r[4]||'', date:r[5]||'', time:r[6]||'', type:r[7]||'', registeredBy:r[8]||''
            }));
        } catch(e) { console.warn('Asistencia:', e); }

        try {
            const rows = await sheetsGet(CONFIG.RANGES.CURSOS);
            APP.db.courses = rows.map(r => ({
                id:r[0]||'', name:r[1]||'', grade:r[2]||'',
                active:(r[3]||'SI').toUpperCase()==='SI', description:r[4]||''
            }));
        } catch(e) { console.warn('Cursos:', e); }

        try {
            const rows = await sheetsGet(CONFIG.RANGES.HORARIOS);
            APP.db.schedules = rows.map(r => ({
                courseId:r[0]||'', courseName:r[1]||'', day:r[2]||'',
                startTime:r[3]||'', endTime:r[4]||'', room:r[5]||''
            }));
        } catch(e) { console.warn('Horarios:', e); }

        try {
            const rows = await sheetsGet(CONFIG.RANGES.PERMISOS);
            APP.db.permisos = rows
                .filter(r => r[0]?.toString().trim())
                .map(r => ({
                    email:  r[0].toString().trim().toLowerCase(),
                    nombre: (r[1]||'').toString().trim(),
                    rol:    (r[2]||'VIEWER').toString().trim().toUpperCase()
                }));
        } catch(e) { console.warn('Permisos:', e); }

        saveLocal();
        syncStatus('ok','✅ Sincronizado');
    } catch(e) {
        console.error('loadFromSheets error:', e);
        syncStatus('err','❌ Error de conexión');
    }
}

// ─── SUBIR A DRIVE ───────────────────────────────────────────
async function uploadToDrive(fileName, base64Data, mimeType) {
    try {
        const token    = getToken();
        const rawB64   = base64Data.split(',')[1];
        const metadata = JSON.stringify({ name: fileName, parents: [CONFIG.FOLDER_ID], mimeType });
        const body     = `--b\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--b\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${rawB64}\r\n--b--`;
        const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method:'POST', headers:{'Authorization':'Bearer '+token,'Content-Type':'multipart/related; boundary=b'}, body
        });
        const f = await r.json();
        return f.id ? `https://drive.google.com/uc?export=view&id=${f.id}` : '';
    } catch(e) { return ''; }
}

// ─── FOTO ────────────────────────────────────────────────────
function loadPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = CONFIG.PHOTO.WIDTH; c.height = CONFIG.PHOTO.HEIGHT;
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            APP.currentPhoto = c.toDataURL('image/jpeg', CONFIG.PHOTO.QUALITY);
            document.getElementById('photoCircle').innerHTML = `<img src="${APP.currentPhoto}" alt="Foto">`;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ─── HORARIOS DINÁMICOS ──────────────────────────────────────
function updateScheduleOptions() {
    const courseSelect   = document.getElementById('inputCourse');
    const scheduleSelect = document.getElementById('inputSchedule');
    const courseName     = courseSelect.value;

    if (!courseName) {
        scheduleSelect.innerHTML = '<option value="">Primero selecciona un curso</option>';
        return;
    }
    const course     = APP.db.courses.find(c => c.name === courseName);
    const courseId   = course ? course.id : null;
    const schedules  = APP.db.schedules.filter(s => s.courseName === courseName || s.courseId === courseId);

    if (!schedules.length) {
        scheduleSelect.innerHTML = '<option value="">Sin horarios disponibles</option>';
        return;
    }
    const groups = {};
    schedules.forEach(s => {
        const key = `${s.startTime}-${s.endTime}|${s.room||''}`;
        if (!groups[key]) groups[key] = { start:s.startTime, end:s.endTime, room:s.room, days:[] };
        groups[key].days.push(s.day);
    });
    scheduleSelect.innerHTML = '<option value="">Seleccionar horario...</option>';
    Object.values(groups).forEach(b => {
        const label = `${b.days.map(capitalize).join(', ')}: ${b.start}–${b.end}${b.room?' · '+b.room:''}`;
        const opt = document.createElement('option');
        opt.value = opt.textContent = label;
        scheduleSelect.appendChild(opt);
    });
}

// ─── REGISTRO ESTUDIANTE ─────────────────────────────────────
async function doRegister(event) {
    event.preventDefault();
    const qrDiv = document.getElementById('qrcode');
    qrDiv.innerHTML = '';

    const student = {
        id:           'SID' + Date.now(),
        name:         document.getElementById('inputName').value.trim(),
        dni:          document.getElementById('inputDni').value.trim(),
        email:        document.getElementById('inputEmail').value.trim(),
        phone:        document.getElementById('inputPhone').value.trim(),
        course:       document.getElementById('inputCourse').value,
        schedule:     document.getElementById('inputSchedule').value,
        photoUrl:'', qrUrl:'',
        createdAt:    new Date().toISOString(),
        registeredBy: APP.currentUser?.email || 'local'
    };

    if (APP.db.students.find(s => s.dni === student.dni)) {
        showToast('bad','Carnet duplicado','Este número de carnet ya está registrado.'); return;
    }
    if (!student.course || !student.schedule) {
        showToast('warn','Faltan datos','Selecciona el curso y el horario.'); return;
    }

    new QRCode(qrDiv, { text: JSON.stringify({ id: student.id }), width: 180, height: 180, correctLevel: QRCode.CorrectLevel.H });
    document.getElementById('qrActions').classList.add('visible');
    APP.lastStudent = { ...student, photo: APP.currentPhoto, photoUrl: APP.currentPhoto||'' };
    // Guardar foto en cache para el modal
    if (APP.currentPhoto) cacheStudentPhoto(student.id, APP.currentPhoto);

    await new Promise(r => setTimeout(r, 500));

    if (APP.authed) {
        document.getElementById('qrStatus').textContent = '🔄 Subiendo datos...';
        student.photoUrl = APP.currentPhoto ? await uploadToDrive(`Foto_${student.dni}.jpg`, APP.currentPhoto, 'image/jpeg') : '';
        const qrCanvas   = qrDiv.querySelector('canvas');
        student.qrUrl    = await uploadToDrive(`QR_${student.dni}.png`, qrCanvas.toDataURL(), 'image/png');

        await sheetsAppend(CONFIG.SHEETS.ESTUDIANTES, [[
            student.id, student.name, student.dni, student.email, student.phone,
            student.course, student.schedule, student.photoUrl, student.qrUrl,
            student.createdAt, student.registeredBy
        ]]);
        document.getElementById('qrStatus').textContent = '✅ Registrado y sincronizado';
        showToast('ok','Registrado',`${student.name} · ${student.registeredBy.split('@')[0]}`);
    } else {
        document.getElementById('qrStatus').textContent = '✅ Registrado localmente';
        showToast('info','Guardado local',`${student.name} sin conexión.`);
    }

    APP.db.students.push(student);
    saveLocal(); refreshAll();
    document.getElementById('regForm').reset();
    document.getElementById('photoCircle').innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8c95a3" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
    document.getElementById('inputSchedule').innerHTML = '<option value="">Primero selecciona un curso</option>';
    APP.currentPhoto = null;
}

// ─── NOTIFICACIÓN EMERGENTE DE ESCANEO ───────────────────────
let notifTimer = null;

function mostrarNotifEscaneo(tipo, student, record, yaRegistrado) {
    const notif = document.getElementById('scanNotification');
    const icon  = document.getElementById('scanNotifIcon');
    const name  = document.getElementById('scanNotifName');
    const detail = document.getElementById('scanNotifDetail');
    const course = document.getElementById('scanNotifCourse');
    const extra  = document.getElementById('scanNotifExtra');

    // Limpiar timer anterior
    if (notifTimer) clearTimeout(notifTimer);

    if (tipo === 'ok') {
        const esEntrada = record.type === CONFIG.TIPOS.ENTRADA;
        icon.textContent   = esEntrada ? '✅' : '🔴';
        name.textContent   = student.name;
        detail.textContent = `${esEntrada ? '🟢 ENTRADA' : '🔴 SALIDA'} · ${record.time}`;
        course.textContent = `${student.course}`;
        if (extra) extra.textContent = student.schedule || '';
        notif.className = 'scan-notification visible notif-ok';

    } else if (tipo === 'ya') {
        icon.textContent   = '⚠️';
        name.textContent   = student.name;
        detail.textContent = `Ya registró ${yaRegistrado.type.toLowerCase()} a las ${yaRegistrado.time}`;
        course.textContent = student.course;
        if (extra) extra.textContent = '';
        notif.className = 'scan-notification visible notif-warn';

    } else {
        icon.textContent   = '❌';
        name.textContent   = 'Código no encontrado';
        detail.textContent = 'Este QR no está registrado en el sistema';
        course.textContent = '';
        if (extra) extra.textContent = '';
        notif.className = 'scan-notification visible notif-bad';
    }

    notifTimer = setTimeout(closeScanNotif, 5000);
}

function closeScanNotif() {
    if (notifTimer) clearTimeout(notifTimer);
    const notif = document.getElementById('scanNotification');
    notif.classList.add('notif-hiding');
    setTimeout(() => { notif.className = 'scan-notification'; }, 350);
}

// ─── ESCANEO QR — PROCESAMIENTO ──────────────────────────────
let scanPaused = false;

async function onScanSuccess(decodedText) {
    if (scanPaused) return;
    scanPaused = true;

    try {
        let data;
        try { data = JSON.parse(decodedText); } catch(e) { data = { id: decodedText }; }

        const student = APP.db.students.find(s => s.id === data.id);

        if (!student) {
            mostrarNotifEscaneo('bad', null, null, null);
            showScanFeedback('bad', '❌ No registrado', 'Este QR no existe en el sistema.');
            setTimeout(() => { scanPaused = false; }, CONFIG.SCANNER.PAUSE_MS);
            return;
        }

        const mode  = document.querySelector('input[name="scanMode"]:checked')?.value || 'ENTRADA';
        const today = getToday();
        const hora  = getTime();

        const yaReg = APP.db.attendance.find(
            a => a.sid === student.id && a.date === today && a.type === mode
        );

        if (yaReg) {
            mostrarNotifEscaneo('ya', student, null, yaReg);
            showScanFeedback('warn', `⚠️ ${student.name}`, `Ya registró ${mode.toLowerCase()} hoy a las ${yaReg.time}`);
            setTimeout(() => { scanPaused = false; }, CONFIG.SCANNER.PAUSE_MS);
            return;
        }

        // ✅ Registrar asistencia
        const record = {
            sid:          student.id,
            name:         student.name,
            dni:          student.dni,
            course:       student.course,
            schedule:     student.schedule,
            date:         today,
            time:         hora,
            type:         mode,
            registeredBy: APP.currentUser?.email || 'local'
        };

        APP.db.attendance.push(record);
        saveLocal();

        // Mostrar notificación grande INMEDIATAMENTE
        mostrarNotifEscaneo('ok', student, record, null);
        showScanFeedback('ok', `✅ ${student.name}`, `${mode === 'ENTRADA' ? '🟢 Entrada' : '🔴 Salida'} · ${hora}`);

        // Actualizar estadísticas
        renderAttendanceStats();
        renderTodayLog();

        // Sincronizar con Sheets en background (sin bloquear)
        if (APP.authed) {
            sheetsAppend(CONFIG.SHEETS.ASISTENCIA, [[
                record.sid, record.name, record.dni, record.course,
                record.schedule, record.date, record.time, record.type, record.registeredBy
            ]]).catch(e => {
                console.warn('Error sincronizando asistencia:', e);
                showToast('warn', 'Sin sincronía', 'Registrado local, se sincronizará después.');
            });
        }

    } catch(e) {
        console.error('Error en onScanSuccess:', e);
        showScanFeedback('bad', '❌ Error', 'No se pudo procesar el código QR.');
    }

    setTimeout(() => { scanPaused = false; }, CONFIG.SCANNER.PAUSE_MS);
}

function showScanFeedback(type, title, msg) {
    const el = document.getElementById('scanFeedback');
    if (el) el.innerHTML = `<div class="scan-feedback ${type}"><h4>${title}</h4><p>${msg}</p></div>`;
}

// ─── ESCÁNER — cámara directa ─────────────────────────────────
let html5QrCode = null;

async function startScanner() {
    const readerEl = document.getElementById('reader');
    if (!readerEl) return;
    readerEl.innerHTML = '';
    scanPaused = false;

    readerEl.innerHTML = `
        <div id="scannerPreview" style="width:100%;background:#111;border-radius:12px;overflow:hidden;min-height:280px;display:flex;align-items:center;justify-content:center;position:relative;">
            <p id="scannerMsg" style="color:rgba(255,255,255,.65);font-size:15px;text-align:center;padding:24px;line-height:1.6;">
                📷 Presiona <b>Iniciar Cámara</b> para comenzar a escanear
            </p>
        </div>
        <div style="padding:12px 0 0;display:flex;flex-direction:column;gap:10px;">
            <button id="btnStartCam" onclick="initCamera()" class="btn btn-blue btn-block">
                📷 &nbsp;Iniciar Cámara
            </button>
            <button id="btnStopCam" onclick="stopScanner()" class="btn btn-block" style="background:var(--redS);color:var(--red);display:none;">
                ⏹ &nbsp;Detener Cámara
            </button>
            <label class="btn btn-ghost btn-block" style="cursor:pointer;">
                🖼️ &nbsp;Escanear desde Imagen
                <input type="file" accept="image/*" style="display:none" onchange="scanFromFile(this)">
            </label>
        </div>
    `;
}

// ─── DETECCIÓN DE PANTALLA NEGRA ─────────────────────────────
function detectBlackScreen(videoEl, timeoutMs = 3000) {
    return new Promise(resolve => {
        const start = Date.now();
        function check() {
            try {
                if (!videoEl || !videoEl.videoWidth) {
                    if (Date.now() - start < timeoutMs) { setTimeout(check, 200); return; }
                    return resolve(false); // sin datos aún, no conclusivo
                }
                const c = document.createElement('canvas');
                c.width = 32; c.height = 32;
                const ctx = c.getContext('2d');
                ctx.drawImage(videoEl, 0, 0, 32, 32);
                const d = ctx.getImageData(0, 0, 32, 32).data;
                let total = 0;
                for (let i = 0; i < d.length; i += 4) total += d[i] + d[i+1] + d[i+2];
                resolve(total > 500); // true = hay imagen real
            } catch(e) { resolve(false); }
        }
        setTimeout(check, 1200);
    });
}

async function initCamera() {
    const btnStart  = document.getElementById('btnStartCam');
    const btnStop   = document.getElementById('btnStopCam');
    const preview   = document.getElementById('scannerPreview');
    const msg       = document.getElementById('scannerMsg');

    if (btnStart) { btnStart.textContent = '⏳  Iniciando cámara...'; btnStart.disabled = true; }

    // Mostrar spinner visual mientras inicia
    if (preview) {
        const existingMsg = preview.querySelector('#scannerMsg');
        if (existingMsg) {
            existingMsg.innerHTML = `<div class="cam-checking"><div class="cam-spinner"></div><span>Buscando cámara...</span></div>`;
        }
    }
    if (html5QrCode) {
        try { await html5QrCode.stop(); await html5QrCode.clear(); } catch(e) {}
        html5QrCode = null;
    }

    // Limpiar mensaje inicial
    if (msg) msg.remove();

    // Estrategias de constraints para máxima compatibilidad
    const constraintStrategies = [
        { facingMode: { ideal: 'environment' } },  // cámara trasera ideal
        { facingMode: 'environment' },              // cámara trasera estricta
        { facingMode: 'user' },                     // cámara frontal
        {}                                          // cualquier cámara
    ];

    const w = preview ? Math.min((preview.offsetWidth || 320) - 40, 260) : 220;

    // Intentar primero con getUserMedia directo para verificar permisos
    let permOk = false;
    try {
        const testStream = await navigator.mediaDevices.getUserMedia({ video: true });
        testStream.getTracks().forEach(t => t.stop());
        permOk = true;
    } catch(permErr) {
        const msg2 = (permErr?.message || '').toLowerCase();
        if (msg2.includes('permission') || msg2.includes('denied') || msg2.includes('notallowed')) {
            showCamError('🔒 Permiso de cámara denegado.\n\nVe a Ajustes del navegador → Permisos del sitio → Cámara → Permitir.\nLuego recarga la página.');
            if (btnStart) { btnStart.textContent = '📷  Intentar de nuevo'; btnStart.disabled = false; }
            return;
        }
    }

    let started = false;
    let lastErr = null;

    try {
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
            showCamError('No se encontró ninguna cámara. Verifica que el dispositivo tenga cámara.');
            if (btnStart) { btnStart.textContent = '📷  Intentar de nuevo'; btnStart.disabled = false; }
            return;
        }

        // Ordenar: cámara trasera primero
        const sorted = [...cameras].sort((a, b) => {
            const aBack = /back|rear|environment|trasera|0/i.test(a.label);
            const bBack = /back|rear|environment|trasera|0/i.test(b.label);
            return bBack - aBack;
        });

        for (const cam of sorted) {
            if (started) break;
            html5QrCode = new Html5Qrcode('scannerPreview');
            try {
                await html5QrCode.start(
                    cam.id,
                    {
                        fps: 10,
                        qrbox: { width: w, height: w },
                        aspectRatio: 1.333,
                        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
                    },
                    (decoded) => onScanSuccess(decoded),
                    () => {}
                );

                // Verificar pantalla negra
                const videoEl = document.querySelector('#scannerPreview video');
                const hasImage = await detectBlackScreen(videoEl, 3500);

                if (!hasImage) {
                    // Pantalla negra detectada → intentar siguiente cámara
                    console.warn('Pantalla negra detectada en', cam.label, '— probando siguiente...');
                    try { await html5QrCode.stop(); await html5QrCode.clear(); } catch(e) {}
                    html5QrCode = null;
                    continue;
                }

                started = true;
            } catch(e) {
                lastErr = e;
                try { await html5QrCode.stop(); await html5QrCode.clear(); } catch(ee) {}
                html5QrCode = null;
            }
        }

        // Si con IDs de cámara no funcionó, intentar con facingMode constraints
        if (!started) {
            for (const constraint of constraintStrategies) {
                if (started) break;
                html5QrCode = new Html5Qrcode('scannerPreview');
                try {
                    await html5QrCode.start(
                        { facingMode: constraint.facingMode || 'environment' },
                        {
                            fps: 10,
                            qrbox: { width: w, height: w },
                            aspectRatio: 1.333,
                            experimentalFeatures: { useBarCodeDetectorIfSupported: true }
                        },
                        (decoded) => onScanSuccess(decoded),
                        () => {}
                    );

                    const videoEl = document.querySelector('#scannerPreview video');
                    const hasImage = await detectBlackScreen(videoEl, 3000);

                    if (hasImage) {
                        started = true;
                    } else {
                        try { await html5QrCode.stop(); await html5QrCode.clear(); } catch(e) {}
                        html5QrCode = null;
                    }
                } catch(e) {
                    lastErr = e;
                    try { await html5QrCode.stop(); await html5QrCode.clear(); } catch(ee) {}
                    html5QrCode = null;
                }
            }
        }

        if (started) {
            if (btnStart) btnStart.style.display = 'none';
            if (btnStop)  btnStop.style.display  = 'flex';
        } else {
            const msg2 = (lastErr?.message || lastErr?.toString() || '').toLowerCase();
            let texto = 'No se pudo iniciar la cámara. Intenta recargar la página.';
            if (msg2.includes('notfound') || msg2.includes('devicenotfound')) {
                texto = 'No se encontró cámara disponible en este dispositivo.';
            }
            showCamError(texto);
            if (btnStart) { btnStart.textContent = '📷  Intentar de nuevo'; btnStart.disabled = false; }
        }

    } catch(err) {
        console.error('initCamera error:', err);
        const msg2 = (err?.message || err?.toString() || '').toLowerCase();
        let texto = 'No se pudo acceder a la cámara.';
        if (msg2.includes('permission') || msg2.includes('denied') || msg2.includes('notallowed')) {
            texto = '🔒 Permiso de cámara denegado.\n\nVe a Ajustes del navegador → Permisos del sitio → Cámara → Permitir.\nLuego recarga la página.';
        } else if (msg2.includes('notfound') || msg2.includes('devicenotfound')) {
            texto = 'No se encontró cámara disponible en este dispositivo.';
        }
        showCamError(texto);
        if (btnStart) { btnStart.textContent = '📷  Intentar de nuevo'; btnStart.disabled = false; }
    }
}

function showCamError(msg) {
    const el = document.getElementById('scanFeedback');
    if (el) el.innerHTML = `<div class="scan-feedback bad" style="margin-top:10px;white-space:pre-line;"><h4>⚠️ Error de cámara</h4><p>${msg}</p></div>`;
}

async function stopScanner() {
    if (html5QrCode) {
        try { await html5QrCode.stop(); } catch(e) {}
        try { await html5QrCode.clear(); } catch(e) {}
        html5QrCode = null;
    }
    const readerEl = document.getElementById('reader');
    if (readerEl) {
        // Volver al estado inicial sin destruir el contenedor
        startScanner();
    }
    const btnStart = document.getElementById('btnStartCam');
    const btnStop  = document.getElementById('btnStopCam');
    if (btnStart) btnStop.style.display = 'none';
    if (btnStop)  btnStart.style.display = 'flex';
}

async function scanFromFile(input) {
    const file = input.files[0];
    if (!file) return;

    showScanFeedback('info', '🔍 Analizando imagen...', 'Buscando código QR...');

    const tmpId = 'qr_tmp_' + Date.now();
    const tmp = document.createElement('div');
    tmp.id = tmpId;
    tmp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(tmp);

    const qr = new Html5Qrcode(tmpId);
    try {
        const result = await qr.scanFile(file, true);
        await onScanSuccess(result);
    } catch(e) {
        showScanFeedback('bad', '❌ QR no encontrado', 'No se detectó ningún código QR válido en la imagen.');
    } finally {
        try { await qr.clear(); } catch(e) {}
        if (tmp.parentNode) document.body.removeChild(tmp);
        input.value = '';
    }
}

// ─── GESTIÓN DE PERMISOS ─────────────────────────────────────
async function addPermiso(event) {
    event.preventDefault();
    const email  = document.getElementById('permEmail').value.trim().toLowerCase();
    const nombre = document.getElementById('permNombre').value.trim();
    const rol    = document.getElementById('permRol').value;

    if (APP.db.permisos.find(p => p.email === email)) {
        showToast('warn','Ya existe',`${email} ya tiene permisos.`); return;
    }
    APP.db.permisos.push({ email, nombre, rol });
    saveLocal();
    try {
        await sheetsAppend(CONFIG.SHEETS.PERMISOS, [[email, nombre, rol]]);
        showToast('ok','Permiso agregado',`${email} — ${rol}`);
    } catch(e) { showToast('warn','Solo local','No se sincronizó con Sheets.'); }
    document.getElementById('permForm').reset();
    renderPermisos();
}

async function deletePermiso(email) {
    APP.db.permisos = APP.db.permisos.filter(p => p.email !== email);
    saveLocal(); renderPermisos();
    showToast('ok','Eliminado', email);
    try {
        await sheetsClear(CONFIG.RANGES.PERMISOS);
        if (APP.db.permisos.length) {
            await sheetsUpdate('Permisos!A2', APP.db.permisos.map(p => [p.email, p.nombre, p.rol]));
        }
    } catch(e) { console.warn('deletePermiso sync error:', e); }
}

function renderPermisos() {
    const tbody = document.getElementById('permisosBody');
    if (!tbody) return;
    if (!APP.db.permisos.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">No hay permisos registrados</td></tr>'; return;
    }
    tbody.innerHTML = APP.db.permisos.map(p => `
        <tr>
            <td>${p.email}</td>
            <td>${p.nombre||'—'}</td>
            <td><span class="role-tag role-${p.rol}">${p.rol}</span></td>
            <td><button class="btn btn-red btn-xs" onclick="deletePermiso('${p.email}')">🗑 Eliminar</button></td>
        </tr>`).join('');
}

// ─── DOM DIFF — actualiza sin parpadeo ───────────────────────
// Actualiza el innerHTML de un contenedor solo si cambió
function patchHTML(el, newHtml) {
    if (!el) return;
    if (el.innerHTML === newHtml) return; // sin cambios → no tocar DOM
    // Si el contenido es una lista de filas, actualizar fila a fila
    const tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    const newNodes = Array.from(tmp.children);
    const oldNodes = Array.from(el.children);

    if (newNodes.length === 0) { el.innerHTML = newHtml; return; }

    // Agregar/actualizar nodos
    newNodes.forEach((newNode, i) => {
        if (i < oldNodes.length) {
            if (oldNodes[i].outerHTML !== newNode.outerHTML) {
                el.replaceChild(newNode.cloneNode(true), oldNodes[i]);
            }
        } else {
            el.appendChild(newNode.cloneNode(true));
        }
    });
    // Remover nodos extra
    while (el.children.length > newNodes.length) {
        el.removeChild(el.lastChild);
    }
}

// ─── RENDER GENERAL ──────────────────────────────────────────
function refreshAll() {
    renderRecentRegistrations();
    renderStudentsTable();
    renderAttendanceStats();
    renderTodayLog();
    renderReports();
    populateCourseFilters();
    renderPermisos();
}

function renderRecentRegistrations() {
    const list = [...APP.db.students].reverse().slice(0,5);
    const c = document.getElementById('recentList');
    if (!c) return;
    if (!list.length) { patchHTML(c, '<p class="empty-msg">No hay registros todavía</p>'); return; }
    const html = list.map(s => `
        <div class="list-row">
            <div class="cell-name">
                <div class="avatar" style="background:${getAvatarColor(s.name)}">${getInitials(s.name)}</div>
                <div><b>${s.name}</b><br><small style="color:var(--txt3)">${s.course||''}</small></div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
                ${s.registeredBy?`<small class="reg-by">${s.registeredBy.split('@')[0]}</small>`:''}
                <button class="btn btn-blue btn-sm" onclick="openQRModal('${s.id}')">📱 QR</button>
            </div>
        </div>`).join('');
    patchHTML(c, html);
}

function renderStudentsTable() {
    const q = (document.getElementById('searchBox')?.value||'').toLowerCase();
    const today = getToday();
    const list = APP.db.students.filter(s =>
        s.name.toLowerCase().includes(q) || s.dni.includes(q) || (s.course||'').toLowerCase().includes(q)
    );
    const tbody = document.getElementById('studentsBody');
    if (!tbody) return;
    if (!list.length) { patchHTML(tbody, '<tr><td colspan="6" class="empty-msg">Sin estudiantes</td></tr>'); return; }
    const html = list.map(s => {
        const ok = APP.db.attendance.find(a => a.sid===s.id && a.date===today && a.type===CONFIG.TIPOS.ENTRADA);
        return `<tr>
            <td><div class="cell-name">
                <div class="avatar" style="background:${getAvatarColor(s.name)}">${getInitials(s.name)}</div>
                <div><b>${s.name}</b><br><small style="color:var(--txt3)">${s.email||''}</small></div>
            </div></td>
            <td>${s.dni}</td>
            <td><span class="course-badge">${s.course||'—'}</span></td>
            <td><small class="schedule-chip">${s.schedule||'—'}</small></td>
            <td><span class="tag ${ok?'tag-ok':'tag-no'}">${ok?'Presente':'Ausente'}</span></td>
            <td><button class="btn btn-blue btn-sm" onclick="openQRModal('${s.id}')">📱</button></td>
        </tr>`;
    }).join('');
    patchHTML(tbody, html);
}

function renderTodayLog() {
    const today = getToday();
    const log   = APP.db.attendance.filter(a => a.date===today).reverse();
    ['todayLog','todayLog2'].forEach(id => {
        const c = document.getElementById(id);
        if (!c) return;
        if (!log.length) { patchHTML(c, '<p class="empty-msg">Esperando lecturas de QR...</p>'); return; }
        const html = log.map(a => {
            const ent = a.type===CONFIG.TIPOS.ENTRADA;
            return `<div class="list-row">
                <div class="cell-name">
                    <div class="avatar" style="background:${getAvatarColor(a.name)}">${getInitials(a.name)}</div>
                    <div><b>${a.name}</b><br><small style="color:var(--txt2)">${a.course||''}</small></div>
                </div>
                <div style="display:flex;align-items:center;gap:7px">
                    <span class="tag ${ent?'tag-ok':'tag-warn'}">${ent?'🟢 Entrada':'🔴 Salida'}</span>
                    <span class="list-time">${a.time}</span>
                </div>
            </div>`;
        }).join('');
        patchHTML(c, html);
    });
}

function renderAttendanceStats() {
    const today   = getToday();
    const total   = APP.db.students.length;
    const present = new Set(APP.db.attendance.filter(a=>a.date===today&&a.type===CONFIG.TIPOS.ENTRADA).map(a=>a.sid)).size;
    const exits   = APP.db.attendance.filter(a=>a.date===today&&a.type===CONFIG.TIPOS.SALIDA).length;
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    set('statTotal',total); set('statPresent',present);
    set('statAbsent',Math.max(0,total-present)); set('statExits',exits);
}

// ─── REPORTES ────────────────────────────────────────────────
function populateCourseFilters() {
    let names = APP.db.courses.filter(c=>c.active!==false).map(c=>c.name);
    if (!names.length) names = [...new Set(APP.db.students.map(s=>s.course))].filter(Boolean);
    names = [...new Set(names)].sort();

    const fill = (id, prefix, opts) => {
        const el = document.getElementById(id); if (!el) return;
        const cur = el.value;
        el.innerHTML = `<option value="">${prefix}</option>` + opts.map(n=>`<option value="${n}" ${n===cur?'selected':''}>${n}</option>`).join('');
    };
    fill('inputCourse', 'Seleccionar curso...', names);
    fill('reportGrade', 'Todos los cursos', names);

    const scheds = [...new Set(APP.db.students.map(s=>s.schedule))].filter(Boolean).sort();
    fill('reportSchedule', 'Todos los horarios', scheds);
}

function renderReports() {
    const today    = getToday();
    const dateFrom = document.getElementById('reportDateFrom')?.value || today;
    const dateTo   = document.getElementById('reportDateTo')?.value   || today;
    const course   = document.getElementById('reportGrade')?.value    || '';
    const schedule = document.getElementById('reportSchedule')?.value || '';

    let att = APP.db.attendance.filter(a => a.date>=dateFrom && a.date<=dateTo);
    if (course)   att = att.filter(a => a.course===course);
    if (schedule) att = att.filter(a => a.schedule===schedule);

    let sts = [...APP.db.students];
    if (course)   sts = sts.filter(s => s.course===course);
    if (schedule) sts = sts.filter(s => s.schedule===schedule);

    const entries = att.filter(a => a.type===CONFIG.TIPOS.ENTRADA);
    const exits   = att.filter(a => a.type===CONFIG.TIPOS.SALIDA);
    const pids    = new Set(entries.map(a=>a.sid));
    const absent  = sts.filter(s => !pids.has(s.id));

    const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
    set('reportTotal',sts.length); set('reportPresent',entries.length);
    set('reportAbsent',absent.length); set('reportExits',exits.length);

    const body = document.getElementById('reportBody');
    if (!body) return;
    if (!entries.length && !absent.length) {
        body.innerHTML='<tr><td colspan="6" class="empty-msg">Sin datos</td></tr>'; return;
    }
    let rows = '';
    entries.forEach(a => {
        const sal = exits.find(x=>x.sid===a.sid&&x.date===a.date)?.time||'—';
        rows += `<tr><td><b>${a.name}</b></td><td><span class="course-badge">${a.course}</span></td><td>${a.date}</td><td><span class="tag tag-ok">Presente</span></td><td>${a.time}</td><td>${sal}</td></tr>`;
    });
    absent.forEach(s => {
        rows += `<tr><td><b>${s.name}</b></td><td><span class="course-badge">${s.course}</span></td><td>${dateFrom===dateTo?dateFrom:`${dateFrom}–${dateTo}`}</td><td><span class="tag tag-no">Ausente</span></td><td>—</td><td>—</td></tr>`;
    });
    body.innerHTML = rows;
    renderScheduleForDay(today);
}

function renderScheduleForDay(dateStr) {
    const c = document.getElementById('scheduleToday');
    if (!c) return;
    const days  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const dow   = days[new Date(dateStr+'T12:00:00').getDay()];
    const sched = APP.db.schedules.filter(s => s.day.toLowerCase()===dow);
    if (!sched.length) { c.innerHTML='<p class="empty-msg">No hay horarios para hoy</p>'; return; }
    c.innerHTML = sched.map(s=>`
        <div class="list-row">
            <div><b>${s.courseName}</b><br><small style="color:var(--txt2)">${s.room?'Aula: '+s.room:''}</small></div>
            <span class="list-time">${s.startTime} – ${s.endTime}</span>
        </div>`).join('');
}

function downloadReport() {
    const { jsPDF } = window.jspdf;
    const today    = getToday();
    const dateFrom = document.getElementById('reportDateFrom')?.value || today;
    const dateTo   = document.getElementById('reportDateTo')?.value   || today;
    const course   = document.getElementById('reportGrade')?.value    || '';
    const schedule = document.getElementById('reportSchedule')?.value || '';

    let att = APP.db.attendance.filter(a=>a.date>=dateFrom&&a.date<=dateTo);
    if (course)   att = att.filter(a=>a.course===course);
    if (schedule) att = att.filter(a=>a.schedule===schedule);

    let sts = [...APP.db.students];
    if (course)   sts = sts.filter(s=>s.course===course);
    if (schedule) sts = sts.filter(s=>s.schedule===schedule);

    const entries = att.filter(a=>a.type===CONFIG.TIPOS.ENTRADA);
    const exits   = att.filter(a=>a.type===CONFIG.TIPOS.SALIDA);
    const pids    = new Set(entries.map(a=>a.sid));
    const absent  = sts.filter(s=>!pids.has(s.id));

    const doc  = new jsPDF('p','mm','a4');
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFillColor(27,46,74); doc.rect(0,0,pageW,28,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(18);
    doc.text('INSTITUTO CEAN', pageW/2,13,{align:'center'});
    doc.setFontSize(10); doc.text('REPORTE DE ASISTENCIA',pageW/2,22,{align:'center'});
    doc.setTextColor(0,0,0); let y=38; doc.setFontSize(10);
    const periodo = dateFrom===dateTo ? dateFrom : `${dateFrom} al ${dateTo}`;
    doc.text(`Período: ${periodo}`,14,y);
    if (course)   doc.text(`Curso: ${course}`,14,y+6);
    if (schedule) doc.text(`Horario: ${schedule}`,14,y+12);
    y += (course||schedule) ? 22 : 10;
    doc.setFont(undefined,'bold');
    doc.text(`Total: ${sts.length}  |  Presentes: ${entries.length}  |  Ausentes: ${absent.length}`,14,y);
    doc.setFont(undefined,'normal'); y+=10;
    doc.setFillColor(27,46,74); doc.rect(14,y,pageW-28,7,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont(undefined,'bold');
    ['ESTUDIANTE','CURSO','FECHA','ESTADO','ENTRADA','SALIDA'].forEach((h,i)=>{
        doc.text(h,[16,70,108,130,150,172][i],y+5);
    });
    doc.setFont(undefined,'normal'); doc.setTextColor(0,0,0); y+=10;
    const addRow=(name,course,date,status,entry,exit,even)=>{
        if(y>278){doc.addPage();y=20;}
        if(even){doc.setFillColor(248,246,242);doc.rect(14,y-4,pageW-28,7,'F');}
        doc.setFontSize(8);
        doc.text(name.substring(0,28),16,y);
        doc.text((course||'').substring(0,18),70,y);
        doc.text(date,108,y); doc.text(status,130,y);
        doc.text(entry,150,y); doc.text(exit,172,y);
        y+=7;
    };
    entries.forEach((a,i)=>addRow(a.name,a.course,a.date,'PRESENTE',a.time,exits.find(x=>x.sid===a.sid&&x.date===a.date)?.time||'—',i%2===0));
    absent.forEach((s,i)=>addRow(s.name,s.course,'—','AUSENTE','—','—',(entries.length+i)%2===0));
    y+=8; doc.setFontSize(7); doc.setTextColor(150);
    doc.text(`Generado: ${new Date().toLocaleString('es-BO')} | Instituto CEAN`,14,y);
    doc.save(`Reporte_CEAN_${dateFrom}_${dateTo}.pdf`);
    showToast('ok','Reporte generado','PDF descargado');
}

// ─── MODAL CARNET 3D ─────────────────────────────────────────

// Cache local de fotos (base64) para el modal
const photoCache = {};

// Descarga una foto de Google Drive usando el token de auth y la convierte a base64
async function loadDrivePhotoAsBase64(driveUrl, studentId) {
    try {
        const token = getToken();
        if (!token) return null;

        // Extraer fileId de distintos formatos de URL de Drive:
        // https://drive.google.com/uc?export=view&id=FILE_ID
        // https://drive.google.com/file/d/FILE_ID/view
        // https://lh3.googleusercontent.com/d/FILE_ID
        let fileId = null;

        const ucMatch  = driveUrl.match(/[?&]id=([^&]+)/);
        const fdMatch  = driveUrl.match(/\/d\/([^/]+)/);
        const lhMatch  = driveUrl.match(/\/d\/([^/?]+)/);

        if (ucMatch)       fileId = ucMatch[1];
        else if (fdMatch)  fileId = fdMatch[1];
        else if (lhMatch)  fileId = lhMatch[1];

        if (!fileId) return null;

        // Usar Drive API v3 para descargar el contenido del archivo
        const apiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const r = await fetch(apiUrl, {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        if (!r.ok) return null;

        const blob   = await r.blob();
        const reader = new FileReader();
        return await new Promise(resolve => {
            reader.onload  = e => resolve(e.target.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch(e) {
        console.warn('loadDrivePhotoAsBase64 error:', e);
        return null;
    }
}

function openQRModal(studentId) {
    const s = APP.db.students.find(s => s.id === studentId);
    if (!s) return;

    // Buscar la foto: 1) cache local base64, 2) photo en objeto, 3) photoUrl base64
    const cachedPhoto = photoCache[studentId] || s.photo || (s.photoUrl?.startsWith('data:') ? s.photoUrl : null);
    APP.lastStudent = { ...s, photo: cachedPhoto };

    // Reset flip
    const inner = document.getElementById('carnetInner');
    if (inner) inner.classList.remove('flipped');

    // Rellenar FRENTE
    const initials = (s.name || '?').split(' ').map(w => w[0] || '').join('').substring(0, 2).toUpperCase();
    document.getElementById('cnName').textContent     = s.name || '—';
    document.getElementById('cnRole').textContent     = 'Estudiante';
    document.getElementById('cnDept').textContent     = s.course || '—';
    document.getElementById('cnDni').textContent      = s.dni || '—';
    document.getElementById('cnYear').textContent     = new Date().getFullYear();
    document.getElementById('cnSchedule').textContent = s.schedule || '—';

    // Foto: cargar y mostrar
    const photoInner  = document.getElementById('cnPhotoInner');
    const placeholder = document.getElementById('cnInitials');

    // Limpiar estado anterior
    let existingImg = photoInner.querySelector('img');
    placeholder.style.display = '';
    placeholder.textContent   = initials;
    if (existingImg) { existingImg.style.display = 'none'; }

    function showPhoto(src) {
        placeholder.style.display = 'none';
        if (!existingImg) {
            existingImg = document.createElement('img');
            existingImg.style.cssText = 'width:100%;height:100%;object-fit:cover;object-position:center top;position:absolute;inset:0;border-radius:8px;';
            photoInner.style.position = 'relative';
            photoInner.appendChild(existingImg);
        }
        existingImg.style.display = 'block';
        existingImg.src = src;
        existingImg.onerror = () => {
            existingImg.style.display = 'none';
            placeholder.style.display = '';
        };
        // También guardar en lastStudent para el PDF
        APP.lastStudent.photo = src;
    }

    function showPhotoLoading() {
        placeholder.style.display = '';
        placeholder.textContent   = '⏳';
        placeholder.style.fontSize = '18px';
    }

    if (cachedPhoto) {
        showPhoto(cachedPhoto);
    } else if (s.photoUrl && s.photoUrl.startsWith('http')) {
        // Mostrar indicador de carga mientras se descarga desde Drive
        showPhotoLoading();
        // Extraer el file ID de la URL de Drive y usar la API con auth token
        loadDrivePhotoAsBase64(s.photoUrl, studentId).then(b64 => {
            if (b64) {
                photoCache[studentId]  = b64;
                APP.lastStudent.photo  = b64;
                showPhoto(b64);
            } else {
                // Resetear placeholder si falla
                placeholder.textContent = initials;
                placeholder.style.fontSize = '';
            }
        });
    }

    // Rellenar DORSO
    document.getElementById('cnDniBack').textContent = s.dni || '—';
    document.getElementById('cnSid').textContent     = s.id || '—';

    // QR en el dorso
    const qrContainer = document.getElementById('cnQrCode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: JSON.stringify({ id: s.id }),
        width: 104, height: 104,
        correctLevel: QRCode.CorrectLevel.H
    });

    document.getElementById('overlay').classList.add('open');
}

// Llamar esto al registrar un alumno para guardar la foto en cache
function cacheStudentPhoto(studentId, base64) {
    if (studentId && base64) photoCache[studentId] = base64;
}

function closeModal() {
    document.getElementById('overlay').classList.remove('open');
}

async function downloadCarnetPDF() {
    if (!APP.lastStudent) return;

    const s = APP.lastStudent;

    // Si hay URL de Drive pero aún no tenemos base64, intentar cargarla ahora
    if (!s.photo && s.photoUrl && s.photoUrl.startsWith('http')) {
        showToast('info', 'Cargando foto...', 'Descargando imagen desde Drive');
        const b64 = await loadDrivePhotoAsBase64(s.photoUrl, s.id);
        if (b64) {
            photoCache[s.id]  = b64;
            s.photo           = b64;
            APP.lastStudent.photo = b64;
        }
    }

    showToast('info', 'Generando PDF...', 'Por favor espera un momento');
    const doc = new (window.jspdf.jsPDF)({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw  = doc.internal.pageSize.getWidth();   // 210mm
    const ph  = doc.internal.pageSize.getHeight();  // 297mm

    // Dimensiones carnet en mm (tarjeta CR80: 85.6 × 54mm)
    const cw = 85.6, ch = 54;
    const cx = (pw - cw) / 2;

    // Fondo página
    doc.setFillColor(15, 20, 28);
    doc.rect(0, 0, pw, ph, 'F');

    // ── Título ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(200, 169, 110);
    doc.text('INSTITUTO CEAN — CREDENCIAL OFICIAL', pw / 2, 18, { align: 'center' });
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('Sistema de Asistencia Escolar', pw / 2, 23, { align: 'center' });

    // ── Renderizar FRENTE ──
    const frontCanvas = await renderCarnetFaceToCanvas('front', s);
    const cy1 = 30;
    doc.addImage(frontCanvas.toDataURL('image/png'), 'PNG', cx, cy1, cw, ch);
    // Sombra simulada
    doc.setDrawColor(200, 169, 110, 0.3);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, cy1, cw, ch, 2, 2, 'S');

    // Etiqueta FRENTE
    doc.setFontSize(6.5);
    doc.setTextColor(180, 180, 180);
    doc.text('▲  FRENTE', cx, cy1 - 2);

    // ── Renderizar REVERSO ──
    const backCanvas = await renderCarnetFaceToCanvas('back', s);
    const cy2 = cy1 + ch + 12;
    doc.addImage(backCanvas.toDataURL('image/png'), 'PNG', cx, cy2, cw, ch);
    doc.setDrawColor(180, 180, 180, 0.2);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx, cy2, cw, ch, 2, 2, 'S');

    // Etiqueta REVERSO
    doc.setFontSize(6.5);
    doc.setTextColor(180, 180, 180);
    doc.text('▲  REVERSO', cx, cy2 - 2);

    // ── Datos del alumno al pie ──
    const dataY = cy2 + ch + 16;
    doc.setFillColor(27, 58, 45, 0.5);
    doc.roundedRect(cx, dataY, cw, 28, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(200, 169, 110);
    doc.text(s.name || '—', cx + cw / 2, dataY + 7, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(220, 220, 220);
    doc.text(`CI: ${s.dni || '—'}`, cx + cw / 2, dataY + 13, { align: 'center' });
    doc.text(`${s.course || '—'}`, cx + cw / 2, dataY + 18, { align: 'center' });
    doc.text(`${s.schedule || '—'}`, cx + cw / 2, dataY + 23, { align: 'center' });

    // ── Pie de página ──
    doc.setFontSize(6);
    doc.setTextColor(80, 80, 80);
    doc.text(`Emitido: ${new Date().toLocaleDateString('es-BO')} · ID: ${s.id}`, pw / 2, ph - 10, { align: 'center' });
    doc.text('institutocean.edu.bo', pw / 2, ph - 6, { align: 'center' });

    doc.save(`Carnet_${s.name?.replace(/\s+/g,'_') || s.dni}.pdf`);
    showToast('ok', 'PDF generado', `Carnet de ${s.name}`);
}

// Renderiza una cara del carnet a canvas de alta resolución
async function renderCarnetFaceToCanvas(face, student) {
    // Escala para alta resolución (2x)
    const SCALE = 3;
    const W = Math.round(322 * SCALE);  // 85.6mm a 96dpi ×3
    const H = Math.round(204 * SCALE);  // 54mm a 96dpi ×3
    const c   = document.createElement('canvas');
    c.width   = W; c.height = H;
    const ctx = c.getContext('2d');
    const s   = SCALE;

    if (face === 'front') {
        await drawCarnetFront(ctx, W, H, s, student);
    } else {
        await drawCarnetBack(ctx, W, H, s, student);
    }
    return c;
}

async function drawCarnetFront(ctx, W, H, s, student) {
    const forest = '#1b3a2d', gold = '#c8a96e', goldL = '#e0c48a', white = '#ffffff';

    // Fondo
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f2a1e'); bg.addColorStop(1, forest);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Brillo esquina
    const gl = ctx.createRadialGradient(W * .8, H * .1, 0, W * .8, H * .1, W * .4);
    gl.addColorStop(0, 'rgba(200,169,110,.08)'); gl.addColorStop(1, 'transparent');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);

    // Header strip
    const hH = H * .28;
    const hg = ctx.createLinearGradient(0, 0, W, 0);
    hg.addColorStop(0, '#0a1f16'); hg.addColorStop(1, '#163022');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, hH);
    ctx.fillStyle = 'rgba(200,169,110,.22)';
    ctx.fillRect(0, hH - 1 * s, W, 1 * s);

    // Logo icono
    const lx = 14 * s, ly = 7 * s, ls = 22 * s, lr = 5 * s;
    roundRectPath(ctx, lx, ly, ls, ls, lr);
    ctx.fillStyle = gold; ctx.fill();
    // Ícono graduación simplificado
    ctx.strokeStyle = forest; ctx.lineWidth = 1.4 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lx + ls*.1, ly + ls*.5); ctx.lineTo(lx + ls*.5, ly + ls*.28); ctx.lineTo(lx + ls*.9, ly + ls*.5); ctx.lineTo(lx + ls*.5, ly + ls*.72); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx + ls*.28, ly + ls*.55); ctx.lineTo(lx + ls*.28, ly + ls*.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx + ls*.72, ly + ls*.55); ctx.lineTo(lx + ls*.72, ly + ls*.8); ctx.stroke();

    // Org name
    ctx.fillStyle = white;
    ctx.font = `bold ${8 * s}px 'Georgia', serif`;
    ctx.textBaseline = 'top';
    ctx.fillText('Instituto CEAN', (lx + ls + 7 * s), ly + 2 * s);
    ctx.fillStyle = gold;
    ctx.font = `${5.5 * s}px Arial, sans-serif`;
    ctx.fillText('SISTEMA DE ASISTENCIA', (lx + ls + 7 * s), ly + 13 * s);

    // Foto
    const px = 14 * s, py = hH + 8 * s, pw = 54 * s, ph = 68 * s, pr = 7 * s;
    // Marco dorado
    const gBorder = ctx.createLinearGradient(px - 2*s, py - 2*s, px + pw + 2*s, py + ph + 2*s);
    gBorder.addColorStop(0, gold); gBorder.addColorStop(.5, goldL); gBorder.addColorStop(1, gold);
    ctx.fillStyle = gBorder;
    roundRectPath(ctx, px - 2.5*s, py - 2.5*s, pw + 5*s, ph + 5*s, pr + 2*s);
    ctx.fill();

    // Área foto
    ctx.save();
    roundRectPath(ctx, px, py, pw, ph, pr);
    ctx.clip();
    ctx.fillStyle = '#1f4535'; ctx.fillRect(px, py, pw, ph);

    if (student.photo) {
        try {
            await new Promise((res, rej) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload  = () => { ctx.drawImage(img, px, py, pw, ph); res(); };
                img.onerror = () => res(); // fallback a placeholder
                img.src = student.photo;
            });
        } catch(e) {}
    } else {
        // Placeholder iniciales
        const ini = (student.name || '?').split(' ').map(w => w[0] || '').join('').substring(0, 2).toUpperCase();
        ctx.fillStyle = 'rgba(200,169,110,.4)';
        ctx.font = `bold ${22 * s}px Georgia, serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ini, px + pw / 2, py + ph / 2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();

    // Badge estrella
    const bx = px + pw - 8 * s, by = py + ph - 2 * s, bs = 14 * s, br2 = 4 * s;
    roundRectPath(ctx, bx, by, bs, bs, br2);
    ctx.fillStyle = gold; ctx.fill();
    ctx.fillStyle = forest;
    ctx.font = `bold ${8 * s}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('★', bx + bs / 2, by + bs / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // Datos a la derecha de la foto
    const dx = px + pw + 12 * s, dw = W - dx - 10 * s;
    const nameFull = (student.name || '—').toUpperCase();

    // Rol
    ctx.fillStyle = gold;
    ctx.font = `600 ${5.5 * s}px Arial, sans-serif`;
    ctx.letterSpacing = `${2 * s}px`;
    ctx.fillText('ESTUDIANTE', dx, hH + 16 * s);
    ctx.letterSpacing = '0px';

    // Nombre
    ctx.fillStyle = white;
    let nfs = 12 * s;
    ctx.font = `bold ${nfs}px 'Georgia', serif`;
    while (ctx.measureText(nameFull).width > dw && nfs > 6 * s) {
        nfs -= 0.5 * s; ctx.font = `bold ${nfs}px 'Georgia', serif`;
    }
    // Split si es muy largo
    if (ctx.measureText(nameFull).width > dw) {
        const parts = nameFull.split(' ');
        const half  = Math.ceil(parts.length / 2);
        ctx.font = `bold ${9 * s}px 'Georgia', serif`;
        ctx.fillText(parts.slice(0, half).join(' '), dx, hH + 27 * s);
        ctx.fillText(parts.slice(half).join(' '),    dx, hH + 38 * s);
    } else {
        ctx.fillText(nameFull, dx, hH + 30 * s);
    }

    // Curso
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.font = `${6.5 * s}px Arial, sans-serif`;
    ctx.fillText((student.course || '—').substring(0, 24), dx, hH + 44 * s);

    // Separador
    ctx.fillStyle = 'rgba(200,169,110,.25)';
    ctx.fillRect(dx, hH + 48 * s, dw, 1 * s);

    // CI
    ctx.fillStyle = 'rgba(200,169,110,.55)';
    ctx.font = `500 ${4.5 * s}px Arial, sans-serif`;
    ctx.letterSpacing = `${1.5 * s}px`;
    ctx.fillText('CI', dx, hH + 57 * s);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = white;
    ctx.font = `500 ${8 * s}px 'Courier New', monospace`;
    ctx.fillText(student.dni || '—', dx, hH + 66 * s);

    // Año
    ctx.fillStyle = 'rgba(200,169,110,.55)';
    ctx.font = `500 ${4.5 * s}px Arial, sans-serif`;
    ctx.letterSpacing = `${1.5 * s}px`;
    ctx.fillText('GESTIÓN', dx + dw * .5, hH + 57 * s);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = white;
    ctx.font = `500 ${8 * s}px 'Courier New', monospace`;
    ctx.fillText(String(new Date().getFullYear()), dx + dw * .5, hH + 66 * s);

    // Footer
    const fy = H - 13 * s;
    const fg = ctx.createLinearGradient(0, fy, W, fy);
    fg.addColorStop(0, 'rgba(200,169,110,.1)'); fg.addColorStop(1, 'rgba(200,169,110,.04)');
    ctx.fillStyle = fg; ctx.fillRect(0, fy, W, 13 * s);
    ctx.fillStyle = 'rgba(200,169,110,.18)'; ctx.fillRect(0, fy, W, 0.8 * s);

    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.font = `${5 * s}px Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('institutocean.edu.bo', 14 * s, fy + 9 * s);

    // Pill "Vigente"
    const vw = 42 * s, vx = W - vw - 10 * s, vy = fy + 4 * s, vh = 8 * s;
    roundRectPath(ctx, vx, vy, vw, vh, 4 * s);
    ctx.fillStyle = 'rgba(46,122,86,.45)'; ctx.fill();
    ctx.strokeStyle = 'rgba(46,122,86,.7)'; ctx.lineWidth = 0.8 * s; ctx.stroke();
    ctx.fillStyle = '#7ed4a3';
    ctx.font = `bold ${4.5 * s}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('● VIGENTE', vx + vw / 2, vy + vh / 2);

    // Corner marks
    const cm = 9 * s, co = 8 * s;
    ctx.strokeStyle = 'rgba(200,169,110,.28)'; ctx.lineWidth = 1.2 * s; ctx.lineCap = 'square';
    [[co, co, 1, 0, 0, 1], [W-co, co, -1, 0, 0, 1], [co, H-co, 1, 0, 0, -1], [W-co, H-co, -1, 0, 0, -1]].forEach(([x, y, sx, sy, ex, ey]) => {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cm * sx, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + cm * ey); ctx.stroke();
    });
}

async function drawCarnetBack(ctx, W, H, s, student) {
    const forest = '#1b3a2d', cream = '#f5f0e8', creamDk = '#e8e0d0', gold = '#c8a96e', ink = '#1a1a1a';

    // Fondo crema
    ctx.fillStyle = cream; ctx.fillRect(0, 0, W, H);

    // Textura puntos
    ctx.fillStyle = 'rgba(200,169,110,.045)';
    for (let x = 15 * s; x < W; x += 20 * s)
        for (let y = 15 * s; y < H; y += 20 * s)
            { ctx.beginPath(); ctx.arc(x, y, 0.8 * s, 0, Math.PI * 2); ctx.fill(); }

    // Barra top degradada
    const bg = ctx.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, forest); bg.addColorStop(.5, '#2e7a56'); bg.addColorStop(1, forest);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, 5 * s);

    // Nombre organización
    ctx.textAlign = 'center';
    ctx.fillStyle = forest;
    ctx.font = `bold ${10 * s}px 'Georgia', serif`;
    ctx.textBaseline = 'top';
    ctx.fillText('Instituto CEAN', W / 2, 9 * s);
    ctx.fillStyle = '#245c41';
    ctx.font = `600 ${5 * s}px Arial`;
    ctx.letterSpacing = `${1.5 * s}px`;
    ctx.fillText('CARNET DE IDENTIFICACIÓN OFICIAL', W / 2, 21 * s);
    ctx.letterSpacing = '0px';

    // Línea separadora
    ctx.fillStyle = creamDk; ctx.fillRect(14 * s, 28 * s, W - 28 * s, 1 * s);

    // CI en caja
    const bx = W / 2 - 44 * s, bw = 88 * s, by = 32 * s, bh = 22 * s;
    ctx.fillStyle = 'rgba(200,169,110,.08)';
    roundRectPath(ctx, bx, by, bw, bh, 4 * s); ctx.fill();
    ctx.strokeStyle = creamDk; ctx.lineWidth = 0.8 * s;
    roundRectPath(ctx, bx, by, bw, bh, 4 * s); ctx.stroke();

    ctx.fillStyle = '#245c41';
    ctx.font = `600 ${5 * s}px Arial`;
    ctx.letterSpacing = `${2 * s}px`;
    ctx.fillText('CARNET DE IDENTIDAD', W / 2, by + 6 * s);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = ink;
    ctx.font = `500 ${9 * s}px 'Courier New', monospace`;
    ctx.letterSpacing = `${2 * s}px`;
    ctx.fillText(student.dni || '—', W / 2, by + 17 * s);
    ctx.letterSpacing = '0px';

    // QR
    const qrS = 62 * s, qrX = W / 2 - qrS / 2, qrY = 57 * s;
    // Marco QR blanco
    const qrPad = 5 * s;
    roundRectPath(ctx, qrX - qrPad, qrY - qrPad, qrS + qrPad * 2, qrS + qrPad * 2, 6 * s);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.07)'; ctx.lineWidth = 0.8 * s;
    roundRectPath(ctx, qrX - qrPad, qrY - qrPad, qrS + qrPad * 2, qrS + qrPad * 2, 6 * s); ctx.stroke();

    // Dibujar QR real desde el DOM
    const qrCanvas = document.querySelector('#cnQrCode canvas');
    if (qrCanvas) {
        ctx.drawImage(qrCanvas, qrX, qrY, qrS, qrS);
    } else {
        // Fallback: QR placeholder
        ctx.fillStyle = '#eee'; ctx.fillRect(qrX, qrY, qrS, qrS);
        ctx.fillStyle = '#999'; ctx.font = `${6 * s}px Arial`;
        ctx.fillText('QR', qrX + qrS/2, qrY + qrS/2);
    }

    // Caption
    ctx.fillStyle = '#5a5a5a';
    ctx.font = `500 ${4.8 * s}px Arial`;
    ctx.letterSpacing = `${1 * s}px`;
    ctx.fillText('ESCANEAR PARA VERIFICAR', W / 2, qrY + qrS + qrPad + 8 * s);
    ctx.letterSpacing = '0px';

    // Línea separadora 2
    ctx.fillStyle = creamDk; ctx.fillRect(14 * s, qrY + qrS + qrPad + 14 * s, W - 28 * s, 1 * s);

    // ID sistema
    const sidY = qrY + qrS + qrPad + 20 * s;
    ctx.fillStyle = '#245c41';
    ctx.font = `600 ${4.5 * s}px Arial`;
    ctx.letterSpacing = `${2 * s}px`;
    ctx.fillText('ID SISTEMA', W / 2, sidY);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = '#888';
    ctx.font = `400 ${5.5 * s}px 'Courier New', monospace`;
    ctx.fillText((student.id || '—').substring(0, 22), W / 2, sidY + 9 * s);

    // Footer barra verde
    ctx.fillStyle = forest; ctx.fillRect(0, H - 14 * s, W, 14 * s);
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.font = `400 ${5 * s}px Arial`;
    ctx.fillText('institutocean.edu.bo', W / 2, H - 5 * s);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

async function downloadCarnetQR() {
    if (!APP.lastStudent) return;
    const canvas = document.querySelector('#cnQrCode canvas');
    if (!canvas) return;
    const out = document.createElement('canvas'); const pad = 16;
    out.width  = canvas.width  + pad * 2;
    out.height = canvas.height + pad * 2;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, pad, pad);
    const a = document.createElement('a');
    a.download = `QR_${APP.lastStudent.dni}.png`;
    a.href = out.toDataURL(); a.click();
}

// ─── CARNET PDF ──────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}
function drawAvatarPlaceholder(ctx, student, x, y, w, h) {
    const g = ctx.createLinearGradient(x,y,x+w,y+h);
    g.addColorStop(0,'#2d4a73'); g.addColorStop(1,'#1b2e4a');
    ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
    const ini = student.name.split(' ').map(p=>p[0]).join('').substring(0,2).toUpperCase();
    ctx.fillStyle='rgba(255,255,255,.5)'; ctx.font='bold 72px Georgia,serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(ini, x+w/2, y+h/2); ctx.textBaseline='alphabetic';
}

async function buildCredentialCanvas(student, qrSourceCanvas, photoDataUrl) {
    const W=1020, H=640;
    const c = document.createElement('canvas');
    c.width=W; c.height=H;
    const ctx = c.getContext('2d');
    const navy='#0f1e33', gold='#d4a843', goldL='#f0c860', white='#ffffff';

    const bgG = ctx.createLinearGradient(0,0,W,H);
    bgG.addColorStop(0,'#0d1b2a'); bgG.addColorStop(.5,'#1a2e4a'); bgG.addColorStop(1,'#142338');
    ctx.fillStyle=bgG; ctx.fillRect(0,0,W,H);

    ctx.save(); ctx.globalAlpha=.04;
    for(let px=20;px<W;px+=40) for(let py=20;py<H;py+=40){
        ctx.beginPath(); ctx.arc(px,py,1.5,0,Math.PI*2); ctx.fillStyle=white; ctx.fill();
    }
    ctx.restore();

    const sg=ctx.createLinearGradient(0,0,0,H);
    sg.addColorStop(0,gold); sg.addColorStop(.5,'#b8922e'); sg.addColorStop(1,gold);
    ctx.fillStyle=sg; ctx.fillRect(0,0,8,H);
    ctx.fillStyle='rgba(212,168,67,.15)'; ctx.fillRect(8,0,4,H);

    const hG=ctx.createLinearGradient(0,0,W,0);
    hG.addColorStop(0,navy); hG.addColorStop(.6,'#1a2e4a'); hG.addColorStop(1,'#243f63');
    ctx.fillStyle=hG; ctx.fillRect(0,0,W,72);
    ctx.fillStyle=gold; ctx.fillRect(0,72,W,3);

    ctx.font='bold 13px Arial,sans-serif'; ctx.fillStyle=goldL;
    ctx.textAlign='center'; ctx.letterSpacing='4px';
    ctx.fillText('INSTITUTO',W/2,30); ctx.letterSpacing='0px';
    ctx.font='bold 28px Crimson Pro,Georgia,serif'; ctx.fillStyle=white; ctx.fillText('CEAN',W/2,58);
    ctx.font='10px Arial,sans-serif'; ctx.fillStyle='rgba(212,168,67,.7)';
    ctx.letterSpacing='2px'; ctx.fillText('SISTEMA DE ASISTENCIA',W/2,70); ctx.letterSpacing='0px';

    const [px2,py2,pw,ph]=[20,90,220,270];
    if(photoDataUrl) {
        await new Promise(res=>{
            const img=new Image(); img.crossOrigin='anonymous';
            img.onload=()=>{ ctx.drawImage(img,px2,py2,pw,ph); res(); };
            img.onerror=()=>{ drawAvatarPlaceholder(ctx,student,px2,py2,pw,ph); res(); };
            img.src=photoDataUrl;
        });
    } else drawAvatarPlaceholder(ctx,student,px2,py2,pw,ph);
    ctx.strokeStyle=gold; ctx.lineWidth=2; ctx.strokeRect(px2,py2,pw,ph);

    if(qrSourceCanvas){
        const qs=200, qx=20, qy=390;
        ctx.fillStyle=white; ctx.fillRect(qx-8,qy-8,qs+16,qs+16);
        ctx.drawImage(qrSourceCanvas,qx,qy,qs,qs);
        ctx.strokeStyle=gold; ctx.lineWidth=2; ctx.strokeRect(qx-8,qy-8,qs+16,qs+16);
    }

    const dx=260, dy=82, dw=W-dx-20;
    const field=(label,value,x,y,maxW)=>{
        ctx.font='bold 9px Arial,sans-serif'; ctx.fillStyle=goldL; ctx.textAlign='left';
        ctx.letterSpacing='2px'; ctx.fillText(label.toUpperCase(),x+10,y); ctx.letterSpacing='0px';
        ctx.fillStyle='rgba(212,168,67,.25)'; ctx.fillRect(x+10,y+4,maxW-20,1);
        let fs=19; ctx.font=`bold ${fs}px Georgia,serif`; ctx.fillStyle=white;
        while(ctx.measureText(value).width>maxW-20&&fs>12){fs--;ctx.font=`bold ${fs}px Georgia,serif`;}
        ctx.fillText(value,x+10,y+24);
    };

    ctx.font='bold 9px Arial,sans-serif'; ctx.fillStyle=goldL; ctx.textAlign='left';
    ctx.letterSpacing='2px'; ctx.fillText('NOMBRE COMPLETO',dx+10,dy+16); ctx.letterSpacing='0px';
    ctx.fillStyle='rgba(212,168,67,.25)'; ctx.fillRect(dx+10,dy+20,dw-20,1);

    let nfs=22; ctx.font=`bold ${nfs}px Georgia,serif`;
    const fn2=student.name.toUpperCase();
    while(ctx.measureText(fn2).width>dw-20&&nfs>13){nfs--;ctx.font=`bold ${nfs}px Georgia,serif`;}
    if(ctx.measureText(fn2).width>dw-20){
        const ws=fn2.split(' '), h2=Math.ceil(ws.length/2);
        nfs=18; ctx.font=`bold ${nfs}px Georgia,serif`; ctx.fillStyle=white; ctx.textAlign='left';
        ctx.fillText(ws.slice(0,h2).join(' '),dx+10,dy+46);
        ctx.fillText(ws.slice(h2).join(' '),dx+10,dy+68);
    } else { ctx.fillStyle=white; ctx.textAlign='left'; ctx.fillText(fn2,dx+10,dy+52); }

    field('Carnet de Identidad',student.dni,     dx,     dy+98, dw/2);
    field('Año',new Date().getFullYear()+'',     dx+dw/2,dy+98, dw/2);
    field('Curso',student.course||'—',           dx,     dy+152,dw);
    field('Horario',(student.schedule||'—').substring(0,50), dx, dy+206, dw);

    const fy=H-58;
    const fG=ctx.createLinearGradient(0,fy,W,fy);
    fG.addColorStop(0,'#0a1828'); fG.addColorStop(.5,'#132030'); fG.addColorStop(1,'#0a1828');
    ctx.fillStyle=fG; ctx.fillRect(0,fy,W,H-fy);
    ctx.fillStyle=gold; ctx.fillRect(0,fy,W,3);
    ctx.textAlign='left'; ctx.fillStyle='rgba(255,255,255,.35)'; ctx.font='9px Arial,sans-serif';
    ctx.fillText(`ID: ${student.id}`,22,fy+22);
    ctx.textAlign='center'; ctx.fillStyle='rgba(212,168,67,.75)'; ctx.font='bold 10px Arial,sans-serif';
    ctx.letterSpacing='1px'; ctx.fillText('DOCUMENTO DE USO EXCLUSIVO — INSTITUTO CEAN',W/2,fy+22); ctx.letterSpacing='0px';
    ctx.textAlign='right'; ctx.fillStyle='rgba(255,255,255,.35)'; ctx.font='9px Arial,sans-serif';
    ctx.fillText(`Emitido: ${new Date().toLocaleDateString('es-BO')}`,W-22,fy+22);
    ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,.25)'; ctx.font='9px Arial,sans-serif';
    ctx.fillText('Válido para el control de ingreso y egreso del establecimiento',W/2,fy+42);
    return c;
}

function buildQRCanvas(studentId) {
    return new Promise(resolve => {
        const tmp = document.createElement('div');
        tmp.style.cssText = 'position:absolute;left:-9999px;';
        document.body.appendChild(tmp);
        new QRCode(tmp, { text: JSON.stringify({id:studentId}), width:220, height:220, correctLevel:QRCode.CorrectLevel.H });
        setTimeout(() => {
            const qrc = tmp.querySelector('canvas');
            const out = document.createElement('canvas'); const pad=18;
            out.width=(qrc?qrc.width:220)+pad*2; out.height=(qrc?qrc.height:220)+pad*2;
            const ctx=out.getContext('2d');
            ctx.fillStyle='#fff'; ctx.fillRect(0,0,out.width,out.height);
            if(qrc) ctx.drawImage(qrc,pad,pad);
            document.body.removeChild(tmp); resolve(out);
        }, 600);
    });
}

// Aliases para compatibilidad con botones del panel de registro
async function downloadQRPng() {
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas || !APP.lastStudent) return;
    const out = document.createElement('canvas'); const pad = 20;
    out.width  = canvas.width + pad*2; out.height = canvas.height + pad*2;
    const ctx  = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,out.width,out.height);
    ctx.drawImage(canvas, pad, pad);
    const a = document.createElement('a');
    a.download = `QR_${APP.lastStudent.dni}.png`; a.href = out.toDataURL(); a.click();
}
async function downloadPDF()          { await downloadCarnetPDF(); }
async function downloadPDFFromModal() { await downloadCarnetPDF(); }

// ─── NAVEGACIÓN ──────────────────────────────────────────────
function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('panel-'+btn.dataset.panel).classList.add('active');

            if (btn.dataset.panel !== 'scanner') stopScanner();
            else startScanner();

            if (btn.dataset.panel === 'reports')  renderReports();
            if (btn.dataset.panel === 'permisos') renderPermisos();
        });
    });
}

function initScanModeToggle() {
    document.querySelectorAll('input[name="scanMode"]').forEach(r=>r.addEventListener('change', updateScanModeStyles));
    updateScanModeStyles();
}
function updateScanModeStyles() {
    const sel = document.querySelector('input[name="scanMode"]:checked')?.value;
    document.querySelectorAll('.scan-mode-selector label').forEach(l=>l.classList.remove('mode-active-entrada','mode-active-salida'));
    if (sel==='ENTRADA') document.querySelector('.mode-entrada')?.classList.add('mode-active-entrada');
    else document.querySelector('.mode-salida')?.classList.add('mode-active-salida');
}

// ─── SINCRONIZACIÓN EN TIEMPO REAL ───────────────────────────
let realtimeTimer = null;
let lastStudentCount = 0;
let lastAttendanceCount = 0;
let isSyncing = false;

async function realtimeSync() {
    if (!APP.authed || !APP.currentUser || isSyncing) return;
    isSyncing = true;
    try {
        // Solo cargar estudiantes y asistencia (las tablas que cambian frecuente)
        let changed = false;

        try {
            const rows = await sheetsGet(CONFIG.RANGES.ESTUDIANTES);
            const newStudents = rows.map(r => ({
                id:r[0]||'', name:r[1]||'', dni:r[2]||'', email:r[3]||'',
                phone:r[4]||'', course:r[5]||'', schedule:r[6]||'',
                photoUrl:r[7]||'', qrUrl:r[8]||'', createdAt:r[9]||'', registeredBy:r[10]||''
            }));
            if (newStudents.length !== lastStudentCount) {
                APP.db.students = newStudents;
                lastStudentCount = newStudents.length;
                changed = true;
            }
        } catch(e) { /* mantener datos locales si falla */ }

        try {
            const rows = await sheetsGet(CONFIG.RANGES.ASISTENCIA);
            const newAtt = rows.map(r => ({
                sid:r[0]||'', name:r[1]||'', dni:r[2]||'', course:r[3]||'',
                schedule:r[4]||'', date:r[5]||'', time:r[6]||'', type:r[7]||'', registeredBy:r[8]||''
            }));
            if (newAtt.length !== lastAttendanceCount) {
                APP.db.attendance = newAtt;
                lastAttendanceCount = newAtt.length;
                changed = true;
            }
        } catch(e) {}

        if (changed) {
            saveLocal();
            // Actualizar UI sin parpadeo (patchHTML)
            renderRecentRegistrations();
            renderStudentsTable();
            renderAttendanceStats();
            renderTodayLog();
            populateCourseFilters();
            syncStatus('ok', '✅ Actualizado');
        }
    } catch(e) {
        console.warn('realtimeSync error:', e);
    }
    isSyncing = false;
}

function startRealtimeSync(intervalMs = 20000) {
    stopRealtimeSync();
    lastStudentCount = APP.db.students.length;
    lastAttendanceCount = APP.db.attendance.length;
    // Primera sync a los 5 segundos, luego cada `intervalMs`
    realtimeTimer = setInterval(realtimeSync, intervalMs);
    setTimeout(realtimeSync, 5000);
}

function stopRealtimeSync() {
    if (realtimeTimer) { clearInterval(realtimeTimer); realtimeTimer = null; }
}

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadLocal();
    initNavigation();
    initScanModeToggle();
    const today = getToday();
    const df = document.getElementById('reportDateFrom');
    const dt = document.getElementById('reportDateTo');
    if (df) df.value = today;
    if (dt) dt.value = today;
    showLoginLoading('Cargando Google...');
});
