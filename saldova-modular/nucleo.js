/* Saldova modular — NÚCLEO compartido por el index y por todos los
 * módulos. Aquí vive lo que NO se repite: el cliente de la base de
 * datos local (Worker + Comlink), el bus entre módulos
 * (BroadcastChannel), los sonidos, la persistencia del
 * almacenamiento, el acceso a archivos reales del equipo
 * (File System Access) y la compresión (Compression Streams).
 * Cada módulo importa solo lo que necesita. */
import * as Comlink from './libs/comlink.mjs';

/* ---------- Base de datos local (SQLite en un Worker) ---------- */
/* Solo la página DUEÑA (el index) crea el Worker: es la única dueña
 * de la base (candado Web Locks). Un módulo dentro de una ventana
 * (iframe) NO crea otro Worker: usa la base del index a través del
 * puente de Comlink entre marcos. Un módulo abierto suelto en su
 * propia pestaña sí crea su Worker (y si el index ya tiene la base,
 * verá el estado «ocupada», como debe ser). */
/* Puente entre marcos (index <-> módulos en ventanas): RPC propio
 * sobre postMessage, con respuesta SIEMPRE a la ventana que llamó
 * (event.source) y tiempo límite. Comlink se queda para el Worker,
 * donde es el canal correcto; entre ventanas su endpoint respondía
 * a la ventana equivocada y las llamadas nunca volvían (fallo
 * verificado en navegador real el 2026-11-22). */
let _rpcSeq = 0;
const _rpcPendientes = new Map();
let _rpcEscuchando = false;
function rpcMarco(metodo, args) {
    return new Promise((resolve, reject) => {
        const id = ++_rpcSeq;
        _rpcPendientes.set(id, { resolve, reject });
        if (!_rpcEscuchando) {
            _rpcEscuchando = true;
            window.addEventListener('message', (ev) => {
                const d = ev.data || {};
                if (ev.source !== window.parent || d.tipo !== 'saldova-rpc-res' || !_rpcPendientes.has(d.id)) return;
                const p = _rpcPendientes.get(d.id);
                _rpcPendientes.delete(d.id);
                if (d.ok) p.resolve(d.valor);
                else p.reject(new Error(d.error || 'Error en el index'));
            });
        }
        window.parent.postMessage(
            { tipo: 'saldova-rpc', id, metodo, args: args || [] },
            window.location.origin
        );
        setTimeout(() => {
            if (_rpcPendientes.has(id)) {
                _rpcPendientes.delete(id);
                reject(new Error('El index no respondió a tiempo'));
            }
        }, 12000);
    });
}

let _bd = null;
export function bd() {
    if (!_bd) {
        if (window.parent !== window) {
            _bd = {
                estado: () => rpcMarco('estado'),
                ping: () => rpcMarco('ping'),
                tablas: () => rpcMarco('tablas'),
                exportar: (token) => rpcMarco('exportar', [token]),
                importar: (token, bytes) => rpcMarco('importar', [token, bytes]),
                acceso: () => rpcMarco('acceso'),
                inicializar: (datos) => rpcMarco('inicializar', [datos]),
                entrar: (usuario, clave) => rpcMarco('entrar', [usuario, clave]),
                sesion: (token) => rpcMarco('sesion', [token]),
                salir: (token) => rpcMarco('salir', [token]),
                usuarios: (token) => rpcMarco('usuarios', [token]),
                usuarioCrear: (token, datos) => rpcMarco('usuarioCrear', [token, datos]),
                bases: () => rpcMarco('bases'),
                baseCrear: (datos) => rpcMarco('baseCrear', [datos]),
                baseElegir: (nombre) => rpcMarco('baseElegir', [nombre]),
                docLeer: (token, slot) => rpcMarco('docLeer', [token, slot]),
                docGuardar: (token, slot, valor) => rpcMarco('docGuardar', [token, slot, valor]),
                docGuardarMultiple: (token, docs) => rpcMarco('docGuardarMultiple', [token, docs]),
                trazas: (token, mes) => rpcMarco('trazas', [token, mes]),
                negocios: (token) => rpcMarco('negocios', [token]),
                negocioCrear: (token, nombre) => rpcMarco('negocioCrear', [token, nombre]),
            };
        } else {
            const w = new Worker(new URL('./db-worker.mjs', import.meta.url), { type: 'module' });
            _bd = Comlink.wrap(w);
        }
    }
    return _bd;
}

/* Lo llama SOLO el index: crea su Worker y atiende las llamadas de
 * los módulos de las ventanas (iframes), respondiendo a cada uno en
 * su propia ventana. */
export function exponerBase() {
    const duena = bd();
    const metodos = {
        estado: () => duena.estado(),
        ping: () => duena.ping(),
        tablas: () => duena.tablas(),
        exportar: (token) => duena.exportar(token),
        importar: (token, bytes) => duena.importar(token, bytes),
        acceso: () => duena.acceso(),
        inicializar: (datos) => duena.inicializar(datos),
        entrar: (usuario, clave) => duena.entrar(usuario, clave),
        sesion: (token) => duena.sesion(token),
        salir: (token) => duena.salir(token),
        usuarios: (token) => duena.usuarios(token),
        usuarioCrear: (token, datos) => duena.usuarioCrear(token, datos),
        bases: () => duena.bases(),
        baseCrear: (datos) => duena.baseCrear(datos),
        baseElegir: (nombre) => duena.baseElegir(nombre),
        docLeer: (token, slot) => duena.docLeer(token, slot),
        docGuardar: (token, slot, valor) => duena.docGuardar(token, slot, valor),
        docGuardarMultiple: (token, docs) => duena.docGuardarMultiple(token, docs),
        trazas: (token, mes) => duena.trazas(token, mes),
        negocios: (token) => duena.negocios(token),
        negocioCrear: (token, nombre) => duena.negocioCrear(token, nombre),
    };
    window.addEventListener('message', async (ev) => {
        const d = ev.data || {};
        if (ev.origin !== window.location.origin || d.tipo !== 'saldova-rpc') return;
        try {
            const fn = metodos[d.metodo];
            if (!fn) throw new Error('Método desconocido: ' + d.metodo);
            const valor = await fn(...(d.args || []));
            ev.source.postMessage({ tipo: 'saldova-rpc-res', id: d.id, ok: true, valor }, ev.origin);
        } catch (e) {
            ev.source.postMessage(
                { tipo: 'saldova-rpc-res', id: d.id, ok: false, error: String((e && e.message) || e) },
                ev.origin
            );
        }
    });
}

/* ---------- Bus entre módulos y pestañas ---------- */
export const bus = ('BroadcastChannel' in self)
    ? new BroadcastChannel('saldova-bus')
    : { postMessage() {}, addEventListener() {} };

/* ---------- Sonidos (sintetizados, sin archivos) ---------- */
let _ctx = null;
export const SND = {
    on: (() => { try { return localStorage.getItem('saldova_sonido') !== '0'; } catch (e) { return true; } })(),
    isOn() { return this.on; },
    setOn(v) { this.on = v; try { localStorage.setItem('saldova_sonido', v ? '1' : '0'); } catch (e) {} },
    ac() {
        if (!_ctx) { try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
        if (_ctx && _ctx.state === 'suspended') _ctx.resume();
        return _ctx;
    },
    nota(f, retardo, dur, tipo, vol) {
        if (!this.on) return;
        const c = this.ac(); if (!c) return;
        const t = c.currentTime + (retardo || 0);
        const o = c.createOscillator(), g = c.createGain();
        o.type = tipo || 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
    },
    ok() { this.nota(659, 0, 0.09); this.nota(880, 0.07, 0.13); },
    error() { this.nota(196, 0, 0.13, 'square', 0.06); this.nota(147, 0.1, 0.17, 'square', 0.06); },
    venta() { [523, 659, 784, 1047].forEach((f, i) => this.nota(f, i * 0.055, 0.11, 'triangle', 0.13)); },
    ventana() { this.nota(523, 0, 0.05, 'sine', 0.05); },
};

/* ---------- Almacenamiento persistente ---------- */
export async function persistencia() {
    if (!navigator.storage) return { soportada: false, persistente: false };
    const persistente = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    let estimacion = null;
    if (navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        estimacion = { uso: e.usage || 0, cuota: e.quota || 0 };
    }
    return { soportada: true, persistente, estimacion };
}
export async function pedirPersistencia() {
    if (navigator.storage && navigator.storage.persist) return navigator.storage.persist();
    return false;
}

/* ---------- Archivos reales del equipo (File System Access) ---------- */
export const hayArchivosReales = () => 'showSaveFilePicker' in window;

export async function guardarArchivoReal(bytes, nombreSugerido, descripcion, extension) {
    if (hayArchivosReales()) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: nombreSugerido,
                types: [{ description: descripcion || 'Archivo', accept: { 'application/octet-stream': [extension || '.db'] } }],
            });
            const w = await handle.createWritable();
            await w.write(bytes);
            await w.close();
            return 'archivo';
        } catch (e) {
            /* Si el usuario canceló, no hacer nada más; si el selector
             * existe pero falla (navegador sin cabeza, contexto no
             * permitido), caer a la descarga normal (F1). */
            if (e && e.name === 'AbortError') throw e;
        }
    }
    const url = URL.createObjectURL(new Blob([bytes]));
    const a = document.createElement('a');
    a.href = url; a.download = nombreSugerido; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'descarga';
}

export async function abrirArchivoReal(extension) {
    if ('showOpenFilePicker' in window) {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{ description: 'Base de datos Saldova', accept: { 'application/octet-stream': [extension || '.db'] } }],
            });
            const file = await handle.getFile();
            return new Uint8Array(await file.arrayBuffer());
        } catch (e) {
            /* Si el usuario canceló, no hacer nada más; si el selector
             * existe pero falla, caer al <input type=file> (F1). */
            if (e && e.name === 'AbortError') throw e;
        }
    }
    return new Promise((resolve, reject) => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = extension || '.db';
        inp.onchange = async () => {
            try { resolve(new Uint8Array(await inp.files[0].arrayBuffer())); }
            catch (e) { reject(e); }
        };
        inp.click();
    });
}

/* ---------- Compresión dentro del navegador ---------- */
export async function comprimir(bytes) {
    const flujo = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
}
export async function descomprimir(bytes) {
    const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
}

/* ---------- Sesión del usuario (el token vive en el navegador;
 * la sesión de verdad está en la tabla sesiones de la base) ------ */
export function guardarSesion(token) { try { localStorage.setItem('saldova_sesion', token); } catch (e) {} }
export function tokenSesion() { try { return localStorage.getItem('saldova_sesion'); } catch (e) { return null; } }
export function borrarSesion() { try { localStorage.removeItem('saldova_sesion'); } catch (e) {} }
export async function sesionActual() {
    const t = tokenSesion();
    if (!t) return null;
    try { return await bd().sesion(t); } catch (e) { return null; }
}


/* ---------- Fechas en hora LOCAL (M-3) ----------
 * Antes las fechas y los meses se construían con
 * new Date().toISOString() (UTC) y, en Cuba (UTC-5), de 19:00 a
 * 23:59 el día y el mes saltaban al día siguiente: asientos y
 * documentos fechados en el mes siguiente, avisos de mes cerrado
 * sobre el mes equivocado y facturas marcadas «Vencida» un día
 * antes. Todo lo que derive una FECHA o un MES para decidir,
 * filtrar o mostrar usa estos ayudantes. Los instantes puros
 * (p. ej. `actualizado` de un documento) siguen en UTC. */
export function fechaLocalDe(d) {
    const f = d instanceof Date ? d : new Date(d);
    return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
}
export function hoyLocal() { return fechaLocalDe(new Date()); }
export function mesLocalDe(d) {
    const f = d instanceof Date ? d : new Date(d);
    return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0');
}
export function mesLocal() { return mesLocalDe(new Date()); }
/* 'YYYY-MM-DD HH:MM' en hora local a partir de un instante ISO
 * (p. ej. el ts UTC de una traza), para mostrarlo en pantalla. */
export function fechaHoraLocal(ts) {
    const f = new Date(ts);
    if (isNaN(f)) return String(ts || '').slice(0, 16).replace('T', ' ');
    return fechaLocalDe(f) + ' ' + String(f.getHours()).padStart(2, '0') + ':' + String(f.getMinutes()).padStart(2, '0');
}

/* ---------- Cuentas automáticas por concepto (C-4) ----------
 * Un solo resolver compartido por todos los módulos: cada concepto
 * contable (ventas, nómina, depreciación...) tiene su cuenta en el
 * plan del dueño y su equivalente en el plan oficial Res. 494/2016.
 * El plan oficial se carga con el campo `auto` inyectado (lo hace
 * Contabilidad al cambiar de plan, con CTA_AUTO_OFICIAL); el plan
 * del dueño no trae `auto`, y ahí manda CTA_AUTO_DUENO. Si el
 * concepto no tiene cuenta en el plan activo, cuentaAuto devuelve
 * '' y el módulo debe avisar y NO guardar el asiento (ver
 * validarLineasAsiento). Los equivalentes oficiales son
 * aproximaciones cuando el clasificador no trae la cuenta fina:
 * el plan oficial no distingue CUP/divisa (todo es 109-000), no
 * trae cuenta propia de salarios ni de depreciación (todo cae en
 * 826-000 Gastos de Operación) y no separa los tipos de activo
 * fijo (todo es 240-000) ni su depreciación acumulada (375-000).
 * Eso queda documentado en la nota de C-4. */
export const CTA_AUTO_DUENO = {
    ventas: '801-000', ventas_servicios: '802-000', ingresos_financieros: '805-000',
    otros_ingresos: '810-000', gastos_financieros: '710-000', costo_ventas: '695-000',
    prod_proceso: '186-000', prod_terminada: '187-000', mercancias: '188-000',
    materias_primas: '181-000', combustible: '182-000', repuestos: '183-000', utiles: '184-000',
    caja: '101-010', banco_cup: '110-010', banco_divisa: '110-020', clientes: '131-000',
    gasto_salarios: '614-000', gasto_seguridad_social: '615-000', nomina_por_pagar: '331-000',
    ss_por_pagar: '333-000', fuerza_trabajo_por_pagar: '334-000',
    ingresos_personales_por_pagar: '345-000', retenciones_por_pagar: '332-000',
    gasto_depreciacion: '613-000',
    aft_edificios: '241-000', aft_transporte: '242-000', aft_maquinaria: '243-000',
    aft_computacion: '244-000', aft_muebles: '245-000',
    dep_acum_edificios: '251-000', dep_acum_transporte: '252-000', dep_acum_maquinaria: '253-000',
    perdida_baja: '720-000', faltante_inventario: '720-000', reservas: '505-000',
    prestamos_por_pagar: '410', dividendos_por_pagar: '417', capital: '501-000',
    onat_utilidades: '342-000', onat_ingresos_personales: '345-000',
    onat_fuerza_trabajo: '334-000', onat_seguridad_social: '333-000', onat_ventas: '341-000',
};
/* Cuenta oficial (Res. 494/2016) -> conceptos que resuelve. Es la
 * tabla que Contabilidad inyecta como campo `auto` al cargar el
 * plan oficial. */
export const CTA_AUTO_OFICIAL = {
    '900-000': 'ventas,ventas_servicios', '920-000': 'ingresos_financieros',
    '950-000': 'otros_ingresos', '835-000': 'gastos_financieros', '810-000': 'costo_ventas',
    '700-000': 'prod_proceso', '188-000': 'prod_terminada', '189-000': 'mercancias',
    '183-000': 'materias_primas', '184-000': 'combustible', '185-000': 'repuestos',
    '187-000': 'utiles', '101-000': 'caja', '109-000': 'banco_cup,banco_divisa',
    '135-000': 'clientes',
    '826-000': 'gasto_salarios,gasto_seguridad_social,gasto_depreciacion',
    '455-000': 'nomina_por_pagar', '440-008': 'ss_por_pagar,onat_seguridad_social',
    '440-007': 'fuerza_trabajo_por_pagar,onat_fuerza_trabajo',
    '440-005': 'ingresos_personales_por_pagar,onat_ingresos_personales',
    '460-000': 'retenciones_por_pagar',
    '240-000': 'aft_edificios,aft_transporte,aft_maquinaria,aft_computacion,aft_muebles',
    '375-000': 'dep_acum_edificios,dep_acum_transporte,dep_acum_maquinaria',
    '845-000': 'perdida_baja', '850-000': 'faltante_inventario', '646-000': 'reservas',
    '520-000': 'prestamos_por_pagar', '417-000': 'dividendos_por_pagar',
    '601-000': 'capital', '440-004': 'onat_utilidades', '440-001': 'onat_ventas',
};
export function existeCuenta(plan, cod) {
    return !!cod && (plan || []).some((c) => c.codigo === cod);
}
/* La cuenta del concepto en el plan activo. Primero el campo `auto`
 * del plan (plan oficial), luego la cuenta del plan del dueño si
 * existe en el plan activo, luego el defecto si existe. '' si no hay
 * cuenta: el módulo debe avisar y no guardar. */
export function cuentaAuto(plan, concepto, defecto) {
    const lista = plan || [];
    for (const c of lista) {
        if (c.auto && String(c.auto).split(',').map((x) => x.trim()).includes(concepto)) return c.codigo;
    }
    const def = CTA_AUTO_DUENO[concepto];
    if (def && lista.some((c) => c.codigo === def)) return def;
    return (defecto && lista.some((c) => c.codigo === defecto)) ? defecto : '';
}
/* Valida que todas las líneas de un asiento existan en el plan de
 * cuentas activo. Devuelve '' si está bien, o el mensaje de error
 * (en español) si alguna línea no tiene cuenta o la cuenta no
 * existe: el módulo debe mostrarlo y NO guardar el asiento. */
export function validarLineasAsiento(plan, lineas) {
    for (const l of lineas || []) {
        if (!l.cuenta) return 'Falta elegir la cuenta en una línea del asiento.';
        if (!existeCuenta(plan, l.cuenta)) return 'La cuenta ' + l.cuenta + ' no existe en el plan de cuentas activo (' + ((plan && plan.length) ? 'revisa el plan o el asiento' : 'sin plan cargado') + '): el asiento no se guardó.';
    }
    return '';
}

/* ---------- Avisos en pantalla ---------- */
/* Descarga una tabla como CSV que Excel abre directo (separador ; y
 * BOM para que las tildes y la ñ se vean bien en Excel en español). */
export function descargarCSV(nombre, filas) {
    const esc = (v) => { const t = String(v == null ? '' : v); return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const texto = '\ufeff' + (filas || []).map((f) => f.map(esc).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}
/* ---------- Escape de HTML (M-2) ----------
 * Un solo esc() compartido por todos los módulos: el texto que escribe
 * el usuario (conceptos, nombres, clientes...) nunca se inserta en
 * innerHTML sin pasar por aquí, ni en contenido ni en atributos. */
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function aviso(texto, tipo) {
    let caja = document.getElementById('saldova-avisos');
    if (!caja) {
        caja = document.createElement('div');
        caja.id = 'saldova-avisos';
        caja.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:99999;display:flex;flex-direction:column;gap:8px';
        document.body.appendChild(caja);
    }
    const t = document.createElement('div');
    t.textContent = texto;
    t.style.cssText = 'background:' + (tipo === 'error' ? '#B23218' : '#1A3E5E') +
        ';color:#fff;padding:10px 14px;border-radius:8px;box-shadow:0 4px 14px rgba(10,30,50,.4);font:500 14px "Segoe UI",Tahoma,Arial,sans-serif;max-width:340px';
    caja.appendChild(t);
    setTimeout(() => t.remove(), 4200);
    if (tipo === 'error') SND.error(); else SND.ok();
}

/* F8: guardar varios slots en UNA transacción; si el servidor lo
 * rechaza (p. ej. consultor), avisa y no sigue como si se hubiera
 * guardado: antes, el aviso de éxito salía igual. */
export async function guardarMultiple(slots) {
    try { await bd().docGuardarMultiple(tokenSesion(), slots); }
    catch (e) { aviso('No se pudo guardar: ' + String((e && e.message) || e), 'error'); throw e; }
}

/* Mensaje del resultado de importar una base (lo usan el Panel y la
 * puerta): la migración del escritorio y el respaldo quedan a la vista. */
export function mensajeImport(r) {
    if (!r) return 'Archivo abierto: ya trabajas con esa base';
    const base = r.migrado
        ? 'Base del escritorio migrada: ' + (r.usuarios || 0) + ' usuario(s) y ' + (r.documentos || 0) + ' documento(s)' +
            ((r.omitidos || 0) ? ' (' + r.omitidos + ' usuario(s) deshabilitado(s) no se migraron)' : '')
        : 'Archivo abierto: ya trabajas con esa base';
    return base + (r.respaldo ? '. Respaldo de la base anterior: ' + String(r.respaldo).replace(/^\//, '') : '');
}

/* ===== Puente de pestañas con la barra del módulo (index) =====
 * Cada módulo tiene su barra .pest-bar interna; este puente la
 * publica al index (que la pinta arriba, junto al título del módulo)
 * y la oculta dentro del módulo. Al pulsar una pestaña arriba, el
 * index avisa y aquí se hace clic en el botón interno de verdad. */
try {
    if (window.parent !== window) {
        let ultimaClave = '';
        const publicarPestanas = () => {
            const bar = document.querySelector('.pest-bar');
            if (!bar) return;
            const btns = [...bar.querySelectorAll('button')];
            if (!btns.length) return;
            const idDe = (b, i) => b.dataset.pest || b.dataset.sec || String(i);
            const pestanas = btns.map((b, i) => ({ id: idDe(b, i), texto: b.textContent.trim() }));
            const act = bar.querySelector('button.activa');
            const activa = act ? idDe(act, btns.indexOf(act)) : pestanas[0].id;
            const clave = JSON.stringify([pestanas, activa]);
            if (clave === ultimaClave) return;
            ultimaClave = clave;
            window.parent.postMessage({ tipo: 'saldova-pestanas', pestanas, activa }, '*');
            bar.style.display = 'none';
        };
        const obsPest = new MutationObserver(() => publicarPestanas());
        obsPest.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        window.addEventListener('message', (e) => {
            const d = e.data || {};
            if (d.tipo !== 'saldova-ir-pestana') return;
            const bar = document.querySelector('.pest-bar');
            if (!bar) return;
            const btns = [...bar.querySelectorAll('button')];
            const b = btns.find((x, i) => (x.dataset.pest || x.dataset.sec || String(i)) === String(d.id));
            if (b) b.click();
        });
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', publicarPestanas);
        else publicarPestanas();
    }
} catch (e) { /* el puente es un extra: el módulo funciona igual */ }
