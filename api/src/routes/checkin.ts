import { Router } from 'express';
import { z } from 'zod';
import { apex } from '../apex.js';
import { requiereSesion } from '../auth.js';
import { tokenDesdeQr } from '../util.js';

export const checkinRouter = Router();

/** Llegada por QR: APEX responde OK | DUPLICADO | INVALIDO. */
checkinRouter.post('/checkin/qr', requiereSesion, async (req, res) => {
  const { valor } = z.object({ valor: z.string().min(1).max(500) }).parse(req.body);
  res.json(await apex('POST', '/checkin/qr', {
    cuerpo: { token: tokenDesdeQr(valor), valor: valor.slice(0, 200), adminId: req.sesion!.adminId },
  }));
});

/** Llegada buscando por nombre (cuando el invitado no trae el QR). */
checkinRouter.post('/checkin/manual', requiereSesion, async (req, res) => {
  const { invitadoId } = z.object({ invitadoId: z.number().int() }).parse(req.body);
  res.json(await apex('POST', '/checkin/manual', { cuerpo: { invitadoId, adminId: req.sesion!.adminId } }));
});

checkinRouter.get('/checkin/recientes', requiereSesion, async (req, res) => {
  const limite = Math.min(Math.max(Number(req.query.limite ?? 30) || 30, 1), 200);
  res.json(await apex('GET', `/checkin/recientes?limite=${limite}`));
});

/** Deshace una llegada registrada por error. */
checkinRouter.delete('/checkin/:id', requiereSesion, async (req, res) => {
  await apex('DELETE', `/checkin/${Number(req.params.id)}`);
  res.json({ ok: true });
});
