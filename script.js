// ============================================================
// script.js — Lógica principal del Sistema de Asistencia
// Colegio San Agustín
// ============================================================

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
        // Estudiantes
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

        // Asistencia
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

        // Cursos
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

        // Horarios
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

function getTodayFormatted() {
    return new Date().toLocaleDateString('es-BO', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
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
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 3200);
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

    // Verificar DNI duplicado
    if (APP.db.students.find(s => s.dni === student.dni)) {
        showToast('bad', 'DNI duplicado', 'Este número de documento ya está registrado.');
        return;
    }

    // Generar QR
    new QRCode(qrDiv, {
        text: JSON.stringify({ id: student.id }),
        width: 180,
        height: 180,
        correctLevel: QRCode.CorrectLevel.H
    });

    document.getElementById('qrActions').classList.add('visible');
    APP.lastStudent = { ...student, photo: APP.currentPhoto };

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

    // Limpiar formulario
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
                showToast('ok', student.name, `${modeLabel} a las ${record.time}`);
                refreshAll();
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
    const query = document.getElementById('searchBox').value.toLowerCase();
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
    const container = document.getElementById('todayLog');
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
}

function renderAttendanceStats() {
    const today = getToday();
    const total = APP.db.students.length;
    const present = APP.db.attendance.filter(
        a => a.date === today && a.type === CONFIG.TIPOS.ENTRADA
    ).length;
    const absent = total - present;
    const exits = APP.db.attendance.filter(
        a => a.date === today && a.type === CONFIG.TIPOS.SALIDA
    ).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statPresent').textContent = present;
    document.getElementById('statAbsent').textContent = absent;
    document.getElementById('statExits').textContent = exits;
}

// ─── REPORTES ───────────────────────────────────────────────
function populateCourseFilters() {
    const gradeFilter = document.getElementById('reportGrade');
    if (!gradeFilter) return;

    // Obtener grados únicos de estudiantes
    const grades = [...new Set(APP.db.students.map(s => s.grade))].sort();
    const current = gradeFilter.value;
    gradeFilter.innerHTML = '<option value="">Todos los grados</option>' +
        grades.map(g => `<option value="${g}" ${g === current ? 'selected' : ''}>${g}</option>`).join('');
}

function renderReports() {
    const dateFilter = document.getElementById('reportDate')?.value || getToday();
    const gradeFilter = document.getElementById('reportGrade')?.value || '';
    const sectionFilter = document.getElementById('reportSection')?.value || '';

    // Filtrar asistencia
    let filtered = APP.db.attendance.filter(a => a.date === dateFilter);
    if (gradeFilter) filtered = filtered.filter(a => a.grade === gradeFilter);
    if (sectionFilter) filtered = filtered.filter(a => a.section === sectionFilter);

    // Filtrar estudiantes para calcular ausentes
    let filteredStudents = [...APP.db.students];
    if (gradeFilter) filteredStudents = filteredStudents.filter(s => s.grade === gradeFilter);
    if (sectionFilter) filteredStudents = filteredStudents.filter(s => s.section === sectionFilter);

    const entries = filtered.filter(a => a.type === CONFIG.TIPOS.ENTRADA);
    const exits = filtered.filter(a => a.type === CONFIG.TIPOS.SALIDA);
    const presentIds = new Set(entries.map(a => a.sid));
    const absentStudents = filteredStudents.filter(s => !presentIds.has(s.id));

    // Resumen
    document.getElementById('reportTotal').textContent = filteredStudents.length;
    document.getElementById('reportPresent').textContent = entries.length;
    document.getElementById('reportAbsent').textContent = absentStudents.length;
    document.getElementById('reportExits').textContent = exits.length;

    // Tabla de reporte
    const reportBody = document.getElementById('reportBody');
    if (!entries.length && !absentStudents.length) {
        reportBody.innerHTML = '<tr><td colspan="5" class="empty-msg">Sin datos para este filtro</td></tr>';
        return;
    }

    let rows = '';
    // Presentes
    entries.forEach(a => {
        rows += `<tr>
            <td><b>${a.name}</b></td>
            <td>${a.grade} ${a.section}</td>
            <td><span class="tag tag-ok">Presente</span></td>
            <td>${a.time}</td>
            <td>${exits.find(x => x.sid === a.sid)?.time || '—'}</td>
        </tr>`;
    });
    // Ausentes
    absentStudents.forEach(s => {
        rows += `<tr>
            <td><b>${s.name}</b></td>
            <td>${s.grade} ${s.section}</td>
            <td><span class="tag tag-no">Ausente</span></td>
            <td>—</td><td>—</td>
        </tr>`;
    });

    reportBody.innerHTML = rows;

    // Horarios del día
    renderScheduleForDay(dateFilter);
}

function renderScheduleForDay(dateStr) {
    const container = document.getElementById('scheduleToday');
    if (!container) return;

    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const dayOfWeek = dayNames[new Date(dateStr + 'T12:00:00').getDay()];

    const todaySchedules = APP.db.schedules.filter(
        s => s.day.toLowerCase() === dayOfWeek
    );

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
    const dateFilter = document.getElementById('reportDate')?.value || getToday();
    const gradeFilter = document.getElementById('reportGrade')?.value || '';
    const sectionFilter = document.getElementById('reportSection')?.value || '';

    let filtered = APP.db.attendance.filter(a => a.date === dateFilter);
    if (gradeFilter) filtered = filtered.filter(a => a.grade === gradeFilter);
    if (sectionFilter) filtered = filtered.filter(a => a.section === sectionFilter);

    let filteredStudents = [...APP.db.students];
    if (gradeFilter) filteredStudents = filteredStudents.filter(s => s.grade === gradeFilter);
    if (sectionFilter) filteredStudents = filteredStudents.filter(s => s.section === sectionFilter);

    const entries = filtered.filter(a => a.type === CONFIG.TIPOS.ENTRADA);
    const exits = filtered.filter(a => a.type === CONFIG.TIPOS.SALIDA);
    const presentIds = new Set(entries.map(a => a.sid));
    const absentStudents = filteredStudents.filter(s => !presentIds.has(s.id));

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = doc.internal.pageSize.getWidth();

    // Encabezado
    doc.setFillColor(27, 46, 74);
    doc.rect(0, 0, pageW, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(CONFIG.SCHOOL.NAME.toUpperCase(), pageW / 2, 11, { align: 'center' });
    doc.setFontSize(10);
    doc.text('REPORTE DE ASISTENCIA', pageW / 2, 18, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    let y = 35;

    // Info
    doc.setFontSize(11);
    doc.text(`Fecha: ${dateFilter}`, 14, y);
    if (gradeFilter) doc.text(`Grado: ${gradeFilter}`, 14, y + 6);
    if (sectionFilter) doc.text(`Sección: ${sectionFilter}`, 80, y + 6);
    y += gradeFilter ? 16 : 10;

    // Resumen
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`Total: ${filteredStudents.length}  |  Presentes: ${entries.length}  |  Ausentes: ${absentStudents.length}`, 14, y);
    doc.setFont(undefined, 'normal');
    y += 10;

    // Tabla
    doc.setFillColor(240, 233, 220);
    doc.rect(14, y, pageW - 28, 7, 'F');
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text('ALUMNO', 16, y + 5);
    doc.text('GRADO', 75, y + 5);
    doc.text('ESTADO', 105, y + 5);
    doc.text('ENTRADA', 135, y + 5);
    doc.text('SALIDA', 165, y + 5);
    doc.setFont(undefined, 'normal');
    y += 10;

    const addRow = (name, grade, status, entryTime, exitTime) => {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.setFontSize(8);
        doc.text(name.substring(0, 30), 16, y);
        doc.text(grade, 75, y);
        doc.text(status, 105, y);
        doc.text(entryTime, 135, y);
        doc.text(exitTime, 165, y);
        y += 6;
    };

    entries.forEach(a => {
        const exitTime = exits.find(x => x.sid === a.sid)?.time || '—';
        addRow(a.name, `${a.grade} ${a.section}`, 'PRESENTE', a.time, exitTime);
    });

    absentStudents.forEach(s => {
        addRow(s.name, `${s.grade} ${s.section}`, 'AUSENTE', '—', '—');
    });

    // Pie
    y += 8;
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generado: ${new Date().toLocaleString('es-BO')}  |  ${CONFIG.SCHOOL.NAME}`, 14, y);

    const fileName = `Reporte_${dateFilter}${gradeFilter ? '_' + gradeFilter : ''}${sectionFilter ? '_' + sectionFilter : ''}.pdf`;
    doc.save(fileName);
    showToast('ok', 'Reporte generado', `Se descargó ${fileName}`);
}

// ─── MODAL QR ───────────────────────────────────────────────
function openQRModal(studentId) {
    const student = APP.db.students.find(s => s.id === studentId);
    if (!student) return;
    APP.lastStudent = student;
    document.getElementById('modalName').textContent = student.name;
    document.getElementById('modalInfo').textContent = `${student.grade} ${student.section} — DNI: ${student.dni}`;
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
    const link = document.createElement('a');
    link.download = `QR_${APP.lastStudent.dni}.png`;
    link.href = canvas.toDataURL();
    link.click();
}

function downloadPDF() {
    if (!APP.lastStudent) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', [90, 60]);

    doc.setFillColor(27, 46, 74);
    doc.rect(0, 0, 90, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(CONFIG.SCHOOL.NAME.toUpperCase(), 45, 10, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(APP.lastStudent.name.toUpperCase(), 10, 24);
    doc.setFontSize(7);
    doc.text('DNI: ' + APP.lastStudent.dni, 10, 30);
    doc.text('Grado: ' + APP.lastStudent.grade, 10, 36);
    doc.text('Sección: ' + APP.lastStudent.section, 10, 42);

    const canvas = document.querySelector('#qrcode canvas') || document.querySelector('#modalQR canvas');
    if (canvas) doc.addImage(canvas.toDataURL(), 'PNG', 55, 18, 30, 30);

    doc.save(`Carnet_${APP.lastStudent.dni}.pdf`);
    showToast('ok', 'Carnet generado', `PDF descargado para ${APP.lastStudent.name}`);
}

function downloadPDFFromModal() {
    if (!APP.lastStudent) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', [90, 60]);

    doc.setFillColor(27, 46, 74);
    doc.rect(0, 0, 90, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(CONFIG.SCHOOL.NAME.toUpperCase(), 45, 10, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(APP.lastStudent.name.toUpperCase(), 10, 24);
    doc.setFontSize(7);
    doc.text('DNI: ' + APP.lastStudent.dni, 10, 30);
    doc.text('Grado: ' + APP.lastStudent.grade, 10, 36);
    doc.text('Sección: ' + (APP.lastStudent.section || ''), 10, 42);

    const canvas = document.querySelector('#modalQR canvas');
    if (canvas) doc.addImage(canvas.toDataURL(), 'PNG', 55, 18, 30, 30);

    doc.save(`Carnet_${APP.lastStudent.dni}.pdf`);
}

// ─── NAVEGACIÓN ─────────────────────────────────────────────
function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Desactivar todos
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

            // Activar seleccionado
            btn.classList.add('active');
            const panelId = 'panel-' + btn.dataset.panel;
            document.getElementById(panelId).classList.add('active');

            // Manejar cámara
            if (btn.dataset.panel !== 'scanner' && APP.qrScanner) {
                APP.qrScanner.clear();
                APP.qrScanner = null;
            }

            if (btn.dataset.panel === 'scanner') {
                APP.qrScanner = new Html5QrcodeScanner('reader', {
                    fps: CONFIG.SCANNER.FPS,
                    qrbox: CONFIG.SCANNER.QR_BOX
                });
                APP.qrScanner.render(onScanSuccess);
            }

            // Actualizar reportes si se abre esa pestaña
            if (btn.dataset.panel === 'reports') {
                renderReports();
            }
        });
    });
}

// ─── MODO ESCANEO (estilos dinámicos) ───────────────────────
function initScanModeToggle() {
    document.querySelectorAll('input[name="scanMode"]').forEach(radio => {
        radio.addEventListener('change', () => updateScanModeStyles());
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

    // Fecha por defecto en reportes
    const reportDate = document.getElementById('reportDate');
    if (reportDate) reportDate.value = getToday();
});
