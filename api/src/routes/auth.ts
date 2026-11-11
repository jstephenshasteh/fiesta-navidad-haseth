import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { exec, query, queryOne } from '../db.js';
import { firmar, requierePrincipal, requiereSesion } from '../auth.js';

export const authRouter = Router();

/** Lista pública de administradores activos (para la pantalla "¿Quién eres?"). */
authRouter.get('/admins', async (_req, res) => {
  const rows = await query<{ id: number; nombre: string; esPrincipal: string; color: string }>(
    `SELECT ID "id", NOMBRE "nombre", ES_PRINCIPAL "esPrincipal", COLOR "color"
       FROM FN_ADMIN WHERE ACTIVO = 'S' ORDER BY ES_PRINCIPAL DESC, NOMBRE`,
  );
  res.json(rows.map((r) => ({ ...r, esPrincipal: r.esPrincipal === 'S' })));
});

const intentos = new Map<number, { n: number; hasta: number }>();

authRouter.post('/auth/login', async (req, res) => {
  const { adminId, pin } = z.object({ adminId: z.number().int(), pin: z.string().regex(/^\d{4,6}$/) }).parse(req.body);
  const bloqueo = intentos.get(adminId);
  if (bloqueo && bloqueo.n >= 5 && bloqueo.hasta > Date.now()) {
    return res.status(429).json({ error: 'Demasiados intentos. Espere 5 minutos.' });
  }
  const a = await queryOne<{ id: number; nombre: string; pinHash: string; esPrincipal: string; color: string }>(
    `SELECT ID "id", NOMBRE "nombre", PIN_HASH "pinHash", ES_PRINCIPAL "esPrincipal", COLOR "color"
       FROM FN_ADMIN WHERE ID = :id AND ACTIVO = 'S'`,
    { id: adminId },
  );
  if (!a || !(await bcrypt.compare(pin, a.pinHash))) {
    const n = (bloqueo && bloqueo.hasta > Date.now() ? bloqueo.n : 0) + 1;
    intentos.set(adminId, { n, hasta: Date.now() + 5 * 60_000 });
    return res.status(401).json({ error: 'PIN incorrecto' });
  }
  intentos.delete(adminId);
  const sesion = { adminId: a.id, nombre: a.nombre, esPrincipal: a.esPrincipal === 'S' };
  res.json({ token: firmar(sesion), admin: { id: a.id, nombre: a.nombre, esPrincipal: sesion.esPrincipal, color: a.color } });
});

const nuevoAdmin = z.object({
  nombre: z.string().trim().min(2).max(120),
  pin: z.string().regex(/^\d{4,6}$/),
  esPrincipal: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

authRouter.post('/admins', requiereSesion, requierePrincipal, async (req, res) => {
  const d = nuevoAdmin.parse(req.body);
  await exec(
    `INSERT INTO FN_ADMIN (NOMBRE, PIN_HASH, ES_PRINCIPAL, COLOR) VALUES (:nombre, :hash, :p, :color)`,
    { nombre: d.nombre, hash: await bcrypt.hash(d.pin, 10), p: d.esPrincipal ? 'S' : 'N', color: d.color ?? '#146B47' },
  );
  res.status(201).json({ ok: true });
});

authRouter.put('/admins/:id/pin', requiereSesion, async (req, res) => {
  const id = Number(req.params.id);
  if (id !== req.sesion!.adminId && !req.sesion!.esPrincipal) return res.status(403).json({ error: 'No permitido' });
  const { pin } = z.object({ pin: z.string().regex(/^\d{4,6}$/) }).parse(req.body);
  await exec(`UPDATE FN_ADMIN SET PIN_HASH = :h WHERE ID = :id`, { h: await bcrypt.hash(pin, 10), id });
  res.json({ ok: true });
});

authRouter.delete('/admins/:id', requiereSesion, requierePrincipal, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.sesion!.adminId) return res.status(400).json({ error: 'No puede desactivarse a sí mismo' });
  await exec(`UPDATE FN_ADMIN SET ACTIVO = 'N' WHERE ID = :id`, { id });
  res.json({ ok: true });
});
