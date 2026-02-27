// ============================================================
// app.js — Sistema de Asistencia QR · Instituto CEAN
// ============================================================

// ─── TRADUCCIÓN ESCÁNER ──────────────────────────────────────
const SCAN_TRANSLATIONS = {
    'Start Scanning': '📷 Iniciar Cámara',
    'Stop Scanning': '⏹ Detener',
    'Request Camera Permissions': '🔓 Permitir Cámara',
    'No Camera Found': '⚠️ Sin cámara',
    'Select Camera': '🎥 Seleccionar cámara',
    'Or drop an image': '— o arrastra una imagen —',
    'Select Image': '🖼️ Seleccionar Imagen',
    'Scan an Image File': '🖼️ Seleccionar Imagen',
    'Use Camera': '📷 Usar Cámara',
    'Switch To Scanning Using Camera': '📷 Usar Cámara',
    'Switch To Scanning Using Image': '🖼️ Usar Imagen',
    'No Devices Found': 'Sin dispositivos',
    'Checking...': 'Verificando...',
    'Idle': 'Esperando',
    'Loading': 'Cargando...',
    'No image chosen': 'Sin imagen',
    'Choose file': 'Elegir archivo',
    'No file chosen': 'Sin archivo',
};

function translateNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        const txt = node.textContent.trim();
        if (SCAN_TRANSLATIONS[txt]) node.textContent = node.textContent.replace(txt, SCAN_TRANSLATIONS[txt]);
    }
}
function translateScannerUI(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        const txt = node.textContent.trim();
        if (SCAN_TRANSLATIONS[txt]) node.textContent = node.textContent.replace(txt, SCAN_TRANSLATIONS[txt]);
    }
    root.querySelectorAll('button, input[type="button"]').forEach(el => {
        const v = (el.value || el.textContent || '').trim();
        if (SCAN_TRANSLATIONS[v]) { if (el.value) el.value = SCAN_TRANSLATIONS[v]; else el.textContent = SCAN_TRANSLATIONS[v]; }
    });
    root.querySelectorAll('a').forEach(a => { const t = a.textContent.trim(); if (SCAN_TRANSLATIONS[t]) a.textContent = SCAN_TRANSLATIONS[t]; });
}
let scanObserver = null;
function watchScannerTranslations() {
    const reader = document.getElementById('reader');
    if (!reader) return;
    translateScannerUI(reader);
    if (scanObserver) scanObserver.disconnect();
    scanObserver = new MutationObserver(mutations => {
        mutations.forEach(m => {
            m.addedNodes.forEach(n => { if (n.nodeType === Node.ELEMENT_NODE) translateScannerUI(n); else translateNode(n); });
            if (m.type === 'characterData') translateNode(m.target);
        });
    });
    scanObserver.observe(reader, { childList: true, subtree: true, characterData: true });
}

// ─── GOOGLE AUTH ─────────────────────────────────────────────
function onGapiLoad() {
    gapi.load('client', async () => {
        await gapi.client.init({
            apiKey: CONFIG.API_KEY,
            discoveryDocs: [
                'https://sheets.googleapis.com/$discovery/rest?version=v4',
                'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
            ]
        });
        APP.gapiOk = true;
        checkReady();
    });
}
function onGisLoad() {
    APP.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: ''
    });
    APP.gisOk = true;
    checkReady();
}
function checkReady() {
    if (APP.gapiOk && APP.gisOk) {
        document.getElementById('authBtn').style.display = 'inline-flex';
        loadLocal();
        syncStatus('g', '⏳ Sin conexión');
    }
}
function handleAuth() {
    APP.tokenClient.callback = async (resp) => {
        if (resp.error) return;
        APP.authed = true;
        // Get user info
        try {
            const profile = await gapi.client.request({ path: 'https://www.googleapis.com/oauth2/v3/userinfo' });
            APP.currentUser = { email: profile.result.email, name: profile.result.name };
        } catch(e) { APP.currentUser = { email: 'usuario@gmail.com', name: 'Usuario' }; }

        document.getElementById('authBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'inline-flex';
        syncStatus('ok', '✅ Conectado');
        await loadFromSheets();
        checkUserPermission();
    };
    const token = gapi.client.getToken();
    APP.tokenClient.requestAccessToken(token === null ? { prompt: 'consent' } : { prompt: '' });
}
function handleSignout() {
    const token = gapi.client.getToken();
    if (token) { google.accounts.oauth2.revoke(token.access_token); gapi.client.setToken(''); }
    APP.authed = false;
    APP.currentUser = null;
    document.getElementById('authBtn').style.display = 'inline-flex';
    document.getElementById('logoutBtn').style.display = 'none';
    document.getElementById('userBadge').style.display = 'none';
    syncStatus('g', '⏳ Desconectado');
    updateNavByRole(null);
}

// ─── PERMISOS / ROLES ────────────────────────────────────────
function checkUserPermission() {
    if (!APP.currentUser) return;
    const email = APP.currentUser.email.toLowerCase();
    const perm  = APP.db.permisos.find(p => p.email.toLowerCase() === email);

    if (!perm) {
        // Sin permiso registrado — acceso denegado
        showToast('bad', 'Acceso denegado', `${email} no tiene permisos en el sistema. Contacta al administrador.`);
        handleSignout();
        return;
    }

    APP.currentUser.role = perm.rol;
    const badge = document.getElementById('userBadge');
    const avatarEl = document.getElementById('userAvatar');
    const emailEl  = document.getElementById('userEmail');
    const roleEl   = document.getElementById('userRole');

    badge.style.display = 'flex';
    avatarEl.textContent = (APP.currentUser.name || email)[0].toUpperCase();
    emailEl.textContent  = APP.currentUser.name || email;
    roleEl.textContent   = perm.rol;
    roleEl.className     = `role-tag role-${perm.rol}`;

    updateNavByRole(perm.rol);
    showToast('ok', `Bienvenido, ${APP.currentUser.name || email}`, `Rol: ${perm.rol}`);
}

function updateNavByRole(role) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (!role) { btn.style.display = 'none'; return; }
        const allowed = (btn.dataset.role || '').split(',');
        btn.style.display = allowed.includes(role) ? 'flex' : 'none';
    });
    // Si no hay rol, mostrar todos (modo sin login)
    if (!role) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.style.display = 'flex');
    }
}

// ─── GESTIÓN DE PERMISOS ─────────────────────────────────────
async function addPermiso(event) {
    event.preventDefault();
    const email  = document.getElementById('permEmail').value.trim().toLowerCase();
    const nombre = document.getElementById('permNombre').value.trim();
    const rol    = document.getElementById('permRol').value;

    if (APP.db.permisos.find(p => p.email.toLowerCase() === email)) {
        showToast('warn', 'Ya existe', `${email} ya tiene permisos registrados.`);
        return;
    }

    const entry = { email, nombre, rol };
    APP.db.permisos.push(entry);
    saveLocal();

    if (APP.authed) {
        try {
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: CONFIG.SHEET_ID,
                range: CONFIG.SHEETS.PERMISOS,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[email, nombre, rol]] }
            });
            showToast('ok', 'Permiso agregado', `${email} — ${rol}`);
        } catch(e) { showToast('warn', 'Guardado local', 'No se pudo sincronizar con Sheets.'); }
    } else {
        showToast('ok', 'Permiso guardado localmente', `${email} — ${rol}`);
    }

    document.getElementById('permForm').reset();
    renderPermisos();
}

async function deletePermiso(email) {
    APP.db.permisos = APP.db.permisos.filter(p => p.email.toLowerCase() !== email.toLowerCase());
    saveLocal();
    renderPermisos();
    showToast('ok', 'Permiso eliminado', email);
    // Reescribir hoja de permisos completa
    if (APP.authed) {
        try {
            await gapi.client.sheets.spreadsheets.values.clear({
                spreadsheetId: CONFIG.SHEET_ID, range: CONFIG.RANGES.PERMISOS
            });
            if (APP.db.permisos.length) {
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: CONFIG.SHEET_ID,
                    range: 'Permisos!A2',
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: APP.db.permisos.map(p => [p.email, p.nombre, p.rol]) }
                });
            }
        } catch(e) {}
    }
}

function renderPermisos() {
    const tbody = document.getElementById('permisosBody');
    if (!tbody) return;
    if (!APP.db.permisos.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">No hay permisos registrados</td></tr>';
        return;
    }
    tbody.innerHTML = APP.db.permisos.map(p => `
        <tr>
            <td>${p.email}</td>
            <td>${p.nombre || '—'}</td>
            <td><span class="role-tag role-${p.rol}">${p.rol}</span></td>
            <td>
                <button class="btn btn-red btn-xs" onclick="deletePermiso('${p.email}')">🗑 Eliminar</button>
            </td>
        </tr>
    `).join('');
}

// ─── SYNC STATUS ─────────────────────────────────────────────
function syncStatus(type, text) {
    const el = document.getElementById('syncChip');
    el.className = 'chip ' + (type === 'ok' ? 'chip-ok' : type === 'err' ? 'chip-err' : 'chip-g');
    el.textContent = text;
}

// ─── ALMACENAMIENTO LOCAL ────────────────────────────────────
function saveLocal() { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(APP.db)); }
function loadLocal() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (saved) { APP.db = JSON.parse(saved); refreshAll(); }
}

// ─── CARGA DESDE GOOGLE SHEETS ───────────────────────────────
async function loadFromSheets() {
    syncStatus('g', '🔄 Cargando...');
    try {
        // Estudiantes (A:J — nuevo formato con email, phone, course, schedule)
        const resStudents = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SHEET_ID, range: CONFIG.RANGES.ESTUDIANTES
        });
        if (resStudents.result.values) {
            APP.db.students = resStudents.result.values.map(r => ({
                id: r[0], name: r[1], dni: r[2], email: r[3] || '',
                phone: r[4] || '', course: r[5] || '', schedule: r[6] || '',
                photoUrl: r[7] || '', qrUrl: r[8] || '', createdAt: r[9] || '',
                registeredBy: r[10] || ''
            }));
        }

        // Asistencia
        const resAtt = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SHEET_ID, range: CONFIG.RANGES.ASISTENCIA
        });
        if (resAtt.result.values) {
            APP.db.attendance = resAtt.result.values.map(r => ({
                sid: r[0], name: r[1], dni: r[2], course: r[3],
                schedule: r[4], date: r[5], time: r[6], type: r[7],
                registeredBy: r[8] || ''
            }));
        }

        // Cursos
        try {
            const resCourses = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: CONFIG.SHEET_ID, range: CONFIG.RANGES.CURSOS
            });
            if (resCourses.result.values) {
                APP.db.courses = resCourses.result.values.map(r => ({
                    id: r[0], name: r[1], grade: r[2],
                    active: (r[3] || 'SI').toUpperCase() === 'SI',
                    description: r[4] || ''
                }));
            }
        } catch(e) {}

        // Horarios
        try {
            const resSched = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: CONFIG.SHEET_ID, range: CONFIG.RANGES.HORARIOS
            });
            if (resSched.result.values) {
                APP.db.schedules = resSched.result.values.map(r => ({
                    courseId: r[0], courseName: r[1], day: r[2],
                    startTime: r[3], endTime: r[4], room: r[5] || ''
                }));
            }
        } catch(e) {}

        // Permisos
        try {
            const resPerms = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: CONFIG.SHEET_ID, range: CONFIG.RANGES.PERMISOS
            });
            if (resPerms.result.values) {
                APP.db.permisos = resPerms.result.values.map(r => ({
                    email: r[0], nombre: r[1] || '', rol: r[2] || CONFIG.ROLES.VIEWER
                }));
            }
        } catch(e) {}

        saveLocal();
        refreshAll();
        syncStatus('ok', '✅ Sincronizado');
    } catch(e) {
        console.error('Error al cargar:', e);
        syncStatus('err', '❌ Error de conexión');
    }
}

// ─── SUBIR A DRIVE ───────────────────────────────────────────
async function uploadToDrive(fileName, base64Data, mimeType) {
    if (!APP.authed) return '';
    try {
        const rawBase64 = base64Data.split(',')[1];
        const metadata = JSON.stringify({ name: fileName, parents: [CONFIG.FOLDER_ID], mimeType });
        const body = `--boundary\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--boundary\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${rawBase64}\r\n--boundary--`;
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + gapi.client.getToken().access_token, 'Content-Type': 'multipart/related; boundary=boundary' },
            body
        });
        const file = await res.json();
        return file.id ? `https://drive.google.com/uc?export=view&id=${file.id}` : '';
    } catch(e) { return ''; }
}

// ─── UTILIDADES ──────────────────────────────────────────────
function getToday() { return new Date().toISOString().split('T')[0]; }
function getTime()  { return new Date().toLocaleTimeString('es-BO', { hour12: false }); }
function getAvatarColor(name) {
    const colors = ['#3b6cb4','#2a8f6a','#c68a1d','#c9463d','#7c3aed','#0891b2','#db2777'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}
function getInitials(name) { return name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase(); }

// ─── TOAST ───────────────────────────────────────────────────
function showToast(type, title, message) {
    const container = document.getElementById('toastContainer');
    const icons = { ok: '✅', bad: '❌', warn: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-icon">${icons[type]||''}</div><h4>${title}</h4><p>${message}</p>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 300); }, 3200);
}

// ─── FOTO ────────────────────────────────────────────────────
function loadPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = CONFIG.PHOTO.WIDTH; canvas.height = CONFIG.PHOTO.HEIGHT;
            canvas.getContext('2d').drawImage(img, 0, 0, CONFIG.PHOTO.WIDTH, CONFIG.PHOTO.HEIGHT);
            APP.currentPhoto = canvas.toDataURL('image/jpeg', CONFIG.PHOTO.QUALITY);
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
    const courseName = courseSelect.value;

    if (!courseName) {
        scheduleSelect.innerHTML = '<option value="">Primero selecciona un curso</option>';
        return;
    }

    // Buscar la ID del curso seleccionado
    const course = APP.db.courses.find(c => c.name === courseName);
    const courseId = course ? course.id : null;

    // Filtrar horarios por curso
    let schedules = APP.db.schedules.filter(s =>
        s.courseName === courseName || s.courseId === courseId
    );

    if (!schedules.length) {
        scheduleSelect.innerHTML = '<option value="">Sin horarios disponibles</option>';
        return;
    }

    // Agrupar por horario único (día + hora + aula)
    const uniqueSchedules = [];
    const seen = new Set();
    schedules.forEach(s => {
        const key = `${s.day} ${s.startTime}-${s.endTime}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueSchedules.push(s);
        }
    });

    // Construir opciones agrupadas por horario
    const dayGroups = {};
    schedules.forEach(s => {
        const label = `${capitalize(s.day)}: ${s.startTime}–${s.endTime}${s.room ? ' · ' + s.room : ''}`;
        if (!dayGroups[label]) dayGroups[label] = [];
        dayGroups[label].push(s.day);
    });

    // Generar opciones con los días que tiene ese horario
    const allDays = ['lunes','martes','miércoles','jueves','viernes','sábado'];
    const blockGroups = {};
    schedules.forEach(s => {
        const key = `${s.startTime}-${s.endTime}|${s.room||''}`;
        if (!blockGroups[key]) blockGroups[key] = { start: s.startTime, end: s.endTime, room: s.room, days: [] };
        blockGroups[key].days.push(s.day);
    });

    scheduleSelect.innerHTML = '<option value="">Seleccionar horario...</option>';
    Object.entries(blockGroups).forEach(([key, block]) => {
        const daysStr = block.days.map(capitalize).join(', ');
        const label   = `${daysStr}: ${block.start}–${block.end}${block.room ? ' · ' + block.room : ''}`;
        const opt = document.createElement('option');
        opt.value = label;
        opt.textContent = label;
        scheduleSelect.appendChild(opt);
    });
}

function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : str; }

// ─── REGISTRO ────────────────────────────────────────────────
async function doRegister(event) {
    event.preventDefault();
    const qrDiv = document.getElementById('qrcode');
    qrDiv.innerHTML = '';

    const student = {
        id:          'SID' + Date.now(),
        name:        document.getElementById('inputName').value.trim(),
        dni:         document.getElementById('inputDni').value.trim(),
        email:       document.getElementById('inputEmail').value.trim(),
        phone:       document.getElementById('inputPhone').value.trim(),
        course:      document.getElementById('inputCourse').value,
        schedule:    document.getElementById('inputSchedule').value,
        photoUrl:    '',
        qrUrl:       '',
        createdAt:   new Date().toISOString(),
        registeredBy: APP.currentUser ? APP.currentUser.email : 'local'
    };

    if (APP.db.students.find(s => s.dni === student.dni)) {
        showToast('bad', 'Carnet duplicado', 'Este número de carnet ya está registrado.');
        return;
    }
    if (!student.course || !student.schedule) {
        showToast('warn', 'Faltan datos', 'Selecciona el curso y el horario.');
        return;
    }

    new QRCode(qrDiv, { text: JSON.stringify({ id: student.id }), width: 180, height: 180, correctLevel: QRCode.CorrectLevel.H });
    document.getElementById('qrActions').classList.add('visible');
    APP.lastStudent = { ...student, photo: APP.currentPhoto, photoUrl: APP.currentPhoto || '' };

    await new Promise(r => setTimeout(r, 500));

    if (APP.authed) {
        document.getElementById('qrStatus').textContent = '🔄 Subiendo datos...';
        student.photoUrl = APP.currentPhoto ? await uploadToDrive(`Foto_${student.dni}.jpg`, APP.currentPhoto, 'image/jpeg') : '';
        const qrCanvas = qrDiv.querySelector('canvas');
        student.qrUrl  = await uploadToDrive(`QR_${student.dni}.png`, qrCanvas.toDataURL(), 'image/png');

        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SHEET_ID,
            range: CONFIG.SHEETS.ESTUDIANTES,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[
                student.id, student.name, student.dni, student.email, student.phone,
                student.course, student.schedule, student.photoUrl, student.qrUrl,
                student.createdAt, student.registeredBy
            ]]}
        });
        showToast('ok', 'Registrado', `${student.name} registrado por ${student.registeredBy}`);
        document.getElementById('qrStatus').textContent = '✅ Registrado y sincronizado';
    } else {
        showToast('info', 'Guardado localmente', `${student.name} registrado sin conexión.`);
        document.getElementById('qrStatus').textContent = '✅ Registrado localmente';
    }

    APP.db.students.push(student);
    saveLocal();
    refreshAll();
    document.getElementById('regForm').reset();
    document.getElementById('photoCircle').innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8c95a3" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
    document.getElementById('inputSchedule').innerHTML = '<option value="">Primero selecciona un curso</option>';
    APP.currentPhoto = null;
}

// ─── ESCÁNER QR ──────────────────────────────────────────────
async function onScanSuccess(decodedText) {
    if (APP.qrScanner.isPaused) return;
    APP.qrScanner.pause(true);
    try {
        const data    = JSON.parse(decodedText);
        const student = APP.db.students.find(s => s.id === data.id);

        if (!student) {
            showScanFeedback('bad', '❌ No registrado', 'Este QR no existe en el sistema.');
            showScanNotification('bad', 'Código no encontrado', 'QR no registrado en el sistema', '');
        } else {
            const mode  = document.querySelector('input[name="scanMode"]:checked').value;
            const today = getToday();
            const already = APP.db.attendance.find(a => a.sid === student.id && a.date === today && a.type === mode);

            if (already) {
                showScanFeedback('warn', `⚠️ ${student.name}`, `Ya registró ${mode.toLowerCase()} hoy a las ${already.time}`);
                showScanNotification('warn', student.name, `Ya registró ${mode.toLowerCase()} hoy · ${already.time}`, `${student.course} · ${student.schedule}`);
            } else {
                const record = {
                    sid: student.id, name: student.name, dni: student.dni,
                    course: student.course, schedule: student.schedule,
                    date: today, time: getTime(), type: mode,
                    registeredBy: APP.currentUser ? APP.currentUser.email : 'local'
                };
                APP.db.attendance.push(record);
                saveLocal();

                if (APP.authed) {
                    await gapi.client.sheets.spreadsheets.values.append({
                        spreadsheetId: CONFIG.SHEET_ID,
                        range: CONFIG.SHEETS.ASISTENCIA,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: [[
                            record.sid, record.name, record.dni, record.course,
                            record.schedule, record.date, record.time, record.type, record.registeredBy
                        ]]}
                    });
                }

                const modeLabel = mode === 'ENTRADA' ? '🟢 Entrada' : '🔴 Salida';
                showScanFeedback('ok', `✅ ${student.name}`, `${modeLabel} · ${record.time}`);
                showScanNotification('ok', student.name, `${modeLabel} registrada · ${record.time}`, `${student.course}`);
                refreshAll();
                renderTodayLog();
            }
        }
    } catch(e) {
        showScanFeedback('bad', '❌ QR inválido', 'El código no es válido para este sistema.');
        showScanNotification('bad', 'QR inválido', 'El código no pertenece a este sistema', '');
    }
    setTimeout(() => { APP.qrScanner.resume(); }, CONFIG.SCANNER.PAUSE_MS);
}

function showScanFeedback(type, title, msg) {
    document.getElementById('scanFeedback').innerHTML =
        `<div class="scan-feedback ${type}"><h4>${title}</h4><p>${msg}</p></div>`;
}

function showScanNotification(type, studentName, detail, course) {
    const notif = document.getElementById('scanNotification');
    document.getElementById('scanNotifIcon').textContent   = type === 'ok' ? '✅' : type === 'warn' ? '⚠️' : '❌';
    document.getElementById('scanNotifName').textContent   = studentName;
    document.getElementById('scanNotifDetail').textContent = detail;
    document.getElementById('scanNotifCourse').textContent = course || '';
    notif.className = `scan-notification visible notif-${type}`;
    clearTimeout(notif._t);
    notif._t = setTimeout(closeScanNotif, 4500);
}
function closeScanNotif() {
    const notif = document.getElementById('scanNotification');
    notif.classList.remove('visible');
    notif.classList.add('notif-hiding');
    setTimeout(() => { notif.className = 'scan-notification'; }, 350);
}

// ─── RENDER ──────────────────────────────────────────────────
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
    const list = [...APP.db.students].reverse().slice(0, 5);
    const container = document.getElementById('recentList');
    if (!container) return;
    if (!list.length) { container.innerHTML = '<p class="empty-msg">No hay registros todavía</p>'; return; }
    container.innerHTML = list.map(s => `
        <div class="list-row">
            <div class="cell-name">
                <div class="avatar" style="background:${getAvatarColor(s.name)}">${getInitials(s.name)}</div>
                <div><b>${s.name}</b><br><small style="color:var(--txt3)">${s.course}</small></div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
                ${s.registeredBy ? `<small class="reg-by">por ${s.registeredBy.split('@')[0]}</small>` : ''}
                <button class="btn btn-blue btn-sm" onclick="openQRModal('${s.id}')">📱 QR</button>
            </div>
        </div>
    `).join('');
}

function renderStudentsTable() {
    const query = (document.getElementById('searchBox')?.value || '').toLowerCase();
    const today = getToday();
    const filtered = APP.db.students.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.dni.includes(query) ||
        (s.course||'').toLowerCase().includes(query)
    );
    const tbody = document.getElementById('studentsBody');
    if (!tbody) return;
    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">No se encontraron estudiantes</td></tr>'; return; }
    tbody.innerHTML = filtered.map(s => {
        const hasEntry = APP.db.attendance.find(a => a.sid === s.id && a.date === today && a.type === CONFIG.TIPOS.ENTRADA);
        const color = getAvatarColor(s.name);
        return `<tr>
            <td><div class="cell-name">
                <div class="avatar" style="background:${color}">${getInitials(s.name)}</div>
                <div><b>${s.name}</b><br><small style="color:var(--txt3)">${s.email||''}</small></div>
            </div></td>
            <td>${s.dni}</td>
            <td><span class="course-badge">${s.course||'—'}</span></td>
            <td><small class="schedule-chip">${s.schedule||'—'}</small></td>
            <td><span class="tag ${hasEntry?'tag-ok':'tag-no'}">${hasEntry?'Presente':'Ausente'}</span></td>
            <td><button class="btn btn-blue btn-sm" onclick="openQRModal('${s.id}')">📱</button></td>
        </tr>`;
    }).join('');
}

function renderTodayLog() {
    const today = getToday();
    const log = APP.db.attendance.filter(a => a.date === today).reverse();
    ['todayLog','todayLog2'].forEach(id => {
        const c = document.getElementById(id);
        if (!c) return;
        if (!log.length) { c.innerHTML = '<p class="empty-msg">Esperando lecturas de QR...</p>'; return; }
        c.innerHTML = log.map(a => {
            const isEntry = a.type === CONFIG.TIPOS.ENTRADA;
            return `<div class="list-row">
                <div><b>${a.name}</b><br><small style="color:var(--txt2)">${a.course}</small></div>
                <div style="display:flex;align-items:center;gap:6px">
                    <span class="tag ${isEntry?'tag-ok':'tag-warn'}">${isEntry?'🟢 Entrada':'🔴 Salida'}</span>
                    <span class="list-time">${a.time}</span>
                </div>
            </div>`;
        }).join('');
    });
}

function renderAttendanceStats() {
    const today   = getToday();
    const total   = APP.db.students.length;
    const present = new Set(APP.db.attendance.filter(a => a.date === today && a.type === CONFIG.TIPOS.ENTRADA).map(a => a.sid)).size;
    const exits   = APP.db.attendance.filter(a => a.date === today && a.type === CONFIG.TIPOS.SALIDA).length;
    document.getElementById('statTotal').textContent   = total;
    document.getElementById('statPresent').textContent = present;
    document.getElementById('statAbsent').textContent  = Math.max(0, total - present);
    document.getElementById('statExits').textContent   = exits;
}

// ─── REPORTES ────────────────────────────────────────────────
function populateCourseFilters() {
    // Cursos activos desde sheets
    let courseNames = APP.db.courses.filter(c => c.active !== false).map(c => c.name);
    if (!courseNames.length) courseNames = [...new Set(APP.db.students.map(s => s.course))].filter(Boolean);
    courseNames = [...new Set(courseNames)].sort();

    // Llenar inputCourse del formulario de registro
    const inputCourse = document.getElementById('inputCourse');
    if (inputCourse) {
        const cur = inputCourse.value;
        inputCourse.innerHTML = '<option value="">Seleccionar curso...</option>' +
            courseNames.map(n => `<option value="${n}" ${n===cur?'selected':''}>${n}</option>`).join('');
        if (!courseNames.length) inputCourse.innerHTML = '<option value="">Sin cursos cargados</option>';
    }

    // Reportes - cursos
    const rg = document.getElementById('reportGrade');
    if (rg) {
        const cur = rg.value;
        rg.innerHTML = '<option value="">Todos los cursos</option>' +
            courseNames.map(n => `<option value="${n}" ${n===cur?'selected':''}>${n}</option>`).join('');
    }

    // Reportes - horarios únicos
    const rs = document.getElementById('reportSchedule');
    if (rs) {
        const schedules = [...new Set(APP.db.students.map(s => s.schedule))].filter(Boolean).sort();
        const cur = rs.value;
        rs.innerHTML = '<option value="">Todos los horarios</option>' +
            schedules.map(s => `<option value="${s}" ${s===cur?'selected':''}>${s}</option>`).join('');
    }
}

function renderReports() {
    const today    = getToday();
    const dateFrom = document.getElementById('reportDateFrom')?.value || today;
    const dateTo   = document.getElementById('reportDateTo')?.value   || today;
    const course   = document.getElementById('reportGrade')?.value    || '';
    const schedule = document.getElementById('reportSchedule')?.value || '';

    let filtered = APP.db.attendance.filter(a => a.date >= dateFrom && a.date <= dateTo);
    if (course)   filtered = filtered.filter(a => a.course   === course);
    if (schedule) filtered = filtered.filter(a => a.schedule === schedule);

    let students = [...APP.db.students];
    if (course)   students = students.filter(s => s.course   === course);
    if (schedule) students = students.filter(s => s.schedule === schedule);

    const entries    = filtered.filter(a => a.type === CONFIG.TIPOS.ENTRADA);
    const exits      = filtered.filter(a => a.type === CONFIG.TIPOS.SALIDA);
    const presentIds = new Set(entries.map(a => a.sid));
    const absent     = students.filter(s => !presentIds.has(s.id));

    document.getElementById('reportTotal').textContent   = students.length;
    document.getElementById('reportPresent').textContent = entries.length;
    document.getElementById('reportAbsent').textContent  = absent.length;
    document.getElementById('reportExits').textContent   = exits.length;

    const body = document.getElementById('reportBody');
    if (!entries.length && !absent.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty-msg">Sin datos para este filtro</td></tr>'; return;
    }
    let rows = '';
    entries.forEach(a => {
        rows += `<tr>
            <td><b>${a.name}</b></td>
            <td><span class="course-badge">${a.course} </span></td>
            <td>${a.date}</td>
            <td><span class="tag tag-ok">Presente</span></td>
            <td>${a.time}</td>
            <td>${exits.find(x=>x.sid===a.sid&&x.date===a.date)?.time||'—'}</td>
        </tr>`;
    });
    absent.forEach(s => {
        rows += `<tr>
            <td><b>${s.name}</b></td>
            <td><span class="course-badge">${s.course}</span></td>
            <td>${dateFrom===dateTo?dateFrom:`${dateFrom}–${dateTo}`}</td>
            <td><span class="tag tag-no">Ausente</span></td>
            <td>—</td><td>—</td>
        </tr>`;
    });
    body.innerHTML = rows;
    renderScheduleForDay(today);
}

function renderScheduleForDay(dateStr) {
    const container = document.getElementById('scheduleToday');
    if (!container) return;
    const days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const dow  = days[new Date(dateStr + 'T12:00:00').getDay()];
    const sched = APP.db.schedules.filter(s => s.day.toLowerCase() === dow);
    if (!sched.length) { container.innerHTML = '<p class="empty-msg">No hay horarios para este día</p>'; return; }
    container.innerHTML = sched.map(s => `
        <div class="list-row">
            <div><b>${s.courseName}</b><br><small style="color:var(--txt2)">${s.room?'Aula: '+s.room:''}</small></div>
            <span class="list-time">${s.startTime} – ${s.endTime}</span>
        </div>
    `).join('');
}

function downloadReport() {
    const { jsPDF } = window.jspdf;
    const today    = getToday();
    const dateFrom = document.getElementById('reportDateFrom')?.value || today;
    const dateTo   = document.getElementById('reportDateTo')?.value   || today;
    const course   = document.getElementById('reportGrade')?.value    || '';
    const schedule = document.getElementById('reportSchedule')?.value || '';

    let filtered = APP.db.attendance.filter(a => a.date >= dateFrom && a.date <= dateTo);
    if (course)   filtered = filtered.filter(a => a.course   === course);
    if (schedule) filtered = filtered.filter(a => a.schedule === schedule);

    let students = [...APP.db.students];
    if (course)   students = students.filter(s => s.course   === course);
    if (schedule) students = students.filter(s => s.schedule === schedule);

    const entries    = filtered.filter(a => a.type === CONFIG.TIPOS.ENTRADA);
    const exits      = filtered.filter(a => a.type === CONFIG.TIPOS.SALIDA);
    const presentIds = new Set(entries.map(a => a.sid));
    const absent     = students.filter(s => !presentIds.has(s.id));

    const doc   = new jsPDF('p','mm','a4');
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFillColor(27,46,74); doc.rect(0,0,pageW,28,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(18);
    doc.text('INSTITUTO CEAN', pageW/2, 13, { align: 'center' });
    doc.setFontSize(10);
    doc.text('REPORTE DE ASISTENCIA', pageW/2, 22, { align: 'center' });

    doc.setTextColor(0,0,0);
    let y = 38;
    doc.setFontSize(10);
    const periodo = dateFrom===dateTo ? dateFrom : `${dateFrom} al ${dateTo}`;
    doc.text(`Período: ${periodo}`, 14, y);
    if (course)   doc.text(`Curso: ${course}`, 14, y+6);
    if (schedule) doc.text(`Horario: ${schedule}`, 14, y+12);
    y += (course||schedule) ? 22 : 10;

    doc.setFont(undefined,'bold');
    doc.text(`Total: ${students.length}  |  Presentes: ${entries.length}  |  Ausentes: ${absent.length}`, 14, y);
    doc.setFont(undefined,'normal');
    y += 10;

    doc.setFillColor(27,46,74); doc.rect(14,y,pageW-28,7,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont(undefined,'bold');
    doc.text('ESTUDIANTE',16,y+5); doc.text('CURSO',70,y+5);
    doc.text('FECHA',108,y+5); doc.text('ESTADO',130,y+5);
    doc.text('ENTRADA',150,y+5); doc.text('SALIDA',172,y+5);
    doc.setFont(undefined,'normal'); doc.setTextColor(0,0,0);
    y += 10;

    const addRow = (name,course,date,status,entry,exit,even) => {
        if (y>278){doc.addPage();y=20;}
        if (even) { doc.setFillColor(248,246,242); doc.rect(14,y-4,pageW-28,7,'F'); }
        doc.setFontSize(8);
        doc.text(name.substring(0,28),16,y);
        doc.text((course||'').substring(0,22),70,y);
        doc.text(date,108,y);
        doc.text(status,130,y);
        doc.text(entry,150,y);
        doc.text(exit,172,y);
        y+=7;
    };
    entries.forEach((a,i) => addRow(a.name,a.course,a.date,'PRESENTE',a.time,exits.find(x=>x.sid===a.sid&&x.date===a.date)?.time||'—',i%2===0));
    absent.forEach((s,i) => addRow(s.name,s.course,'—','AUSENTE','—','—',(entries.length+i)%2===0));

    y+=8;
    doc.setFontSize(7); doc.setTextColor(150);
    doc.text(`Generado: ${new Date().toLocaleString('es-BO')} | Instituto CEAN`, 14, y);

    const fn = `Reporte_CEAN_${dateFrom}_${dateTo}${course?'_'+course.substring(0,20):''}.pdf`;
    doc.save(fn);
    showToast('ok','Reporte generado',fn);
}

// ─── MODAL QR ────────────────────────────────────────────────
function openQRModal(studentId) {
    const student = APP.db.students.find(s => s.id === studentId);
    if (!student) return;
    APP.lastStudent = { ...student, photo: student.photo || (student.photoUrl?.startsWith('data:') ? student.photoUrl : null) };
    document.getElementById('modalName').textContent = student.name;
    document.getElementById('modalInfo').textContent = `${student.course} · CI: ${student.dni}`;
    const qrWrap = document.getElementById('modalQR');
    qrWrap.innerHTML = '';
    new QRCode(qrWrap, { text: JSON.stringify({ id: student.id }), width: 160, height: 160 });
    document.getElementById('overlay').classList.add('open');
}
function closeModal() { document.getElementById('overlay').classList.remove('open'); }

// ─── CARNET / PDF ────────────────────────────────────────────
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
    ctx.fillStyle = g; ctx.fillRect(x,y,w,h);
    const initials = student.name.split(' ').map(p=>p[0]).join('').substring(0,2).toUpperCase();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `bold 72px Georgia,serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initials, x+w/2, y+h/2);
    ctx.textBaseline = 'alphabetic';
}

async function buildCredentialCanvas(student, qrSourceCanvas, photoDataUrl) {
    const W = 1020, H = 640;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    const navy  = '#0f1e33';
    const navyM = '#1a2e4a';
    const navyL = '#243f63';
    const gold  = '#d4a843';
    const goldL = '#f0c860';
    const white = '#ffffff';
    const cream = '#fdf8f0';

    // ── Fondo principal ──────────────────────────────────────
    ctx.fillStyle = navyM;
    ctx.fillRect(0, 0, W, H);

    // Gradiente diagonal suave
    const bgG = ctx.createLinearGradient(0, 0, W, H);
    bgG.addColorStop(0, '#0d1b2a');
    bgG.addColorStop(0.5, '#1a2e4a');
    bgG.addColorStop(1, '#142338');
    ctx.fillStyle = bgG;
    ctx.fillRect(0, 0, W, H);

    // Patrón de puntos de fondo (sutil)
    ctx.save();
    ctx.globalAlpha = 0.04;
    for (let px = 20; px < W; px += 40) {
        for (let py = 20; py < H; py += 40) {
            ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI*2);
            ctx.fillStyle = white; ctx.fill();
        }
    }
    ctx.restore();

    // ── FRANJA LATERAL IZQUIERDA (decorativa) ────────────────
    const stripeGrad = ctx.createLinearGradient(0, 0, 0, H);
    stripeGrad.addColorStop(0, gold);
    stripeGrad.addColorStop(0.5, goldL);
    stripeGrad.addColorStop(1, gold);
    ctx.fillStyle = stripeGrad;
    ctx.fillRect(0, 0, 8, H);

    // ── FRANJA LATERAL DERECHA ───────────────────────────────
    ctx.fillStyle = stripeGrad;
    ctx.fillRect(W-8, 0, 8, H);

    // ── HEADER ───────────────────────────────────────────────
    const hdrH = 120;
    const hdrG = ctx.createLinearGradient(0, 0, W, 0);
    hdrG.addColorStop(0, '#0a1828');
    hdrG.addColorStop(0.5, '#162338');
    hdrG.addColorStop(1, '#0a1828');
    ctx.fillStyle = hdrG;
    ctx.fillRect(0, 0, W, hdrH);

    // Línea dorada separadora
    ctx.fillStyle = gold;
    ctx.fillRect(0, hdrH, W, 3);
    ctx.fillStyle = goldL;
    ctx.fillRect(0, hdrH+3, W, 1);

    // ── LOGO / ÍCONO ─────────────────────────────────────────
    const logoX = 38, logoY = 18, logoR = 42;
    // Fondo circular con gradiente
    const lgG = ctx.createRadialGradient(logoX+logoR, logoY+logoR, 10, logoX+logoR, logoY+logoR, logoR);
    lgG.addColorStop(0, 'rgba(212,168,67,0.2)');
    lgG.addColorStop(1, 'rgba(212,168,67,0.05)');
    ctx.beginPath(); ctx.arc(logoX+logoR, logoY+logoR, logoR, 0, Math.PI*2);
    ctx.fillStyle = lgG; ctx.fill();
    // Borde dorado fino
    ctx.strokeStyle = gold; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(logoX+logoR, logoY+logoR, logoR, 0, Math.PI*2); ctx.stroke();
    // Texto ícono
    ctx.font = '44px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = gold;
    ctx.fillText('🎓', logoX+logoR, logoY+logoR+2);
    ctx.textBaseline = 'alphabetic';

    // ── NOMBRE INSTITUTO ─────────────────────────────────────
    ctx.textAlign = 'center';
    ctx.fillStyle = white;
    ctx.font = 'bold 30px Georgia,serif';
    ctx.letterSpacing = '3px';
    ctx.fillText('INSTITUTO CEAN', W/2 + 30, 46);
    ctx.font = '12px Arial,sans-serif';
    ctx.fillStyle = gold;
    ctx.letterSpacing = '5px';
    ctx.fillText('SISTEMA DE ASISTENCIA', W/2 + 30, 70);
    ctx.font = 'bold 10px Arial,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.letterSpacing = '3px';
    ctx.fillText('CARNET DE IDENTIDAD ESTUDIANTIL', W/2 + 30, 95);
    ctx.letterSpacing = '0px';

    // ── FOTO ─────────────────────────────────────────────────
    // Layout: foto a la izquierda, datos al centro, QR a la derecha
    // Con espacios bien definidos para que nada se intersecte
    const MARGIN_L = 22;
    const photoX = MARGIN_L, photoY = 136;
    const photoW = 190, photoH = 234;
    const photoR = 14;

    // Sombra de la foto
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4;
    roundRect(ctx, photoX-4, photoY-4, photoW+8, photoH+8, photoR+2);
    ctx.fillStyle = gold; ctx.fill();
    ctx.restore();

    // Marco dorado
    roundRect(ctx, photoX-4, photoY-4, photoW+8, photoH+8, photoR+2);
    ctx.fillStyle = gold; ctx.fill();

    // Recorte de foto
    ctx.save();
    roundRect(ctx, photoX, photoY, photoW, photoH, photoR);
    ctx.clip();
    ctx.fillStyle = navyL; ctx.fillRect(photoX, photoY, photoW, photoH);
    if (photoDataUrl) {
        try {
            await new Promise(res => {
                const img = new Image();
                img.onload = () => {
                    const s = Math.min(img.width, img.height);
                    const sx = (img.width-s)/2, sy = (img.height-s)/2;
                    ctx.drawImage(img, sx, sy, s, s, photoX, photoY, photoW, photoH);
                    res();
                };
                img.onerror = res; img.src = photoDataUrl;
            });
        } catch(e) { drawAvatarPlaceholder(ctx, student, photoX, photoY, photoW, photoH); }
    } else { drawAvatarPlaceholder(ctx, student, photoX, photoY, photoW, photoH); }
    ctx.restore();

    // Etiqueta bajo foto
    ctx.fillStyle = gold; ctx.font = 'bold 10px Arial,sans-serif';
    ctx.textAlign = 'center'; ctx.letterSpacing = '3px';
    ctx.fillText('ESTUDIANTE', photoX+photoW/2, photoY+photoH+22);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = gold; ctx.fillRect(photoX, photoY+photoH+26, photoW, 1.5);

    // ── QR — bien ubicado en su propio bloque ────────────────
    const qrBoxSize = 190;
    const qrPad     = 16;
    const qrTotalW  = qrBoxSize + qrPad*2;
    const qrTotalH  = qrBoxSize + qrPad*2;
    const qrX = W - 8 - qrTotalW - 14;  // pegado al borde derecho con margen
    const qrY = 136;

    // Fondo blanco puro para QR
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    roundRect(ctx, qrX, qrY, qrTotalW, qrTotalH, 12);
    ctx.fillStyle = white; ctx.fill();
    ctx.restore();

    // Borde dorado del QR
    ctx.save();
    roundRect(ctx, qrX, qrY, qrTotalW, qrTotalH, 12);
    ctx.strokeStyle = gold; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();

    // Dibujar QR real
    if (qrSourceCanvas) {
        ctx.drawImage(qrSourceCanvas, qrX + qrPad, qrY + qrPad, qrBoxSize, qrBoxSize);
    }

    // Texto bajo QR
    ctx.fillStyle = gold; ctx.font = 'bold 9px Arial,sans-serif';
    ctx.textAlign = 'center'; ctx.letterSpacing = '2px';
    ctx.fillText('ESCANEAR ASISTENCIA', qrX + qrTotalW/2, qrY + qrTotalH + 18);
    ctx.letterSpacing = '0px';

    // ── DATOS ────────────────────────────────────────────────
    // Zona de datos: entre foto y QR
    const dataX = MARGIN_L + photoW + 22;
    const dataW = qrX - dataX - 16;
    const dataY = 134;

    // Fondo sutil de datos
    ctx.save();
    roundRect(ctx, dataX, dataY, dataW, 256, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
    ctx.strokeStyle = 'rgba(212,168,67,0.2)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    function drawField(label, value, x, y, maxW) {
        ctx.font = 'bold 9px Arial,sans-serif';
        ctx.fillStyle = goldL; ctx.textAlign = 'left';
        ctx.letterSpacing = '2px';
        ctx.fillText(label.toUpperCase(), x+10, y);
        ctx.letterSpacing = '0px';
        ctx.fillStyle = 'rgba(212,168,67,0.25)';
        ctx.fillRect(x+10, y+4, maxW-20, 1);

        let fs = 19;
        ctx.font = `bold ${fs}px Georgia,serif`;
        ctx.fillStyle = white;
        while (ctx.measureText(value).width > maxW-20 && fs > 12) {
            fs--; ctx.font = `bold ${fs}px Georgia,serif`;
        }
        ctx.fillText(value, x+10, y+24);
    }

    // Nombre completo
    ctx.font = 'bold 9px Arial,sans-serif'; ctx.fillStyle = goldL;
    ctx.textAlign = 'left'; ctx.letterSpacing = '2px';
    ctx.fillText('NOMBRE COMPLETO', dataX+10, dataY+16);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(212,168,67,0.25)';
    ctx.fillRect(dataX+10, dataY+20, dataW-20, 1);

    // Nombre adaptable
    let nfs = 22; ctx.font = `bold ${nfs}px Georgia,serif`;
    const fullName = student.name.toUpperCase();
    while (ctx.measureText(fullName).width > dataW-20 && nfs > 13) {
        nfs--; ctx.font = `bold ${nfs}px Georgia,serif`;
    }
    if (ctx.measureText(fullName).width > dataW-20) {
        const words = fullName.split(' '), half = Math.ceil(words.length/2);
        const l1 = words.slice(0,half).join(' '), l2 = words.slice(half).join(' ');
        nfs = 18; ctx.font = `bold ${nfs}px Georgia,serif`;
        ctx.fillStyle = white; ctx.textAlign = 'left';
        ctx.fillText(l1, dataX+10, dataY+46);
        ctx.fillText(l2, dataX+10, dataY+68);
    } else {
        ctx.fillStyle = white; ctx.textAlign = 'left';
        ctx.fillText(fullName, dataX+10, dataY+52);
    }

    const col2X = dataX + dataW/2;
    drawField('Carnet de Identidad', student.dni,     dataX,  dataY+98,  dataW/2);
    drawField('Año',                 new Date().getFullYear()+'', col2X, dataY+98,  dataW/2);
    // Curso — campo ancho
    drawField('Curso', student.course||'—',           dataX,  dataY+152, dataW);
    // Horario
    const schedLabel = (student.schedule||'—').substring(0, 50);
    drawField('Horario',             schedLabel,       dataX,  dataY+206, dataW);

    // ── FOOTER ───────────────────────────────────────────────
    const footY = H - 58;
    const fG = ctx.createLinearGradient(0,footY,W,footY);
    fG.addColorStop(0,'#0a1828'); fG.addColorStop(0.5,'#132030'); fG.addColorStop(1,'#0a1828');
    ctx.fillStyle = fG; ctx.fillRect(0, footY, W, H-footY);
    ctx.fillStyle = gold; ctx.fillRect(0, footY, W, 3);

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '9px Arial,sans-serif';
    ctx.fillText(`ID: ${student.id}`, 22, footY+22);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(212,168,67,0.75)';
    ctx.font = 'bold 10px Arial,sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText('DOCUMENTO DE USO EXCLUSIVO — INSTITUTO CEAN', W/2, footY+22);
    ctx.letterSpacing = '0px';

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '9px Arial,sans-serif';
    ctx.fillText(`Emitido: ${new Date().toLocaleDateString('es-BO')}`, W-22, footY+22);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '9px Arial,sans-serif';
    ctx.fillText('Válido para el control de ingreso y egreso del establecimiento', W/2, footY+42);

    return c;
}

function buildQRCanvas(studentId) {
    return new Promise(resolve => {
        const tmp = document.createElement('div');
        tmp.style.cssText = 'position:absolute;left:-9999px';
        document.body.appendChild(tmp);
        new QRCode(tmp, { text: JSON.stringify({ id: studentId }), width: 220, height: 220, correctLevel: QRCode.CorrectLevel.H });
        setTimeout(() => {
            const qrc = tmp.querySelector('canvas');
            const out = document.createElement('canvas');
            const pad = 18;
            out.width = (qrc ? qrc.width : 220) + pad*2;
            out.height = (qrc ? qrc.height : 220) + pad*2;
            const ctx = out.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out.width, out.height);
            if (qrc) ctx.drawImage(qrc, pad, pad);
            document.body.removeChild(tmp);
            resolve(out);
        }, 600);
    });
}

async function downloadQRPng() {
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas || !APP.lastStudent) return;
    const out = document.createElement('canvas'); const pad = 20;
    out.width = canvas.width+pad*2; out.height = canvas.height+pad*2;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,out.width,out.height);
    ctx.drawImage(canvas, pad, pad);
    const link = document.createElement('a');
    link.download = `QR_${APP.lastStudent.dni}.png`; link.href = out.toDataURL(); link.click();
}

async function downloadPDF() {
    if (!APP.lastStudent) return;
    showToast('info', 'Generando carnet...', 'Por favor espera');
    const { jsPDF } = window.jspdf;
    const qrCanvas   = await buildQRCanvas(APP.lastStudent.id);
    const photoUrl   = APP.lastStudent.photo || APP.lastStudent.photoUrl || null;
    const credCanvas = await buildCredentialCanvas(APP.lastStudent, qrCanvas, photoUrl);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [100, 63] });
    doc.addImage(credCanvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, 100, 63);
    doc.save(`Carnet_${APP.lastStudent.dni}.pdf`);
    showToast('ok', 'Carnet generado', APP.lastStudent.name);
}

async function downloadPDFFromModal() {
    if (!APP.lastStudent) return;
    showToast('info', 'Generando carnet...', 'Por favor espera');
    const { jsPDF } = window.jspdf;
    const qrCanvas   = await buildQRCanvas(APP.lastStudent.id);
    const photoUrl   = APP.lastStudent.photo || APP.lastStudent.photoUrl || null;
    const credCanvas = await buildCredentialCanvas(APP.lastStudent, qrCanvas, photoUrl);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [100, 63] });
    doc.addImage(credCanvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, 100, 63);
    doc.save(`Carnet_${APP.lastStudent.dni}.pdf`);
    showToast('ok', 'Carnet generado', APP.lastStudent.name);
}

// ─── NAVEGACIÓN ──────────────────────────────────────────────
function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('panel-' + btn.dataset.panel).classList.add('active');

            if (btn.dataset.panel !== 'scanner' && APP.qrScanner) {
                if (scanObserver) scanObserver.disconnect();
                APP.qrScanner.clear(); APP.qrScanner = null;
            }
            if (btn.dataset.panel === 'scanner') {
                APP.qrScanner = new Html5QrcodeScanner('reader', { fps: CONFIG.SCANNER.FPS, qrbox: CONFIG.SCANNER.QR_BOX });
                APP.qrScanner.render(onScanSuccess);
                setTimeout(watchScannerTranslations, 400);
            }
            if (btn.dataset.panel === 'reports') renderReports();
            if (btn.dataset.panel === 'permisos') renderPermisos();
        });
    });
}

function initScanModeToggle() {
    document.querySelectorAll('input[name="scanMode"]').forEach(r => r.addEventListener('change', updateScanModeStyles));
    updateScanModeStyles();
}
function updateScanModeStyles() {
    const sel = document.querySelector('input[name="scanMode"]:checked')?.value;
    document.querySelectorAll('.scan-mode-selector label').forEach(l => l.classList.remove('mode-active-entrada','mode-active-salida'));
    if (sel === 'ENTRADA') document.querySelector('.mode-entrada')?.classList.add('mode-active-entrada');
    else document.querySelector('.mode-salida')?.classList.add('mode-active-salida');
}

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initScanModeToggle();
    const today = getToday();
    const df = document.getElementById('reportDateFrom');
    const dt = document.getElementById('reportDateTo');
    if (df) df.value = today;
    if (dt) dt.value = today;
});
