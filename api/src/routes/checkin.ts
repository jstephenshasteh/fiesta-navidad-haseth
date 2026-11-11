import { Router } from 'express';
import { z } from 'zod';
import { eventoActivoId, exec, query, queryOne, withConn } from '../db.js';
import { requiereSesion } from '../auth.js';
import { tokenDesdeQr } from '../util.js';

export const checkinRouter = Router();

interface InvLlegada {
  id: number;
  codigo: string;
  nombre: string;
  area: string | null;
  llegadaEn: Date | null;
  llegadaAdmin: string | null;
}

const SELECT_INV = `SELECT i.ID "id", i.CODIGO "codigo", i.NOMBRE "nombre", i.AREA "area", i.LLEGADA_EN "llegadaEn", a.NOMBRE "llegadaAdmin"
                      FROM FN_INVITADO i LEFT JOIN FN_ADMIN a ON a.ID = i.LLEGADA_ADMIN_ID`;

async function registrar(inv: InvLlegada, adminId: number, via: 'QR' | 'NOMBRE', valor: string | null) {
  if (inv.llegadaEn) {
    await exec(`INSERT INTO FN_ESCANEO (INVITADO_ID, RESULTADO, VALOR_LEIDO, ADMIN_ID) VALUES (:i, 'DUPLICADO', :v, :a)`, { i: inv.id, v: valor, a: adminId });
    return { resultado: 'DUPLICADO' as const, invitado: inv };
  }
  // El "AND LLEGADA_EN IS NULL" evita doble registro si dos tablets escanean a la vez.
  const actualizado = await withConn(async (c) => {
    const r = await c.execute(
      `UPDATE FN_INVITADO SET LLEGADA_EN = SYSTIMESTAMP, LLEGADA_ADMIN_ID = :a, LLEGADA_VIA = :via WHERE ID = :id AND LLEGADA_EN IS NULL`,
      { a: adminId, via, id: inv.id },
    );
    await c.execute(`INSERT INTO FN_ESCANEO (INVITADO_ID, RESULTADO, VALOR_LEIDO, ADMIN_ID) VALUES (:i, :r, :v, :a)`, {
      i: inv.id, r: r.rowsAffected ? 'OK' : 'DUPLICADO', v: valor, a: adminId,
    });
    await c.commit();
    return (r.rowsAffected ?? 0) > 0;
  });
  const nuevo = await queryOne<InvLlegada>(`${SELECT_INV} WHERE i.ID = :id`, { id: inv.id });
  return { resultado: actualizado ? ('OK' as const) : ('DUPLICADO' as const), invitado: nuevo };
}

checkinRouter.post('/checkin/qr', requiereSesion, async (req, res) => {
  const { valor } = z.object({ valor: z.string().min(1).max(500) }).parse(req.body);
  const token = tokenDesdeQr(valor);
  const ev = await eventoActivoId();
  const inv = token
    ? await queryOne<InvLlegada>(`${SELECT_INV} WHERE i.TOKEN_QR = :t AND i.EVENTO_ID = :ev AND i.ACTIVO = 'S'`, { t: token, ev })
    : null;
  if (!inv) {
    await exec(`INSERT INTO FN_ESCANEO (RESULTADO, VALOR_LEIDO, ADMIN_ID) VALUES ('INVALIDO', :v, :a)`, { v: valor.slice(0, 200), a: req.sesion!.adminId });
    return res.json({ resultado: 'INVALIDO' });
  }
  res.json(await registrar(inv, req.sesion!.adminId, 'QR', valor.slice(0, 200)));
});

checkinRouter.post('/checkin/manual', requiereSesion, async (req, res) => {
  const { invitadoId } = z.object({ invitadoId: z.number().int() }).parse(req.body);
  const ev = await eventoActivoId();
  const inv = await queryOne<InvLlegada>(`${SELECT_INV} WHERE i.ID = :id AND i.EVENTO_ID = :ev AND i.ACTIVO = 'S'`, { id: invitadoId, ev });
  if (!inv) return res.status(404).json({ error: 'Invitado no encontrado' });
  res.json(await registrar(inv, req.sesion!.adminId, 'NOMBRE', null));
});

checkinRouter.get('/checkin/recientes', requiereSesion, async (req, res) => {
  const limite = Math.min(Number(req.query.limite ?? 30), 200);
  const ev = await eventoActivoId();
  const rows = await query(
    `SELECT i.ID "id", i.CODIGO "codigo", i.NOMBRE "nombre", i.AREA "area", i.LLEGADA_EN "llegadaEn", i.LLEGADA_VIA "llegadaVia", a.NOMBRE "llegadaAdmin"
       FROM FN_INVITADO i LEFT JOIN FN_ADMIN a ON a.ID = i.LLEGADA_ADMIN_ID
      WHERE i.EVENTO_ID = :ev AND i.ACTIVO = 'S' AND i.LLEGADA_EN IS NOT NULL
      ORDER BY i.LLEGADA_EN DESC FETCH FIRST ${limite} ROWS ONLY`,
    { ev },
  );
  res.json(rows);
});

/** Deshace una llegada registrada por error. */
checkinRouter.delete('/checkin/:id', requiereSesion, async (req, res) => {
  await exec(`UPDATE FN_INVITADO SET LLEGADA_EN = NULL, LLEGADA_ADMIN_ID = NULL, LLEGADA_VIA = NULL WHERE ID = :id`, { id: Number(req.params.id) });
  res.json({ ok: true });
});
