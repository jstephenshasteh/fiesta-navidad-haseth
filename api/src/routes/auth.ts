import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { apex, apexOpcional } from '../apex.js';
import { firmar, requierePrincipal, requiereSesion, rolDe, ROLES, type Rol } from '../auth.js';

export const authRouter = Router();

interface AdminApex { id: number; nombre: string; esPrincipal: boolean; rol?: string | null; color: string }
interface AdminConPin extends AdminApex { pinHash: string }

/** Datos públicos de un usuario, con su perfil. */
const publico = (a: AdminApex) => {
  const rol = rolDe(a);
  return { id: a.id, nombre: a.nombre, rol, esPrincipal: rol === 'PRINCIPAL', color: a.color };
};

/** Lista pública de usuarios activos (para la pantalla "¿Quién eres?"). */
authRouter.get('/admins', async (_req, res) => {
  res.json((await apex<AdminApex[]>('GET', '/admins')).map(publico));
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
  const admin = publico(a);
  res.json({ token: firmar({ adminId: a.id, nombre: a.nombre, rol: admin.rol, esPrincipal: admin.esPrincipal }), admin });
});

const rolValido = z.enum(ROLES as [Rol, ...Rol[]]);

const nuevoAdmin = z.object({
  nombre: z.string().trim().min(2).max(120),
  pin: z.string().regex(/^\d{4,6}$/),
  rol: rolValido.optional(),
  esPrincipal: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

authRouter.post('/admins', requierePrincipal, async (req, res) => {
  const d = nuevoAdmin.parse(req.body);
  const rol: Rol = d.rol ?? (d.esPrincipal ? 'PRINCIPAL' : 'ADMIN');
  const r = await apex<{ id: number }>('POST', '/admins', {
    cuerpo: { nombre: d.nombre, pinHash: await bcrypt.hash(d.pin, 10), rol, esPrincipal: rol === 'PRINCIPAL', color: d.color ?? '#146B47' },
  });
  res.status(201).json(r);
});

/** Cambia el nombre o el perfil de un usuario (solo el principal). */
authRouter.put('/admins/:id', requierePrincipal, async (req, res) => {
  const id = Number(req.params.id);
  const d = z.object({ nombre: z.string().trim().min(2).max(120).optional(), rol: rolValido.optional() }).parse(req.body);
  if (d.rol && d.rol !== 'PRINCIPAL') {
    const todos = (await apex<AdminApex[]>('GET', '/admins')).map(publico);
    const principales = todos.filter((a) => a.rol === 'PRINCIPAL');
    if (principales.length === 1 && principales[0].id === id) {
      return res.status(400).json({ error: 'Debe quedar al menos un administrador principal' });
    }
  }
  await apex('PUT', `/admins/${id}`, { cuerpo: d });
  res.json({ ok: true });
});

authRouter.put('/admins/:id/pin', requiereSesion, async (req, res) => {
  const id = Number(req.params.id);
  if (id !== req.sesion!.adminId && req.sesion!.rol !== 'PRINCIPAL') return res.status(403).json({ error: 'No permitido' });
  const { pin } = z.object({ pin: z.string().regex(/^\d{4,6}$/) }).parse(req.body);
  await apex('PUT', `/admins/${id}/pin`, { cuerpo: { pinHash: await bcrypt.hash(pin, 10) } });
  res.json({ ok: true });
});

authRouter.delete('/admins/:id', requierePrincipal, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.sesion!.adminId) return res.status(400).json({ error: 'No puede desactivarse a sí mismo' });
  await apex('DELETE', `/admins/${id}`);
  res.json({ ok: true });
});
