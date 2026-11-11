import { eventoActivoId, oracledb, queryOne, withConn } from '../db.js';

export interface Evento {
  id: number;
  nombre: string;
  fechaTexto: string | null;
  dia: string | null;
  mesCorto: string | null;
  hora: string | null;
  lugar: string | null;
  salon: string | null;
  vestimenta: string | null;
  prefijoCodigo: string;
  temaPase: string | null;
  asuntoCorreo: string | null;
  mensaje: string | null;
  arteNombre: string | null;
  tieneArte: number;
}

export async function obtenerEvento(): Promise<Evento> {
  const id = await eventoActivoId();
  const ev = await queryOne<Evento>(
    `SELECT ID "id", NOMBRE "nombre", FECHA_TEXTO "fechaTexto", DIA "dia", MES_CORTO "mesCorto", HORA "hora",
            LUGAR "lugar", SALON "salon", VESTIMENTA "vestimenta", PREFIJO_CODIGO "prefijoCodigo",
            TEMA_PASE "temaPase", ASUNTO_CORREO "asuntoCorreo", MENSAJE "mensaje", ARTE_NOMBRE "arteNombre",
            CASE WHEN ARTE IS NULL THEN 0 ELSE 1 END "tieneArte"
       FROM FN_EVENTO WHERE ID = :id`,
    { id },
  );
  return ev!;
}

export interface Arte {
  contenido: Buffer;
  mime: string;
  nombre: string;
  clave: string;
}

export async function obtenerArte(): Promise<Arte | null> {
  const id = await eventoActivoId();
  return withConn(async (c) => {
    const r = await c.execute<{ ARTE: Buffer | null; ARTE_MIME: string; ARTE_NOMBRE: string; LARGO: number }>(
      `SELECT ARTE, ARTE_MIME, ARTE_NOMBRE, DBMS_LOB.GETLENGTH(ARTE) LARGO FROM FN_EVENTO WHERE ID = :id`,
      { id },
      { fetchInfo: { ARTE: { type: oracledb.BUFFER } } },
    );
    const row = r.rows?.[0];
    if (!row?.ARTE) return null;
    return {
      contenido: row.ARTE,
      mime: row.ARTE_MIME || 'image/png',
      nombre: row.ARTE_NOMBRE || 'invitacion.png',
      clave: `${row.ARTE_NOMBRE}:${row.LARGO}`,
    };
  });
}

export interface Invitado {
  id: number;
  codigo: string;
  token: string;
  nombre: string;
  correo: string | null;
  whatsapp: string | null;
  area: string | null;
}

export async function obtenerInvitado(id: number): Promise<Invitado | null> {
  const ev = await eventoActivoId();
  return queryOne<Invitado>(
    `SELECT ID "id", CODIGO "codigo", TOKEN_QR "token", NOMBRE "nombre", CORREO "correo", WHATSAPP "whatsapp", AREA "area"
       FROM FN_INVITADO WHERE ID = :id AND EVENTO_ID = :ev AND ACTIVO = 'S'`,
    { id, ev },
  );
}
