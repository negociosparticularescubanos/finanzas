/* Saldova modular — el Worker dueño de la base de datos local.
 * SQLite oficial compilado a WASM (@sqlite.org/sqlite-wasm) sobre
 * OPFS con el VFS «sahpool»: datos persistentes sin necesidad de
 * cabeceras especiales del servidor. Un candado Web Locks garantiza
 * que SOLO una pestaña sea la dueña de la base; las demás lo saben
 * (estado «ocupada») en vez de corromper o fallar en silencio.
 * La interfaz se expone con Comlink: la página lo usa como si
 * fueran funciones normales. */
import * as Comlink from './libs/comlink.mjs';
import sqlite3InitModule from './libs/sqlite3/index.mjs';

const NOMBRE_BD = '/saldova.db';
let db = null;
let poolUtil = null;
let estado = 'arrancando';
let detalle = '';
let listoResolve;
const listo = new Promise((r) => (listoResolve = r));

async function aplicarEsquema() {
    for (const ruta of ['sql/esquema.sql', 'sql/esquema-datos.sql']) {
        const resp = await fetch(ruta);
        if (resp.ok) db.exec(await resp.text());
    }
}

async function abrir() {
    // El .wasm viaja como texto base64 (el repo solo admite texto al
    // publicar) y se decodifica aquí antes de arrancar el motor.
    const b64 = await (await fetch('libs/sqlite3/sqlite3.wasm.b64')).text();
    const bin = atob(b64.trim());
    const wasmBinary = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) wasmBinary[i] = bin.charCodeAt(i);
    const sqlite3 = await sqlite3InitModule({ wasmBinary });
    poolUtil = await sqlite3.installOpfsSAHPoolVfs();
    db = new poolUtil.OpfsSAHPoolDb(NOMBRE_BD);
    try { db.exec('PRAGMA synchronous = NORMAL;'); } catch (e) { /* el VFS manda */ }
    await aplicarEsquema();
    estado = 'conectada';
    listoResolve();
}

if (self.navigator && navigator.locks) {
    navigator.locks.request('saldova-db', { mode: 'exclusive' }, async () => {
        try { await abrir(); }
        catch (e) { estado = 'error'; detalle = String((e && e.message) || e); listoResolve(); }
        await new Promise(() => {}); // el candado se mantiene mientras viva la pestaña
    });
    setTimeout(() => {
        if (estado === 'arrancando') { estado = 'ocupada'; detalle = 'Otra pestaña de Saldova tiene la base abierta'; listoResolve(); }
    }, 2500);
} else {
    abrir().catch((e) => { estado = 'error'; detalle = String((e && e.message) || e); listoResolve(); });
}

const api = {
    async estado() { await listo; return { estado, detalle }; },
    async ping() {
        await listo;
        if (estado !== 'conectada') return { ok: false, estado };
        db.exec('SELECT 1');
        return { ok: true };
    },
    async tablas() {
        await listo;
        if (estado !== 'conectada') return { tablas: [], conteos: {} };
        const tablas = [];
        db.exec({
            sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            rowMode: 'object',
            callback: (r) => tablas.push(r.name),
        });
        const conteos = {};
        for (const t of tablas) {
            try {
                db.exec({ sql: 'SELECT COUNT(*) AS n FROM "' + t + '"', rowMode: 'object', callback: (r) => (conteos[t] = r.n) });
            } catch (e) { conteos[t] = null; }
        }
        return { tablas, conteos };
    },
    async consulta(sql, params) {
        await listo;
        const filas = [];
        db.exec({ sql, bind: params || [], rowMode: 'object', callback: (r) => filas.push(r) });
        return filas;
    },
    async ejecutar(sql) { await listo; db.exec(sql); return { ok: true }; },
    async exportar() { await listo; return poolUtil.exportFile(NOMBRE_BD); },
    async importar(bytes) {
        await listo;
        db.close();
        await poolUtil.importFile(NOMBRE_BD, bytes);
        db = new poolUtil.OpfsSAHPoolDb(NOMBRE_BD);
        await aplicarEsquema();
        return { ok: true };
    },
};

Comlink.expose(api);
