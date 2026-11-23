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
                consulta: (sql, params) => rpcMarco('consulta', [sql, params]),
                ejecutar: (sql) => rpcMarco('ejecutar', [sql]),
                exportar: () => rpcMarco('exportar'),
                importar: (bytes) => rpcMarco('importar', [bytes]),
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
        consulta: (sql, params) => duena.consulta(sql, params),
        ejecutar: (sql) => duena.ejecutar(sql),
        exportar: () => duena.exportar(),
        importar: (bytes) => duena.importar(bytes),
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
        const handle = await window.showSaveFilePicker({
            suggestedName: nombreSugerido,
            types: [{ description: descripcion || 'Archivo', accept: { 'application/octet-stream': [extension || '.db'] } }],
        });
        const w = await handle.createWritable();
        await w.write(bytes);
        await w.close();
        return 'archivo';
    }
    const url = URL.createObjectURL(new Blob([bytes]));
    const a = document.createElement('a');
    a.href = url; a.download = nombreSugerido; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'descarga';
}

export async function abrirArchivoReal(extension) {
    if ('showOpenFilePicker' in window) {
        const [handle] = await window.showOpenFilePicker({
            types: [{ description: 'Base de datos Saldova', accept: { 'application/octet-stream': [extension || '.db'] } }],
        });
        const file = await handle.getFile();
        return new Uint8Array(await file.arrayBuffer());
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
export function aviso(texto, tipo) {
    let caja = document.getElementById('saldova-avisos');
    if (!caja) {
        caja = document.createElement('div');
        caja.id = 'saldova-avisos';
        caja.style.cssText = 'position:fixed;top:14px;right:14px;z-index:99999;display:flex;flex-direction:column;gap:8px';
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
