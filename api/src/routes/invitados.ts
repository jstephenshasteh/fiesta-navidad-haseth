import { Router } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { eventoActivoId, query, queryOne, withConn } from '../db.js';
import { requiereSesion } from '../auth.js';
import { obtenerEvento, obtenerInvitado } from '../services/datos.js';
import { pngPase } from '../services/pase.js';
import { formatoCodigo, normalizarCorreo, normalizarWhatsapp, nuevoToken } from '../util.js';

export const invitadosRouter = Router();

export interface FilaInvitado {
  id: number;
  codigo: string;
  nombre: string;
  correo: string | null;
  whatsapp: string | null;
  area: string | null;
  llegadaEn: Date | null;
  llegadaVia: string | null;
  llegadaAdmin: string | null;
  waEnviadoEn: Date | null;
  correoEnviadoEn: Date | null;
}

export async function listarInvitados(): Promise<FilaInvitado[]> {
  const ev = await eventoActivoId();
  return query<FilaInvitado>(
    `SELECT i.ID "id", i.CODIGO "codigo", i.NOMBRE "nombre", i.CORREO "correo", i.WHATSAPP "whatsapp", i.AREA "area",
            i.LLEGADA_EN "llegadaEn", i.LLEGADA_VIA "llegadaVia", a.NOMBRE "llegadaAdmin",
            (SELECT MAX(e.ENVIADO_EN) FROM FN_ENVIO e WHERE e.INVITADO_ID = i.ID AND e.CANAL = 'WHATSAPP' AND e.ESTADO = 'ENVIADO') "waEnviadoEn",
            (SELECT MAX(e.ENVIADO_EN) FROM FN_ENVIO e WHERE e.INVITADO_ID = i.ID AND e.CANAL = 'CORREO' AND e.ESTADO = 'ENVIADO') "correoEnviadoEn"
       FROM FN_INVITADO i LEFT JOIN FN_ADMIN a ON a.ID = i.LLEGADA_ADMIN_ID
      WHERE i.EVENTO_ID = :ev AND i.ACTIVO = 'S'
      ORDER BY i.NOMBRE`,
    { ev },
  );
}

invitadosRouter.get('/invitados', requiereSesion, async (_req, res) => {
  res.json(await listarInvitados());
});

invitadosRouter.get('/invitados/resumen', requiereSesion, async (_req, res) => {
  const ev = await eventoActivoId();
  const r = await queryOne<{ total: number; llegaron: number; enviadas: number }>(
    `SELECT COUNT(*) "total",
            COUNT(i.LLEGADA_EN) "llegaron",
            SUM(CASE WHEN EXISTS (SELECT 1 FROM FN_ENVIO e WHERE e.INVITADO_ID = i.ID AND e.ESTADO = 'ENVIADO') THEN 1 ELSE 0 END) "enviadas"
       FROM FN_INVITADO i WHERE i.EVENTO_ID = :ev AND i.ACTIVO = 'S'`,
    { ev },
  );
  const total = r?.total ?? 0;
  res.json({ total, llegaron: r?.llegaron ?? 0, faltan: total - (r?.llegaron ?? 0), enviadas: r?.enviadas ?? 0, pendientes: total - (r?.enviadas ?? 0) });
});

const filaImport = z.object({
  nombre: z.string().trim().min(2).max(150),
  correo: z.string().nullish(),
  whatsapp: z.union([z.string(), z.number()]).nullish(),
  area: z.string().trim().max(100).nullish(),
});

/** Importa (o actualiza por nombre) la lista que la app leyó del Excel. */
invitadosRouter.post('/invitados/importar', requiereSesion, async (req, res) => {
  const { invitados } = z.object({ invitados: z.array(filaImport).min(1).max(5000) }).parse(req.body);
  const ev = await obtenerEvento();
  const resultado = await withConn(async (c) => {
    const existentes = await c.execute<{ ID: number; NOMBRE: string }>(
      `SELECT ID, UPPER(NOMBRE) NOMBRE FROM FN_INVITADO WHERE EVENTO_ID = :ev AND ACTIVO = 'S'`, { ev: ev.id },
    );
    const porNombre = new Map((existentes.rows ?? []).map((r) => [r.NOMBRE, r.ID]));
    const max = await c.execute<{ N: number | null }>(
      `SELECT MAX(TO_NUMBER(REGEXP_SUBSTR(CODIGO, '[0-9]+$'))) N FROM FN_INVITADO WHERE EVENTO_ID = :ev`, { ev: ev.id },
    );
    let siguiente = (max.rows?.[0]?.N ?? 0) + 1;
    let creados = 0;
    let actualizados = 0;
    for (const f of invitados) {
      const datos = {
        nombre: f.nombre.replace(/\s+/g, ' '),
        correo: normalizarCorreo(f.correo ?? null),
        whatsapp: normalizarWhatsapp(f.whatsapp == null ? null : String(f.whatsapp)),
        area: f.area ?? null,
      };
      const id = porNombre.get(datos.nombre.toUpperCase());
      if (id) {
        await c.execute(
          `UPDATE FN_INVITADO SET CORREO = NVL(:correo, CORREO), WHATSAPP = NVL(:whatsapp, WHATSAPP), AREA = NVL(:area, AREA) WHERE ID = :id`,
          { correo: datos.correo, whatsapp: datos.whatsapp, area: datos.area, id },
        );
        actualizados++;
      } else {
        await c.execute(
          `INSERT INTO FN_INVITADO (EVENTO_ID, CODIGO, TOKEN_QR, NOMBRE, CORREO, WHATSAPP, AREA)
           VALUES (:ev, :codigo, :token, :nombre, :correo, :whatsapp, :area)`,
          { ev: ev.id, codigo: formatoCodigo(ev.prefijoCodigo, siguiente++), token: nuevoToken(), ...datos },
        );
        porNombre.set(datos.nombre.toUpperCase(), -1);
        creados++;
      }
    }
    await c.commit();
    return { creados, actualizados };
  });
  res.json(resultado);
});

invitadosRouter.delete('/invitados/:id', requiereSesion, async (req, res) => {
  await withConn(async (c) => {
    await c.execute(`UPDATE FN_INVITADO SET ACTIVO = 'N' WHERE ID = :id`, { id: Number(req.params.id) }, { autoCommit: true });
  });
  res.json({ ok: true });
});

/** Imagen 2: pase QR personalizado. */
invitadosRouter.get('/invitados/:id/pase.png', requiereSesion, async (req, res) => {
  const inv = await obtenerInvitado(Number(req.params.id));
  if (!inv) return res.status(404).end();
  const ev = await obtenerEvento();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.send(pngPase({ nombre: inv.nombre, codigo: inv.codigo, token: inv.token, evento: ev }));
});

/** Plantilla de Excel para cargar invitados. */
invitadosRouter.get('/invitados/plantilla.xlsx', async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Invitados');
  ws.columns = [
    { header: 'Nombre', key: 'nombre', width: 32 },
    { header: 'Correo', key: 'correo', width: 32 },
    { header: 'WhatsApp', key: 'whatsapp', width: 18 },
    { header: 'Área', key: 'area', width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ nombre: 'Nombre Apellido', correo: 'correo@ejemplo.com', whatsapp: '61234567', area: 'Finanzas' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_invitados.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

/** Exporta invitados con su estado de envío y llegada. */
invitadosRouter.get('/invitados/exportar.xlsx', requiereSesion, async (_req, res) => {
  const filas = await listarInvitados();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Llegadas');
  ws.columns = [
    { header: 'Código', key: 'codigo', width: 10 },
    { header: 'Nombre', key: 'nombre', width: 32 },
    { header: 'Área', key: 'area', width: 20 },
    { header: 'Correo', key: 'correo', width: 30 },
    { header: 'WhatsApp', key: 'whatsapp', width: 16 },
    { header: 'Enviado WhatsApp', key: 'waEnviadoEn', width: 20 },
    { header: 'Enviado correo', key: 'correoEnviadoEn', width: 20 },
    { header: 'Llegada', key: 'llegadaEn', width: 20 },
    { header: 'Registrado por', key: 'llegadaAdmin', width: 20 },
    { header: 'Vía', key: 'llegadaVia', width: 8 },
  ];
  ws.getRow(1).font = { bold: true };
  filas.forEach((f) => ws.addRow(f));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="llegadas_fiesta_2026.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});
