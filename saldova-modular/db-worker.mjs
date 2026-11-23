/* Saldova modular — el Worker dueño de las bases de datos locales.
 *
 * Modelo (el mismo de la Saldova de escritorio 2.8.0, adaptado a
 * OPFS): cada base es UN archivo dentro del navegador; un registro
 * (otro archivo) guarda la lista de bases, cuál es la predeterminada
 * y la huella del PIN de creador. Los usuarios viven DENTRO de cada
 * base: cada base tiene los suyos.
 *
 * SQLite oficial en WASM sobre OPFS (VFS sahpool, sin cabeceras
 * especiales). Un candado Web Locks garantiza UNA sola pestaña dueña.
 * Las contraseñas y el PIN se guardan como huella PBKDF2 con sal
 * (WebCrypto), nunca en claro. La interfaz se expone con Comlink. */
import * as Comlink from './libs/comlink.mjs';
import sqlite3InitModule from './libs/sqlite3/index.mjs';

const ARCHIVO_PRINCIPAL = '/saldova.db';
const ARCHIVO_REGISTRO = '/registro.db';
let poolUtil = null;
let reg = null;          // el registro de bases
let db = null;           // la base activa
let activaNombre = '';
let activaArchivo = '';
let estado = 'arrancando';
let detalle = '';
let listoResolve;
const listo = new Promise((r) => (listoResolve = r));
const intentos = new Map(); // usuario -> { fallos, hasta } (límite de intentos de entrada)

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const desdeB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashSecreto(secreto) {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: sal, iterations: 150000, hash: 'SHA-256' }, base, 256);
    return 'pbkdf2$150000$' + b64(sal) + '$' + b64(new Uint8Array(bits));
}
async function verificaSecreto(secreto, guardado) {
    const p = String(guardado || '').split('$');
    if (p.length !== 4 || p[0] !== 'pbkdf2') return false;
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: desdeB64(p[2]), iterations: parseInt(p[1], 10) || 150000, hash: 'SHA-256' }, base, 256);
    return b64(new Uint8Array(bits)) === p[3];
}
const tokenNuevo = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
const slug = (nombre) => (String(nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'base');

function filas(dbX, sql, bind) {
    const out = [];
    dbX.exec({ sql, bind: bind || [], rowMode: 'object', callback: (r) => out.push(r) });
    return out;
}
const regGet = (clave) => { const f = filas(reg, 'SELECT valor FROM reg WHERE clave = ?', [clave]); return f.length ? f[0].valor : null; };
const regSet = (clave, valor) => reg.exec({ sql: 'INSERT INTO reg (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', bind: [clave, valor] });
const listaBases = () => filas(reg, 'SELECT nombre, archivo FROM bases ORDER BY nombre');

function espejarEnActiva() {
    // Como en el escritorio: cada base lleva dentro el registro de la
    // familia (saldova_bases) y su propio nombre (meta_saldova).
    try {
        db.exec('DELETE FROM saldova_bases');
        for (const b of listaBases()) db.exec({ sql: 'INSERT INTO saldova_bases (nombre, ruta) VALUES (?, ?)', bind: [b.nombre, b.archivo] });
        db.exec({ sql: "INSERT INTO meta_saldova (clave, valor) VALUES ('nombre_base', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor", bind: [activaNombre] });
    } catch (e) { /* el esquema manda; si falta la tabla, no es fatal */ }
}

async function aplicarEsquema(dbX) {
    for (const ruta of ['sql/esquema.sql', 'sql/esquema-datos.sql']) {
        const resp = await fetch(ruta);
        if (resp.ok) dbX.exec(await resp.text());
    }
}

async function abrirActiva(nombre, archivo) {
    if (db) { try { db.close(); } catch (e) {} db = null; }
    db = new poolUtil.OpfsSAHPoolDb(archivo);
    try { db.exec('PRAGMA synchronous = NORMAL;'); } catch (e) {}
    await aplicarEsquema(db);
    activaNombre = nombre;
    activaArchivo = archivo;
    espejarEnActiva();
}

async function abrir() {
    // El motor viaja en base64 (el repo solo admite texto al publicar).
    const b64txt = await (await fetch('libs/sqlite3/sqlite3.wasm.b64')).text();
    const bin = atob(b64txt.trim());
    const wasmBinary = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) wasmBinary[i] = bin.charCodeAt(i);
    const sqlite3 = await sqlite3InitModule({ wasmBinary });
    poolUtil = await sqlite3.installOpfsSAHPoolVfs();

    reg = new poolUtil.OpfsSAHPoolDb(ARCHIVO_REGISTRO);
    reg.exec('CREATE TABLE IF NOT EXISTS bases (nombre TEXT PRIMARY KEY, archivo TEXT NOT NULL, creada INTEGER NOT NULL DEFAULT 0);' +
             'CREATE TABLE IF NOT EXISTS reg (clave TEXT PRIMARY KEY, valor TEXT);');
    if (!listaBases().length) {
        reg.exec({ sql: 'INSERT INTO bases (nombre, archivo, creada) VALUES (?, ?, ?)', bind: ['Principal', ARCHIVO_PRINCIPAL, Date.now()] });
        regSet('predeterminada', 'Principal');
    }
    const pred = regGet('predeterminada') || 'Principal';
    const fila = listaBases().find((b) => b.nombre === pred) || listaBases()[0];
    await abrirActiva(fila.nombre, fila.archivo);
    estado = 'conectada';
    listoResolve();
}

if (self.navigator && navigator.locks) {
    navigator.locks.request('saldova-db', { mode: 'exclusive' }, async () => {
        try { await abrir(); }
        catch (e) { estado = 'error'; detalle = String((e && e.message) || e); listoResolve(); }
        await new Promise(() => {}); // el candado vive lo que vive la pestaña
    });
    setTimeout(() => {
        if (estado === 'arrancando') { estado = 'ocupada'; detalle = 'Otra pestaña de Saldova tiene la base abierta'; listoResolve(); }
    }, 2500);
} else {
    abrir().catch((e) => { estado = 'error'; detalle = String((e && e.message) || e); listoResolve(); });
}

const usuariosDeActiva = () => filas(db, 'SELECT username, role, negocio, entity_type, socios, must_change FROM usuarios ORDER BY username');
function sesionValida(token) {
    if (!token) return null;
    const f = filas(db, 'SELECT username FROM sesiones WHERE token = ? AND expira > ?', [token, Math.floor(Date.now() / 1000)]);
    if (!f.length) return null;
    const u = filas(db, 'SELECT username, role, negocio FROM usuarios WHERE username = ?', [f[0].username]);
    return u.length ? u[0] : null;
}
const esAdmin = (token) => { const s = sesionValida(token); return s && s.role === 'admin' ? s : null; };
/* Los negocios de la base viven en config ('negocios', JSON): los crea
 * el administrador general tras entrar; los usuarios cuelgan de uno. */
function listaNegocios() {
    const f = filas(db, "SELECT valor FROM config WHERE clave = 'negocios'");
    let lista = [];
    if (f.length) { try { lista = JSON.parse(f[0].valor); } catch (e) { lista = []; } }
    if (!Array.isArray(lista) || !lista.length) {
        lista = [...new Set(usuariosDeActiva().map((u) => u.negocio).filter(Boolean))];
    }
    return lista;
}
function guardarNegocios(lista) {
    db.exec({ sql: "INSERT INTO config (clave, valor) VALUES ('negocios', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor", bind: [JSON.stringify(lista)] });
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
        const tablas = filas(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name);
        const conteos = {};
        for (const t of tablas) {
            try { conteos[t] = filas(db, 'SELECT COUNT(*) AS n FROM "' + t + '"')[0].n; } catch (e) { conteos[t] = null; }
        }
        return { tablas, conteos };
    },
    async consulta(sql, params) { await listo; return filas(db, sql, params); },
    async ejecutar(sql) { await listo; db.exec(sql); return { ok: true }; },
    /* Documentos por (negocio, slot): el contrato de datos de Saldova.
       El negocio sale de la sesión, nunca del cliente. Al guardar se
       deja la foto anterior en documentos_respaldo, como el escritorio. */
    async docLeer(token, slot) {
        await listo;
        const s = sesionValida(token);
        if (!s) throw new Error('Sesión expirada');
        const f = filas(db, 'SELECT json FROM documentos WHERE negocio = ? AND slot = ?', [s.negocio, String(slot)]);
        return f.length ? JSON.parse(f[0].json) : null;
    },
    async docGuardar(token, slot, valor) {
        await listo;
        const s = sesionValida(token);
        if (!s) throw new Error('Sesión expirada');
        const txt = JSON.stringify(valor == null ? null : valor);
        if (txt.length > 3000000) throw new Error('Documento demasiado grande');
        const ahora = new Date().toISOString();
        const f = filas(db, 'SELECT json, version FROM documentos WHERE negocio = ? AND slot = ?', [s.negocio, String(slot)]);
        db.exec('BEGIN');
        try {
            if (f.length) {
                db.exec({ sql: 'INSERT OR REPLACE INTO documentos_respaldo (negocio, slot, json, version, actualizado) VALUES (?, ?, ?, ?, ?)', bind: [s.negocio, String(slot), f[0].json, f[0].version, ahora] });
                db.exec({ sql: 'UPDATE documentos SET json = ?, version = version + 1, actualizado = ? WHERE negocio = ? AND slot = ?', bind: [txt, ahora, s.negocio, String(slot)] });
            } else {
                db.exec({ sql: 'INSERT INTO documentos (negocio, slot, json, version, actualizado) VALUES (?, ?, ?, 1, ?)', bind: [s.negocio, String(slot), txt, ahora] });
            }
            db.exec('COMMIT');
        } catch (e) { try { db.exec('ROLLBACK'); } catch (_) { /* nada */ } throw e; }
        return { ok: true };
    },
    async exportar() { await listo; return poolUtil.exportFile(activaArchivo); },
    async importar(bytes) {
        await listo;
        db.close();
        await poolUtil.importFile(activaArchivo, bytes);
        await abrirActiva(activaNombre, activaArchivo);
        return { ok: true };
    },

    /* ---------- Acceso, usuarios y bases con nombre ---------- */
    async acceso() {
        await listo;
        if (estado !== 'conectada') return { estado };
        return {
            estado,
            hayUsuarios: usuariosDeActiva().length > 0,
            bases: listaBases().map((b) => b.nombre),
            activa: activaNombre,
            hayPin: !!regGet('pin_hash'),
        };
    },
    async inicializar(datos) {
        await listo;
        if (usuariosDeActiva().length) throw new Error('Esta base ya tiene usuarios');
        if (regGet('pin_hash')) throw new Error('El PIN de creador ya está fijado');
        const nombreBase = String(datos.base || 'Principal').trim() || 'Principal';
        const usuario = String(datos.usuario || '').trim();
        const clave = String(datos.clave || '');
        const pin = String(datos.pin || '');
        if (!usuario || clave.length < 6) throw new Error('El usuario es obligatorio y la contraseña debe tener al menos 6 caracteres');
        if (pin.length < 4 || pin.length > 12) throw new Error('El PIN de creador debe tener entre 4 y 12 caracteres');
        if (nombreBase !== activaNombre) {
            if (listaBases().some((b) => b.nombre === nombreBase)) throw new Error('Ya hay una base con ese nombre');
            reg.exec({ sql: 'UPDATE bases SET nombre = ? WHERE nombre = ?', bind: [nombreBase, activaNombre] });
            regSet('predeterminada', nombreBase);
            activaNombre = nombreBase;
            espejarEnActiva();
        }
        regSet('pin_hash', await hashSecreto(pin));
        db.exec({
            sql: 'INSERT INTO usuarios (username, hash, role, entity_type, socios, negocio) VALUES (?, ?, ?, ?, ?, ?)',
            bind: [usuario, await hashSecreto(clave), 'admin', 'tcp', 0, nombreBase],
        });
        guardarNegocios([nombreBase]);
        return { ok: true, base: activaNombre };
    },
    async entrar(usuario, clave) {
        await listo;
        usuario = String(usuario || '').trim();
        const reg2 = intentos.get(usuario) || { fallos: 0, hasta: 0 };
        if (reg2.hasta > Date.now()) throw new Error('Demasiados intentos: espera un minuto');
        const f = filas(db, 'SELECT username, hash, role, negocio, must_change FROM usuarios WHERE username = ?', [usuario]);
        const bien = f.length && (await verificaSecreto(String(clave || ''), f[0].hash));
        if (!bien) {
            reg2.fallos++;
            if (reg2.fallos >= 5) { reg2.hasta = Date.now() + 60000; reg2.fallos = 0; }
            intentos.set(usuario, reg2);
            throw new Error('Credenciales inválidas');
        }
        intentos.delete(usuario);
        const token = tokenNuevo();
        const ahora = Math.floor(Date.now() / 1000);
        db.exec({ sql: 'INSERT INTO sesiones (token, username, creado, expira) VALUES (?, ?, ?, ?)', bind: [token, f[0].username, ahora, ahora + 30 * 24 * 3600] });
        return { token, username: f[0].username, role: f[0].role, negocio: f[0].negocio, must_change: !!f[0].must_change, base: activaNombre };
    },
    async sesion(token) { await listo; return sesionValida(token); },
    async salir(token) {
        await listo;
        if (token) db.exec({ sql: 'DELETE FROM sesiones WHERE token = ?', bind: [token] });
        return { ok: true };
    },
    async usuarios(token) {
        await listo;
        if (!esAdmin(token)) throw new Error('Solo el administrador');
        return usuariosDeActiva();
    },
    async usuarioCrear(token, datos) {
        await listo;
        if (!esAdmin(token)) throw new Error('Solo el administrador');
        const username = String(datos.username || '').trim();
        const clave = String(datos.clave || '');
        const role = ['editor', 'consultor'].includes(datos.role) ? datos.role : null;
        const negocio = String(datos.negocio || '').trim();
        if (!username || clave.length < 6) throw new Error('Usuario obligatorio y contraseña de al menos 6 caracteres');
        if (!role) throw new Error('El administrador de la base se crea solo al configurarla; aquí van editor o consultor');
        if (!negocio) throw new Error('Falta el negocio del usuario');
        if (filas(db, 'SELECT 1 FROM usuarios WHERE username = ?', [username]).length) throw new Error('Ese nombre de usuario ya existe');
        const mismo = filas(db, 'SELECT COUNT(*) AS n FROM usuarios WHERE negocio = ? AND role = ?', [negocio, role])[0].n;
        if (mismo >= 1) throw new Error('Ese negocio ya tiene su ' + role + ' (límite: 1 por negocio)');
        db.exec({
            sql: 'INSERT INTO usuarios (username, hash, role, entity_type, socios, negocio) VALUES (?, ?, ?, ?, ?, ?)',
            bind: [username, await hashSecreto(clave), role, datos.entity_type || 'tcp', datos.socios || 0, negocio],
        });
        return { ok: true };
    },
    async negocios(token) {
        await listo;
        if (!sesionValida(token)) throw new Error('Sesión expirada');
        return listaNegocios();
    },
    async negocioCrear(token, nombre) {
        await listo;
        if (!esAdmin(token)) throw new Error('Solo el administrador');
        nombre = String(nombre || '').trim();
        if (!nombre) throw new Error('El negocio necesita un nombre');
        const lista = listaNegocios();
        if (lista.some((n) => n.toLowerCase() === nombre.toLowerCase())) throw new Error('Ese negocio ya existe en esta base');
        lista.push(nombre);
        guardarNegocios(lista);
        return lista;
    },
    async bases() {
        await listo;
        return { lista: listaBases().map((b) => ({ nombre: b.nombre, activa: b.nombre === activaNombre })), activa: activaNombre, hayPin: !!regGet('pin_hash') };
    },
    async baseCrear(datos) {
        await listo;
        const nombre = String(datos.nombre || '').trim();
        const usuario = String(datos.usuario || '').trim();
        const clave = String(datos.clave || '');
        if (!nombre) throw new Error('La base necesita un nombre');
        if (listaBases().some((b) => b.nombre === nombre)) throw new Error('Ya hay una base con ese nombre');
        if (!usuario || clave.length < 6) throw new Error('El administrador es obligatorio y su contraseña debe tener al menos 6 caracteres');
        const pinHash = regGet('pin_hash');
        if (!pinHash) throw new Error('Primero configura la base inicial (ahí se fija el PIN de creador)');
        if (!(await verificaSecreto(String(datos.pin || ''), pinHash))) throw new Error('PIN de creador incorrecto');
        const archivo = '/base-' + slug(nombre) + '.db';
        const nueva = new poolUtil.OpfsSAHPoolDb(archivo);
        try { nueva.exec('PRAGMA synchronous = NORMAL;'); } catch (e) {}
        await aplicarEsquema(nueva);
        nueva.exec({
            sql: 'INSERT INTO usuarios (username, hash, role, entity_type, socios, negocio) VALUES (?, ?, ?, ?, ?, ?)',
            bind: [usuario, await hashSecreto(clave), 'admin', 'tcp', 0, nombre],
        });
        nueva.exec({ sql: "INSERT INTO config (clave, valor) VALUES ('negocios', ?)", bind: [JSON.stringify([nombre])] });
        nueva.close();
        reg.exec({ sql: 'INSERT INTO bases (nombre, archivo, creada) VALUES (?, ?, ?)', bind: [nombre, archivo, Date.now()] });
        regSet('predeterminada', nombre);
        await abrirActiva(nombre, archivo);
        return { ok: true, nombre };
    },
    async baseElegir(nombre) {
        await listo;
        const fila = listaBases().find((b) => b.nombre === nombre);
        if (!fila) throw new Error('Esa base no está en el registro');
        regSet('predeterminada', nombre);
        await abrirActiva(fila.nombre, fila.archivo);
        return { ok: true, nombre };
    },
};

Comlink.expose(api);
