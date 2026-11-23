/* Saldova modular — Service Worker (PWA): todo el proyecto queda
 * guardado en el equipo y abre sin internet. Subir la versión del
 * caché al publicar cambios. */
const CACHE = 'saldova-modular-v33';
const ARCHIVOS = [
    './', 'index.html', 'nucleo.js', 'componentes.js', 'fondos.js', 'db-worker.mjs',
    'libs/winbox.bundle.min.js', 'libs/comlink.mjs', 'libs/comlink.js',
    'libs/sqlite3/index.mjs', 'libs/sqlite3/sqlite3-opfs-async-proxy.js', 'libs/sqlite3/sqlite3.wasm.b64',
    'modulos/panel.html', 'modulos/chequera.html', 'modulos/contabilidad.html', 'modulos/fiscal.html', 'modulos/nomina.html', 'modulos/aft.html', 'modulos/gestion.html', 'modulos/pos.html', 'modulos/cierre.html', 'modulos/gestor.html', 'modulos/informes.html', 'modulos/inventarios.html', 'modulos/tasas.html', 'modulos/ayuda.html', 'modulos/produccion.html', 'plan-dueno.js', 'plan-oficial.js', 'sql/esquema.sql', 'sql/esquema-datos.sql',
    'manifest.webmanifest', 'icono.svg', 'iconos/panel.svg', 'iconos/chequera.svg', 'iconos/conta.svg', 'iconos/fiscal.svg', 'iconos/nomina.svg', 'iconos/aft.svg', 'iconos/gestion.svg', 'iconos/pos.svg', 'iconos/cierre.svg', 'iconos/gestor.svg', 'iconos/informes.svg', 'iconos/inventarios.svg', 'iconos/produccion.svg', 'iconos/tasas.svg', 'iconos/ayuda.svg',
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request))
    );
});
