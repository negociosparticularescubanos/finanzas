-- Finanzas (escritorio) — tablas de datos.
-- Modelo espejo del probado en el programa anterior (internal/store):
-- usuarios y sesiones propios, documentos por (negocio, slot) con
-- versión, respaldo de documentos, bloqueos de mes, config y trazas.

CREATE TABLE IF NOT EXISTS usuarios (
  username    TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  role        TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'tcp',
  socios      INTEGER NOT NULL DEFAULT 0,
  negocio     TEXT NOT NULL,
  theme       TEXT NOT NULL DEFAULT '',
  must_change INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sesiones (
  token    TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES usuarios(username),
  creado   INTEGER NOT NULL,
  expira   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones(expira);
CREATE TABLE IF NOT EXISTS recuperacion (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  instalacion     TEXT NOT NULL,
  verificador     TEXT NOT NULL DEFAULT '',
  generado        TEXT NOT NULL DEFAULT '',
  solicitud       TEXT NOT NULL DEFAULT '',
  solicitud_expira INTEGER NOT NULL DEFAULT 0,
  intentos        INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bloqueos (
  mes       TEXT PRIMARY KEY,
  bloqueado INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS documentos (
  negocio     TEXT NOT NULL,
  slot        TEXT NOT NULL,
  json        TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 0,
  actualizado TEXT NOT NULL,
  PRIMARY KEY (negocio, slot)
);
CREATE TABLE IF NOT EXISTS documentos_respaldo (
  negocio     TEXT NOT NULL,
  slot        TEXT NOT NULL,
  json        TEXT NOT NULL,
  version     INTEGER NOT NULL,
  actualizado TEXT NOT NULL,
  PRIMARY KEY (negocio, slot)
);
CREATE TABLE IF NOT EXISTS trazas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL,
  usuario      TEXT NOT NULL,
  accion       TEXT NOT NULL,
  negocio      TEXT,
  slot         TEXT,
  detalle      TEXT,
  hash_antes   TEXT,
  hash_despues TEXT,
  ip           TEXT
);
CREATE INDEX IF NOT EXISTS idx_trazas_ts ON trazas(ts);

-- Saldova: todo vive DENTRO del archivo de la base — su nombre, la
-- huella del PIN de creador y el registro de bases conocidas.
CREATE TABLE IF NOT EXISTS meta_saldova (
  clave TEXT PRIMARY KEY,
  valor TEXT
);
CREATE TABLE IF NOT EXISTS saldova_bases (
  nombre TEXT,
  ruta   TEXT
);
