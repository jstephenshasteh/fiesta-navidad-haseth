import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

/**
 * Perfiles:
 *  - PRINCIPAL: todo, incluidos usuarios y ajustes del evento.
 *  - ADMIN: invitados, envíos, escaneo y premios (no usuarios ni ajustes).
 *  - HOST: solo recibe invitados (escanear QR y buscar por nombre).
 */
export type Rol = 'PRINCIPAL' | 'ADMIN' | 'HOST';
export const ROLES: Rol[] = ['PRINCIPAL', 'ADMIN', 'HOST'];

export interface Sesion {
  adminId: number;
  nombre: string;
  rol: Rol;
  esPrincipal: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sesion?: Sesion;
    }
  }
}

/** Perfil de un usuario. Si APEX aún no tiene la columna ROL (falta 09), se deduce de esPrincipal. */
export function rolDe(a: { rol?: string | null; esPrincipal?: boolean }): Rol {
  const r = (a.rol ?? '').toUpperCase();
  if (ROLES.includes(r as Rol)) return r as Rol;
  return a.esPrincipal ? 'PRINCIPAL' : 'ADMIN';
}

export function firmar(s: Sesion): string {
  return jwt.sign(s, config.jwtSecret, { expiresIn: '14h' });
}

/** Acepta el token en "Authorization: Bearer ..." o en ?token= (para <img> y descargas). */
export function requiereSesion(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : typeof req.query.token === 'string' ? req.query.token : null;
  if (!token) return res.status(401).json({ error: 'Sesión requerida' });
  try {
    const p = jwt.verify(token, config.jwtSecret) as Partial<Sesion> & { adminId: number; nombre: string };
    const rol = rolDe(p);
    req.sesion = { adminId: p.adminId, nombre: p.nombre, rol, esPrincipal: rol === 'PRINCIPAL' };
    next();
  } catch {
    res.status(401).json({ error: 'Sesión vencida, vuelva a ingresar' });
  }
}

const MENSAJE: Record<string, string> = {
  PRINCIPAL: 'Solo el administrador principal puede hacer esto',
  GESTION: 'Su perfil (Host) solo permite recibir invitados',
};

/** Sesión válida y uno de los perfiles indicados. */
export function soloPerfiles(...permitidos: Rol[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    requiereSesion(req, res, () => {
      if (!permitidos.includes(req.sesion!.rol)) {
        return res.status(403).json({ error: permitidos.length === 1 ? MENSAJE.PRINCIPAL : MENSAJE.GESTION });
      }
      next();
    });
  };
}

/** Principal y Administrador (todo lo que no es recibir invitados). */
export const requiereGestion = soloPerfiles('PRINCIPAL', 'ADMIN');
/** Solo el administrador principal. */
export const requierePrincipal = soloPerfiles('PRINCIPAL');
