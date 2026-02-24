let db = {
    flota: JSON.parse(localStorage.getItem('cb_flota')) || [],
    rutas: JSON.parse(localStorage.getItem('cb_rutas')) || [],
    manto: JSON.parse(localStorage.getItem('cb_manto')) || [],
    equipos: JSON.parse(localStorage.getItem('cb_equipos')) || {},
    inv: JSON.parse(localStorage.getItem('cb_inv')) || []
};

// --- PEGA TU URL DE GOOGLE AQUÍ ---
const CLOUD_URL = "https://script.google.com/macros/s/AKfycbxHX7W_KvIWF8RC-0NVo_4yx0xsBocSyXB5dzEgs-SSNcSRrRojpY4LD6hWitjmGnsebQ/exec"; 

function saveDB() {
    Object.keys(db).forEach(key => localStorage.setItem('cb_' + key, JSON.stringify(db[key])));
}

['resp-name', 'resp-email'].forEach(id => {
    document.getElementById(id).value = localStorage.getItem('cb_' + id) || '';
    document.getElementById(id).addEventListener('input', e => localStorage.setItem('cb_' + id, e.target.value));
});

// Registrar Service Worker para Celular/Offline
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => console.log("Offline listo"));
}

async function enviarALaNube(payload) {
    if (!CLOUD_URL || CLOUD_URL.includes("TU_URL")) return;
    try { await fetch(CLOUD_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) }); } catch (e) { console.error(e); }
}

function obtenerEstadoAceite(unidad) {
    const cambios = db.manto.filter(m => m.u === unidad && m.t === "Cambio Aceite");
    if (cambios.length === 0) return null;
    const ultimo = cambios[cambios.length - 1];
    const kmCambio = parseInt(ultimo.km);
    const limiteFab = parseInt(ultimo.kmFab || 5000);
    const rutas = db.rutas.filter(r => r.u === unidad && r.fin);
    const kmActual = rutas.length > 0 ? parseInt(rutas[rutas.length-1].kF) : kmCambio;
    const recorridos = kmActual - kmCambio;
    const restantes = limiteFab - recorridos;
    return { recorridos, restantes, limite: limiteFab, alerta: restantes <= 500, critico: restantes <= 0 };
}

function nav(view) {
    document.querySelectorAll('.menu button').forEach(b => b.classList.remove('active'));
    if(document.getElementById('nav-'+view)) document.getElementById('nav-'+view).classList.add('active');
    document.getElementById('view-title').innerText = view.toUpperCase();
    const views = { inicio: renderInicio, flota: renderFlota, equipos: renderEquipos, rutas: renderRutas, manto: renderManto, inventario: renderInventario };
    if(views[view]) views[view]();
}

function renderInicio() {
    let alertasHTML = "";
    db.flota.forEach(v => {
        const est = obtenerEstadoAceite(v.unidad);
        if(est) {
            let color = est.critico ? "#ef4444" : (est.alerta ? "#f59e0b" : "#10b981");
            let pct = Math.min(100, (est.recorridos / est.limite) * 100);
            alertasHTML += `
                <div style="margin-bottom:15px; background:white; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:5px;">
                        <b>${v.unidad}</b> <span>${est.restantes} KM para cambio</span>
                    </div>
                    <div class="progress-container"><div class="progress-bar" style="width:${pct}%; background:${color}"></div></div>
                </div>`;
        }
    });

    document.getElementById('viewport').innerHTML = `
        <div style="background:linear-gradient(45deg, #0f172a, #e63946); color:white; padding:30px; border-radius:15px; margin-bottom:20px;">
            <h1>Estación Santa Isabel</h1>
            <button onclick="descargarReportePDF()" class="btn-main" style="background:white; color:black; margin-top:10px;">GENERAR PDF DE GUARDIA</button>
        </div>
        <div style="display:grid; grid-template-columns: 1fr; gap:20px;">
            <div class="card"><h4>Alertas de Aceite</h4>${alertasHTML || 'Sin registros de cambio'}</div>
        </div>`;
}

function renderInventario() {
    document.getElementById('viewport').innerHTML = `
        <div class="card">
            <h3>Checklist de Guardia</h3>
            <select id="sel-inspeccion" onchange="iniciarChecklist(this.value)" style="width:100%; padding:10px; border-radius:8px;">
                <option value="">-- Seleccionar Unidad o Bodega --</option>
                ${db.flota.map(v => `<option value="${v.unidad}">${v.unidad}</option>`).join('')}
                <option value="BODEGA CENTRAL">BODEGA CENTRAL</option>
            </select>
            <div id="area-checklist" style="margin-top:20px;"></div>
        </div>`;
}

function iniciarChecklist(u) {
    if(!u) return;
    const items = db.equipos[u] || [];
    const area = document.getElementById('area-checklist');
    if(items.length === 0) { area.innerHTML = `<p style="color:red">No hay equipos. Ve a Config. Equipos.</p>`; return; }
    area.innerHTML = `
        <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid #e2e8f0;">
            <h4>Inspección: ${u}</h4>
            ${items.map(it => `<div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #e2e8f0;">
                <span>${it}</span><input type="checkbox" class="chk-item" data-item="${it}" style="width:18px; height:18px;">
            </div>`).join('')}
            <button onclick="finalizarChecklist('${u}')" class="btn-main" style="width:100%; margin-top:15px; background:green; justify-content:center;">FIRMAR Y ENVIAR</button>
        </div>`;
}

async function finalizarChecklist(u) {
    let faltantes = [];
    document.querySelectorAll('.chk-item').forEach(c => { if(!c.checked) faltantes.push(c.getAttribute('data-item')); });
    const est = faltantes.length === 0 ? "✅ TODO CONFORME" : "⚠️ NOVEDADES: Faltan " + faltantes.join(', ');
    const data = { tipo: "CHECKLIST", u, r: document.getElementById('resp-name').value, det: est, f: new Date().toLocaleString() };
    db.inv.push(data); saveDB(); await enviarALaNube(data);
    alert(est); nav('inventario');
}

function renderRutas() {
    document.getElementById('viewport').innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3>Hoja de Ruta</h3><button onclick="abrirRuta()" class="btn-main" style="background:var(--accent); color:black;">+ Salida</button>
        </div>
        <table><thead><tr><th>Fecha</th><th>Unidad</th><th>Responsable</th><th>Estado</th></tr></thead><tbody>
        ${db.rutas.map((r, i) => `<tr><td>${r.f}</td><td><b>${r.u}</b></td><td>${r.r}</td>
        <td>${!r.fin ? `<button onclick="cerrarRuta(${i})">Cerrar</button>` : 'Finalizado'}</td></tr>`).reverse().join('')}
        </tbody></table>`;
}

function abrirRuta() {
    const user = document.getElementById('resp-name').value;
    if(!user) return alert("Firma primero.");
    if(db.rutas.find(r => r.r === user && !r.fin)) return alert(`BLOQUEO: ${user}, cierra tu unidad pendiente.`);
    const ops = db.flota.map(v => `<option value="${v.unidad}">${v.unidad}</option>`).join('');
    openModal("Nueva Salida", `<select id="r-u" style="width:100%; padding:10px; margin-bottom:10px;">${ops}</select>
        <input id="r-lab" placeholder="Labor" style="width:100%; padding:10px; margin-bottom:10px;">
        <input type="number" id="r-k" placeholder="KM Salida" style="width:100%; padding:10px; margin-bottom:10px;">
        <button onclick="confirmarRuta()" class="btn-main" style="width:100%; justify-content:center;">INICIAR</button>`);
}

async function confirmarRuta() {
    const u = document.getElementById('r-u').value;
    const data = { tipo: "RUTA", u, r: document.getElementById('resp-name').value, lab: document.getElementById('r-lab').value, kS: document.getElementById('r-k').value, f: new Date().toLocaleDateString(), fin: false };
    db.rutas.push(data); saveDB(); await enviarALaNube(data); closeModal(); nav('rutas');
}

function cerrarRuta(i) {
    const kf = prompt("Kilometraje Final:");
    if(kf) { db.rutas[i].fin = true; db.rutas[i].kF = kf; saveDB(); renderRutas(); }
}

function renderManto() {
    document.getElementById('viewport').innerHTML = `
        <div style="display:flex; justify-content:space-between;"><h3>Mantenimiento</h3><button onclick="modalManto()" class="btn-main">Nuevo</button></div>
        <table><thead><tr><th>Fecha</th><th>Unidad</th><th>Tipo</th><th>Detalle</th></tr></thead><tbody>
        ${db.manto.map(m => `<tr><td>${m.f}</td><td>${m.u}</td><td>${m.t}</td><td>${m.d}</td></tr>`).reverse().join('')}
        </tbody></table>`;
}

function modalManto() {
    const ops = db.flota.map(v => `<option>${v.unidad}</option>`).join('');
    openModal("Reporte Técnico", `
        <select id="m-u" style="width:100%; padding:10px; margin-bottom:10px;">${ops}</select>
        <select id="m-t" onchange="document.getElementById('m-extra').style.display=(this.value==='Cambio Aceite'?'block':'none')" style="width:100%; padding:10px; margin-bottom:10px;">
            <option>Mecánico</option><option>Eléctrico</option><option value="Cambio Aceite">Cambio Aceite</option>
        </select>
        <input type="number" id="m-km" placeholder="KM Actual" style="width:100%; padding:10px; margin-bottom:10px;">
        <div id="m-extra" style="display:none; background:#fef3c7; padding:10px; border-radius:8px; margin-bottom:10px;">
            <input type="number" id="m-km-fab" placeholder="KM Fabricante (Eje: 5000)" style="width:100%; padding:8px;">
        </div>
        <textarea id="m-d" placeholder="Descripción..." style="width:100%; padding:10px;"></textarea>
        <button onclick="guardarManto()" class="btn-main" style="width:100%; margin-top:10px; justify-content:center;">GUARDAR</button>`);
}

async function guardarManto() {
    const data = { tipo: "MANTO", f: new Date().toLocaleDateString(), u: document.getElementById('m-u').value, t: document.getElementById('m-t').value, km: document.getElementById('m-km').value, kmFab: document.getElementById('m-km-fab').value, d: document.getElementById('m-d').value };
    db.manto.push(data); saveDB(); await enviarALaNube(data); closeModal(); renderManto();
}

function descargarReportePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const user = document.getElementById('resp-name').value || "Bombero";
    doc.text("BOMBEROS SANTA ISABEL - REPORTE", 14, 20);
    doc.autoTable({ startY: 30, head: [['Fecha', 'Unidad', 'Labor', 'Estado']], body: db.rutas.filter(r => r.r === user).map(r => [r.f, r.u, r.lab, r.fin ? 'OK' : 'PENDIENTE']) });
    doc.save(`Reporte_${user}.pdf`);
}

function renderFlota() {
    document.getElementById('viewport').innerHTML = `<div style="display:flex; justify-content:space-between;"><h3>Unidades</h3><button onclick="modalV()" class="btn-main">Añadir</button></div><div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:15px; margin-top:15px;">${db.flota.map(v => `<div class="card"><b>${v.unidad}</b><br><small>${v.placa}</small></div>`).join('')}</div>`;
}
function modalV() { openModal("Nueva Unidad", `<input id="v-u" placeholder="Unidad"><input id="v-p" placeholder="Placa" style="margin-top:10px;"><button onclick="db.flota.push({unidad:document.getElementById('v-u').value, placa:document.getElementById('v-p').value}); saveDB(); nav('flota'); closeModal();" class="btn-main" style="width:100%; margin-top:10px;">GUARDAR</button>`); }
function renderEquipos() { document.getElementById('viewport').innerHTML = `<h3>Configurar Equipos</h3><div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:15px;">${db.flota.map(v => `<div class="card"><b>${v.unidad}</b><br><button onclick="modalConfigEq('${v.unidad}')" class="btn-main">Configurar</button></div>`).join('')}<div class="card"><b>BODEGA</b><br><button onclick="modalConfigEq('BODEGA CENTRAL')" class="btn-main">Configurar</button></div></div>`; }
function modalConfigEq(u) { const act = db.equipos[u] ? db.equipos[u].join(', ') : ''; openModal("Equipos en " + u, `<textarea id="e-lista" style="width:100%; height:80px; padding:10px;">${act}</textarea><button onclick="db.equipos['${u}']=document.getElementById('e-lista').value.split(',').map(i=>i.trim()); saveDB(); closeModal(); renderEquipos();" class="btn-main" style="width:100%; margin-top:10px;">GUARDAR</button>`); }
function openModal(t, b) { document.getElementById('modal-title').innerText=t; document.getElementById('modal-body').innerHTML=b; document.getElementById('modal').style.display='flex'; }
function closeModal() { document.getElementById('modal').style.display='none'; }
setInterval(() => { if(document.getElementById('live-clock')) document.getElementById('live-clock').innerText = new Date().toLocaleString(); }, 1000);
nav('inicio');