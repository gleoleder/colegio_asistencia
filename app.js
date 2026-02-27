// ============================================================
// app.js — Lógica principal del Sistema de Asistencia
// Instituto CEAN
// ============================================================

// ─── TRADUCCIÓN DE BOTONES DEL ESCÁNER ──────────────────────
// Mapa de textos inglés → español para los botones nativos
const SCAN_TRANSLATIONS = {
    'Start Scanning': '📷 Iniciar Cámara',
    'Stop Scanning': '⏹ Detener Cámara',
    'Request Camera Permissions': '🔓 Permitir Cámara',
    'No Camera Found': '⚠️ Sin cámara disponible',
    'Select Camera': '🎥 Seleccionar cámara',
    'Or drop an image': '— o arrastra una imagen aquí —',
    'Select Image': '🖼️ Seleccionar Imagen',
    'Scan an Image File': '🖼️ Seleccionar Imagen',
    'Use Camera': '📷 Usar Cámara',
    'Switch To Scanning Using Camera': '📷 Usar Cámara',
    'Switch To Scanning Using Image': '🖼️ Usar Imagen',
    'No Devices Found': 'Sin dispositivos encontrados',
    'Checking...': 'Verificando...',
    'Idle': 'Esperando',
    'Error': 'Error',
    'Loading': 'Cargando...',
    'Loading image...': 'Cargando imagen...',
    'No image chosen': 'Sin imagen seleccionada',
    'Choose file': 'Elegir archivo',
    'No file chosen': 'Sin archivo seleccionado',
};

/**
 * Traduce un nodo de texto si coincide con alguna clave del mapa.
 */
function translateNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        const txt = node.textContent.trim();
        if (SCAN_TRANSLATIONS[txt]) {
            node.textContent = node.textContent.replace(txt, SCAN_TRANSLATIONS[txt]);
        }
    }
}

/**
 * Traduce todos los botones/textos del escáner dentro del contenedor.
 */
function translateScannerUI(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        const txt = node.textContent.trim();
        if (SCAN_TRANSLATIONS[txt]) {
            node.textContent = node.textContent.replace(txt, SCAN_TRANSLATIONS[txt]);
        }
    }

    // También traducir atributos value de botones/inputs
    root.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach(el => {
        const v = (el.value || el.textContent || '').trim();
        if (SCAN_TRANSLATIONS[v]) {
            if (el.value) el.value = SCAN_TRANSLATIONS[v];
            else el.textContent = SCAN_TRANSLATIONS[v];
        }
    });

    // Traducir placeholders y options de select
    root.querySelectorAll('select option').forEach(opt => {
        const v = opt.textContent.trim();
        if (SCAN_TRANSLATIONS[v]) opt.textContent = SCAN_TRANSLATIONS[v];
    });

    // Estilar anchor de cambio de modo
    root.querySelectorAll('a').forEach(a => {
        const txt = a.textContent.trim();
        if (SCAN_TRANSLATIONS[txt]) a.textContent = SCAN_TRANSLATIONS[txt];
    });
}

/**
 * Observa cambios en el escáner para traducir en tiempo real.
 */
let scanObserver = null;
function watchScannerTranslations() {
    const reader = document.getElementById('reader');
    if (!reader) return;

    // Primera pasada
    translateScannerUI(reader);

    // Observar mutaciones futuras
    if (scanObserver) scanObserver.disconnect();
    scanObserver = new MutationObserver(mutations => {
        mutations.forEach(m => {
            m.addedNodes.forEach(n => {
                if (n.nodeType === Node.ELEMENT_NODE) translateScannerUI(n);
                else translateNode(n);
            });
            if (m.type === 'characterData') translateNode(m.target);
        });
    });
    scanObserver.observe(reader, { childList: true, subtree: true, characterData: true });
}

// ─── GOOGLE AUTH ────────────────────────────────────────────
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
        document.getElementById('authBtn').style.display = 'none';
        document.getElementById('logoutBtn').style.display = 'inline-flex';
        syncStatus('ok', '✅ Conectado');
        await loadFromSheets();
    };
    const token = gapi.client.getToken();
    APP.tokenClient.requestAccessToken(token === null ? { prompt: 'consent' } : { prompt: '' });
}

function handleSignout() {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
    }
    APP.authed = false;
    document.getElementById('authBtn').style.display = 'inline-flex';
    document.getElementById('logoutBtn').style.display = 'none';
    syncStatus('g', '⏳ Desconectado');
}

// ─── ESTADO DE SINCRONIZACIÓN ───────────────────────────────
function syncStatus(type, text) {
    const el = document.getElementById('syncChip');
    el.className = 'chip ' + (type === 'ok' ? 'chip-ok' : type === 'err' ? 'chip-err' : 'chip-g');
    el.textContent = text;
}

// ─── ALMACENAMIENTO LOCAL ───────────────────────────────────
function saveLocal() {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(APP.db));
}

function loadLocal() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (saved) {
        APP.db = JSON.parse(saved);
        refreshAll();
    }
}

// ─── CARGA DESDE GOOGLE SHEETS ──────────────────────────────
async function loadFromSheets() {
    syncStatus('g', '🔄 Cargando...');
    try {
        const resStudents = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SHEET_ID,
            range: CONFIG.RANGES.ESTUDIANTES
        });
        if (resStudents.result.values) {
            APP.db.students = resStudents.result.values.map(r => ({
                id: r[0], name: r[1], dni: r[2], grade: r[3],
                section: r[4], photoUrl: r[5] || '', qrUrl: r[6] || '',
                createdAt: r[7] || ''
            }));
        }

        const resAtt = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SHEET_ID,
            range: CONFIG.RANGES.ASISTENCIA
        });
        if (resAtt.result.values) {
            APP.db.attendance = resAtt.result.values.map(r => ({
                sid: r[0], name: r[1], dni: r[2], grade: r[3],
                section: r[4], date: r[5], time: r[6], type: r[7]
            }));
        }

        try {
            const resCourses = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: CONFIG.SHEET_ID,
                range: CONFIG.RANGES.CURSOS
            });
            if (resCourses.result.values) {
                APP.db.courses = resCourses.result.values.map(r => ({
                    id: r[0], name: r[1], grade: r[2],
                    active: (r[3] || 'SI').toUpperCase() === 'SI',
                    description: r[4] || ''
                }));
            }
        } catch (e) { /* Pestaña puede no existir aún */ }

        try {
            const resSched = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: CONFIG.SHEET_ID,
                range: CONFIG.RANGES.HORARIOS
            });
            if (resSched.result.values) {
                APP.db.schedules = resSched.result.values.map(r => ({
                    courseId: r[0], courseName: r[1], day: r[2],
                    startTime: r[3], endTime: r[4], room: r[5] || ''
                }));
            }
        } catch (e) { /* Pestaña puede no existir aún */ }

        saveLocal();
        refreshAll();
        syncStatus('ok', '✅ Sincronizado');
    } catch (e) {
        console.error('Error al cargar:', e);
        syncStatus('err', '❌ Error de conexión');
    }
}

// ─── SUBIR ARCHIVOS A GOOGLE DRIVE ──────────────────────────
async function uploadToDrive(fileName, base64Data, mimeType) {
    if (!APP.authed) return '';
    try {
        const rawBase64 = base64Data.split(',')[1];
        const metadata = JSON.stringify({
            name: fileName,
            parents: [CONFIG.FOLDER_ID],
            mimeType: mimeType
        });
        const body = `--boundary\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--boundary\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${rawBase64}\r\n--boundary--`;

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + gapi.client.getToken().access_token,
                'Content-Type': 'multipart/related; boundary=boundary'
            },
            body: body
        });
        const file = await res.json();
        return file.id ? `https://drive.google.com/uc?export=view&id=${file.id}` : '';
    } catch (e) {
        console.error('Error al subir archivo:', e);
        return '';
    }
}

// ─── UTILIDADES ─────────────────────────────────────────────
function getToday() {
    return new Date().toISOString().split('T')[0];
}

function getTime() {
    return new Date().toLocaleTimeString('es-BO', { hour12: false });
}

function getAvatarColor(name) {
    const colors = ['#3b6cb4', '#2a8f6a', '#c68a1d', '#c9463d', '#7c3aed', '#0891b2', '#db2777'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

// ─── NOTIFICACIÓN CENTRAL (TOAST) ───────────────────────────
function showToast(type, title, message) {
    const container = document.getElementById('toastContainer');
    const icons = { ok: '✅', bad: '❌', warn: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || ''}</div>
        <h4>${title}</h4>
        <p>${message}</p>
    `;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3200);
}

// ─── FOTO DE PERFIL ─────────────────────────────────────────
function loadPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = CONFIG.PHOTO.WIDTH;
            canvas.height = CONFIG.PHOTO.HEIGHT;
            canvas.getContext('2d').drawImage(img, 0, 0, CONFIG.PHOTO.WIDTH, CONFIG.PHOTO.HEIGHT);
            APP.currentPhoto = canvas.toDataURL('image/jpeg', CONFIG.PHOTO.QUALITY);
            document.getElementById('photoCircle').innerHTML =
                `<img src="${APP.currentPhoto}" alt="Foto">`;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ─── REGISTRO DE ESTUDIANTE ─────────────────────────────────
async function doRegister(event) {
    event.preventDefault();
    const qrDiv = document.getElementById('qrcode');
    qrDiv.innerHTML = '';

    const student = {
        id: 'SID' + Date.now(),
        name: document.getElementById('inputName').value.trim(),
        dni: document.getElementById('inputDni').value.trim(),
        grade: document.getElementById('inputGrade').value,
        section: document.getElementById('inputSection').value,
        photoUrl: '',
        qrUrl: '',
        createdAt: new Date().toISOString()
    };

    if (APP.db.students.find(s => s.dni === student.dni)) {
        showToast('bad', 'Carnet duplicado', 'Este número de carnet de identidad ya está registrado.');
        return;
    }

    new QRCode(qrDiv, {
        text: JSON.stringify({ id: student.id }),
        width: 180,
        height: 180,
        correctLevel: QRCode.CorrectLevel.H
    });

    document.getElementById('qrActions').classList.add('visible');
    // Guardamos la foto base64 directamente para el carnet
    APP.lastStudent = { ...student, photo: APP.currentPhoto, photoUrl: APP.currentPhoto || '' };

    await new Promise(r => setTimeout(r, 500));

    if (APP.authed) {
        document.getElementById('qrStatus').textContent = '🔄 Subiendo datos a Google...';
        student.photoUrl = APP.currentPhoto
            ? await uploadToDrive(`Foto_${student.dni}.jpg`, APP.currentPhoto, 'image/jpeg')
            : '';
        const qrCanvas = qrDiv.querySelector('canvas');
        student.qrUrl = await uploadToDrive(`QR_${student.dni}.png`, qrCanvas.toDataURL(), 'image/png');

        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SHEET_ID,
            range: CONFIG.SHEETS.ESTUDIANTES,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[
                    student.id, student.name, student.dni, student.grade,
                    student.section, student.photoUrl, student.qrUrl, student.createdAt
                ]]
            }
        });

        showToast('ok', 'Registrado', `${student.name} fue registrado y sincronizado con Google.`);
        document.getElementById('qrStatus').textContent = '✅ Registrado y sincronizado';
    } else {
        showToast('info', 'Guardado localmente', `${student.name} fue registrado sin conexión a Google.`);
        document.getElementById('qrStatus').textContent = '✅ Registrado localmente';
    }

    APP.db.students.push(student);
    saveLocal();
    refreshAll();

    document.getElementById('regForm').reset();
    document.getElementById('photoCircle').innerHTML = '📷';
    APP.currentPhoto = null;
}

// ─── ESCÁNER QR ─────────────────────────────────────────────
async function onScanSuccess(decodedText) {
    if (APP.qrScanner.isPaused) return;
    APP.qrScanner.pause(true);

    try {
        const data = JSON.parse(decodedText);
        const student = APP.db.students.find(s => s.id === data.id);

        if (!student) {
            showScanFeedback('bad', '❌ No registrado', 'Este alumno no existe en la base de datos.');
            showToast('bad', 'No registrado', 'Código QR no encontrado en el sistema.');
        } else {
            const mode = document.querySelector('input[name="scanMode"]:checked').value;
            const today = getToday();
            const alreadyMarked = APP.db.attendance.find(
                a => a.sid === student.id && a.date === today && a.type === mode
            );

            if (alreadyMarked) {
                showScanFeedback('warn', `⚠️ ${student.name}`,
                    `Ya registró su ${mode.toLowerCase()} hoy a las ${alreadyMarked.time}`);
                showScanNotification('warn', student.name, `Ya registró ${mode.toLowerCase()} a las ${alreadyMarked.time}`, `${student.grade} ${student.section}`);
                showToast('warn', 'Ya registrado', `${student.name} ya tiene ${mode.toLowerCase()} hoy.`);
            } else {
                const record = {
                    sid: student.id, name: student.name, dni: student.dni,
                    grade: student.grade, section: student.section,
                    date: today, time: getTime(), type: mode
                };
                APP.db.attendance.push(record);
                saveLocal();

                if (APP.authed) {
                    await gapi.client.sheets.spreadsheets.values.append({
                        spreadsheetId: CONFIG.SHEET_ID,
                        range: CONFIG.SHEETS.ASISTENCIA,
                        valueInputOption: 'USER_ENTERED',
                        resource: {
                            values: [[record.sid, record.name, record.dni, record.grade,
                                record.section, record.date, record.time, record.type]]
                        }
                    });
                }

                const modeLabel = mode === 'ENTRADA' ? '🟢 Entrada' : '🔴 Salida';
                showScanFeedback('ok', `✅ ${student.name}`, `${modeLabel} registrada: ${record.time}`);
                showScanNotification('ok', student.name, `${modeLabel} registrada · ${record.time}`, `${student.grade} ${student.section}`);
                showToast('ok', student.name, `${modeLabel} a las ${record.time}`);
                refreshAll();
                renderTodayLog();
            }
        }
    } catch (e) {
        showScanFeedback('bad', '❌ Error de lectura', 'El código QR no es válido para este sistema.');
        showToast('bad', 'QR inválido', 'No se pudo leer el código.');
    }

    setTimeout(() => { APP.qrScanner.resume(); }, CONFIG.SCANNER.PAUSE_MS);
}

function showScanFeedback(type, title, msg) {
    document.getElementById('scanFeedback').innerHTML =
        `<div class="scan-feedback ${type}"><h4>${title}</h4><p>${msg}</p></div>`;
}

function showScanNotification(type, studentName, detail, course) {
    const notif = document.getElementById('scanNotification');
    const icon  = document.getElementById('scanNotifIcon');
    const name  = document.getElementById('scanNotifName');
    const det   = document.getElementById('scanNotifDetail');
    const crs   = document.getElementById('scanNotifCourse');

    const icons = { ok: '✅', bad: '❌', warn: '⚠️' };
    icon.textContent  = icons[type] || '✅';
    name.textContent  = studentName;
    det.textContent   = detail;
    crs.textContent   = course || '';

    notif.className = `scan-notification visible notif-${type}`;

    // Auto-cerrar tras 4 segundos
    clearTimeout(notif._closeTimer);
    notif._closeTimer = setTimeout(() => {
        notif.classList.remove('visible');
    }, 4000);
}

// ─── RENDERIZADO DE INTERFAZ ────────────────────────────────
function refreshAll() {
    renderRecentRegistrations();
    renderStudentsTable();
    renderAttendanceStats();
    renderTodayLog();
    renderReports();
    populateCourseFilters();
}

function renderRecentRegistrations() {
    const list = [...APP.db.students].reverse().slice(0, 5);
    const container = document.getElementById('recentList');
    if (!list.length) {
        container.innerHTML = '<p class="empty-msg">No hay registros todavía</p>';
        return;
    }
    container.innerHTML = list.map(s => `
        <div class="list-row">
            <div>
                <b>${s.name}</b><br>
                <small style="color:var(--txt2)">${s.grade} ${s.section}</small>
            </div>
            <button class="btn btn-blue btn-sm" onclick="openQRModal('${s.id}')">📱 QR</button>
        </div>
    `).join('');
}

function renderStudentsTable() {
    const query = (document.getElementById('searchBox')?.value || '').toLowerCase();
    const today = getToday();
    const filtered = APP.db.students.filter(
        s => s.name.toLowerCase().includes(query) || s.dni.includes(query)
    );
    const tbody = document.getElementById('studentsBody');
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">No se encontraron alumnos</td></tr>';
        return;
    }
    tbody.innerHTML = filtered.map(s => {
        const hasEntry = APP.db.attendance.find(
            a => a.sid === s.id && a.date === today && a.type === CONFIG.TIPOS.ENTRADA
        );
        const color = getAvatarColor(s.name);
        return `<tr>
            <td>
                <div class="cell-name">
                    <div class="avatar" style="background:${color}">${getInitials(s.name)}</div>
                    <div><b>${s.name}</b><br><small style="color:var(--txt3)">${s.grade} ${s.section}</small></div>
                </div>
            </td>
            <td>${s.dni}</td>
            <td><span class="tag ${hasEntry ? 'tag-ok' : 'tag-no'}">${hasEntry ? 'Presente' : 'Ausente'}</span></td>
            <td><button class="btn btn-blue btn-sm" onclick="openQRModal('${s.id}')">📱</button></td>
        </tr>`;
    }).join('');
}

function renderTodayLog() {
    const today = getToday();
    const log = APP.db.attendance.filter(a => a.date === today).reverse();

    ['todayLog', 'todayLog2'].forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        if (!log.length) {
            container.innerHTML = '<p class="empty-msg">Esperando lecturas de QR...</p>';
            return;
        }
        container.innerHTML = log.map(a => {
            const isEntry = a.type === CONFIG.TIPOS.ENTRADA;
            return `<div class="list-row">
                <div>
                    <b>${a.name}</b><br>
                    <small style="color:var(--txt2)">${a.grade} ${a.section}</small>
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                    <span class="tag ${isEntry ? 'tag-ok' : 'tag-warn'}">${isEntry ? '🟢 Entrada' : '🔴 Salida'}</span>
                    <span class="list-time">${a.time}</span>
                </div>
            </div>`;
        }).join('');
    });
}

function renderAttendanceStats() {
    const today = getToday();
    const total   = APP.db.students.length;
    const present = APP.db.attendance.filter(a => a.date === today && a.type === CONFIG.TIPOS.ENTRADA).length;
    const absent  = total - present;
    const exits   = APP.db.attendance.filter(a => a.date === today && a.type === CONFIG.TIPOS.SALIDA).length;

    document.getElementById('statTotal').textContent   = total;
    document.getElementById('statPresent').textContent = present;
    document.getElementById('statAbsent').textContent  = absent;
    document.getElementById('statExits').textContent   = exits;
}

// ─── REPORTES ───────────────────────────────────────────────
function populateCourseFilters() {
    // Obtener cursos únicos desde la hoja de cursos (si existe) o desde los estudiantes registrados
    let courseNames = [];
    if (APP.db.courses && APP.db.courses.length > 0) {
        courseNames = [...new Set(APP.db.courses.filter(c => c.active !== false).map(c => c.name))].sort();
    } else {
        courseNames = [...new Set(APP.db.students.map(s => s.grade))].filter(Boolean).sort();
    }

    // Secciones/paralelos únicos
    const sections = [...new Set(APP.db.students.map(s => s.section))].filter(Boolean).sort();

    // Poblar select de REGISTRO (inputGrade)
    const inputGrade = document.getElementById('inputGrade');
    if (inputGrade) {
        const currentVal = inputGrade.value;
        inputGrade.innerHTML = '<option value="">Seleccionar curso...</option>' +
            courseNames.map(n => `<option value="${n}" ${n === currentVal ? 'selected' : ''}>${n}</option>`).join('');
        if (!courseNames.length) {
            inputGrade.innerHTML = '<option value="">Sin cursos cargados aún</option>';
        }
    }

    // Poblar selects de REPORTE (reportGrade, reportSection)
    const gradeFilter = document.getElementById('reportGrade');
    if (gradeFilter) {
        const current = gradeFilter.value;
        gradeFilter.innerHTML = '<option value="">Todos los cursos</option>' +
            courseNames.map(g => `<option value="${g}" ${g === current ? 'selected' : ''}>${g}</option>`).join('');
    }

    const sectionFilter = document.getElementById('reportSection');
    if (sectionFilter) {
        const current = sectionFilter.value;
        // Siempre incluir A,B,C + los que haya en los datos
        const allSections = [...new Set(['A','B','C', ...sections])].sort();
        sectionFilter.innerHTML = '<option value="">Todos los paralelos</option>' +
            allSections.map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`).join('');
    }
}

function renderReports() {
    const today        = getToday();
    const dateFrom     = document.getElementById('reportDateFrom')?.value || today;
    const dateTo       = document.getElementById('reportDateTo')?.value   || today;
    const gradeFilter  = document.getElementById('reportGrade')?.value    || '';
    const sectionFilter= document.getElementById('reportSection')?.value  || '';

    // Filtrar asistencia por rango de fechas
    let filtered = APP.db.attendance.filter(a => a.date >= dateFrom && a.date <= dateTo);
    if (gradeFilter)   filtered = filtered.filter(a => a.grade   === gradeFilter);
    if (sectionFilter) filtered = filtered.filter(a => a.section === sectionFilter);

    let filteredStudents = [...APP.db.students];
    if (gradeFilter)   filteredStudents = filteredStudents.filter(s => s.grade   === gradeFilter);
    if (sectionFilter) filteredStudents = filteredStudents.filter(s => s.section === sectionFilter);

    const entries        = filtered.filter(a => a.type === CONFIG.TIPOS.ENTRADA);
    const exits          = filtered.filter(a => a.type === CONFIG.TIPOS.SALIDA);
    const presentIds     = new Set(entries.map(a => a.sid));
    const absentStudents = filteredStudents.filter(s => !presentIds.has(s.id));

    document.getElementById('reportTotal').textContent   = filteredStudents.length;
    document.getElementById('reportPresent').textContent = entries.length;
    document.getElementById('reportAbsent').textContent  = absentStudents.length;
    document.getElementById('reportExits').textContent   = exits.length;

    const reportBody = document.getElementById('reportBody');
    if (!entries.length && !absentStudents.length) {
        reportBody.innerHTML = '<tr><td colspan="6" class="empty-msg">Sin datos para este filtro</td></tr>';
        return;
    }

    let rows = '';
    entries.forEach(a => {
        rows += `<tr>
            <td><b>${a.name}</b></td>
            <td>${a.grade} ${a.section}</td>
            <td>${a.date}</td>
            <td><span class="tag tag-ok">Presente</span></td>
            <td>${a.time}</td>
            <td>${exits.find(x => x.sid === a.sid && x.date === a.date)?.time || '—'}</td>
        </tr>`;
    });
    absentStudents.forEach(s => {
        rows += `<tr>
            <td><b>${s.name}</b></td>
            <td>${s.grade} ${s.section}</td>
            <td>${dateFrom === dateTo ? dateFrom : `${dateFrom} – ${dateTo}`}</td>
            <td><span class="tag tag-no">Ausente</span></td>
            <td>—</td><td>—</td>
        </tr>`;
    });

    reportBody.innerHTML = rows;
    renderScheduleForDay(today);
}

function renderScheduleForDay(dateStr) {
    const container = document.getElementById('scheduleToday');
    if (!container) return;
    const dayNames = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const dayOfWeek = dayNames[new Date(dateStr + 'T12:00:00').getDay()];
    const todaySchedules = APP.db.schedules.filter(s => s.day.toLowerCase() === dayOfWeek);

    if (!todaySchedules.length) {
        container.innerHTML = '<p class="empty-msg">No hay horarios cargados para este día</p>';
        return;
    }
    container.innerHTML = todaySchedules.map(s => `
        <div class="list-row">
            <div>
                <b>${s.courseName}</b><br>
                <small style="color:var(--txt2)">${s.room ? 'Aula: ' + s.room : ''}</small>
            </div>
            <span class="list-time">${s.startTime} - ${s.endTime}</span>
        </div>
    `).join('');
}

function downloadReport() {
    const { jsPDF } = window.jspdf;
    const today        = getToday();
    const dateFrom     = document.getElementById('reportDateFrom')?.value || today;
    const dateTo       = document.getElementById('reportDateTo')?.value   || today;
    const gradeFilter  = document.getElementById('reportGrade')?.value    || '';
    const sectionFilter= document.getElementById('reportSection')?.value  || '';

    let filtered = APP.db.attendance.filter(a => a.date >= dateFrom && a.date <= dateTo);
    if (gradeFilter)   filtered = filtered.filter(a => a.grade   === gradeFilter);
    if (sectionFilter) filtered = filtered.filter(a => a.section === sectionFilter);

    let filteredStudents = [...APP.db.students];
    if (gradeFilter)   filteredStudents = filteredStudents.filter(s => s.grade   === gradeFilter);
    if (sectionFilter) filteredStudents = filteredStudents.filter(s => s.section === sectionFilter);

    const entries        = filtered.filter(a => a.type === CONFIG.TIPOS.ENTRADA);
    const exits          = filtered.filter(a => a.type === CONFIG.TIPOS.SALIDA);
    const presentIds     = new Set(entries.map(a => a.sid));
    const absentStudents = filteredStudents.filter(s => !presentIds.has(s.id));

    const doc   = new jsPDF('p', 'mm', 'a4');
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFillColor(27, 46, 74);
    doc.rect(0, 0, pageW, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('INSTITUTO CEAN', pageW / 2, 11, { align: 'center' });
    doc.setFontSize(10);
    doc.text('REPORTE DE ASISTENCIA', pageW / 2, 18, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    let y = 35;
    doc.setFontSize(11);
    const periodoLabel = dateFrom === dateTo ? dateFrom : `${dateFrom}  al  ${dateTo}`;
    doc.text(`Período: ${periodoLabel}`, 14, y);
    if (gradeFilter)   doc.text(`Curso: ${gradeFilter}`, 14, y + 6);
    if (sectionFilter) doc.text(`Paralelo: ${sectionFilter}`, 80, y + 6);
    y += gradeFilter ? 16 : 10;

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`Total: ${filteredStudents.length}  |  Presentes: ${entries.length}  |  Ausentes: ${absentStudents.length}`, 14, y);
    doc.setFont(undefined, 'normal');
    y += 10;

    doc.setFillColor(240, 233, 220);
    doc.rect(14, y, pageW - 28, 7, 'F');
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text('ESTUDIANTE', 16, y + 5);
    doc.text('CURSO', 75, y + 5);
    doc.text('FECHA', 105, y + 5);
    doc.text('ESTADO', 130, y + 5);
    doc.text('ENTRADA', 153, y + 5);
    doc.text('SALIDA', 175, y + 5);
    doc.setFont(undefined, 'normal');
    y += 10;

    const addRow = (name, grade, date, status, entryTime, exitTime) => {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.setFontSize(8);
        doc.text(name.substring(0, 28), 16, y);
        doc.text(grade, 75, y);
        doc.text(date, 105, y);
        doc.text(status, 130, y);
        doc.text(entryTime, 153, y);
        doc.text(exitTime, 175, y);
        y += 6;
    };

    entries.forEach(a => {
        addRow(a.name, `${a.grade} ${a.section}`, a.date, 'PRESENTE', a.time,
               exits.find(x => x.sid === a.sid && x.date === a.date)?.time || '—');
    });
    absentStudents.forEach(s => {
        addRow(s.name, `${s.grade} ${s.section}`, '—', 'AUSENTE', '—', '—');
    });

    y += 8;
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generado: ${new Date().toLocaleString('es-BO')}  |  Instituto CEAN`, 14, y);

    const fileName = `Reporte_CEAN_${dateFrom}_${dateTo}${gradeFilter ? '_' + gradeFilter : ''}${sectionFilter ? '_' + sectionFilter : ''}.pdf`;
    doc.save(fileName);
    showToast('ok', 'Reporte generado', `Se descargó ${fileName}`);
}

// ─── MODAL QR ───────────────────────────────────────────────
function openQRModal(studentId) {
    const student = APP.db.students.find(s => s.id === studentId);
    if (!student) return;
    // Preservar foto base64 si existe (prioridad: campo photo > photoUrl si es base64)
    APP.lastStudent = {
        ...student,
        photo: student.photo || (student.photoUrl && student.photoUrl.startsWith('data:') ? student.photoUrl : null)
    };
    document.getElementById('modalName').textContent = student.name;
    document.getElementById('modalInfo').textContent = `${student.grade} ${student.section} — CI: ${student.dni}`;
    const qrWrap = document.getElementById('modalQR');
    qrWrap.innerHTML = '';
    new QRCode(qrWrap, { text: JSON.stringify({ id: student.id }), width: 160, height: 160 });
    document.getElementById('overlay').classList.add('open');
}

function closeModal() {
    document.getElementById('overlay').classList.remove('open');
}

// ─── DESCARGAS ──────────────────────────────────────────────
function downloadQRPng() {
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas || !APP.lastStudent) return;
    // QR con borde blanco garantizado
    const out = document.createElement('canvas');
    const pad = 16;
    out.width  = canvas.width  + pad * 2;
    out.height = canvas.height + pad * 2;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, pad, pad);
    const link = document.createElement('a');
    link.download = `QR_${APP.lastStudent.dni}.png`;
    link.href = out.toDataURL();
    link.click();
}

// ─── GENERADOR DE CARNET PROFESIONAL ────────────────────────
/**
 * Dibuja el carnet completo en un Canvas HTML y devuelve su dataURL.
 * Dimensiones: 1012 × 638 px (aprox. CR80 / tarjeta de crédito a 300 dpi)
 */
async function buildCredentialCanvas(student, qrSourceCanvas, photoDataUrl) {
    const W = 1016, H = 640;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // ── Paleta ──────────────────────────────────────────────
    const navy   = '#1b2e4a';
    const navyL  = '#2d4a73';
    const blue   = '#3b6cb4';
    const gold   = '#c8a94a';
    const goldL  = '#e8c96a';
    const white  = '#ffffff';
    const cream  = '#fdf8f0';
    const txt2   = '#5a6472';

    // ── Fondo base ───────────────────────────────────────────
    // Gradiente vertical oscuro-claro
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0,   navy);
    bgGrad.addColorStop(0.42, navyL);
    bgGrad.addColorStop(1,   '#1e3a5f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ── Banda diagonal decorativa ────────────────────────────
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = white;
    ctx.beginPath();
    ctx.moveTo(W * 0.35, 0);
    ctx.lineTo(W * 0.70, 0);
    ctx.lineTo(W * 0.55, H);
    ctx.lineTo(W * 0.20, H);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Círculos decorativos de fondo ────────────────────────
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = white;
    ctx.beginPath(); ctx.arc(-60,  -60, 200, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(W+60, H+60, 220, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Banda superior (header) ──────────────────────────────
    const hdrH = 110;
    const hdrGrad = ctx.createLinearGradient(0, 0, W, 0);
    hdrGrad.addColorStop(0,   navy);
    hdrGrad.addColorStop(0.5, '#243d5c');
    hdrGrad.addColorStop(1,   navy);
    ctx.fillStyle = hdrGrad;
    ctx.fillRect(0, 0, W, hdrH);

    // Línea dorada inferior del header
    ctx.fillStyle = gold;
    ctx.fillRect(0, hdrH - 4, W, 4);

    // Línea dorada fina extra
    ctx.fillStyle = goldL;
    ctx.fillRect(0, hdrH, W, 1);

    // ── Logo / escudo placeholder ────────────────────────────
    const shieldX = 36, shieldY = 16, shieldS = 78;
    ctx.save();
    // Círculo fondo escudo
    ctx.beginPath();
    ctx.arc(shieldX + shieldS/2, shieldY + shieldS/2, shieldS/2, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Emoji escudo
    ctx.font = '38px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎓', shieldX + shieldS/2, shieldY + shieldS/2 + 2);
    ctx.restore();

    // ── Nombre del colegio (header) ──────────────────────────
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = white;
    ctx.font = 'bold 26px Georgia, serif';
    ctx.letterSpacing = '2px';
    ctx.fillText('INSTITUTO CEAN', W / 2 + 20, 48);
    ctx.font = '13px Arial, sans-serif';
    ctx.fillStyle = gold;
    ctx.letterSpacing = '4px';
    ctx.fillText('SISTEMA DE ASISTENCIA', W / 2 + 20, 72);

    // Subtítulo tipo del carnet
    ctx.fillStyle = 'rgba(255,255,255,0.60)';
    ctx.font = '11px Arial, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText('CARNET ESTUDIANTIL', W / 2 + 20, 96);
    ctx.letterSpacing = '0px';

    // ── SECCIÓN FOTO ─────────────────────────────────────────
    const photoX = 52, photoY = 140;
    const photoW = 200, photoH = 240;
    const photoR = 14;

    // Marco dorado
    ctx.save();
    roundRect(ctx, photoX - 5, photoY - 5, photoW + 10, photoH + 10, photoR + 3);
    ctx.fillStyle = gold;
    ctx.fill();
    ctx.restore();

    // Fondo interno foto
    ctx.save();
    roundRect(ctx, photoX, photoY, photoW, photoH, photoR);
    ctx.clip();
    ctx.fillStyle = '#243d5c';
    ctx.fillRect(photoX, photoY, photoW, photoH);

    if (photoDataUrl) {
        try {
            await new Promise((res) => {
                const img = new Image();
                img.onload = () => {
                    // Crop cuadrado centrado
                    const s = Math.min(img.width, img.height);
                    const sx = (img.width  - s) / 2;
                    const sy = (img.height - s) / 2;
                    ctx.drawImage(img, sx, sy, s, s, photoX, photoY, photoW, photoH);
                    res();
                };
                img.onerror = res;
                img.src = photoDataUrl;
            });
        } catch(e) { drawAvatarPlaceholder(ctx, student, photoX, photoY, photoW, photoH); }
    } else {
        drawAvatarPlaceholder(ctx, student, photoX, photoY, photoW, photoH);
    }
    ctx.restore();

    // Etiqueta "ALUMNO" debajo de la foto
    ctx.fillStyle = gold;
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '3px';
    ctx.fillText('ALUMNO', photoX + photoW/2, photoY + photoH + 24);
    ctx.letterSpacing = '0px';

    // Línea decorativa bajo la foto
    ctx.fillStyle = gold;
    ctx.fillRect(photoX, photoY + photoH + 30, photoW, 2);

    // ── SECCIÓN DATOS ────────────────────────────────────────
    const dataX  = 298;
    const dataY  = 140;
    const dataW  = W - dataX - 210; // deja espacio para QR

    // Tarjeta de datos (fondo semi-transparente)
    ctx.save();
    roundRect(ctx, dataX - 14, dataY - 10, dataW + 20, 270, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,169,74,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Función helper para dibujar campo
    function drawField(label, value, x, y, maxW) {
        ctx.font = 'bold 10px Arial, sans-serif';
        ctx.fillStyle = gold;
        ctx.textAlign = 'left';
        ctx.letterSpacing = '2px';
        ctx.fillText(label.toUpperCase(), x, y);
        ctx.letterSpacing = '0px';

        // Línea separadora
        ctx.fillStyle = 'rgba(200,169,74,0.3)';
        ctx.fillRect(x, y + 4, maxW - 10, 1);

        // Valor — ajuste automático de fuente para nombres largos
        let fontSize = 20;
        ctx.font = `bold ${fontSize}px Georgia, serif`;
        ctx.fillStyle = white;
        while (ctx.measureText(value).width > maxW - 10 && fontSize > 13) {
            fontSize -= 1;
            ctx.font = `bold ${fontSize}px Georgia, serif`;
        }
        ctx.fillText(value, x, y + 26);
    }

    // Nombre completo — campo más grande
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.fillStyle = gold;
    ctx.textAlign = 'left';
    ctx.letterSpacing = '2px';
    ctx.fillText('NOMBRE COMPLETO', dataX, dataY + 12);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(200,169,74,0.3)';
    ctx.fillRect(dataX, dataY + 18, dataW, 1);

    // Nombre adaptable — split en dos líneas si es muy largo
    const fullName = student.name.toUpperCase();
    let nameFontSize = 24;
    ctx.font = `bold ${nameFontSize}px Georgia, serif`;
    while (ctx.measureText(fullName).width > dataW && nameFontSize > 14) {
        nameFontSize -= 1;
        ctx.font = `bold ${nameFontSize}px Georgia, serif`;
    }
    // Si aún no cabe, dividir en dos líneas
    if (ctx.measureText(fullName).width > dataW) {
        const words  = fullName.split(' ');
        const half   = Math.ceil(words.length / 2);
        const line1  = words.slice(0, half).join(' ');
        const line2  = words.slice(half).join(' ');
        nameFontSize = 20;
        ctx.font = `bold ${nameFontSize}px Georgia, serif`;
        ctx.fillStyle = white;
        ctx.fillText(line1, dataX, dataY + 48);
        ctx.fillText(line2, dataX, dataY + 74);
    } else {
        ctx.fillStyle = white;
        ctx.fillText(fullName, dataX, dataY + 56);
    }

    // Resto de campos
    drawField('Carnet de Identidad',    student.dni,                 dataX,       dataY + 104, dataW / 2 - 10);
    drawField('Curso',              student.grade,               dataX + dataW/2,  dataY + 104, dataW / 2);
    drawField('Paralelo',            student.section,             dataX,       dataY + 168, dataW / 2 - 10);

    // Año escolar dinámico
    const year = new Date().getFullYear();
    drawField('Año Escolar',        `${year} - ${year+1}`,       dataX + dataW/2, dataY + 168, dataW / 2);

    // ── SECCIÓN QR ───────────────────────────────────────────
    const qrAreaX = W - 200;
    const qrAreaY = 130;
    const qrSize  = 178;

    // Fondo blanco amplio para el QR (garantiza escaneo rápido)
    const qrPad = 16;
    ctx.save();
    roundRect(ctx, qrAreaX - qrPad, qrAreaY - qrPad, qrSize + qrPad*2, qrSize + qrPad*2, 14);
    ctx.fillStyle = white;
    ctx.fill();
    // Borde dorado
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // QR real
    if (qrSourceCanvas) {
        ctx.drawImage(qrSourceCanvas, qrAreaX, qrAreaY, qrSize, qrSize);
    }

    // Texto bajo el QR
    ctx.fillStyle = gold;
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '1.5px';
    ctx.fillText('ESCANEAR PARA ASISTENCIA', qrAreaX + qrSize/2, qrAreaY + qrSize + qrPad + 14);
    ctx.letterSpacing = '0px';

    // ── BANDA INFERIOR ───────────────────────────────────────
    const footerY = H - 62;
    const fGrad = ctx.createLinearGradient(0, footerY, W, footerY);
    fGrad.addColorStop(0,   navy);
    fGrad.addColorStop(0.5, '#243d5c');
    fGrad.addColorStop(1,   navy);
    ctx.fillStyle = fGrad;
    ctx.fillRect(0, footerY, W, H - footerY);

    // Línea dorada superior del footer
    ctx.fillStyle = gold;
    ctx.fillRect(0, footerY, W, 3);

    // Línea de validez
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`ID: ${student.id}`, 52, footerY + 22);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(200,169,74,0.8)';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.fillText('CARNET DE IDENTIDAD ESTUDIANTIL — INSTITUTO CEAN', W/2, footerY + 22);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px Arial, sans-serif';
    const now = new Date();
    ctx.fillText(`Emitido: ${now.toLocaleDateString('es-BO')}`, W - 52, footerY + 22);

    // Franjas decorativas izquierda/derecha
    const stripeW = 14;
    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 === 0 ? gold : navyL;
        ctx.fillRect(0,     footerY + 34 + i * 6, stripeW, 5);
        ctx.fillRect(W - stripeW, footerY + 34 + i * 6, stripeW, 5);
    }

    // Texto adicional footer
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px Arial, sans-serif';
    ctx.fillText('Válido para el ingreso y salida del establecimiento educativo', W/2, footerY + 48);

    return c;
}

/** Helper: dibuja el placeholder con iniciales si no hay foto */
function drawAvatarPlaceholder(ctx, student, x, y, w, h) {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#2d4a73');
    grad.addColorStop(1, '#1b2e4a');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    const initials = student.name.split(' ').map(p => p[0]).join('').substring(0,2).toUpperCase();
    ctx.fillStyle = 'rgba(200,169,74,0.4)';
    ctx.font = `bold 80px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, x + w/2, y + h/2);
    ctx.textBaseline = 'alphabetic';
}

/** Helper: trazado de rect con bordes redondeados */
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

/**
 * Genera un QR con fondo blanco amplio en un canvas temporal.
 */
function buildQRCanvas(studentId) {
    return new Promise(resolve => {
        const tmp = document.createElement('div');
        tmp.style.position = 'absolute';
        tmp.style.left = '-9999px';
        document.body.appendChild(tmp);

        new QRCode(tmp, {
            text: JSON.stringify({ id: studentId }),
            width: 220,
            height: 220,
            correctLevel: QRCode.CorrectLevel.H
        });

        setTimeout(() => {
            const qrCanvas = tmp.querySelector('canvas');
            // Envolver en canvas con fondo blanco (margen extra garantizado)
            const out = document.createElement('canvas');
            const pad = 20;
            out.width  = qrCanvas ? qrCanvas.width  + pad*2 : 260;
            out.height = qrCanvas ? qrCanvas.height + pad*2 : 260;
            const ctx = out.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, out.width, out.height);
            if (qrCanvas) ctx.drawImage(qrCanvas, pad, pad);
            document.body.removeChild(tmp);
            resolve(out);
        }, 600);
    });
}

async function downloadQRPng() {
    const canvas = document.querySelector('#qrcode canvas');
    if (!canvas || !APP.lastStudent) return;
    // QR con borde blanco garantizado
    const out = document.createElement('canvas');
    const pad = 20;
    out.width  = canvas.width  + pad * 2;
    out.height = canvas.height + pad * 2;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, pad, pad);
    const link = document.createElement('a');
    link.download = `QR_${APP.lastStudent.dni}.png`;
    link.href = out.toDataURL();
    link.click();
}

async function downloadPDF() {
    if (!APP.lastStudent) return;
    showToast('info', 'Generando carnet...', 'Por favor espera un momento');

    const { jsPDF } = window.jspdf;

    // 1. Construir QR con fondo blanco
    const qrCanvas = await buildQRCanvas(APP.lastStudent.id);

    // 2. Obtener foto
    const photoUrl = APP.lastStudent.photo || APP.lastStudent.photoUrl || null;

    // 3. Dibujar carnet en canvas
    const credCanvas = await buildCredentialCanvas(APP.lastStudent, qrCanvas, photoUrl);

    // 4. Exportar a PDF tamaño CR80 (85.6 x 54 mm) en landscape
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [100, 63] });
    const imgData = credCanvas.toDataURL('image/jpeg', 0.97);
    doc.addImage(imgData, 'JPEG', 0, 0, 100, 63);
    doc.save(`Carnet_${APP.lastStudent.dni}.pdf`);
    showToast('ok', 'Carnet generado', `PDF descargado para ${APP.lastStudent.name}`);
}

async function downloadPDFFromModal() {
    if (!APP.lastStudent) return;
    showToast('info', 'Generando carnet...', 'Por favor espera un momento');

    const { jsPDF } = window.jspdf;
    const qrCanvas   = await buildQRCanvas(APP.lastStudent.id);
    const photoUrl   = APP.lastStudent.photo || APP.lastStudent.photoUrl || null;
    const credCanvas = await buildCredentialCanvas(APP.lastStudent, qrCanvas, photoUrl);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [100, 63] });
    doc.addImage(credCanvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, 100, 63);
    doc.save(`Carnet_${APP.lastStudent.dni}.pdf`);
    showToast('ok', 'Carnet generado', `PDF descargado para ${APP.lastStudent.name}`);
}

// ─── NAVEGACIÓN ─────────────────────────────────────────────
function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById('panel-' + btn.dataset.panel).classList.add('active');

            if (btn.dataset.panel !== 'scanner' && APP.qrScanner) {
                if (scanObserver) scanObserver.disconnect();
                APP.qrScanner.clear();
                APP.qrScanner = null;
            }

            if (btn.dataset.panel === 'scanner') {
                APP.qrScanner = new Html5QrcodeScanner('reader', {
                    fps: CONFIG.SCANNER.FPS,
                    qrbox: CONFIG.SCANNER.QR_BOX
                });
                APP.qrScanner.render(onScanSuccess);

                // Iniciar observador de traducción
                setTimeout(watchScannerTranslations, 400);
            }

            if (btn.dataset.panel === 'reports') {
                renderReports();
            }
        });
    });
}

// ─── MODO ESCANEO (estilos dinámicos) ───────────────────────
function initScanModeToggle() {
    document.querySelectorAll('input[name="scanMode"]').forEach(radio => {
        radio.addEventListener('change', updateScanModeStyles);
    });
    updateScanModeStyles();
}

function updateScanModeStyles() {
    const selected = document.querySelector('input[name="scanMode"]:checked')?.value;
    document.querySelectorAll('.scan-mode-selector label').forEach(label => {
        label.classList.remove('mode-active-entrada', 'mode-active-salida');
    });
    if (selected === 'ENTRADA') {
        document.querySelector('.mode-entrada')?.classList.add('mode-active-entrada');
    } else {
        document.querySelector('.mode-salida')?.classList.add('mode-active-salida');
    }
}

// ─── INICIALIZACIÓN ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initScanModeToggle();
    const today = getToday();
    const reportDateFrom = document.getElementById('reportDateFrom');
    const reportDateTo   = document.getElementById('reportDateTo');
    if (reportDateFrom) reportDateFrom.value = today;
    if (reportDateTo)   reportDateTo.value   = today;
});
