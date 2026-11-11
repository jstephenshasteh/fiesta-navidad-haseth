import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { apex, apexOpcional } from '../apex.js';
import { firmar, requierePrincipal, requiereSesion } from '../auth.js';

export const authRouter = Router();

interface AdminPublico { id: number; nombre: string; esPrincipal: boolean; color: string }
interface AdminConPin extends AdminPublico { pinHash: string }

/** Lista pública de administradores activos (para la pantalla "¿Quién eres?"). */
authRouter.get('/admins', async (_req, res) => {
  res.json(await apex<AdminPublico[]>('GET', '/admins'));
});

const intentos = new Map<number, { n: number; hasta: number }>();

authRouter.post('/auth/login', async (req, res) => {
  const { adminId, pin } = z.object({ adminId: z.number().int(), pin: z.string().regex(/^\d{4,6}$/) }).parse(req.body);
  const bloqueo = intentos.get(adminId);
  if (bloqueo && bloqueo.n >= 5 && bloqueo.hasta > Date.now()) {
    return res.status(429).json({ error: 'Demasiados intentos. Espere 5 minutos.' });
  }
  const a = await apexOpcional<AdminConPin>('GET', `/admins/${adminId}`);
  if (!a || !(await bcrypt.compare(pin, a.pinHash))) {
    const n = (bloqueo && bloqueo.hasta > Date.now() ? bloqueo.n : 0) + 1;
    intentos.set(adminId, { n, hasta: Date.now() + 5 * 60_000 });
    return res.status(401).json({ error: 'PIN incorrecto' });
  }
  intentos.delete(adminId);
  const sesion = { adminId: a.id, nombre: a.nombre, esPrincipal: a.esPrincipal };
  res.json({ token: firmar(sesion), admin: { id: a.id, nombre: a.nombre, esPrincipal: a.esPrincipal, color: a.color } });
});

const nuevoAdmin = z.object({
  nombre: z.string().trim().min(2).max(120),
  pin: z.string().regex(/^\d{4,6}$/),
  esPrincipal: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

authRouter.post('/admins', requiereSesion, requierePrincipal, async (req, res) => {
  const d = nuevoAdmin.parse(req.body);
  const r = await apex<{ id: number }>('POST', '/admins', {
    cuerpo: { nombre: d.nombre, pinHash: await bcrypt.hash(d.pin, 10), esPrincipal: d.esPrincipal ?? false, color: d.color ?? '#146B47' },
  });
  res.status(201).json(r);
});

authRouter.put('/admins/:id/pin', requiereSesion, async (req, res) => {
  const id = Number(req.params.id);
  if (id !== req.sesion!.adminId && !req.sesion!.esPrincipal) return res.status(403).json({ error: 'No permitido' });
  const { pin } = z.object({ pin: z.string().regex(/^\d{4,6}$/) }).parse(req.body);
  await apex('PUT', `/admins/${id}/pin`, { cuerpo: { pinHash: await bcrypt.hash(pin, 10) } });
  res.json({ ok: true });
});

authRouter.delete('/admins/:id', requiereSesion, requierePrincipal, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.sesion!.adminId) return res.status(400).json({ error: 'No puede desactivarse a sí mismo' });
  await apex('DELETE', `/admins/${id}`);
  res.json({ ok: true });
});
