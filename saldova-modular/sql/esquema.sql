-- Finanzas (escritorio) — esquema base de la base de datos local.
-- La base vive FUERA de la carpeta del programa (carpeta de datos del
-- usuario): actualizar el programa nunca toca los datos.
--
-- Tablas del sistema de llaves offline (diseño del puente, mensajes
-- 2026-11-20-1953 y 1957, adoptado el 2026-11-20):

-- meta: datos de identidad de ESTA base. db_firma se genera al crear
-- la base (128 bits aleatorios, 32 hex), viaja con ella y no se edita
-- nunca desde el programa. ultima_fecha_vista es el anti-trampa de la
-- llave anual (si el reloj de la PC retrocede, se detecta).
CREATE TABLE IF NOT EXISTS meta (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
-- claves: 'db_firma' (32 hex), 'creado_en' (fecha ISO),
--         'ultima_fecha_vista' (fecha ISO)

-- lic_clientes: PCs cliente registradas en este servidor. La llave
-- dice cuántas activas puede haber (max_clientes); sustituir un
-- cliente = poner activo = 0 desde el panel y el hueco queda libre.
CREATE TABLE IF NOT EXISTS lic_clientes (
  firma TEXT PRIMARY KEY,          -- 64 hex, firma de instalación del cliente
  nombre TEXT,                     -- nombre que le pone el administrador
  registrado_en TEXT NOT NULL,     -- fecha ISO
  ultimo_uso TEXT,                 -- fecha ISO
  activo INTEGER NOT NULL DEFAULT 1
);

-- Las tablas de negocio (usuarios, negocios, documentos y los slots
-- del contrato de 31 acciones) se crean en el bloque del traslado del
-- contrato, espejo del modelo ya probado del programa anterior.
