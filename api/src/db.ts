import oracledb from 'oracledb';
import { config } from './config.js';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

let pool: oracledb.Pool | null = null;
let creando: Promise<oracledb.Pool> | null = null;

/** Crea el pool la primera vez que se necesita (y lo reintenta si Oracle no respondía). */
async function obtenerPool(): Promise<oracledb.Pool> {
  if (pool) return pool;
  creando ??= oracledb
    .createPool({
      user: config.oracle.user,
      password: config.oracle.password,
      connectString: config.oracle.connectString,
      poolMin: 0,
      poolMax: 10,
      poolIncrement: 1,
      queueTimeout: 15_000,
    })
    .then((p) => (pool = p))
    .finally(() => (creando = null));
  return creando;
}

/** Prueba la conexión al iniciar; si falla solo lo informa (la API sigue arriba y reintenta). */
export async function initDb(): Promise<void> {
  try {
    await withConn((c) => c.execute('SELECT 1 FROM DUAL'));
    console.log('Conexión a Oracle OK');
  } catch (e) {
    console.error('No se pudo conectar a Oracle:', e instanceof Error ? e.message : e);
  }
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.close(5);
}

/** Ejecuta una función con una conexión del pool (sin auto-commit). */
export async function withConn<T>(fn: (c: oracledb.Connection) => Promise<T>): Promise<T> {
  const conn = await (await obtenerPool()).getConnection();
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

/** SELECT: devuelve filas como objetos. Use alias entre comillas para nombres camelCase. */
export async function query<T>(sql: string, binds: oracledb.BindParameters = {}): Promise<T[]> {
  return withConn(async (c) => {
    const r = await c.execute<T>(sql, binds);
    return (r.rows ?? []) as T[];
  });
}

export async function queryOne<T>(sql: string, binds: oracledb.BindParameters = {}): Promise<T | null> {
  const rows = await query<T>(sql, binds);
  return rows[0] ?? null;
}

/** INSERT/UPDATE/DELETE con commit automático. */
export async function exec(sql: string, binds: oracledb.BindParameters = {}): Promise<oracledb.Result<unknown>> {
  return withConn((c) => c.execute(sql, binds, { autoCommit: true }));
}

/** Evento activo (se guarda en memoria unos segundos). */
let eventoCache: { id: number; at: number } | null = null;
export async function eventoActivoId(): Promise<number> {
  if (eventoCache && Date.now() - eventoCache.at < 30_000) return eventoCache.id;
  const row = await queryOne<{ id: number }>(
    `SELECT ID "id" FROM FN_EVENTO WHERE ACTIVO = 'S' ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`,
  );
  if (!row) throw Object.assign(new Error('No hay un evento activo en FN_EVENTO'), { status: 500 });
  eventoCache = { id: row.id, at: Date.now() };
  return row.id;
}

export { oracledb };
